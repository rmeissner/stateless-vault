import AppLogo from 'src/assets/icons/yacate-logo.svg'
import * as React from 'react'
import styled from 'styled-components'
import { TextField } from '@material-ui/core'
import { utils } from 'ethers'
import { Button } from '@gnosis.pm/safe-react-components'
import { loadLastSelectedVault, loadVaults, setLastSelectedVault, setVault } from 'src/logic/vaultRepository'
import { useHistory } from 'react-router'
import { undefinedOnError } from 'src/utils/general'
import VaultCreationDialog from '../vault/settings/VaultCreationDialog'

const OnboardingContainer = styled.main`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  align-items: center;
  text-align: center;
`

const SHeading = styled.h1`
@media screen and (max-width: 768px) {
  font-size: 1.2em;
}
`

const Welcome: React.FC = () => {
  const history = useHistory()
  const [loading, setLoading] = React.useState(true)
  const [vaultName, setVaultName] = React.useState("")
  const [vaultAddress, setVaultAddress] = React.useState("")
  const [inputError, setInputError] = React.useState<string | undefined>()
  const [showVaultCreation, setShowVaultCreation] = React.useState(false)
  const addVault = React.useCallback(async () => {
    try {
      const cleanAddress = utils.getAddress(vaultAddress)
      await setVault(cleanAddress, vaultName)
      await setLastSelectedVault(cleanAddress)
      history.replace(`/${cleanAddress}`)
    } catch (e) {
      console.error(e)
      setInputError("Invalid vault address")
    }
  }, [setInputError, vaultAddress, vaultName, history])

  const loadSelected = React.useCallback(async () => {
    setLoading(true)
    let selectedVault = await undefinedOnError(loadLastSelectedVault())
    if (!selectedVault) {
      const vaults = await loadVaults()
      if (vaults.length > 0) {
        selectedVault = vaults[0].address
        await setLastSelectedVault(selectedVault)
      }
    }
    if (selectedVault) {
      history.replace(`/${selectedVault}`)
    }
    setLoading(false)
  }, [history, setLoading])

  React.useEffect(() => {
    loadSelected()
  }, [loadSelected])

  if (loading) return (
    <OnboardingContainer>
      <img src={AppLogo} alt="App Logo" width="100"></img>
      <SHeading>Yacate - A smart wallet based on the Stateless Vault</SHeading>
      <p>Loading</p>
    </OnboardingContainer>
  )
  return (
    <OnboardingContainer>
      <img src={AppLogo} alt="App Logo" width="100"></img>
      <SHeading>Yacate - A smart wallet based on the Stateless Vault</SHeading>
      <p>Start by adding a Vault</p>
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
      <Button size="lg" color="primary" onClick={addVault}>Add Vault</Button>
      <Button size="lg" color="secondary" onClick={() => setShowVaultCreation(true)}>Create Vault</Button>
      <VaultCreationDialog open={showVaultCreation} onClose={() => setShowVaultCreation(false)} />
    </OnboardingContainer>
  )
}

export default Welcome