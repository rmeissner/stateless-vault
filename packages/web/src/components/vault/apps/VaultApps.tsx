import * as React from 'react'
import { Vault } from '@rmeissner/stateless-vault-sdk';
import { createStyles, WithStyles, withStyles } from '@material-ui/core';
import { iframeMessageHandler, sendMessageToIframe, MessageHandlers } from './messaging';
import { INTERFACE_MESSAGES, LowercaseNetworks, RequestId, Transaction } from '@gnosis.pm/safe-apps-sdk'
import { chainName } from 'src/utils/config';
import TransactionProposalDialog from './TransactionProposalDialog';

const styles = createStyles({
    appContainer: {
        border: 0,
        frameborder: 0,
        width: '100%',
        height: '100%'
    }
})

interface Props extends WithStyles<typeof styles> {
    vault: Vault
}

interface ProposalParams {
    transactions: Transaction[]
    requestId: RequestId
}

const VaultApps: React.FC<Props> = ({ vault, classes }) => {
    const [proposalParams, setProposalParams] = React.useState<ProposalParams | undefined>(undefined)
    const appUrl = "https://apps.gnosis-safe.io/tx-builder"
    const appFrame = React.useRef<HTMLIFrameElement>(null)
    const handlers: MessageHandlers = React.useMemo(() => {
        return {
            onSDKIntitalized: () => {
                const iframe = appFrame.current
                if (!iframe) return
                sendMessageToIframe(
                    iframe,
                    appUrl,
                    {
                        messageId: INTERFACE_MESSAGES.ON_SAFE_INFO,
                        data: {
                            safeAddress: vault.address,
                            network: chainName as LowercaseNetworks,
                            ethBalance: "0",
                        },
                    }
                )
            },
            onTransactionProposal: (transactions, requestId) => {
                if (transactions.length == 0) return
                setProposalParams({ transactions, requestId })
            }
        }
    }, [vault, appFrame, appUrl, setProposalParams])

    const handleTransactionConfirmation = React.useCallback(async (requestId: RequestId, vaultHash: string) => {
        const iframe = appFrame.current
        if (!iframe) return
        sendMessageToIframe(
            iframe,
            appUrl,
            {
                messageId: INTERFACE_MESSAGES.TRANSACTION_CONFIRMED,
                data: {
                    safeTxHash: vaultHash
                },
            },
            requestId
        )
        setProposalParams(undefined)
    }, [appFrame, appUrl, setProposalParams])

    const handleTransactionRejection = React.useCallback(async (requestId: RequestId, message: string) => {
        const iframe = appFrame.current
        if (!iframe) return
        sendMessageToIframe(
            iframe,
            appUrl,
            {
                messageId: INTERFACE_MESSAGES.TRANSACTION_REJECTED,
                data: { message },
            },
            requestId
        )
        setProposalParams(undefined)
    }, [appFrame, appUrl, setProposalParams])

    const loaded = React.useCallback(async () => {
        handlers.onSDKIntitalized()
    }, [handlers])

    React.useEffect(() => {
        const messageHandler = iframeMessageHandler(appUrl, handlers)
        window.addEventListener('message', messageHandler)
        return () => {
            window.removeEventListener('message', messageHandler)
        }
    }, [appFrame, appUrl, handlers])

    return (
        <>
            <iframe ref={appFrame} onLoad={loaded} src={appUrl} className={classes.appContainer} />
            { proposalParams && (<TransactionProposalDialog
                open={true}
                vault={vault}
                app={appUrl}
                transactions={proposalParams.transactions}
                requestId={proposalParams.requestId}
                onReject={handleTransactionRejection}
                onConfirm={handleTransactionConfirmation} />
            )}
        </>
    )
}

export default withStyles(styles)(VaultApps)