import * as React from 'react'
import { Vault, VaultTransaction } from '@rmeissner/stateless-vault-sdk';
import { useHistory, useParams } from "react-router-dom";
import WalletInfo from '../../WalletInfo'
import { createStyles, WithStyles, withStyles, Box, Typography } from '@material-ui/core';
import { loadTransactionDetails } from 'src/logic/vaultRepository';
import { utils } from 'ethers';

const styles = createStyles({
    details: {
        flex: 1
    },
    data: {
        overflowWrap: 'anywhere',
        maxWidth: '100vw'
    },
    address: {
        display: 'flex',
        justifyContent: 'center',
        maxWidth: '100vw'
    }
})

interface Props extends WithStyles<typeof styles> {
    vault: Vault
}

interface Path {
    vaultHash: string
}

const VaultTransactionDetails: React.FC<Props> = ({ vault, classes }) => {
    console.log("Load Transaction")
    const history = useHistory()
    const { vaultHash } = useParams<Path>()
    console.log(useParams<any>())
    const [details, setDetails] = React.useState<VaultTransaction | undefined>(undefined)
    const loadDetails = React.useCallback(async () => {
        try {
            setDetails(await loadTransactionDetails(vault, vaultHash))
        } catch (e) {
            console.log(`Could not load transactions`)
            console.error(e)
            history.goBack()
        }
    }, [vault, vaultHash, setDetails])
    console.log({ vaultHash })
    React.useEffect(() => {
        loadDetails()
    }, [])
    return details ? (
        <Box className={classes.details}>
            <p>Nonce</p>
            <Typography>{details.nonce}</Typography>
            <p>To</p>
            <Box className={classes.address}><WalletInfo address={details.to} textColor="text" /></Box>
            <p>Value</p>
            <Typography>{utils.formatEther(details.value)} ETH</Typography>
            <p>Data</p>
            <Typography className={classes.data}>{details.data}</Typography>
            <p>Meta</p>
            <Typography className={classes.data}>{details.meta}</Typography>
            <p>Operation</p>
            <Typography>{details.operation}</Typography>
            <p>Min available gas</p>
            <Typography>{details.minAvailableGas}</Typography>
        </Box>
    ) : (
            <p>Loading details</p>
        )
}

export default withStyles(styles)(VaultTransactionDetails)