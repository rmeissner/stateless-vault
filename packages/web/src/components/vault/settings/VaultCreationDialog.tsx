import * as React from 'react'
import { RelayedVaultFactory } from '@rmeissner/stateless-vault-sdk';
import { Box, Button, createStyles, withStyles, WithStyles, Dialog, DialogContent, DialogTitle, DialogActions } from '@material-ui/core'
import AccountInfo from 'src/components/WalletInfo';
import { utils, BigNumber, providers } from 'ethers';
import { relayCreation, RelayEstimation, requestFee } from 'src/logic/relayRepository';
import { getSignerAddress, loadProvider, setLocalSigner, setAppSigner, loadSigner } from 'src/logic/ethereumRepository';
import ConnectButton from '../../ConnectButton';
import { factoryAddress, vaultImplementationAddress } from 'src/utils/config';
import { setLastSelectedVault, setVault } from 'src/logic/vaultRepository';
import { useHistory } from 'react-router';

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
    const [signer, setSigner] = React.useState<string | undefined>(undefined)
    const [estimate, setEstimate] = React.useState<Estimate | undefined>(undefined)
    const createVault = React.useCallback(async () => {
        if (!estimate) return
        const localSigner = loadSigner()
        if (!localSigner) return
        const provider = loadProvider()
        try {
            const relayData = await estimate.factory.relayData(
                localSigner, { operation: 0, ...estimate.estimation.transaction } , estimate.nonce
            )
            const vaultBalance = await provider.getBalance(estimate.address)
            if (vaultBalance < BigNumber.from(estimate.estimation.fee)) throw Error(`Not enough funds to deploy to ${estimate.address} (${utils.formatEther(vaultBalance)} < ${utils.formatEther(estimate.estimation.fee)})`)
            const deploymentTxHash = await relayCreation(relayData)
            const deploymentTx = await provider.getTransaction(deploymentTxHash)
            await deploymentTx.wait()
            await setVault(estimate.address, "My App Vault")
            await setLastSelectedVault(estimate.address)
            history.push('/')
            onClose()
        } catch (e) {
            console.error(e)
        }
    }, [onClose, history, setLastSelectedVault])
    const estimateCreation = React.useCallback(async () => {
        if (!signer) return
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
            const nonce = factory.saltNonce("just having lots of fun .... NOT")
            const address = await factory.calculateAddress(nonce, signers)
            const estimation = await requestFee({
                to: address,
                value: "0x0",
                data: setupData,
                operation: 0
            })
            setEstimate({
                nonce,
                factory,
                address,
                estimation
            })
        } catch (e) {
            console.error(e)
        }
    }, [signer, setEstimate])
    React.useEffect(() => {
        estimateCreation()
    }, [estimateCreation])
    const useAppAccount = React.useCallback(async () => {
        try {
            await setAppSigner()
            setSigner(await getSignerAddress())
        } catch (e) {
            console.error(e)
        }
    }, [setSigner])
    const onConnect = React.useCallback(async (web3provider: any) => {
        try {
            const provider = new providers.Web3Provider(web3provider)
            setLocalSigner(provider.getSigner())
            setSigner(await getSignerAddress())
        } catch (e) {
            console.error(e)
        }
    }, [setSigner])
    return (
        <Dialog
            open={open}
            onClose={onClose}
            scroll="paper"
            aria-labelledby="scroll-dialog-title"
            aria-describedby="scroll-dialog-description">
            <DialogTitle id="scroll-dialog-title">Confirm Transaction</DialogTitle>
            <DialogContent dividers={true}>
                {signer ? (
                    <Box>
                        Owner:<br /><AccountInfo address={signer} textColor="text" />
                        { estimate ? (<>
                            Vault:<br /><AccountInfo address={estimate.address} textColor="text" />
                            Fee: { utils.formatEther(estimate.estimation.fee) } ETH
                        </>) : (<>Loading...</>)}
                    </Box>
                ) : (
                        <Box>
                            <Button onClick={useAppAccount} color="primary">
                                Use App Account
                        </Button>
                            <ConnectButton onConnect={onConnect} />
                        </Box>
                    )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="default">
                    Cancel
                </Button>
                <Button onClick={createVault} color="primary" disabled={!estimate}>
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(VaultCreationDialog)