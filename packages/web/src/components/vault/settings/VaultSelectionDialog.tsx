import * as React from 'react'
import { Box, Button, createStyles, WithStyles, withStyles, List, ListItem, Dialog, DialogContent, DialogTitle, DialogContentText, DialogActions } from '@material-ui/core'
import { useHistory } from 'react-router'
import { loadLastSelectedVault, loadVaults, removeVault, removeLastSelectedVault, setLastSelectedVault } from 'src/logic/vaultRepository'
import AccountInfo from 'src/components/WalletInfo'
import { Delete } from '@material-ui/icons';

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
    onAdd?: () => void
}

const VaultSelectionDialog: React.FC<Props> = ({ classes, open, onClose, onAdd }) => {
    const history = useHistory()
    const [vaults, setVaults] = React.useState<{ address: string, name: string }[]>([])
    const select = React.useCallback(async (address: string) => {
        try {
            await setLastSelectedVault(address)
            history.push('/')
        } catch (e) {
            console.error(e)
        }
    }, [history])
    const remove = React.useCallback(async (address: string) => {
        try {
            const lastVault = await loadLastSelectedVault()
            if (lastVault === address) {
                await removeLastSelectedVault()
            }
            await removeVault(address)
            history.push('/')
        } catch (e) {
            console.error(e)
        }
    }, [history])
    React.useEffect(() => {
        console.log("init")
        const init = async () => {
            try {
                setVaults(await loadVaults())
            } catch (e) {
                onClose()
            }
        }
        init()
    }, [open])
    return (
        <Dialog
            open={open}
            onClose={onClose}
            scroll="paper"
            aria-labelledby="scroll-dialog-title"
            aria-describedby="scroll-dialog-description">
            <DialogTitle id="scroll-dialog-title">Select a Vault</DialogTitle>
            <DialogContent dividers={true}>
                <DialogContentText
                    id="scroll-dialog-description"
                    tabIndex={-1}
                >
                    <List>
                        {vaults.map((vault) => (
                            <ListItem onClick={() => select(vault.address)}>
                                <Box className={classes.item}>
                                    {vault.name}
                                    <AccountInfo address={vault.address} textColor="text" />
                                </Box>
                                <Button className={classes.remove} color="secondary" onClick={() => remove(vault.address)}><Delete color="secondary" /></Button>
                            </ListItem>
                        ))}
                        {onAdd && (
                            <ListItem>
                                <Button onClick={() => { onAdd(); onClose() }} color="default">Add vault</Button>
                            </ListItem>
                        )}
                    </List>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary">
                    Cancel
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default withStyles(styles)(VaultSelectionDialog)