export declare class Vault {
    constructor(owners: string[], threshold: number);
}
export interface Config {
    factoryAddress: string;
    vaultImplementationAddress: string;
}
export declare class VaultFactory {
    constructor(config: Config);
}
