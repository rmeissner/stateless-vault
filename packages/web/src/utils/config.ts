import { config } from 'dotenv'

config()

export const chainNames: { [key: number]: string; } = {
    1: "mainnet",
    4: "rinkeby",
    100: "xdai"
}

export const rpcUrl: string = process.env.REACT_APP_RPC_URL!!

export const chainId: number = parseInt(process.env.REACT_APP_CHAIN_ID!!)

export const chainName: string = chainNames[chainId]

export const multiSendAddress: string = process.env.REACT_APP_MULTI_SEND_ADDRESS!!

export const factoryAddress: string = process.env.REACT_APP_FACTORY_ADDRESS!!

export const vaultImplementationAddress: string = process.env.REACT_APP_VAULT_IMPLEMENTATION_ADDRESS!!

export const relayUrl: string = process.env.REACT_APP_RELAY_URL!!