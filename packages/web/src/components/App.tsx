import React from 'react'
import { Route, Switch, HashRouter as Router, useHistory } from "react-router-dom"
import VaultHome from './vault/VaultHome'
import Welcome from './onboarding/Welcome'
import { loadLastSelectedVault } from 'src/logic/vaultRepository'
import { undefinedOnError } from 'src/utils/general'


const App: React.FC = () => {
  const history = useHistory()
  const loadSelected = React.useCallback(async () => {
    const selectedVault = await undefinedOnError(loadLastSelectedVault())
    if (selectedVault) {
      history.push(`/${selectedVault}`)
    }
  }, [])

  React.useEffect(() => {
    loadSelected()
  }, [loadSelected])

  return (
    <Router>
      <Switch>
        <Route path="/:vaultAddress">
          <VaultHome />
        </Route>
        <Route path="/">
          <Welcome onboardingDone={loadSelected} />
        </Route>
      </Switch>
    </Router>
  )
}

export default App
