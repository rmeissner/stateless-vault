import * as React from 'react'
import { Vault } from '@rmeissner/stateless-vault-sdk';
import { CircularProgress, createStyles, WithStyles, withStyles } from '@material-ui/core';
import { FrameCommunicator } from './messaging';
import { chainName, defaultAppUrl } from 'src/utils/config';
import TransactionProposalDialog from './TransactionProposalDialog';
import {
    LowercaseNetworks,
    RequestId,
    Transaction
} from '@gnosis.pm/safe-apps-sdk'
import { getSignerAddress, loadProvider } from 'src/logic/ethereumRepository';
import SelectAccount from 'src/components/account/SelectAccount';

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
    const [loading, setLoading] = React.useState<boolean>(false)
    const [signerAddress, setSignerAddress] = React.useState<string | undefined>(undefined)
    const [canUseApps, setCanUseApps] = React.useState<boolean>(false)
    const [proposalParams, setProposalParams] = React.useState<ProposalParams | undefined>(undefined)
    const appUrl = defaultAppUrl
    const appFrame = React.useRef<HTMLIFrameElement>(null)
    const communicator: FrameCommunicator = React.useMemo(() => {
        return new FrameCommunicator(appFrame, appUrl, {
            safeAddress: vault.address,
            network: chainName as LowercaseNetworks,
            ethBalance: "0",
        }, {
            onTransactionProposal: (transactions, requestId) => {
                if (transactions.length == 0) return
                setProposalParams({ transactions, requestId })
            }
        }, loadProvider())
    }, [vault, appFrame, appUrl, setProposalParams])

    const handleTransactionConfirmation = React.useCallback(async (requestId: RequestId, vaultHash: string) => {
        communicator.sendResponse({ safeTxHash: vaultHash }, requestId)
        setProposalParams(undefined)
    }, [communicator, setProposalParams])

    const handleTransactionRejection = React.useCallback(async (requestId: RequestId, message: string) => {
        communicator.sendError(message, requestId)
        setProposalParams(undefined)
    }, [communicator, setProposalParams])

    React.useEffect(() => {
        return communicator.connect(window)
    }, [communicator])

    React.useEffect(() => {
        const loadSigner = async () => {
            setLoading(true)
            try {
                const signerAddress = await getSignerAddress()
                setSignerAddress(signerAddress)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        loadSigner()
    }, [setSignerAddress])

    React.useEffect(() => {
        if (!signerAddress) return
        const checkSigner = async () => {
            setLoading(true)
            try {
                const config = await vault.loadConfig()
                setCanUseApps(config.signers.indexOf(signerAddress) >= 0)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        checkSigner()
    }, [vault, signerAddress])

    if (loading) return (<CircularProgress />)
    if (!signerAddress) return (<SelectAccount onProgress={setLoading} onSelected={setSignerAddress} />)
    if (!canUseApps) return (<p>You need to be an owner to use Apps</p>)
    return (
        <>
            <iframe ref={appFrame} src={appUrl} className={classes.appContainer} />
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