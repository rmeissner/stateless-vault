import { VaultConfig } from '../index';
export declare const buildProof: (txSigners: string[], allSigners: string[]) => Promise<{
    indeces: number[];
    hashes: string[];
}>;
export declare const buildValidationData: (vaultConfig: VaultConfig, signatures: string, signers: string[]) => Promise<string>;
