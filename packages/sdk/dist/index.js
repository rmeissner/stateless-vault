import FactoryAbi from './abis/Factory.json';
import EIP712Domain from "eth-typed-data";
import { Contract, constants, utils, BigNumber } from 'ethers';
import { buildValidationData } from './utils/proof';
import { pullWithKeccak } from './utils/ipfs';
import { prepareEthSignSignatureForSafe } from './utils/signatures';
import StatelessVault from '@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json';
import Initializor from '@rmeissner/stateless-vault-contracts/build/contracts/Initializor.json';
import RelayedFactory from '@rmeissner/stateless-vault-contracts/build/contracts/ProxyFactoryWithInitializor.json';
export class BaseFactory {
    constructor() {
        this.vaultInterface = Contract.getInterface(StatelessVault.abi);
    }
    async creationData(vaultSetup) {
        return this.vaultInterface.encodeFunctionData("setup(address[],uint256,address,address,address)", [vaultSetup.signers, vaultSetup.threshold, constants.AddressZero, constants.AddressZero, constants.AddressZero]);
    }
}
export class LocalVaultFactory extends BaseFactory {
    constructor(config) {
        super();
        this.config = config;
        this.factoryInstance = new Contract(config.factoryAddress, FactoryAbi, config.signer);
    }
    async calculateAddress(initializer, saltNonce) {
        const initializerHash = utils.solidityKeccak256(["bytes"], [initializer]);
        const salt = utils.solidityKeccak256(['bytes32', 'uint256'], [initializerHash, saltNonce]);
        const proxyCreationCode = await this.factoryInstance.proxyCreationCode();
        const proxyDeploymentCode = utils.solidityPack(['bytes', 'uint256'], [proxyCreationCode, this.config.vaultImplementationAddress]);
        const proxyDeploymentCodeHash = utils.solidityKeccak256(["bytes"], [proxyDeploymentCode]);
        const address = utils.solidityKeccak256(['bytes1', 'address', 'bytes32', 'bytes32'], ["0xFF", this.config.factoryAddress, salt, proxyDeploymentCodeHash]);
        return "0x" + address.slice(-40);
    }
    async create(vaultSetup, saltString) {
        const initializer = await this.creationData(vaultSetup);
        const saltNonce = utils.keccak256(Buffer.from(saltString || `${new Date()}`));
        try {
            const tx = await this.factoryInstance.createProxyWithNonce(this.config.vaultImplementationAddress, initializer, saltNonce);
            await tx.wait();
            console.log(tx);
        }
        catch (e) { }
        const address = await this.calculateAddress(initializer, saltNonce);
        return new Vault(this.config.signer.provider, address);
    }
}
export class RelayedVaultFactory extends BaseFactory {
    constructor(config) {
        super();
        this.initializorInterface = Contract.getInterface(Initializor.abi);
        this.config = config;
        this.relayFactoryInstance = new Contract(config.relayFactoryAddress, RelayedFactory.abi, config.provider);
        this.factoryInstance = new Contract(config.factoryAddress, FactoryAbi, config.provider);
    }
    async calculateAddress(saltNonce, validators, intializor) {
        const proxyCreationData = this.initializorInterface.encodeFunctionData("setValidators", [validators]);
        const intializorAddress = intializor || await this.relayFactoryInstance.callStatic.initializor();
        const initializerHash = utils.solidityKeccak256(["bytes"], [proxyCreationData]);
        const salt = utils.solidityKeccak256(['bytes32', 'uint256'], [initializerHash, saltNonce]);
        const proxyCreationCode = await this.factoryInstance.proxyCreationCode();
        const proxyDeploymentCode = utils.solidityPack(['bytes', 'uint256'], [proxyCreationCode, intializorAddress]);
        const proxyDeploymentCodeHash = utils.solidityKeccak256(["bytes"], [proxyDeploymentCode]);
        const address = utils.solidityKeccak256(['bytes1', 'address', 'bytes32', 'bytes32'], ["0xFF", this.config.factoryAddress, salt, proxyDeploymentCodeHash]);
        return "0x" + address.slice(-40);
    }
    saltNonce(saltString) {
        return utils.keccak256(Buffer.from(saltString || `${new Date()}`));
    }
    async relayData(validator, setupTransaction, saltNonce) {
        const intializorAddress = await this.relayFactoryInstance.callStatic.initializor();
        const initializor = new Contract(intializorAddress, this.initializorInterface, this.config.provider);
        const validatorAddress = await validator.getAddress();
        const vaultAddress = await this.calculateAddress(saltNonce, [validatorAddress], intializorAddress);
        const setupHash = await initializor.callStatic.generateSetupHashForAddress(vaultAddress, this.config.vaultImplementationAddress, setupTransaction.to, setupTransaction.value, setupTransaction.data, setupTransaction.operation, utils.solidityPack(["address[]"], [[validatorAddress]]));
        const signatures = prepareEthSignSignatureForSafe(await validator.signMessage(utils.arrayify(setupHash)));
        return {
            implementation: this.config.vaultImplementationAddress,
            transaction: setupTransaction,
            validators: [validatorAddress],
            signatures,
            nonce: saltNonce
        };
    }
}
export class Vault {
    constructor(provider, vaultAddress) {
        this.address = vaultAddress;
        this.vaultInstance = new Contract(vaultAddress, StatelessVault.abi, provider);
    }
    async loadTransactions() {
        const txs = [];
        const configTopic = this.vaultInstance.interface.getEventTopic("Configuration");
        const failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure");
        const successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess");
        const events = await this.vaultInstance.queryFilter({
            address: this.vaultInstance.address,
            topics: [
                [
                    configTopic, failedTopic, successTopic
                ]
            ]
        });
        for (const e of events) {
            if (e.topics[0] == configTopic) {
                const config = this.vaultInstance.interface.decodeEventLog("Configuration", e.data, e.topics);
                if (config.currentNonce.eq(0)) {
                    txs.push({
                        action: "config_update",
                        txHash: e.transactionHash
                    });
                }
                else {
                    txs.push({
                        action: "config_update",
                        txHash: e.transactionHash,
                        nonce: config.currentNonce - 1
                    });
                }
            }
            else if (e.topics[0] == failedTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog("ExecutionFailure", e.data, e.topics);
                txs.push({
                    action: "executed_transaction",
                    vaultHash: exec.txHash,
                    ethereumHash: e.transactionHash,
                    nonce: exec.usedNonce,
                    success: false
                });
            }
            else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog("ExecutionSuccess", e.data, e.topics);
                txs.push({
                    action: "executed_transaction",
                    vaultHash: exec.txHash,
                    ethereumHash: e.transactionHash,
                    nonce: exec.usedNonce,
                    success: true
                });
            }
        }
        return txs.reverse();
    }
    async loadConfig() {
        const configTopic = this.vaultInstance.interface.getEventTopic("Configuration");
        const failedTopic = this.vaultInstance.interface.getEventTopic("ExecutionFailure");
        const successTopic = this.vaultInstance.interface.getEventTopic("ExecutionSuccess");
        const events = await this.vaultInstance.queryFilter({
            address: this.vaultInstance.address,
            topics: [
                [
                    configTopic, failedTopic, successTopic
                ]
            ]
        });
        const currentConfig = {
            implementation: constants.AddressZero,
            signatureChecker: constants.AddressZero,
            requestGuard: constants.AddressZero,
            fallbackHandler: constants.AddressZero,
            signers: [],
            threshold: BigNumber.from(0),
            nonce: BigNumber.from(-1)
        };
        for (const e of events) {
            if (e.topics[0] == configTopic) {
                const config = this.vaultInstance.interface.decodeEventLog("Configuration", e.data, e.topics);
                if (config.currentNonce >= currentConfig.nonce) {
                    currentConfig.signers = config.signers;
                    currentConfig.threshold = config.threshold;
                    currentConfig.nonce = config.currentNonce;
                    currentConfig.implementation = config.implementation;
                    currentConfig.signatureChecker = config.signatureChecker;
                    currentConfig.requestGuard = config.requestGuard;
                    currentConfig.fallbackHandler = config.fallbackHandler;
                }
            }
            else if (e.topics[0] == failedTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog("ExecutionFailure", e.data, e.topics);
                if (currentConfig.nonce <= exec.usedNonce) {
                    currentConfig.nonce = exec.usedNonce.add(1);
                }
            }
            else if (e.topics[0] == successTopic) {
                const exec = this.vaultInstance.interface.decodeEventLog("ExecutionSuccess", e.data, e.topics);
                console.log(exec);
                if (currentConfig.nonce <= exec.usedNonce) {
                    currentConfig.nonce = exec.usedNonce.add(1);
                }
            }
            else {
                console.warn("Unknown log");
            }
        }
        if (currentConfig.nonce.eq(-1))
            throw Error("could not load config");
        return currentConfig;
    }
    async fetchTxByHash(ipfs, txHash) {
        const hashData = await pullWithKeccak(ipfs, txHash);
        const tx = await pullWithKeccak(ipfs, hashData.substring(68));
        const txData = await pullWithKeccak(ipfs, tx.substring(3 * 64, 4 * 64));
        const to = utils.getAddress(tx.substring(64 + 24, 2 * 64));
        const value = BigNumber.from("0x" + tx.substring(2 * 64, 3 * 64));
        const data = "0x" + txData;
        const operation = parseInt(tx.substring(4 * 64, 5 * 64), 16);
        const minAvailableGas = BigNumber.from("0x" + tx.substring(5 * 64, 6 * 64));
        const nonce = BigNumber.from("0x" + tx.substring(6 * 64, 7 * 64));
        const metaHash = "0x" + tx.substring(7 * 64, 8 * 64);
        let meta;
        if (metaHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            try {
                meta = await pullWithKeccak(ipfs, metaHash, "utf8");
            }
            catch (e) {
                console.error(e);
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
        };
    }
    async publishTx(ipfs, to, value, dataString, operation, nonce, meta) {
        const metaData = meta ? JSON.stringify(meta) : null;
        const metaHash = metaData ? utils.solidityKeccak256(["string"], [metaData]) : "0x";
        if (metaData) {
            console.log("Publish meta data");
            for await (const res of ipfs.add(metaData, { hashAlg: "keccak-256" })) {
                console.log(`metadata: ${res.path}`);
            }
        }
        const data = utils.arrayify(dataString);
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
        const minAvailableGas = 0;
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
        console.log("Publish data");
        for await (const res of ipfs.add(data, { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }
        // TX_TYPEHASH, to, value, keccak256(data), operation, minAvailableGas, nonce
        console.log("Publish tx");
        for await (const res of ipfs.add(vaultTx.encodeData(), { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }
        // byte(0x19), byte(0x01), domainSeparator, txHash
        console.log("Publish tx hash");
        const txHash = "0x" + vaultTx.signHash().toString('hex');
        for await (const res of ipfs.add(vaultTx.encode(), { hashAlg: "keccak-256" })) {
            console.log(`metadata: ${res.path}`);
        }
        const dataHash = await this.vaultInstance.generateTxHash(to, value, data, operation, minAvailableGas, nonce, metaHash);
        if (txHash != dataHash)
            throw Error("Invalid hash generated");
        return txHash;
    }
    async formatSignature(config, hashProvider, signatures, signer) {
        let sigs;
        let signers;
        if (signatures) {
            const dataHash = await hashProvider();
            sigs = signatures.map((sig) => sig.slice(2));
            let prevIndex = -1;
            signers = signatures.map((sig) => {
                const signer = utils.verifyMessage(utils.arrayify(dataHash), sig);
                const signerIndex = config.signers.indexOf(signer, prevIndex + 1);
                if (signerIndex <= prevIndex)
                    throw Error("Invalid signer");
                prevIndex = signerIndex;
                return signer;
            });
        }
        else if (config.signers.length == 1) {
            const singleSigner = await signer.getAddress();
            if (config.signers.indexOf(singleSigner) < 0)
                throw Error("Signer is not an owner");
            sigs = [utils.solidityPack(["uint256", "uint256", "bytes1"], [singleSigner, 0, "0x01"]).slice(2)];
            signers = [singleSigner];
        }
        else {
            throw Error("Cannot execute transaction due to missing confirmation");
        }
        return { signaturesString: "0x" + sigs.join(""), signers };
    }
    async buildExecData(transaction, signatures, signer) {
        const config = await this.loadConfig();
        if (!config.nonce.eq(transaction.nonce))
            throw Error("Invalid nonce");
        const { signaturesString, signers } = await this.formatSignature(config, () => {
            return this.vaultInstance.generateTxHash(transaction.to, transaction.value, transaction.data, transaction.operation, transaction.minAvailableGas, transaction.nonce, transaction.metaHash);
        }, signatures, signer);
        const validationData = await buildValidationData(config, signaturesString, signers);
        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true))
        return {
            wallet: this.address,
            validationData,
            transaction
        };
    }
}
export class VaultSigner {
    constructor(vault, signer) {
        this.vault = vault;
        this.signer = signer;
    }
    async signTx(transaction) {
        const dataHash = await this.vault.vaultInstance.generateTxHash(transaction.to, transaction.value, transaction.data, transaction.operation, transaction.minAvailableGas, transaction.nonce, transaction.metaHash);
        return prepareEthSignSignatureForSafe(await this.signer.signMessage(utils.arrayify(dataHash)));
    }
    async signTxFromHash(ipfs, txHash) {
        const vaultTx = await this.vault.fetchTxByHash(ipfs, txHash);
        return await this.signTx(vaultTx);
    }
    async signUpdate(newSigners, newThreshold, nonce) {
        const config = await this.vault.loadConfig();
        const dataHash = await this.vault.vaultInstance.generateConfigChangeHash(config.implementation, utils.solidityPack(["address[]"], [newSigners]), newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce, "0x");
        return prepareEthSignSignatureForSafe(await this.signer.signMessage(utils.arrayify(dataHash)));
    }
}
export class VaultExecutor {
    constructor(vault, executor) {
        this.vault = vault;
        this.executor = executor;
        this.writeVaultInstance = vault.vaultInstance.connect(executor);
    }
    async exec(to, value, data, operation, nonce, metaHash, signatures) {
        const transaction = { to, value: value.toHexString(), data, operation, nonce: nonce.toHexString(), minAvailableGas: "0x0", metaHash };
        const execData = await this.vault.buildExecData(transaction, signatures, this.executor);
        //console.log(await this.vaultInstance.callStatic.execTransaction(to, value, data, operation, 0, config.nonce, "0x", validationData, true))
        await this.writeVaultInstance.execTransaction(execData.transaction.to, execData.transaction.value, execData.transaction.data, execData.transaction.operation, execData.transaction.minAvailableGas, execData.transaction.nonce, execData.transaction.metaHash, execData.validationData, true);
    }
    async update(newSigners, newThreshold, nonce, signatures) {
        const config = await this.vault.loadConfig();
        if (!config.nonce.eq(nonce))
            throw Error("Invalid nonce");
        const { signaturesString, signers } = await this.vault.formatSignature(config, () => {
            return this.vault.vaultInstance.generateConfigChangeHash(config.implementation, utils.solidityPack(["address[]"], [newSigners]), newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce, "0x");
        }, signatures, this.executor);
        const validationData = await buildValidationData(config, signaturesString, signers);
        await this.writeVaultInstance.updateConfig(config.implementation, newSigners, newThreshold, config.signatureChecker, config.requestGuard, config.fallbackHandler, "0x", nonce, "0x", validationData);
    }
}
//# sourceMappingURL=index.js.map