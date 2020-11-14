import FactoryAbi from './abis/Factory.json'
import EIP712Domain from "eth-typed-data";
import { Contract, constants, utils, Signer, BigNumber, providers } from 'ethers'
import { buildValidationData } from './utils/proof'
import { pullWithKeccak } from './utils/ipfs'
import { prepareEthSignSignatureForSafe } from './utils/signatures'
import StatelessVault from '@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json'
import Initializor from '@rmeissner/stateless-vault-contracts/build/contracts/Initializor.json'
import RelayedFactory from '@rmeissner/stateless-vault-contracts/build/contracts/ProxyFactoryWithInitializor.json'

export { pullWithKeccak }

export interface LocalFactoryConfig {
    factoryAddress: string,
    vaultImplementationAddress: string,
    signer: Signer
}

export interface RelayedFactoryConfig {
    factoryAddress: string,
    relayFactoryAddress: string,
    vaultImplementationAddress: string,
    provider: providers.Provider
}

export interface VaultSetup {
    signers: string[],
    threshold: BigNumber
}

export abstract class BaseFactory {

    readonly vaultInterface = Contract.getInterface(StatelessVault.abi)

    async creationData(vaultSetup: VaultSetup): Promise<string> {
        return this.vaultInterface.encodeFunctionData(
            "setup(address[],uint256,address,address,address)",
            [vaultSetup.signers, vaultSetup.threshold, constants.AddressZero, constants.AddressZero, constants.AddressZero]
        )
    }
}

export class LocalVaultFactory extends BaseFactory {
    readonly config: LocalFactoryConfig
    readonly factoryInstance: Contract

    constructor(config: LocalFactoryConfig) {
        super()
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
        const initializer = await this.creationData(vaultSetup)
        const saltNonce = utils.keccak256(Buffer.from(saltString || `${new Date()}`))
        try {
            const tx = await this.factoryInstance.createProxyWithNonce(this.config.vaultImplementationAddress, initializer, saltNonce)
            await tx.wait()
            console.log(tx)
        } catch (e) { }
        const address = await this.calculateAddress(initializer, saltNonce)
        return new Vault(this.config.signer.provider!!, address)
    }
}

export interface SetupTransaction {
    to: string,
    value: string,
    data: string,
    operation: number
}

export interface RelayDeployment {
    implementation: string,
    validators: string[],
    signatures: string,
    transaction: SetupTransaction,
    nonce: string
}

export interface VaultTransaction {
    to: string,
    value: string,
    data: string,
    operation: number,
    minAvailableGas: string,
    nonce: string,
    metaHash: string,
    meta?: string
}

export interface VaultExecInfo {
    wallet: string,
    validationData: string,
    transaction: VaultTransaction
}

export class RelayedVaultFactory extends BaseFactory {
    readonly initializorInterface = Contract.getInterface(Initializor.abi)
    readonly config: RelayedFactoryConfig
    readonly relayFactoryInstance: Contract
    readonly factoryInstance: Contract

    constructor(config: RelayedFactoryConfig) {
        super()
        this.config = config
        this.relayFactoryInstance = new Contract(config.relayFactoryAddress, RelayedFactory.abi, config.provider)
        this.factoryInstance = new Contract(config.factoryAddress, FactoryAbi, config.provider)
    }

    async calculateAddress(saltNonce: string, validators: string[], intializor?: string): Promise<string> {
        const proxyCreationData = this.initializorInterface.encodeFunctionData(
            "setValidators",
            [validators]
        )
        const intializorAddress = intializor || await this.relayFactoryInstance.callStatic.initializor()
        const initializerHash = utils.solidityKeccak256(["bytes"], [proxyCreationData])
        const salt = utils.solidityKeccak256(['bytes32', 'uint256'], [initializerHash, saltNonce])
        const proxyCreationCode = await this.factoryInstance.proxyCreationCode()
        const proxyDeploymentCode = utils.solidityPack(['bytes', 'uint256'], [proxyCreationCode, intializorAddress])
        const proxyDeploymentCodeHash = utils.solidityKeccak256(["bytes"], [proxyDeploymentCode])
        const address = utils.solidityKeccak256(
            ['bytes1', 'address', 'bytes32', 'bytes32'],
            ["0xFF", this.config.factoryAddress, salt, proxyDeploymentCodeHash]
        )
        return "0x" + address.slice(-40)
    }

