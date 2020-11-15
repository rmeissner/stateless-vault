import * as React from 'react'
import { Vault } from '@rmeissner/stateless-vault-sdk';
import { createStyles, WithStyles, withStyles } from '@material-ui/core';
import { sendMessageToIframe } from './messaging';
import {
    INTERFACE_MESSAGES,
    LowercaseNetworks,
  } from '@gnosis.pm/safe-apps-sdk'
import { chainName } from 'src/utils/config';

const styles = createStyles({
    appContainer: {
        border: 0,
        frameborder: 0,
        width: '100%',
        height: '100%'
    }
})

interface Props extends WithStyles<typeof styles> {
    vault: Vault
}

const VaultApps: React.FC<Props> = ({vault, classes}) => {
    const appUrl = "https://apps.gnosis-safe.io/tx-builder"
    const appFrame = React.useRef<HTMLIFrameElement>(null)
    const loaded = React.useCallback(async() => {
        const iframe = appFrame.current
        if (!iframe) return
        sendMessageToIframe(
            iframe,
            appUrl,
            {
            messageId: INTERFACE_MESSAGES.ON_SAFE_INFO,
            data: {
              safeAddress: vault.address,
              network: chainName as LowercaseNetworks,
              ethBalance: "0",
            },
          })
    }, [appFrame])

    return (
        <iframe ref={appFrame} onLoad={loaded} src={appUrl} className={classes.appContainer}/>
    )
}

export default withStyles(styles)(VaultApps)