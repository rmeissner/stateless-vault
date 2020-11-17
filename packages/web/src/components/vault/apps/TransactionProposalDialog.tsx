import * as React from 'react'
import { Vault } from '@rmeissner/stateless-vault-sdk';
import { Box, Button, Typography, createStyles, withStyles, WithStyles, List, ListItem, Dialog, DialogContent, DialogTitle, DialogActions } from '@material-ui/core'
import { RequestId, Transaction } from '@gnosis.pm/safe-apps-sdk'
import AccountInfo from 'src/components/WalletInfo';
import { utils } from 'ethers';
import { buildMultiSend, metaTxToVaultTx } from '../utils/multisend';
import { requestFee } from 'src/logic/relayRepository';
import { addTransactionProposal } from 'src/logic/vaultRepository';
import { relayUrl } from 'src/utils/config';

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

const TransactionProposalDialog: React.FC<Props> = ({ classes, open, vault, transactions, requestId, app, onConfirm, onReject }) => {
    const proposeTx = React.useCallback(async () => {
        try {
            const transaction = await buildMultiSend(transactions)
            const estimate = await requestFee(transaction)
            const config = await vault.loadConfig()
            const meta = {
                app: app,
                fee: estimate.fee,
                feeReceiver: estimate.feeReceiver,
                relay: relayUrl
            }
            await addTransactionProposal(vault, metaTxToVaultTx(estimate.transaction, config.nonce, meta))
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