    saltNonce(saltString?: string): string {
        return utils.keccak256(Buffer.from(saltString || `${new Date()}`))
    }

    async relayData(validator: Signer, setupTransaction: SetupTransaction, saltNonce: string): Promise<RelayDeployment> {
        const intializorAddress = await this.relayFactoryInstance.callStatic.initializor()
        const initializor = new Contract(intializorAddress, this.initializorInterface, this.config.provider)
        const validatorAddress = await validator.getAddress()
        const vaultAddress = await this.calculateAddress(saltNonce, [validatorAddress], intializorAddress)
        const setupHash = await initializor.callStatic.generateSetupHashForAddress(
            vaultAddress,
            this.config.vaultImplementationAddress,
            setupTransaction.to,
            setupTransaction.value,
            setupTransaction.data,
            setupTransaction.operation,
            utils.solidityPack(["address[]"], [[validatorAddress]])
        )
        const signatures = prepareEthSignSignatureForSafe(await validator.signMessage(utils.arrayify(setupHash)))
        return {
            implementation: this.config.vaultImplementationAddress,
            transaction: setupTransaction,
            validators: [validatorAddress],
            signatures,
            nonce: saltNonce
        }
    }
}

export interface VaultConfig extends VaultSetup {
    implementation: string,
    signatureChecker: string,
    requestGuard: string,
    fallbackHandler: string,
    nonce: BigNumber
}

export type VaultConfigUpdate = {
    action: "config_update";
    readonly txHash: string;
    readonly nonce?: number;
}

export type VaultExecutedTransaction = {
    action: "executed_transaction";
    readonly vaultHash: string;
    readonly ethereumHash: string;
    readonly nonce: number;
    readonly success: boolean;
}

export type VaultAction = VaultConfigUpdate | VaultExecutedTransaction

export enum VaultTransactionStatus {
    SUCCESS,
    FAILED,
    UNKNOWN
}

export class Vault {
    readonly address: string
    readonly vaultInstance: Contract

    constructor(provider: providers.Provider, vaultAddress: string) {
        this.address = vaultAddress
        this.vaultInstance = new Contract(vaultAddress, StatelessVault.abi, provider)
    }

