import * as React from 'react'
import { Vault, VaultAction } from '@rmeissner/stateless-vault-sdk';
import { createStyles, WithStyles, withStyles, Box, List, ListItem, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';

const styles = createStyles({
    list: {
    },
    item: {
        display: 'block'
    }
})

interface Props extends WithStyles<typeof styles> {
    vault: Vault
}

const VaultTransactions: React.FC<Props> = ({ vault, classes }) => {
    const [transactions, setTransactions] = React.useState<VaultAction[]>([])
    const loadTransactions = React.useCallback(async () => {
        try {
            setTransactions(await vault.loadTransactions())
        } catch (e) {
            console.log(`Could not load transactions`)
            console.error(e)
        }
    }, [vault, setTransactions])
    React.useEffect(() => {
        setTransactions([])
        loadTransactions()
    }, [vault.address])
    const listItems = transactions.map((tx) => {
        switch (tx.action) {
            case "config_update":
                return (<ListItem className={classes.item}>
                    <Box>Config Update</Box>
                    <Box textOverflow="ellipsis" overflow="hidden">{tx.txHash}</Box>
                </ListItem>);
            case "executed_transaction":
                if (tx.success) {
                    return (<Link to={location => `${location.pathname}/${tx.vaultHash}`}>
                        <ListItem className={classes.item}>
                            <Box>Tx success (nonce {tx.nonce.toString()})</Box>
                            <Box textOverflow="ellipsis" overflow="hidden">{tx.ethereumHash}</Box>
                        </ListItem>
                    </Link>);
                } else {
                    return (<Link to={location => `${location.pathname}/${tx.vaultHash}`}>
                        <ListItem className={classes.item}>
                            <Box>Tx failure (nonce {tx.nonce.toString()})</Box>
                            <Box textOverflow="ellipsis" overflow="hidden">{tx.ethereumHash}</Box>
                        </ListItem>
                    </Link >);
                }
        }
    })
    return transactions.length > 0 ? (
        <List className={classes.list}>
            <Typography>History</Typography>
            { listItems}
        </List>
    ) : (
            <p>No Transactions yet</p>
        )
}

export default withStyles(styles)(VaultTransactions)