import FactoryAbi from './abis/Factory.json'
import { config } from 'dotenv'
import IpfsClient from 'ipfs-http-client';
import EIP712Domain from "eth-typed-data";
import { Contract, ethers, constants, utils, Signer, Wallet, BigNumber } from 'ethers'
import { buildValidationData } from './utils/proof'
import { pullWithKeccak } from './utils/ipfs'
import StatelessVault from '@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json'
config()

const mnemonic = process.env.MNEMONIC!!
const rpcUrl = process.env.RPC_URL!!
const browserUrlTx = process.env.BROWSER_URL_TX!!
const browserUrlAddress = process.env.BROWSER_URL_ADDRESS!!

export interface FactoryConfig {
    factoryAddress: string,
    vaultImplementationAddress: string,
    signer: Signer
}

export interface VaultSetup {
    signers: string[],
    threshold: BigNumber
}

export class VaultFactory {
    readonly vaultInterface = Contract.getInterface(StatelessVault.abi)
    readonly config: FactoryConfig
    readonly factoryInstance: Contract

    constructor(config: FactoryConfig) {
        this.config = config
        this.factoryInstance = new Contract(config.factoryAddress, FactoryAbi, config.signer)
    }

    async calculateAddress(initializer: string, saltNonce: string): Promise<string> {
        const initializerHash = utils.solidityKeccak256(["bytes"], [initializer])
        const salt = utils.solidityKeccak256(['bytes32', 'uint256'], [initializerHash, saltNonce])
        const proxyCreationCode = await this.factoryInstance.proxyCreationCode()
        const proxyDeploymentCode = utils.solidityPack(['bytes', 'uint256'], [proxyCreationCode, this.config.vaultImplementationAddress])
        const proxyDeploymentCodeHash = utils.solidityKeccak256(["bytes"], [proxyDeploymentCode])
        const address = utils.solidityKeccak256(
            ['bytes1', 'address', 'bytes32', 'bytes32'],
            ["0xFF", this.config.factoryAddress, salt, proxyDeploymentCodeHash]
        )
        return "0x" + address.slice(-40)
    }

    async create(vaultSetup: VaultSetup, saltString?: string): Promise<Vault> {
        const initializer = this.vaultInterface.encodeFunctionData(
            "setup(address[],uint256,address,address,address)",
            [vaultSetup.signers, vaultSetup.threshold, constants.AddressZero, constants.AddressZero, constants.AddressZero]
        )
        const saltNonce = utils.keccak256(Buffer.from(saltString || `${new Date()}`))
        try {
            const tx = await this.factoryInstance.createProxyWithNonce(this.config.vaultImplementationAddress, initializer, saltNonce)
            await tx.wait()
            console.log(tx)
        } catch (e) { }
        const address = await this.calculateAddress(initializer, saltNonce)
        return new Vault(this.config.signer, address)
    }
}

export interface VaultConfig extends VaultSetup {
    implementation: string,
    signatureChecker: string,
    requestGuard: string,
    fallbackHandler: string,
    nonce: BigNumber
}

export class Vault {
    readonly signer: Signer
    readonly address: string
    readonly vaultInstance: Contract

    constructor(signer: Signer, vaultAddress: string) {
        this.address = vaultAddress
        this.signer = signer
        this.vaultInstance = new Contract(vaultAddress, StatelessVault.abi, signer)
    }

