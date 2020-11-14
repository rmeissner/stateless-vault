import React from 'react'
import { Route, Switch, HashRouter as Router } from "react-router-dom"
import VaultHome from './vault/VaultHome'
import Welcome from './onboarding/Welcome'


const App: React.FC = () => {
  return (
    <Router>
      <Switch>
        <Route path="/:vaultAddress">
          <VaultHome />
        </Route>
        <Route path="/">
          <Welcome />
        </Route>
      </Switch>
    </Router>
  )
}

export default App
