import { EthHashInfo } from '@gnosis.pm/safe-react-components'
import { ThemeColors } from '@gnosis.pm/safe-react-components/dist/theme'
import React from 'react'
import { chainName } from 'src/utils/config'

const AccountInfo: React.FC<{ address: string, className?: string, textColor?: ThemeColors }> = ({ address, className, textColor }) => {
  if (!address) {
    return null
  }

  return (
    <EthHashInfo
      hash={address}
      textSize="xl"
      showCopyBtn
      showIdenticon
      showEtherscanBtn
      shortenHash={4}
      textColor={textColor || "white"}
      className={className || "address"}
      network={chainName}
    />
  )
}

export default AccountInfo
