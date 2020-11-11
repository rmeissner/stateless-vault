import AppLogo from 'src/assets/icons/yacate-logo.svg'
import * as React from 'react'
import styled from 'styled-components'

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
type Props = {
  onboardingDone: () => void
}

const Welcome: React.FC<Props> = () => {
    return (
        <OnboardingContainer>
            <img src={AppLogo} alt="App Logo" width="100"></img>
            <SHeading>Yacate - A smart wallet based on the Stateless Vault</SHeading>
            <p>Start by adding a Vault</p>
        </OnboardingContainer>
    )
}

export default Welcome