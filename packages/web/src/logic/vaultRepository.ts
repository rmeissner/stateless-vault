import { Vault } from "@rmeissner/stateless-vault-sdk"
import { loadProvider } from "./ethereumRepository"
import { utils } from 'ethers'

const VAULTS_STORAGE_KEY = "vault_repository.vaults"
const SELECTED_VAULT_STORAGE_KEY = "vault_repository.selected_vault"

interface StorageHolder<T> {
    readonly version: number,
    readonly value: T
}

const loadVaultStorage = (): { [key: string]: string} => {
    const holder: StorageHolder<{ [key: string]: string}> = JSON.parse(localStorage.getItem(VAULTS_STORAGE_KEY)!!)
    if (holder.version == 0) throw Error("Unknown storage version " + holder.version)
    return holder.value
}

const writeVaultStorage = (vaults: { [key: string]: string})  => {
    const holder: StorageHolder<{ [key: string]: string}> = {
        version: 0,
        value: vaults
    }
    localStorage.setItem(VAULTS_STORAGE_KEY, JSON.stringify(holder))
}

export const loadLastSelectedVault = async (): Promise<string | undefined> => {
    const store = localStorage.getItem(SELECTED_VAULT_STORAGE_KEY)
    if (!store) return undefined
    const holder: StorageHolder<string> = JSON.parse(store)
    if (holder.version == 0) throw Error("Unknown storage version " + holder.version)
    return holder.value
}

export const loadVaultName = async(address: string): Promise<string> => {
    const vaults = await loadVaultStorage()
    return vaults[address]
}

export const setLastSelectedVault = async (address: string) => {
    const holder: StorageHolder<string> = {
        version: 0,
        value: address
    }
    localStorage.setItem(SELECTED_VAULT_STORAGE_KEY, JSON.stringify(holder))
}

export const loadVaults = async(): Promise<[string, string][]> => {
    try {
        const vaults = loadVaultStorage()
        return Object.entries(vaults)
    } catch (e) {
        console.log(e)
        return []
    }
}

export const setVault = async(address: string, name: string): Promise<void> => {
    try {
        const vaults = loadVaultStorage()
        vaults[address] = name
        writeVaultStorage(vaults)
    } catch (e) {
        console.log(e)
    }
}

export const removeVault = async(address: string): Promise<void> => {
    try {
        const vaults = loadVaultStorage()
        delete vaults[address]
        writeVaultStorage(vaults)
    } catch (e) {
        console.log(e)
    }
}

export const getVaultInstance = async(address: string): Promise<Vault> => {
    if (!utils.isAddress(address)) throw Error("Invalid Address")
    return new Vault(loadProvider(), address)
}