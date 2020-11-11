import { rpcUrl } from "src/utils/config"
import { Signer, providers } from "ethers"

let localProvider = new providers.JsonRpcProvider({
    url: rpcUrl
})

let localSigner: Signer | undefined = undefined

export const loadProvider = (): providers.Provider => {
    return localProvider
}

export const setLocalSigner = (signer: Signer) => {
    localSigner = signer;
}

export const clearLocalSigner = () => {
    localSigner = undefined
}

export const loadSigner = (): Signer => {
    if (!localSigner) localProvider.getSigner()
    return localSigner!!
}