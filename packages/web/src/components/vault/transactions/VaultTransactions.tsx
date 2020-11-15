import * as React from 'react'
import { Vault, VaultAction, VaultTransaction } from '@rmeissner/stateless-vault-sdk';
import { createStyles, WithStyles, withStyles, Box, List, ListItem, Typography } from '@material-ui/core';
import { Link } from 'react-router-dom';
import { loadTransactionProposals, removeTransactionProposals } from 'src/logic/vaultRepository';

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
    const [proposals, setProposals] = React.useState<{vaultHash: string, transaction: VaultTransaction}[]>([])
    const loadItems = React.useCallback(async () => {
        try {
            const transactions = await vault.loadTransactions()
            await removeTransactionProposals(
                vault, transactions.map((tx) => (tx.action === "executed_transaction") ? tx.vaultHash : "").filter((val) => val !== "")
            )
            setProposals(await loadTransactionProposals(vault))
            setTransactions(transactions)
        } catch (e) {
            console.log(`Could not load transactions`)
            console.error(e)
        }
    }, [vault, setTransactions, setProposals])
    React.useEffect(() => {
        setProposals([])
        setTransactions([])
        loadItems()
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
    const proposalItems = proposals.map((proposal) => (
        <Link to={location => `${location.pathname}/${proposal.vaultHash}`}>
            <ListItem className={classes.item}><Box>Tx propsal (nonce {proposal.transaction.nonce})</Box></ListItem>
        </Link>
    ))
    return (proposalItems.length + transactions.length) > 0 ? (
        <List className={classes.list}>
            {
                proposalItems.length > 1 && (
                    <>
                        <ListItem className={classes.item}><Typography>Proposals</Typography></ListItem>
                        { proposalItems}
                    </>
                )
            }
            {
                listItems.length > 1 && (
                    <>
                        <ListItem className={classes.item}><Typography>History</Typography></ListItem>
                        { listItems}
                    </>
                )
            }
        </List>
    ) : (
            <p>No Transactions yet</p>
        )
}

export default withStyles(styles)(VaultTransactions)