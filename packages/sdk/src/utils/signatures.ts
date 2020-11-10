export const prepareEthSignSignatureForSafe = (signature: string): string => {
    return signature.replace(/00$/, "1f").replace(/1b$/, "1f").replace(/01$/, "20").replace(/1c$/, "20")
}