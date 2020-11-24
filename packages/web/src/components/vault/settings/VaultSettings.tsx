import * as React from 'react'
import { Vault, VaultConfig } from '@rmeissner/stateless-vault-sdk'
import { Box, createStyles, WithStyles, withStyles, List, ListItem } from '@material-ui/core'
import WalletInfo from '../../WalletInfo'
import { getAppMnemonic, getAppSignerAddress } from 'src/logic/ethereumRepository'
import { Button } from '@gnosis.pm/safe-react-components'

const styles = createStyles({
    list: {
    },
    content: {
    },
    item: {
        display: 'flex',
        justifyContent: 'center',
        maxWidth: '100vw'
    }
})

interface Props extends WithStyles<typeof styles> {
    vault: Vault
}

const VaultSettings: React.FC<Props> = ({ vault, classes }) => {
    const [localSigner, setLocalSigner] = React.useState<string | undefined>(undefined)
    const [mnemonic, setMnemonic] = React.useState<string | undefined>(undefined)
    const [configuration, setConfiguration] = React.useState<VaultConfig | undefined>(undefined)
    const loadLocalSigner = React.useCallback(async () => {
        try {
            setLocalSigner(await getAppSignerAddress())
        } catch (e) {
            console.log(`Could not load transactions`)
            console.error(e)
        }
    }, [setLocalSigner])

    const loadConfig = React.useCallback(async () => {
        try {
            setConfiguration(await vault.loadConfig())
        } catch (e) {
            console.log(`Could not load transactions`)
            console.error(e)
        }
    }, [vault, setConfiguration])
    
    const toggleMnemonic = React.useCallback(async () => {
        if (mnemonic) {
            setMnemonic(undefined)
        } else {
            setMnemonic(await getAppMnemonic())
        }
    }, [mnemonic, setMnemonic])

    React.useEffect(() => {
        loadLocalSigner()
        loadConfig()
    }, [])

    return configuration ? (
        <div className={classes.content}>
            { localSigner && (
                <>
                    <p>Local Signer</p>
                    <Box>{localSigner}</Box>
                </>
            )}
            <p>Threshold</p>
            <Box>{configuration.threshold.toString()}</Box>
            <p>Nonce</p>
            <Box>{configuration.nonce.toString()}</Box>
            <p>Signers</p>
            <List className={classes.list}>
                {configuration.signers.map((signer) => {
                    return (
                        <ListItem className={classes.item}><WalletInfo address={signer} textColor="text" /></ListItem>
                    )
                })}
            </List>
            <p>Implementation</p>
            <Box className={classes.item}><WalletInfo address={configuration.implementation} textColor="text" /></Box>
            <p>Menmonic</p>
            <Box className={classes.item}>{mnemonic || "************************"}</Box>
            <Button onClick={toggleMnemonic} size="md" color="primary">Toggle Mnemonic</Button>
        </div>
    ) : (
            <p>Loading config</p>
        )
}

export default withStyles(styles)(VaultSettings)