    async loadTransactions(): Promise<string[]> {
        const txs: string[] = []
        const configTopic = this.vaultInstance.interface.getEventTopic("Configuration")
        const failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure")
        const successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess")
        const events = await this.vaultInstance.queryFilter({
            address: this.vaultInstance.address,
            topics: [
                [
                    configTopic, failedTopic, successTopic
                ]
            ]
        })
        for (const e of events) {
            if (e.topics[0] == configTopic) {
                const config = this.vaultInstance.interface.decodeEventLog(
                    "Configuration",
                    e.data
                )
                if (config.currentNonce.eq(0)) {
                    txs.push(`Vault setup @ ${browserUrlTx.replace("{}", e.transactionHash)}`)
                } else {
                    txs.push(`Config change (nonce ${config.currentNonce - 1}) @ ${browserUrlTx.replace("{}", e.transactionHash)}`)
                }
            } else if (e.topics[0] == failedTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionFailure",
                    e.data
                )
                txs.push(`Tx failure (nonce ${exec.usedNonce}) @ ${browserUrlTx.replace("{}", e.transactionHash)}`)
            } else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionSuccess",
                    e.data
                )
                txs.push(`Tx success (nonce ${exec.usedNonce}) @ ${browserUrlTx.replace("{}", e.transactionHash)}`)
            }
        }
        return txs.reverse()
    }

    async loadConfig(): Promise<VaultConfig> {
        const configTopic = this.vaultInstance.interface.getEventTopic("Configuration")
        const failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure")
        const successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess")
        const events = await this.vaultInstance.queryFilter({
            address: this.vaultInstance.address,
            topics: [
                [
                    configTopic, failedTopic, successTopic
                ]
            ]
        })
        const currentConfig = {
            implementation: constants.AddressZero,
            signatureChecker: constants.AddressZero,
            requestGuard: constants.AddressZero,
            fallbackHandler: constants.AddressZero,
            signers: [],
            threshold: BigNumber.from(0),
            nonce: BigNumber.from(-1)
        }
        for (const e of events) {
            if (e.topics[0] == configTopic) {
                const config = this.vaultInstance.interface.decodeEventLog(
                    "Configuration",
                    e.data
                )
                if (config.currentNonce >= currentConfig.nonce) {
                    currentConfig.signers = config.signers
                    currentConfig.threshold = config.threshold
                    currentConfig.nonce = config.currentNonce
                    currentConfig.implementation = config.implementation
                    currentConfig.signatureChecker = config.signatureChecker
                    currentConfig.requestGuard = config.requestGuard
                    currentConfig.fallbackHandler = config.fallbackHandler
                }
            } else if (e.topics[0] == failedTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionFailure",
                    e.data
                )
                if (currentConfig.nonce <= exec.usedNonce) {
                    currentConfig.nonce = exec.usedNonce.add(1)
                }
            } else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionSuccess",
                    e.data
                )
                if (currentConfig.nonce <= exec.usedNonce) {
                    currentConfig.nonce = exec.usedNonce.add(1)
                }
            } else {
                console.warn("Unknown log")
            }
        }
        if (currentConfig.nonce.eq(-1)) throw Error("could not load config")
        return currentConfig
    }

    async signExec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber): Promise<string> {
        const dataHash = await this.vaultInstance.generateTxHash(
            to, value, data, operation, 0, nonce, "0x"
        )
        return await this.signer.signMessage(utils.arrayify(dataHash))
    }

    async signExecFromHash(ipfs: any, txHash: string): Promise<string> {
        const hashData = await pullWithKeccak(ipfs, txHash)
        const tx = await pullWithKeccak(ipfs, hashData.substring(68))
        const txData = await pullWithKeccak(ipfs, tx.substring(3*64, 4*64))
        const to = utils.getAddress(tx.substring(64 + 24, 2*64))
        const value = BigNumber.from("0x" + tx.substring(2*64, 3*64))
        const data = "0x" + txData
        const operation = parseInt(tx.substring(4*64, 5*64), 16)
        const minAvailableGas = BigNumber.from("0x" + tx.substring(5*64, 6*64))
        const nonce = BigNumber.from("0x" + tx.substring(6*64, 7*64))
        const metaHash = "0x" + tx.substring(7*64, 8*64)
        console.log(`To: ${to}`)
        console.log(`Value: ${value}`)
        console.log(`Data: ${data}`)
        console.log(`Operation: ${operation}`)
        console.log(`Minimum available gas: ${minAvailableGas}`)
        console.log(`Nonce: ${nonce}`)
        console.log(`Meta hash: ${metaHash}`)
        const dataHash = await this.vaultInstance.generateTxHash(
            to, value, data, operation, minAvailableGas, nonce, metaHash
        )
        return await this.signer.signMessage(utils.arrayify(dataHash))
    }

    async publishExec(ipfs: any, to: string, value: BigNumber, dataString: string, operation: number, nonce: BigNumber): Promise<string> {
        const data = utils.arrayify(dataString)
        const vaultDomain = new EIP712Domain({
            chainId: 4,
            verifyingContract: this.address,
        });

        const VaultTx = vaultDomain.createType('Transaction', [
            { type: "address", name: "to" },
            { type: "uint256", name: "value" },
            { type: "bytes", name: "data" },
            { type: "uint8", name: "operation" },
            { type: "uint256", name: "minAvailableGas" },
            { type: "uint256", name: "nonce" },
            { type: "bytes32", name: "metaHash" },
        ]);

        const minAvailableGas = 0
        const vaultTx = new VaultTx({
            to, 
            value: value.toHexString(), 
            data, 
            operation, 
            minAvailableGas, 
            nonce: nonce.toNumber(),
            metaHash: "0x"
        });

        // data
        console.log("Publish data")
        for await (const res of ipfs.add(data, { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }
        // TX_TYPEHASH, to, value, keccak256(data), operation, minAvailableGas, nonce
        console.log("Publish tx")
        for await (const res of ipfs.add(vaultTx.encodeData(), { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }

        // byte(0x19), byte(0x01), domainSeparator, txHash
        console.log("Publish tx hash")
        const txHash = "0x" + vaultTx.signHash().toString('hex')
        for await (const res of ipfs.add(vaultTx.encode(), { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }
        return txHash
    }

    async signUpdate(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber): Promise<string> {
        const config = await this.loadConfig()
        const dataHash = await this.vaultInstance.generateConfigChangeHash(
            config.implementation,
            utils.solidityPack(["address[]"], [newSigners]),
            newThreshold,
            config.signatureChecker,
            config.requestGuard,
            config.fallbackHandler,
            "0x",
            nonce
        )
        return await this.signer.signMessage(utils.arrayify(dataHash))
    }

    async formatSignature(config: VaultConfig, hashProvider: () => Promise<string>, signatures?: string[]): Promise<{ signaturesString: string, signers: string[] }> {
        let sigs: string[]
        let signers: string[]
        if (signatures) {
            const dataHash = await hashProvider()
            sigs = signatures.map((sig) => sig.slice(2).replace(/00$/, "1f").replace(/1b$/, "1f").replace(/01$/, "20").replace(/1c$/, "20"))
            let prevIndex = -1
            signers = signatures.map((sig) => {
                const signer = utils.verifyMessage(utils.arrayify(dataHash), sig)
                const signerIndex = config.signers.indexOf(signer, prevIndex + 1)
                if (signerIndex <= prevIndex) throw Error("Invalid signer")
                prevIndex = signerIndex
                return signer
            })
        } else if (config.signers.length == 1) {
            const singleSigner = await this.signer.getAddress()
            if (config.signers.indexOf(singleSigner) < 0) throw Error("Signer is not an owner")
            sigs = [utils.solidityPack(["uint256", "uint256", "bytes1"], [singleSigner, 0, "0x01"]).slice(2)]
            signers = [singleSigner]
        } else {
            throw Error("Cannot execute transaction due to missing confirmation")
        }
        return { signaturesString: "0x" + sigs.join(""), signers }
    }

    async update(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber, signatures?: string[]) {
        const config = await this.loadConfig()
        if (!config.nonce.eq(nonce)) throw Error("Invalid nonce")
        const { signaturesString, signers } = await this.formatSignature(config, () => {
            return this.vaultInstance.generateConfigChangeHash(
                config.implementation,
                utils.solidityPack(["address[]"], [newSigners]),
                newThreshold,
                config.signatureChecker,
                config.requestGuard,
                config.fallbackHandler,
                "0x",
                nonce
            )
        }, signatures)
        const validationData = await buildValidationData(config, signaturesString, signers)

        console.log(await this.vaultInstance.callStatic.updateConfig(
            config.implementation,
            newSigners,
            newThreshold,
            config.signatureChecker,
            config.requestGuard,
            config.fallbackHandler,
            "0x",
            nonce,
            validationData
        ))

        await this.vaultInstance.updateConfig(
            config.implementation,
            newSigners,
            newThreshold,
            config.signatureChecker,
            config.requestGuard,
            config.fallbackHandler,
            "0x",
            nonce,
            validationData
        )
    }

    async exec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber, signatures?: string[]) {
        const config = await this.loadConfig()
        if (!config.nonce.eq(nonce)) throw Error("Invalid nonce")
        const { signaturesString, signers } = await this.formatSignature(config, () => {
            return this.vaultInstance.generateTxHash(
                to, value, data, operation, 0, nonce, "0x"
            )
        }, signatures)
        const validationData = await buildValidationData(config, signaturesString, signers)
        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true))
        await this.vaultInstance.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true)
    }
}

const ipfs = IpfsClient({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https'
});

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const signer = Wallet.fromMnemonic(mnemonic).connect(provider)
const signer2 = Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/1").connect(provider)
const test = async () => {
    const factory = new VaultFactory({
        factoryAddress: "0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B",
        vaultImplementationAddress: StatelessVault.networks[4].address,
        signer
    })
    const vault = await factory.create({
        signers: [await signer.getAddress()],
        threshold: BigNumber.from(1)
    }, "test_vault")
    console.log(`Vault @ ${browserUrlAddress.replace("{}", vault.address)}`)
    const vault2 = new Vault(signer2, vault.address)
    const config = await vault.loadConfig()
    console.log({config})
    console.log(await vault.loadTransactions())
    const txHash = await vault.publishExec(ipfs, vault.address, BigNumber.from(42), "0xbaddad", 1, config.nonce)
    console.log({txHash})
    await vault.signExecFromHash(ipfs, txHash)
    /*
    const sig1 = await vault.signUpdate([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce)
    const sig2 = await vault2.signUpdate([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce)
    await vault.update([await signer.getAddress(), await signer2.getAddress()], BigNumber.from(2), config.nonce, [sig1, sig2])
    */
    /*
    const sig1 = await vault.signExec(vault.address, BigNumber.from(0), "0x", 0, config.nonce)
    const sig2 = await vault2.signExec(vault.address, BigNumber.from(0), "0x", 0, config.nonce)
    await vault.exec(vault.address, BigNumber.from(0), "0x", 0, config.nonce, [sig1, sig2])
    */
}
test()