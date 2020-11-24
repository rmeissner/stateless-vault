import { Button } from '@gnosis.pm/safe-react-components'
import * as React from 'react'
import Web3Modal from 'web3modal'
import WalletConnectProvider from "@walletconnect/web3-provider";
import { chainId, rpcUrl } from 'src/utils/config';

type Props = {
  onConnect: (provider: any) => void,
  onDialogOpen?: (visible: boolean) => void
}

const ConnectButton: React.FC<Props> = ({ onConnect, onDialogOpen }) => {
  const connect = React.useCallback(async () => {
    const web3Modal = new Web3Modal({
      network: "rinkeby",
      //cacheProvider: true,
      providerOptions: {
        walletconnect: {
          package: WalletConnectProvider,
          options: {
            rpc: rpcUrl,
            chainId: chainId
          }
        }
      }
    });
    if (onDialogOpen) onDialogOpen(true)
    try { onConnect(await web3Modal.connect()) }
    catch (e) {
      console.log('Web3Connect Modal Closed: ', e) // modal has closed
    } finally {
      if (onDialogOpen) onDialogOpen(false)
    }
  }, [onConnect])
  return (
    <Button size="lg" color="primary" onClick={connect}>
      Connect
    </Button>
  )
}

export default ConnectButton
