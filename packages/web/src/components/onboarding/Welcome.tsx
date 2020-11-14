import AppLogo from 'src/assets/icons/yacate-logo.svg'
import * as React from 'react'
import styled from 'styled-components'
import { TextField } from '@material-ui/core'
import { utils } from 'ethers'
import { Button } from '@gnosis.pm/safe-react-components'
import { loadLastSelectedVault, setLastSelectedVault, setVault } from 'src/logic/vaultRepository'
import { useHistory } from 'react-router'
import { undefinedOnError } from 'src/utils/general'

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
  const addVault = React.useCallback(async () => {
    try {
      const cleanAddress = utils.getAddress(vaultAddress)
      await setVault(cleanAddress, vaultName)
      await setLastSelectedVault(cleanAddress)
      history.push(`/${cleanAddress}`)
    } catch (e) {
      console.error(e)
      setInputError("Invalid vault address")
    }
  }, [setInputError, vaultAddress, vaultName, history])

  console.log({ history })
  const loadSelected = React.useCallback(async () => {
    setLoading(true)
    const selectedVault = await undefinedOnError(loadLastSelectedVault())
    if (selectedVault) {
      history.push(`/${selectedVault}`)
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
    </OnboardingContainer>
  )
}

export default Welcome