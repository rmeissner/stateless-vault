import * as React from 'react'
import WalletInfo from 'src/components/WalletInfo'
import { Vault } from '@rmeissner/stateless-vault-sdk';
import { Redirect, Route, Switch, useHistory, useParams, useRouteMatch } from "react-router-dom";
import { AppBar, BottomNavigation, BottomNavigationAction, Container, createStyles, Toolbar, WithStyles, withStyles } from '@material-ui/core';
import { Timeline, Settings } from '@material-ui/icons';
import { getVaultInstance } from 'src/logic/vaultRepository';
import styled from 'styled-components'
import VaultTransactions from './transactions/VaultTransactions';
import VaultTransactionDetails from './transactions/VaultTransactionDetails';
import VaultSettings from './settings/VaultSettings';

const styles = createStyles({
    toolbar: {
        justifyContent: 'center',
        maxWidth: '100vw'
    },
    content: {
        paddingBottom: '64px',
        flex: "1 1 auto",
        maxWidth: '100vw'
    },
    navigation: {
        height: '64px',
        position: 'fixed',
        bottom: 0,
        width: '100vw'
    }
})

const VaultHomeContainer = styled.main`
  display: flex;
  flex-direction: column;
  align-items: top;
  text-align: center;
  flex-grow: 1;
  width: 100vw;
  height: 100vh;
`

interface Active {
    address: string,
    instance: Vault
}

interface Path {
    vaultAddress: string
}

const VaultHome: React.FC<WithStyles<typeof styles>> = ({ classes }) => {
    const match = useRouteMatch()
    const [active, setActive] = React.useState<Active | undefined>(undefined)
    const history = useHistory()
    const { vaultAddress } = useParams<Path>()
    React.useEffect(() => {
        const loadActive = async () => {
            try {
                const instance = await getVaultInstance(vaultAddress)
                setActive({
                    address: vaultAddress,
                    instance
                })
            } catch (e) {
                console.log(`Could not load Vault ${vaultAddress}`)
                console.error(e)
                history.push(`/`)
            }
        }
        loadActive()
    }, [vaultAddress, setActive])
    if (!active) return (<>Loading</>)
    return (
        <VaultHomeContainer>
            <AppBar position="fixed">
                <Toolbar className={classes.toolbar}>
                    <WalletInfo address={active.address!} />
                </Toolbar>
            </AppBar>
            <Toolbar />
            <Container className={classes.content}>
                <Switch>
                    <Route path={`${match.path}/transactions/:vaultHash`}>
                        <VaultTransactionDetails vault={active.instance} />
                    </Route>
                    <Route path={`${match.path}/transactions`}>
                        <VaultTransactions vault={active.instance} />
                    </Route>
                    <Route path={`${match.path}/config`}>
                        <VaultSettings vault={active.instance} />
                    </Route>
                    <Route path="*">
                        <Redirect to={`${match.url}/transactions`} />
                    </Route>
                </Switch>
            </Container>
            <BottomNavigation
                className={classes.navigation}
                onChange={(_, newValue) => {
                    switch (newValue) {
                        case 1:
                            history.push(`${match.url}/config`)
                            break;
                        default:
                            history.push(`${match.url}/transactions`)
                            break;
                    }
                }}
                showLabels
            >
                <BottomNavigationAction label="Transactions" icon={<Timeline />} />
                <BottomNavigationAction label="Settings" icon={<Settings />} />
            </BottomNavigation>
        </VaultHomeContainer>
    )
}

export default withStyles(styles)(VaultHome)