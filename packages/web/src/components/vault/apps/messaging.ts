import {
    InterfaceMessageIds,
    InterfaceMessageToPayload,
    SDKMessageIds,
    SDKMessageToPayload,
    RequestId,
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