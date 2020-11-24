import * as React from 'react'
import { RelayedVaultFactory } from '@rmeissner/stateless-vault-sdk';
import { Box, Button, createStyles, withStyles, WithStyles, Dialog, DialogContent, DialogTitle, DialogActions, CircularProgress } from '@material-ui/core'
import AccountInfo from 'src/components/WalletInfo';
import { utils, BigNumber } from 'ethers';
import { relayCreation, RelayEstimation, requestFee } from 'src/logic/relayRepository';
import { loadProvider, loadSigner } from 'src/logic/ethereumRepository';
import { factoryAddress, vaultImplementationAddress } from 'src/utils/config';
import { setLastSelectedVault, setVault } from 'src/logic/vaultRepository';
import { useHistory } from 'react-router';
import SelectAccount from 'src/components/account/SelectAccount';

const styles = createStyles({
    item: {
        display: 'block'
    }
})

interface Props extends WithStyles<typeof styles> {
    open: boolean,
    onClose: () => void
}

interface Estimate {
    nonce: string,
    factory: RelayedVaultFactory,
    address: string,
    estimation: RelayEstimation
}

const VaultCreationDialog: React.FC<Props> = ({ open, onClose }) => {
    const history = useHistory()
    const [loading, setLoading] = React.useState<boolean>(false)
    const [showConnectModal, setShowConnectModal] = React.useState<boolean>(false)
    const [signer, setSigner] = React.useState<string | undefined>(undefined)
    const [estimate, setEstimate] = React.useState<Estimate | undefined>(undefined)
    const handleClose = React.useCallback(async () => {
        setSigner(undefined)
        onClose()
    }, [onClose])

    const activateVault = React.useCallback(async (address: string) => {
        await setVault(address, "My App Vault")
        await setLastSelectedVault(address)
        history.push('/')
        handleClose()
    }, [handleClose])

    const createVault = React.useCallback(async () => {
        if (!estimate) return
        const localSigner = loadSigner()
        if (!localSigner) return
        const provider = loadProvider()
        setLoading(true)
        try {
            const relayData = await estimate.factory.relayData(
                localSigner, { operation: 0, ...estimate.estimation.transaction }, estimate.nonce
            )
            const vaultBalance = await provider.getBalance(estimate.address)
            if (vaultBalance < BigNumber.from(estimate.estimation.fee)) throw Error(`Not enough funds to deploy to ${estimate.address} (${utils.formatEther(vaultBalance)} < ${utils.formatEther(estimate.estimation.fee)})`)
            const deploymentTxHash = await relayCreation(relayData)
            const deploymentTx = await provider.getTransaction(deploymentTxHash)
            await deploymentTx.wait()
            await activateVault(estimate.address)
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }, [estimate, activateVault, history])
    const estimateCreation = React.useCallback(async () => {
        if (!signer) return
        setLoading(true)
        try {
            const factory = new RelayedVaultFactory({
                factoryAddress: factoryAddress,
                vaultImplementationAddress: vaultImplementationAddress,
                provider: loadProvider()
            })
            const signers = [signer]
            const setupData = await factory.creationData({
                signers: signers,
                threshold: BigNumber.from(1)
            })
            const nonce = factory.saltNonce("LEEEEEERRRROOOOOOOYYYYY JENKIIIIIIIIIIIINS")
            const estimation = await requestFee({
                to: vaultImplementationAddress,
                value: "0x0",
                data: setupData,
                operation: 1
            })
            const address = await factory.calculateAddress(nonce, signers)
            const provider = loadProvider()
            const code = await provider.getCode(address)
            if (code != "0x") await activateVault(address)
            else {
                setEstimate({
                    nonce,
                    factory,
                    address,
                    estimation
                })
            }
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }, [signer, setEstimate])
    React.useEffect(() => {
        estimateCreation()
    }, [estimateCreation])
    return (
        <Dialog
            open={open && !showConnectModal}
            onClose={handleClose}
            scroll="paper"
            aria-labelledby="scroll-dialog-title"
            aria-describedby="scroll-dialog-description">
            <DialogTitle id="scroll-dialog-title">Confirm Transaction</DialogTitle>
            <DialogContent dividers={true}>
                {loading ? (
                    <CircularProgress />
                ) : (
                        signer ? (
                            <Box>
                                Owner:<br /><AccountInfo address={signer} textColor="text" />
                                { estimate ? (
                                <>
                                    Vault:<br /><AccountInfo address={estimate.address} textColor="text" />
                                    <br />
                                    Fee: { utils.formatEther(estimate.estimation.fee)} ETH
                                </>) : (<>Loading...</>)}
                            </Box>
                        ) : (<SelectAccount onProgress={setLoading} onSelected={setSigner} onWalletDialogVisible={setShowConnectModal} />)
                    )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="default">
                    Cancel
                </Button>
                <Button onClick={createVault} color="primary" disabled={!estimate || loading}>
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(VaultCreationDialog)