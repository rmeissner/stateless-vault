import { pullWithKeccak, Vault, VaultTransaction } from "@rmeissner/stateless-vault-sdk"
import { loadProvider } from "./ethereumRepository"
import { utils, BigNumber } from 'ethers'
import IpfsClient from 'ipfs-http-client';

const VAULTS_STORAGE_KEY = "vault_repository.vaults"
const PROPOSAL_STORAGE_KEY_PREFIX = "vault_repository.proposals."
const SELECTED_VAULT_STORAGE_KEY = "vault_repository.selected_vault"
const STORAGE_IPFS_CACHE_PREFIX = "vault_repository.ipfs_cache."

interface StorageHolder<T> {
    readonly version: number,
    readonly value: T
}

const ipfs = IpfsClient({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https'
});

const loadVaultStorage = (): { [key: string]: string } => {
    const stored = localStorage.getItem(VAULTS_STORAGE_KEY)
    if (!stored) return {}
    const holder: StorageHolder<{ [key: string]: string }> = JSON.parse(stored)
    if (holder.version != 0) throw Error("Unknown storage version " + holder.version)
    return holder.value
}

const writeVaultStorage = (vaults: { [key: string]: string }) => {
    const holder: StorageHolder<{ [key: string]: string }> = {
        version: 0,
        value: vaults
    }
    localStorage.setItem(VAULTS_STORAGE_KEY, JSON.stringify(holder))
}

export const loadLastSelectedVault = async (): Promise<string | undefined> => {
    const store = localStorage.getItem(SELECTED_VAULT_STORAGE_KEY)
    if (!store) return undefined
    const holder: StorageHolder<string> = JSON.parse(store)
    if (holder.version != 0) throw Error("Unknown storage version " + holder.version)
    return holder.value
}

export const loadVaultName = async (address: string): Promise<string | undefined> => {
    const vaults = await loadVaultStorage()
    return vaults[address]
}

export const managesVault = async (address: string): Promise<boolean> => {
    const vaults = await loadVaultStorage()
    return address in vaults
}

export const removeLastSelectedVault = async () => {
    localStorage.removeItem(SELECTED_VAULT_STORAGE_KEY)
}

export const setLastSelectedVault = async (address: string) => {
    const holder: StorageHolder<string> = {
        version: 0,
        value: address
    }
    localStorage.setItem(SELECTED_VAULT_STORAGE_KEY, JSON.stringify(holder))
}

export const loadVaults = async (): Promise<{ address: string, name: string }[]> => {
    try {
        const vaults = loadVaultStorage()
        return Object.keys(vaults).sort().map((address) => {
            return {
                address,
                name: vaults[address]
            }
        })
    } catch (e) {
        console.log(e)
        return []
    }
}

export const setVault = async (address: string, name: string): Promise<void> => {
    const vaults = loadVaultStorage()
    vaults[address] = name
    writeVaultStorage(vaults)
}

export const removeVault = async (address: string): Promise<void> => {
    const vaults = loadVaultStorage()
    delete vaults[address]
    writeVaultStorage(vaults)
}

export const getVaultInstance = async (address: string): Promise<Vault> => {
    if (!utils.isAddress(address)) throw Error("Invalid Address")
    return new Vault(loadProvider(), address)
}

const cachedLoader = async (key: string, encoding: string): Promise<string> => {
    try {
        const cached = localStorage.getItem(STORAGE_IPFS_CACHE_PREFIX + key)
        if (cached) return cached
    } catch (e) {
        console.error(e)
    }
    const value = await pullWithKeccak(ipfs, key, encoding)
    try {
        localStorage.setItem(STORAGE_IPFS_CACHE_PREFIX + key, value)
    } catch (e) {
        console.error(e)
    }
    return value
}

export const loadTransactionDetails = async (vault: Vault, vaultHash: string): Promise<VaultTransaction> => {
    return await vault.fetchTxByHash(ipfs, vaultHash, cachedLoader)
}

const loadProposalStorage = (vaultAddress: string): { [key: string]: VaultTransaction } => {
    const stored = localStorage.getItem(PROPOSAL_STORAGE_KEY_PREFIX + vaultAddress)
    if (!stored) return {}
    const holder: StorageHolder<{ [key: string]: VaultTransaction }> = JSON.parse(stored)
    if (holder.version != 0) throw Error("Unknown storage version " + holder.version)
    return holder.value
}

const writeProposalStorage = (vaultAddress: string, vaults: { [key: string]: VaultTransaction }) => {
    const holder: StorageHolder<{ [key: string]: VaultTransaction }> = {
        version: 0,
        value: vaults
    }
    localStorage.setItem(PROPOSAL_STORAGE_KEY_PREFIX + vaultAddress, JSON.stringify(holder))
}

export const loadTransactionProposals = async (vault: Vault): Promise<{ vaultHash: string, transaction: VaultTransaction }[]> => {
    const proposals = loadProposalStorage(vault.address)
    return Object.entries(proposals)
        .map(([vaultHash, transaction]) => { return { vaultHash, transaction } })
        .sort((left, right) => BigNumber.from(left.transaction.nonce).sub(BigNumber.from(right.transaction.nonce)).toNumber())
}

export const removeTransactionProposals = async (vault: Vault, vaultHashes: string[]): Promise<void> => {
    const proposals = loadProposalStorage(vault.address)
    for (let vaultHash of vaultHashes) {
        delete proposals[vaultHash]
    }
    writeProposalStorage(vault.address, proposals)
}

export const addTransactionProposal = async (vault: Vault, transaction: VaultTransaction): Promise<string> => {
    console.log(ipfs)
    const { vaultHash, metaHash } = await vault.publishTx(
        ipfs,
        transaction.to,
        BigNumber.from(transaction.value),
        transaction.data,
        transaction.operation,
        BigNumber.from(transaction.nonce),
        transaction.meta
    )
    transaction.metaHash = metaHash
    const proposals = loadProposalStorage(vault.address)
    proposals[vaultHash] = transaction
    writeProposalStorage(vault.address, proposals)
    return vaultHash
}