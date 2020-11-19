import { Contract, utils, Signer, BigNumber, providers } from 'ethers';
import { pullWithKeccak } from './utils/ipfs';
export { pullWithKeccak };
export interface LocalFactoryConfig {
    factoryAddress: string;
    vaultImplementationAddress: string;
    signer: Signer;
}
export interface RelayedFactoryConfig {
    factoryAddress: string;
    vaultImplementationAddress: string;
    provider: providers.Provider;
}
export interface VaultSetup {
    signers: string[];
    threshold: BigNumber;
}
export declare abstract class BaseFactory {
    readonly vaultInterface: utils.Interface;
    creationData(vaultSetup: VaultSetup): Promise<string>;
}
export declare class LocalVaultFactory extends BaseFactory {
    readonly config: LocalFactoryConfig;
    readonly factoryInstance: Contract;
    constructor(config: LocalFactoryConfig);
    calculateAddress(initializer: string, saltNonce: string): Promise<string>;
    create(vaultSetup: VaultSetup, saltString?: string): Promise<Vault>;
}
export interface SetupTransaction {
    to: string;
    value: string;
    data: string;
    operation: number;
}
export interface RelayDeployment {
    implementation: string;
    validators: string[];
    signatures: string;
    transaction: SetupTransaction;
    nonce: string;
}
export interface VaultTransaction {
    to: string;
    value: string;
    data: string;
    operation: number;
    minAvailableGas: string;
    nonce: string;
    metaHash: string;
    meta?: string;
}
export interface VaultExecInfo {
    wallet: string;
    validationData: string;
    transaction: VaultTransaction;
}
export declare class RelayedVaultFactory extends BaseFactory {
    readonly config: RelayedFactoryConfig;
    readonly factoryInstance: Contract;
    constructor(config: RelayedFactoryConfig);
    calculateAddress(saltNonce: string, validators: string[]): Promise<string>;
    saltNonce(saltString?: string): string;
    relayData(validator: Signer, setupTransaction: SetupTransaction, saltNonce: string): Promise<RelayDeployment>;
}
export interface VaultConfig extends VaultSetup {
    implementation: string;
    signatureChecker: string;
    requestGuard: string;
    fallbackHandler: string;
    nonce: BigNumber;
}
export declare type VaultConfigUpdate = {
    action: "config_update";
    readonly txHash: string;
    readonly nonce?: number;
};
export declare type VaultExecutedTransaction = {
    action: "executed_transaction";
    readonly vaultHash: string;
    readonly ethereumHash: string;
    readonly nonce: number;
    readonly success: boolean;
};
export declare type VaultAction = VaultConfigUpdate | VaultExecutedTransaction;
export declare enum VaultTransactionStatus {
    SUCCESS = 0,
    FAILED = 1,
    UNKNOWN = 2
}
export declare class Vault {
    readonly address: string;
    readonly vaultInstance: Contract;
    constructor(provider: providers.Provider, vaultAddress: string);
    loadTransactions(): Promise<VaultAction[]>;
    loadTransactionState(vaultHash: string): Promise<VaultTransactionStatus>;
    loadConfig(): Promise<VaultConfig>;
    pullWithLoader(ipfs: any, key: string, loader?: (key: string, encoding: string) => Promise<string>, encoding?: string): Promise<string>;
    fetchTxByHash(ipfs: any, txHash: string, loader?: (skey: string, encoding: string) => Promise<string>): Promise<VaultTransaction>;
    publishTx(ipfs: any, to: string, value: BigNumber, dataString: string, operation: number, nonce: BigNumber, meta?: string): Promise<{
        vaultHash: string;
        metaHash: string;
    }>;
    formatSignature(config: VaultConfig, hashProvider: () => Promise<string>, signatures?: string[], signer?: Signer): Promise<{
        signaturesString: string;
        signers: string[];
    }>;
    buildExecData(transaction: VaultTransaction, signatures?: string[], signer?: Signer): Promise<VaultExecInfo>;
}
export declare class VaultSigner {
    readonly vault: Vault;
    readonly signer: Signer;
    constructor(vault: Vault, signer: Signer);
    signTx(transaction: VaultTransaction): Promise<string>;
    signTxFromHash(ipfs: any, txHash: string): Promise<string>;
    signUpdate(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber): Promise<string>;
}
export declare class VaultExecutor {
    readonly vault: Vault;
    readonly executor: Signer;
    readonly writeVaultInstance: Contract;
    constructor(vault: Vault, executor: Signer);
    exec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber, metaHash?: string, signatures?: string[]): Promise<void>;
    update(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber, signatures?: string[]): Promise<void>;
}
