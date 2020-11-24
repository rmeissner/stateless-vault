import { rpcUrl } from "src/utils/config"
import { Signer, providers, Wallet } from "ethers"

const WALLET_STORAGE_KEY = "ethereum_repository.app_wallet"
const WALLET_PASSWORD = "THIS_SHOULD_NOT_BE_HARDCODED"

let localProvider = new providers.JsonRpcProvider({
    url: rpcUrl
})

let localSigner: Signer | undefined = undefined

export const loadProvider = (): providers.JsonRpcProvider => {
    return localProvider
}

export const setLocalSigner = (signer: Signer) => {
    localSigner = signer;
}

export const clearLocalSigner = () => {
    localSigner = undefined
}

export const hasLocalSigner = (): boolean => {
    return !!localSigner
}

export const loadSigner = (): Signer | undefined => {
    return localSigner
}

export const getSignerAddress = async (): Promise<string | undefined> => {
    const signer = loadSigner()
    if (!signer) return undefined
    return await signer.getAddress()
}

export const hasAppSigner = (): boolean => {
    return !!localStorage.getItem(WALLET_STORAGE_KEY)
}

const getAppSigner = async (): Promise<Wallet> => {
    const walletState = localStorage.getItem(WALLET_STORAGE_KEY)
    const wallet = walletState ? await Wallet.fromEncryptedJson(walletState, WALLET_PASSWORD) : Wallet.createRandom()
    if (!walletState) {
        console.log("Created new app wallet")
        localStorage.setItem(WALLET_STORAGE_KEY, await wallet.encrypt(WALLET_PASSWORD, { scrypt: { N: 2 } }))
    }
    return wallet
}

export const getAppSignerAddress = async (): Promise<string | undefined> => {
    if (!hasAppSigner()) return undefined
    const appSigner = await getAppSigner()
    return appSigner.address
}

export const setAppSigner = async () => {
    setLocalSigner(await getAppSigner())
}

export const getAppMnemonic = async (): Promise<string | undefined> => {
    if (!hasAppSigner()) return undefined
    return (await getAppSigner()).mnemonic.phrase
}

export const clearAppSigner = async (): Promise<void> => {
    localStorage.removeItem(WALLET_STORAGE_KEY)
}