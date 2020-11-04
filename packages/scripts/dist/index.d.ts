import { Contract, ethers, Signer, BigNumber } from 'ethers';
export interface FactoryConfig {
    factoryAddress: string;
    vaultImplementationAddress: string;
    signer: Signer;
}
export interface VaultSetup {
    signers: string[];
    threshold: BigNumber;
}
export declare class VaultFactory {
    readonly vaultInterface: ethers.utils.Interface;
    readonly config: FactoryConfig;
    readonly factoryInstance: Contract;
    constructor(config: FactoryConfig);
    calculateAddress(initializer: string, saltNonce: string): Promise<string>;
    create(vaultSetup: VaultSetup, saltString?: string): Promise<Vault>;
}
export interface VaultConfig extends VaultSetup {
    implementation: string;
    signatureChecker: string;
    requestGuard: string;
    fallbackHandler: string;
    nonce: BigNumber;
}
export declare class Vault {
    readonly signer: Signer;
    readonly address: string;
    readonly vaultInstance: Contract;
    constructor(signer: Signer, vaultAddress: string);
    loadTransactions(): Promise<string[]>;
    loadConfig(): Promise<VaultConfig>;
    signExec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber): Promise<string>;
    signExecFromHash(ipfs: any, txHash: string): Promise<string>;
    publishExec(ipfs: any, to: string, value: BigNumber, dataString: string, operation: number, nonce: BigNumber): Promise<string>;
    signUpdate(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber): Promise<string>;
    formatSignature(config: VaultConfig, hashProvider: () => Promise<string>, signatures?: string[]): Promise<{
        signaturesString: string;
        signers: string[];
    }>;
    update(newSigners: string[], newThreshold: BigNumber, nonce: BigNumber, signatures?: string[]): Promise<void>;
    exec(to: string, value: BigNumber, data: string, operation: number, nonce: BigNumber, signatures?: string[]): Promise<void>;
}
