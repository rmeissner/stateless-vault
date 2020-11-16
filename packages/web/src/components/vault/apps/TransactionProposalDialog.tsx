import * as React from 'react'
import { Vault, VaultTransaction } from '@rmeissner/stateless-vault-sdk';
import { addTransactionProposal } from 'src/logic/vaultRepository';
import { Box, Button, Typography, createStyles, withStyles, WithStyles, List, ListItem, Dialog, DialogContent, DialogTitle, DialogActions } from '@material-ui/core'
import { RequestId, Transaction } from '@gnosis.pm/safe-apps-sdk'
import AccountInfo from 'src/components/WalletInfo';
import { utils } from 'ethers';

const styles = createStyles({
    item: {
        display: 'block'
    }
})

interface Props extends WithStyles<typeof styles> {
    open: boolean,
    vault: Vault,
    transactions: Transaction[],
    requestId: RequestId,
    app?: string,
    onConfirm: (requestId: RequestId, vaultHash: string) => void,
    onReject: (requestId: RequestId, message: string) => void
}

const buildMultiSend = async (transactions: Transaction[], nonce: string, meta: any | undefined): Promise<VaultTransaction> => {
    const metaString = meta ? JSON.stringify(meta) : undefined
    if (transactions.length == 1) return {
        to: transactions[0].to,
        value: transactions[0].value,
        data: transactions[0].data,
        operation: 0,
        minAvailableGas: "0x00",
        nonce,
        metaHash: "", // Will be set by repo,
        meta: metaString
    }
    return {
        to: transactions[0].to,
        value: transactions[0].value,
        data: transactions[0].data,
        operation: 0,
        minAvailableGas: "0x00",
        nonce,
        metaHash: "", // Will be set by repo,
        meta: metaString
    }
}

const TransactionProposalDialog: React.FC<Props> = ({ classes, open, vault, transactions, requestId, app, onConfirm, onReject }) => {
    const proposeTx = React.useCallback(async () => {
        try {
            const config = await vault.loadConfig()
            const meta = {
                app: app
            }
            const transaction = await buildMultiSend(transactions, config.nonce.toHexString(), meta)
            await addTransactionProposal(vault, transaction)
            onConfirm(requestId, "")
        } catch (e) {
            console.error(e)
        }
    }, [vault, app, requestId, transactions, onConfirm])
    const rejectTx = React.useCallback(async () => {
        onReject(requestId, "User rejected transaction")
    }, [requestId, onReject])
    return (
        <Dialog
            open={open}
            onClose={rejectTx}
            scroll="paper"
            aria-labelledby="scroll-dialog-title"
            aria-describedby="scroll-dialog-description">
            <DialogTitle id="scroll-dialog-title">Confirm Transaction</DialogTitle>
            <DialogContent dividers={true}>
                <List>
                    {transactions.map((transaction) => (
                        <ListItem className={classes.item}>
                            <Box><AccountInfo address={transaction.to} textColor="text" /></Box>
                            <Typography>{utils.formatEther(transaction.value)} ETH</Typography>
                            <Box textOverflow="ellipsis" overflow="hidden">{transaction.data}</Box>
                        </ListItem>
                    ))}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={rejectTx} color="default">
                    Cancel
                </Button>
                <Button onClick={proposeTx} color="primary">
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(TransactionProposalDialog)