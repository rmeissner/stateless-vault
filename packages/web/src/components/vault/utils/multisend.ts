import { VaultTransaction } from '@rmeissner/stateless-vault-sdk'
import { BigNumber, utils, } from 'ethers'
import { MetaTransaction } from 'src/logic/relayRepository'
import { multiSendAddress } from 'src/utils/config'
import multiSendAbi from './multisend.json'

const multiSendInterface = new utils.Interface(multiSendAbi)

export const metaTxToVaultTx = (metaTx: MetaTransaction, nonce: BigNumber, meta: any | undefined): VaultTransaction => {
    const metaString = meta ? JSON.stringify(meta) : undefined
    return {
        to: metaTx.to,
        value: metaTx.value,
        data: metaTx.data,
        operation: metaTx.operation || 0,
        minAvailableGas: "0x00",
        nonce: nonce.toHexString(),
        metaHash: "", // Will be set by repo,
        meta: metaString
    }
}

const removeHexPrefix = (input: string) => input.toLowerCase().startsWith("0x") ? input.slice(2) : input;

const encodeData = function (operation: number, to: string, value: string, data: string) {
    let dataBuffer = Buffer.from(removeHexPrefix(data), "hex")
    return removeHexPrefix(utils.solidityPack(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [operation, to, BigNumber.from(value).toHexString(), dataBuffer.length, dataBuffer]
    ))
}

export const buildMultiSend = async (transactions: MetaTransaction[]): Promise<MetaTransaction> => {
    if (transactions.length < 0) throw Error("Cannot encode empty transactions")
    if (transactions.length == 1) return {
        ...transactions[0],
        value: BigNumber.from(transactions[0].value).toHexString()
    }
    let multiSendBytes = "0x"
    for (let transaction of transactions) {
        multiSendBytes += encodeData(0, transaction.to, transaction.value, transaction.data)
    }
    const multiSendData = multiSendInterface.encodeFunctionData("multiSend", [multiSendBytes])
    return {
        to: multiSendAddress,
        value: "0x00",
        data: multiSendData,
        operation: 1
    }
}

/**
 * Methods tries to decode multisend. If no multisend is detected the original transaction is returned.
 * @param transaction Meta transaction that should be decoded
 */
export const decodeMultiSend = async (transaction: MetaTransaction): Promise<MetaTransaction[]> => {
    if (transaction.operation != 1) return [transaction]
    if (transaction.to.toLowerCase() !== multiSendAddress.toLowerCase()) return [transaction]
    if (!BigNumber.from(transaction.value).eq(BigNumber.from(0))) return [transaction]
    try {
        const transactions = []
        const [multiSendBytes] = multiSendInterface.decodeFunctionData("multiSend", transaction.data)
        const rawData = removeHexPrefix(multiSendBytes)
        let index = 0;
        while (index < rawData.length) {
            const operation = parseInt(rawData.slice(index, index += 2), 16)
            const to = utils.getAddress("0x" + rawData.slice(index, index += 40))
            const value = BigNumber.from("0x" + rawData.slice(index, index += 64)).toHexString()
            const dataLength = parseInt(rawData.slice(index, index += 64), 16) * 2
            const data = "0x" + rawData.slice(index, index += dataLength)
            transactions.push({
                to,
                value,
                operation,
                data
            })
        }
        return transactions
    } catch (e) {
        console.error(e)
    }
    return [transaction]
}