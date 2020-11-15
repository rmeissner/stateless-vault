import * as React from 'react'
import { Button, createStyles, WithStyles, withStyles, TextField, Dialog, DialogContent, DialogTitle, DialogContentText, DialogActions } from '@material-ui/core'
import { useHistory } from 'react-router'
import { setVault, setLastSelectedVault, managesVault } from 'src/logic/vaultRepository'
import { utils } from 'ethers'

const styles = createStyles({
    remove: {
        margin: '16px'
    },
    item: {
        flex: 1
    }
})

interface Props extends WithStyles<typeof styles> {
    open: boolean,
    onClose: () => void
}

const AddVaultDialog: React.FC<Props> = ({ open, onClose }) => {
    const history = useHistory()
    const [vaultName, setVaultName] = React.useState("")
    const [vaultAddress, setVaultAddress] = React.useState("")
    const [inputError, setInputError] = React.useState<string | undefined>()
    const addVault = React.useCallback(async () => {
        try {
            const cleanAddress = utils.getAddress(vaultAddress)
            if (await managesVault(cleanAddress)) {
                setInputError("Vault already exists in app")
                return
            }
            await setVault(cleanAddress, vaultName)
            await setLastSelectedVault(cleanAddress)
            onClose()
            history.push(`/`)
        } catch (e) {
            console.error(e)
            setInputError("Invalid vault address")
        }
    }, [setInputError, vaultAddress, vaultName, history])
    return (
        <Dialog
            open={open}
            onClose={onClose}
            scroll="paper"
            aria-labelledby="scroll-dialog-title"
            aria-describedby="scroll-dialog-description">
            <DialogTitle id="scroll-dialog-title">Add a Vault</DialogTitle>
            <DialogContent dividers={true}>
                <DialogContentText
                    id="scroll-dialog-description"
                    tabIndex={-1}
                >
                    <TextField
                        label="Vault name"
                        onChange={(e) => {
                            setVaultName(e.target.value)
                        }}>
                        {vaultName}
                    </TextField>
                    <TextField
                        label="Vault address"
                        onChange={(e) => {
                            setVaultAddress(e.target.value)
                            setInputError(undefined)
                        }}
                        error={inputError !== undefined}
                        helperText={inputError}>
                        {vaultAddress}
                    </TextField>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="default">
                    Cancel
                </Button>
                <Button onClick={addVault} color="primary">
                    Add
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(AddVaultDialog)