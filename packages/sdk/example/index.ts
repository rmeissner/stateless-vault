import axios from 'axios'
import { config } from 'dotenv'
import IpfsClient from 'ipfs-http-client';
import { ethers, utils, Wallet, BigNumber } from 'ethers'
import StatelessVault from '@rmeissner/stateless-vault-contracts/build/contracts/StatelessVault.json'
import RelayedFactory from '@rmeissner/stateless-vault-contracts/build/contracts/ProxyFactoryWithInitializor.json'
import { Vault, VaultSigner, VaultConfigUpdate, VaultExecutedTransaction, LocalVaultFactory, RelayedVaultFactory, SetupTransaction, VaultTransaction } from '../src/index'
config()

const mnemonic = process.env.MNEMONIC!!
const rpcUrl = process.env.RPC_URL!!
const browserUrlTx = process.env.BROWSER_URL_TX!!
const browserUrlAddress = process.env.BROWSER_URL_ADDRESS!!
const proxyFactoryAddress = process.env.PROXY_FACTORY_ADDRESS!!
const relayUrl = process.env.RELAY_URL!!
const network = 4

const ipfs = IpfsClient({
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https'
});

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const signer = Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/2").connect(provider)

interface RelayEstimation {
    fee: string,
    feeReceiver: string,
    transaction: SetupTransaction
}

const getOrCreateRelayed = async (salt: string): Promise<Vault> => {
    const factory = new RelayedVaultFactory({
        factoryAddress: RelayedFactory.networks[network].address,
        vaultImplementationAddress: StatelessVault.networks[network].address,
        provider
    })
    const signers = [await signer.getAddress()]
    const saltNonce = factory.saltNonce(salt)
    const vaultAddress = await factory.calculateAddress(
        saltNonce, signers
    )
    const contractCode = await provider.getCode(vaultAddress)
    if (contractCode != "0x") return new Vault(provider, vaultAddress)
    const setupData = await factory.creationData({
        signers,
        threshold: BigNumber.from(1)
    })

    const response = await axios.post(`${relayUrl}/v1/transactions/prepare`, {
        to: vaultAddress,
        value: "0x0",
        data: setupData,
        operation: 0
    })
    const data = response.data as RelayEstimation
    console.log({ data })

    const relayData = await factory.relayData(
        signer, data.transaction, saltNonce
    )
    const vaultBalance = await provider.getBalance(vaultAddress)
    if (vaultBalance < BigNumber.from(data.fee)) throw Error(`Not enough funds to deploy to ${vaultAddress} (${utils.formatEther(vaultBalance)} < ${utils.formatEther(data.fee)})`)
    const deployment = await axios.post(`${relayUrl}/v1/deployment/execute`, relayData)
    console.log(`Deploy Vault @ ${browserUrlTx.replace("{}", deployment.data)} >>> fee ${utils.formatEther(data.fee)} ETH`)
    const deploymentTx = await signer.provider.getTransaction(deployment.data)
    await deploymentTx.wait()
    return new Vault(provider, vaultAddress)
}

const relayTransaction = async (vault: Vault, transaction: VaultTransaction, signatures: string[]): Promise<string> => {
    const execData = await vault.buildExecData(transaction, signatures)
    const response = await axios.post(`${relayUrl}/v1/transactions/execute/vault`, execData)
    return response.data
}

const prepareRelayTransaction = async (to: string, value: BigNumber, data: string, operation: number): Promise<RelayEstimation> => {
    const response = await axios.post(`${relayUrl}/v1/transactions/prepare`, {
        to,
        value: value.toHexString(),
        data,
        operation
    })
    return response.data as RelayEstimation
}

const getOrCreateLocal = async (salt: string): Promise<Vault> => {
    const factory = new LocalVaultFactory({
        factoryAddress: proxyFactoryAddress,
        vaultImplementationAddress: StatelessVault.networks[network].address,
        signer
    })

    const vault = await factory.create({
        signers: [await signer.getAddress()],
        threshold: BigNumber.from(1)
    }, salt)
    return vault
}

const test = async (submit: boolean) => {
    const vault = await getOrCreateRelayed("test_vault")
    console.log(`Vault @ ${browserUrlAddress.replace("{}", vault.address)}`)
    const config = await vault.loadConfig()
    console.log("############# Configuration ############")
    console.log({ config })
    console.log()
    console.log("############# Transactions #############")
    const txs = await vault.loadTransactions();
    for (let tx of txs) {
        switch (tx.action) {
            case "config_update":
                if (tx.nonce) {
                    console.log((`Config change (nonce ${tx.nonce}) @ ${browserUrlTx.replace("{}", tx.txHash)}`))
                } else {
                    console.log(`Vault setup @ ${browserUrlTx.replace("{}", tx.txHash)}`)
                }
                break;
            case "executed_transaction":
                if (tx.success) {
                    console.log(`Tx success (nonce ${tx.nonce}) @ ${browserUrlTx.replace("{}", tx.ethereumHash)}`)
                } else {
                    console.log(`Tx failure (nonce ${tx.nonce}) @ ${browserUrlTx.replace("{}", tx.ethereumHash)}`)
                }
                const txInfo = await vault.fetchTxByHash(ipfs, tx.vaultHash)
                console.log("Vault tx information: " + JSON.stringify(txInfo, undefined, 2))
                break;
        }
    }
    if (!submit) return
    console.log()
    console.log()
    console.log()
    console.log("############ New Transaction ###########")
    const estimatedTx = await prepareRelayTransaction("0xfd807255a0557655e6632A34e9EB36746c6C76d9", utils.parseEther("0.001"), "0x", 0)
    const { vaultHash } = await vault.publishTx(
        ipfs,
        estimatedTx.transaction.to,
        BigNumber.from(estimatedTx.transaction.value),
        estimatedTx.transaction.data,
        estimatedTx.transaction.operation,
        config.nonce,
        JSON.stringify({
            app: "Example script",
            purpose: "Simple script transfer",
            fee: estimatedTx.fee,
            relayer: estimatedTx.feeReceiver
        })
    )
    console.log("Vault tx hash: " + vaultHash)
    console.log()
    console.log()
    console.log("############ Sign Transaction ##########")
    const tx = await vault.fetchTxByHash(ipfs, vaultHash)
    console.log("Vault tx information: " + JSON.stringify(tx, undefined, 2))
    const vaultSigner = new VaultSigner(vault, signer)
    const signature = await vaultSigner.signTx(tx)
    console.log("Signature: " + signature);

    console.log("############ Relay Transaction ##########")
    console.log("Ethereum tx hash: " + await relayTransaction(vault, tx, [signature]))
}
test(false)