import * as React from 'react'
import { Box, Button } from '@material-ui/core'
import { providers } from 'ethers';
import { getSignerAddress, setLocalSigner, setAppSigner } from 'src/logic/ethereumRepository';
import ConnectButton from '../ConnectButton';

interface Props {
    onProgress: (active: boolean) => void,
    onSelected: (signerAddress: string | undefined) => void,
    onWalletDialogVisible?: (visible: boolean) => void
}

const SelectAccount: React.FC<Props> = ({ onProgress, onSelected, onWalletDialogVisible }) => {
    const useAppAccount = React.useCallback(async () => {
        onProgress(true)
        try {
            await setAppSigner()
            onSelected(await getSignerAddress())
        } catch (e) {
            console.error(e)
        }
        onProgress(false)
    }, [onProgress, onSelected])
    const onConnect = React.useCallback(async (web3provider: any) => {
        onProgress(true)
        try {
            const provider = new providers.Web3Provider(web3provider)
            setLocalSigner(provider.getSigner())
            onSelected(await getSignerAddress())
        } catch (e) {
            console.error(e)
        }
        onProgress(false)
    }, [onProgress, onSelected])
    return (
        <Box>
            <Button onClick={useAppAccount} color="primary">Use App Account</Button>
            <br />
            <ConnectButton onConnect={onConnect} onDialogOpen={onWalletDialogVisible} />
        </Box>
    )
}

export default SelectAccount