    async loadTransactions(): Promise<VaultAction[]> {
        const txs: VaultAction[] = []
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
                    "Configuration", e.data, e.topics
                )
                if (config.currentNonce.eq(0)) {
                    txs.push({ 
                        action: "config_update",
                        txHash: e.transactionHash 
                    })
                } else {
                    txs.push({ 
                        action: "config_update",
                        txHash: e.transactionHash,
                        nonce: config.currentNonce - 1
                    })
                }
            } else if (e.topics[0] == failedTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionFailure", e.data, e.topics
                )
                txs.push({
                    action: "executed_transaction",
                    vaultHash: exec.txHash,
                    ethereumHash: e.transactionHash,
                    nonce: exec.usedNonce,
                    success: false
                })
            } else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionSuccess", e.data, e.topics
                )
                txs.push({
                    action: "executed_transaction",
                    vaultHash: exec.txHash,
                    ethereumHash: e.transactionHash,
                    nonce: exec.usedNonce,
                    success: true
                })
            }
        }
        return txs.reverse()
    }

    async loadTransactionState(vaultHash: string): Promise<VaultTransactionStatus> {
        const failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure")
        const successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess")
        const events = await this.vaultInstance.queryFilter({
            address: this.vaultInstance.address,
            topics: [
                [
                    failedTopic, successTopic
                ],
                null, // usedNonce,
                vaultHash
            ]
        })
        if (events.length != 1) return VaultTransactionStatus.UNKNOWN
        return events.length[0].topics[0] === successTopic ? VaultTransactionStatus.SUCCESS : VaultTransactionStatus.FAILED
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
                    "Configuration", e.data, e.topics
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
                    "ExecutionFailure", e.data, e.topics
                )
                if (currentConfig.nonce <= exec.usedNonce) {
                    currentConfig.nonce = exec.usedNonce.add(1)
                }
            } else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog(
                    "ExecutionSuccess", e.data, e.topics
                )
                console.log(exec)
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

    async pullWithLoader(ipfs: any, key: string, loader?: (key: string, encoding: string) => Promise<string>, encoding?: string): Promise<string> {
        if (!loader) pullWithKeccak(ipfs, key, encoding)
        return loader(key, encoding)
    }

    async fetchTxByHash(ipfs: any, txHash: string, loader?: (skey: string, encoding: string) => Promise<string>): Promise<VaultTransaction> {
        const hashData = await this.pullWithLoader(ipfs, txHash, loader)
        const tx = await this.pullWithLoader(ipfs, hashData.substring(68), loader)
        const txData = await this.pullWithLoader(ipfs, tx.substring(3 * 64, 4 * 64), loader)
        const to = utils.getAddress(tx.substring(64 + 24, 2 * 64))
        const value = BigNumber.from("0x" + tx.substring(2 * 64, 3 * 64))
        const data = "0x" + txData
        const operation = parseInt(tx.substring(4 * 64, 5 * 64), 16)
        const minAvailableGas = BigNumber.from("0x" + tx.substring(5 * 64, 6 * 64))
        const nonce = BigNumber.from("0x" + tx.substring(6 * 64, 7 * 64))
        const metaHash = "0x" + tx.substring(7 * 64, 8 * 64)
        let meta
        if (metaHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            try {
                meta = await this.pullWithLoader(ipfs, metaHash, loader, "utf8")
            } catch (e) {
                console.error(e)
            }
        }
        return {
            to,
            value: value.toHexString(),
            data,
            operation,
            minAvailableGas: minAvailableGas.toHexString(),
            nonce: nonce.toHexString(),
            metaHash,
            meta
        }
    }

    async publishTx(ipfs: any, to: string, value: BigNumber, dataString: string, operation: number, nonce: BigNumber, meta?: any): Promise<string> {
        const metaData = meta ? JSON.stringify(meta) : null
        const metaHash = metaData ? utils.solidityKeccak256(["string"], [metaData]) : "0x"

        if (metaData) {
            console.log("Publish meta data")
            for await (const res of ipfs.add(metaData, { hashAlg: "keccak-256" })) {
                console.log(`metadata: ${res.path}`);
            }
        }

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
            metaHash
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
        const dataHash = await this.vaultInstance.generateTxHash(
            to, value, data, operation, minAvailableGas, nonce, metaHash
        )
        if (txHash != dataHash) throw Error("Invalid hash generated")
        return txHash
    }

    async formatSignature(config: VaultConfig, hashProvider: () => Promise<string>, signatures?: string[], signer?: Signer): Promise<{ signaturesString: string, signers: string[] }> {
        let sigs: string[]
        let signers: string[]
        if (signatures) {
            const dataHash = await hashProvider()
            sigs = signatures.map((sig) => sig.slice(2))
            let prevIndex = -1
            signers = signatures.map((sig) => {
                const signer = utils.verifyMessage(utils.arrayify(dataHash), sig)
                const signerIndex = config.signers.indexOf(signer, prevIndex + 1)
                if (signerIndex <= prevIndex) throw Error("Invalid signer")
                prevIndex = signerIndex
                return signer
            })
        } else if (config.signers.length == 1) {
            const singleSigner = await signer.getAddress()
            if (config.signers.indexOf(singleSigner) < 0) throw Error("Signer is not an owner")
            sigs = [utils.solidityPack(["uint256", "uint256", "bytes1"], [singleSigner, 0, "0x01"]).slice(2)]
            signers = [singleSigner]
        } else {
            throw Error("Cannot execute transaction due to missing confirmation")
        }
        return { signaturesString: "0x" + sigs.join(""), signers }
    }

    async buildExecData(transaction: VaultTransaction, signatures?: string[], signer?: Signer): Promise<VaultExecInfo> {
        const config = await this.loadConfig()
        if (!config.nonce.eq(transaction.nonce)) throw Error("Invalid nonce")
        const { signaturesString, signers } = await this.formatSignature(config, () => {
            return this.vaultInstance.generateTxHash(
                transaction.to, transaction.value, transaction.data, transaction.operation, transaction.minAvailableGas, transaction.nonce, transaction.metaHash
            )
        }, signatures, signer)
        const validationData = await buildValidationData(config, signaturesString, signers)
        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true))
        return {
            wallet: this.address,
            validationData,
            transaction
        }
    }
}

