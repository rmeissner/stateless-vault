import * as React from 'react'
import { Vault, VaultSigner } from '@rmeissner/stateless-vault-sdk';
import { Box, Button, Checkbox, Typography, createStyles, withStyles, WithStyles, List, ListItem, Dialog, DialogContent, DialogTitle, DialogActions } from '@material-ui/core'
import { RequestId, Transaction } from '@gnosis.pm/safe-apps-sdk'
import AccountInfo from 'src/components/WalletInfo';
import { utils, BigNumber } from 'ethers';
import { buildMultiSend, metaTxToVaultTx } from '../utils/multisend';
import { RelayEstimation, relayTransaction, requestFee } from 'src/logic/relayRepository';
import { addTransactionProposal } from 'src/logic/vaultRepository';
import { relayUrl } from 'src/utils/config';
import { getSignerAddress, loadSigner, hasAppSigner, setAppSigner } from 'src/logic/ethereumRepository';

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

interface Estimate {
    canSubmit: boolean,
    nonce: BigNumber,
    estimation: RelayEstimation
}

const TransactionProposalDialog: React.FC<Props> = ({ classes, open, vault, transactions, requestId, app, onConfirm, onReject }) => {
    const [submitTx, setSubmitTx] = React.useState(true)
    const [estimate, setEstimate] = React.useState<Estimate | undefined>(undefined)
    const proposeTx = React.useCallback(async () => {
        if (!estimate) return
        try {
            const meta = {
                app: app,
                fee: estimate.estimation.fee,
                feeReceiver: estimate.estimation.feeReceiver,
                relay: relayUrl
            }
            const vaultTx = metaTxToVaultTx(estimate.estimation.transaction, estimate.nonce, meta)
            const vaultHash = await addTransactionProposal(vault, vaultTx)
            const signer = loadSigner()
            if (submitTx && signer) {
                const vaultSigner = new VaultSigner(vault, signer)
                // Lets not wait
                relayTransaction(vault, vaultTx, [await vaultSigner.signTx(vaultTx)]).then(
                    (resp) => {
                        console.log(resp)
                    }, (error) => {
                        console.error(error)
                    }
                )
            }
            onConfirm(requestId, vaultHash)
        } catch (e) {
            console.error(e)
        }
    }, [vault, app, requestId, estimate, submitTx, onConfirm])
    const estimateTx = React.useCallback(async () => {
        try {
            const config = await vault.loadConfig()
            const signerAddress = await getSignerAddress()
            if (!signerAddress && hasAppSigner()) {
                await setAppSigner()
            }
            const canSubmit = config.threshold.eq(BigNumber.from(1)) && !!signerAddress && config.signers.indexOf(signerAddress) >= 0
            const transaction = await buildMultiSend(transactions)
            const estimation = await requestFee(transaction)
            setEstimate({
                canSubmit,
                estimation,
                nonce: config.nonce
            })
        } catch (e) {
            console.error(e)
        }
    }, [vault, transactions])
    React.useEffect(() => {
        estimateTx()
    }, [estimateTx])
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
            { estimate?.canSubmit && (
                <Box>
                    Submit transaction via Relay for {utils.formatEther(estimate.estimation.fee)} ETH
                    <Checkbox checked={submitTx} onChange={(_e, checked) => setSubmitTx(checked)} />
                </Box>
            )
            }
            <DialogActions>
                <Button onClick={rejectTx} color="default">
                    Cancel
                </Button>
                <Button onClick={proposeTx} color="primary" disabled={!estimate || !estimate.canSubmit}>
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(TransactionProposalDialog)