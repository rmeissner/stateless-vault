import {
    InterfaceMessageIds,
    InterfaceMessageToPayload,
    SDK_MESSAGES,
    SDKMessageIds,
    SDKMessageToPayload,
    RequestId,
    Transaction,
} from '@gnosis.pm/safe-apps-sdk'

export type InterfaceMessageProps<T extends InterfaceMessageIds> = {
    messageId: T
    data: InterfaceMessageToPayload[T]
}

export type ReturnType = {
    sendMessageToIframe: <T extends InterfaceMessageIds>(message: InterfaceMessageProps<T>, requestId?: RequestId) => void
}

export interface CustomMessageEvent extends MessageEvent {
    data: {
        requestId: RequestId
        messageId: SDKMessageIds
        data: SDKMessageToPayload[SDKMessageIds]
    }
}

export interface InterfaceMessageRequest extends InterfaceMessageProps<InterfaceMessageIds> {
    requestId: number | string
}

export const sendMessageToIframe = <T extends InterfaceMessageIds>(
    iframe: HTMLIFrameElement,
    appUrl: string,
    message: InterfaceMessageProps<T>,
    requestId?: RequestId
) => {
    const requestWithMessage = {
        ...message,
        requestId: requestId || Math.trunc(window.performance.now()),
    }

    iframe?.contentWindow?.postMessage(requestWithMessage, appUrl)
}

export interface MessageHandlers {
    onSDKIntitalized: () => void,
    onTransactionProposal: (transactions: Transaction[], requestId: RequestId) => void
}

const handleIframeMessage = (
    messageId: SDKMessageIds,
    messagePayload: SDKMessageToPayload[typeof messageId],
    requestId: RequestId,
    handler: MessageHandlers
): void => {
    if (!messageId) {
        console.error('ThirdPartyApp: A message was received without message id.')
        return
    }

    switch (messageId) {
        // typescript doesn't narrow type in switch/case statements
        // issue: https://github.com/microsoft/TypeScript/issues/20375
        // possible solution: https://stackoverflow.com/a/43879897/7820085
        case SDK_MESSAGES.SEND_TRANSACTIONS: {
            if (messagePayload) {
                handler.onTransactionProposal(
                    messagePayload as SDKMessageToPayload[typeof SDK_MESSAGES.SEND_TRANSACTIONS],
                    requestId,
                )
            }
            break
        }

        case SDK_MESSAGES.SEND_TRANSACTIONS_V2: {
            // TODO: handle payload params
            const payload = messagePayload as SDKMessageToPayload[typeof SDK_MESSAGES.SEND_TRANSACTIONS_V2]
            if (payload) {
                handler.onTransactionProposal(payload.txs, requestId)
            }
            break
        }

        case SDK_MESSAGES.SAFE_APP_SDK_INITIALIZED: {
            handler.onSDKIntitalized()
            break
        }
        default: {
            console.error(`ThirdPartyApp: A message was received with an unknown message id ${messageId}.`)
            break
        }
    }
}

export const iframeMessageHandler = (appUrl: string, handler: MessageHandlers): ((message: CustomMessageEvent) => void) => async (message: CustomMessageEvent) => {
    if (message.origin === window.origin) {
        return
    }
    if (!appUrl.includes(message.origin)) {
        console.error(`ThirdPartyApp: A message was received from an unknown origin ${message.origin}`)
        return
    }
    handleIframeMessage(message.data.messageId, message.data.data, message.data.requestId, handler)
}