export class VaultSigner{
    constructor(readonly vault: Vault, readonly signer: Signer) {}

    async signTx(transaction: VaultTransaction): Promise<string> {
        const dataHash = await this.vault.vaultInstance.generateTxHash(
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.operation,
            transaction.minAvailableGas,
            transaction.nonce,
            transaction.metaHash
        )
        return prepareEthSignSignatureForSafe(await this.signer.signMessage(utils.arrayify(dataHash)))
    }

    async signTxFromHash(ipfs: any, txHash: string): Promise<string> {
        const vaultTx = await this.vault.fetchTxByHash(ipfs, txHash)
        return await this.signTx(vaultTx)
    }

    async signUpdate(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber): Promise<string> {
        const config = await this.vault.loadConfig()
        const dataHash = await this.vault.vaultInstance.generateConfigChangeHash(
            config.implementation,
            utils.solidityPack(["address[]"], [newSigners]),
            newThreshold,
            config.signatureChecker,
            config.requestGuard,
            config.fallbackHandler,
            "0x",
            nonce,
            "0x"
        )
        return prepareEthSignSignatureForSafe(await this.signer.signMessage(utils.arrayify(dataHash)))
    }
}

export class VaultExecutor {
    readonly writeVaultInstance: Contract
    constructor(readonly vault: Vault, readonly executor: Signer) {
        this.writeVaultInstance = vault.vaultInstance.connect(executor)
    }

    async exec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber, metaHash?: string, signatures?: string[]) {
        const transaction = { to, value: value.toHexString(), data, operation, nonce: nonce.toHexString(), minAvailableGas: "0x0", metaHash }
        const execData = await this.vault.buildExecData(transaction, signatures, this.executor)
        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true))

        await this.writeVaultInstance.execTransaction(
            execData.transaction.to,
            execData.transaction.value,
            execData.transaction.data,
            execData.transaction.operation,
            execData.transaction.minAvailableGas,
            execData.transaction.nonce,
            execData.transaction.metaHash,
            execData.validationData,
            true
        )
    }

    async update(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber, signatures?: string[]) {
        const config = await this.vault.loadConfig()
        if (!config.nonce.eq(nonce)) throw Error("Invalid nonce")
        const { signaturesString, signers } = await this.vault.formatSignature(config, () => {
            return this.vault.vaultInstance.generateConfigChangeHash(
                config.implementation,
                utils.solidityPack(["address[]"], [newSigners]),
                newThreshold,
                config.signatureChecker,
                config.requestGuard,
                config.fallbackHandler,
                "0x",
                nonce,
                "0x"
            )
        }, signatures, this.executor)
        const validationData = await buildValidationData(config, signaturesString, signers)

        await this.writeVaultInstance.updateConfig(
            config.implementation,
            newSigners,
            newThreshold,
            config.signatureChecker,
            config.requestGuard,
            config.fallbackHandler,
            "0x",
            nonce,
            "0x",
            validationData
        )
    }
}