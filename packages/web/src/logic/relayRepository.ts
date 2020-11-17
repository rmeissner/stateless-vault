import { Vault, VaultTransaction } from '@rmeissner/stateless-vault-sdk'
import axios from 'axios'
import { BigNumber } from 'ethers'
import { buildMultiSend, decodeMultiSend } from 'src/components/vault/utils/multisend'
import { relayUrl } from 'src/utils/config'

export interface MetaTransaction {
    to: string,
    value: string,
    data: string,
    operation?: number
}

export interface RelayEstimation {
    fee: string,
    feeReceiver: string,
    transaction: MetaTransaction
}

const sameTx = (left: MetaTransaction, right: MetaTransaction): boolean => {
    if ((left.operation || 0) != (right.operation || 0)) return false
    if (left.to.toLowerCase() !== right.to.toLowerCase()) return false
    if (!BigNumber.from(left.value).eq(BigNumber.from(right.value))) return false
    if (left.data.toLowerCase() !== right.data.toLowerCase()) return false
    return true
}

export const decodeAndCheckFee = async (estimate: RelayEstimation): Promise<MetaTransaction[]> => {
    const transactions = await decodeMultiSend(estimate.transaction)
    if (!BigNumber.from(estimate.fee).eq(BigNumber.from(0))) {
        if (transactions.length < 2) throw Error("Unknown payment logic")
        const paymentTx = transactions[-1]
        if (paymentTx.operation != 0) throw Error("Invalid payment tx operation")
        if (paymentTx.to.toLowerCase() != estimate.feeReceiver.toLowerCase()) throw Error("Invalid payment tx to")
        if (paymentTx.data != "0x") throw Error("Invalid payment tx data")
        if (!BigNumber.from(paymentTx.value).eq(BigNumber.from(estimate.fee))) throw Error("Invalid payment tx value")
    }
    return transactions
}

const checkFeeAndOptimize = async (tx: MetaTransaction, estimate: RelayEstimation): Promise<RelayEstimation> => {
    if (BigNumber.from(estimate.fee).eq(BigNumber.from(0))) {
        if (!sameTx(tx, estimate.transaction)) throw Error("Requested tx has been adjusted")
        return estimate
    }
    // If there is a fee we expect a multisig transaction
    const transactionsWithPayment = await decodeMultiSend(estimate.transaction)
    if (transactionsWithPayment.length != 2) throw Error("Unknown payment logic")
    if (!sameTx(tx, transactionsWithPayment[0])) throw Error("Requested tx has been adjusted")
    const paymentTx = transactionsWithPayment[1]
    if (paymentTx.operation != 0) throw Error("Invalid payment tx operation")
    if (paymentTx.to.toLowerCase() != estimate.feeReceiver.toLowerCase()) throw Error("Invalid payment tx to")
    if (paymentTx.data != "0x") throw Error("Invalid payment tx data")
    if (!BigNumber.from(paymentTx.value).eq(BigNumber.from(estimate.fee))) throw Error("Invalid payment tx value")
    const requestedTransactions = await decodeMultiSend(tx)
    return {
        fee: estimate.fee,
        feeReceiver: estimate.feeReceiver,
        transaction: await buildMultiSend([...requestedTransactions, paymentTx])
    }
}

export const requestFee = async (tx: MetaTransaction): Promise<RelayEstimation> => {
    const preparedTx = {
        operation: 0,
        ...tx
    }
    const response = await axios.post(`${relayUrl}/v1/transactions/prepare`, preparedTx)
    return await checkFeeAndOptimize(preparedTx, response.data as RelayEstimation)
}

export const relayTransaction = async (vault: Vault, transaction: VaultTransaction, signatures: string[]): Promise<string> => {
    const execData = await vault.buildExecData(transaction, signatures)
    const response = await axios.post(`${relayUrl}/v1/transactions/execute/vault`, execData)
    return response.data
}