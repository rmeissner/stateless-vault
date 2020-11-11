import * as React from 'react'
import { Vault, VaultAction } from '@rmeissner/stateless-vault-sdk';
import { createStyles, WithStyles, withStyles, Box, List, ListItem } from '@material-ui/core';

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
    console.log("Load Transactions")
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
        loadTransactions()
    }, [])
    const listItems = transactions.map((tx, index) => {
        switch (tx.action) {
            case "config_update":
                return (<ListItem className={classes.item}>
                    <Box>Config Update {index}/{transactions.length}</Box>
                    <Box textOverflow="ellipsis" overflow="hidden">{tx.txHash}</Box>
                </ListItem>);
            case "executed_transaction":
                if (tx.success) {
                    return (<ListItem className={classes.item}>
                        <Box>Tx success (nonce {tx.nonce.toString()} {index}/{transactions.length})</Box>
                        <Box textOverflow="ellipsis" overflow="hidden">{tx.ethereumHash}</Box>
                    </ListItem>);
                } else {
                    return (<ListItem className={classes.item}>
                        <Box>Tx failure (nonce {tx.nonce.toString()})</Box>
                        <Box textOverflow="ellipsis" overflow="hidden">{tx.ethereumHash}</Box>
                    </ListItem>);
                }
        }
    })
    console.log({ listItems })
    return transactions.length > 0 ? (
        <List className={classes.list}>
            { listItems }
        </List>
    ) : (
            <p>No Transactions yet</p>
        )
}

export default withStyles(styles)(VaultTransactions)