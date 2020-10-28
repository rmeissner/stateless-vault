const { signTypedData, ethSign, logGasUsage, Address0 } = require('./general')
const { buildProof } = require('./proof')

const { rawEncode, solidityPack } = require('ethereumjs-abi')
const { toBuffer } = require('ethereumjs-util')

const generateTxSignaturesWithTypedData = async function (vault, to, value, data, operation, gasLimit, nonce, signers) {
    let chainId = (await vault.getChainId()).toNumber()
    console.log({ chainId })
    let typedData = {
        types: {
            EIP712Domain: [
                { type: "uint256", name: "chainId" },
                { type: "address", name: "verifyingContract" }
            ],
            // "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 gasLimit,uint256 nonce)"
            Transaction: [
                { type: "address", name: "to" },
                { type: "uint256", name: "value" },
                { type: "bytes", name: "data" },
                { type: "uint8", name: "operation" },
                { type: "uint256", name: "gasLimit" },
                { type: "uint256", name: "nonce" },
            ]
        },
        domain: {
            chainId: chainId,
            verifyingContract: vault.address
        },
        primaryType: "Transaction",
        message: {
            to: to,
            value: value,
            data: data,
            operation: operation,
            gasLimit: gasLimit,
            nonce: nonce
        }
    }
    let signatureBytes = "0x"
    signers.sort()
    for (var i = 0; i < signers.length; i++) {
        const signature = await signTypedData(signers[i], typedData)
        signatureBytes += (signature).replace('0x', '')
    }
    return signatureBytes
}

const generateSignaturesWithEthSign = async function (dataHash, signers) {
    let signatureBytes = "0x"
    for (var i = 0; i < signers.length; i++) {
        // Adjust v (it is + 27 => EIP-155 and + 4 to differentiate them from typed data signatures in the Safe)
        let signature = (await ethSign(signers[i], dataHash)).replace('0x', '').replace(/00$/, "1f").replace(/01$/, "20")
        signatureBytes += (signature)
    }
    return signatureBytes
}

const generateTxSignaturesWithEthSign = async function (vault, to, value, data, operation, gasLimit, nonce, signers) {
    const dataHash = await vault.generateTxHash(
        to, value, data, operation, gasLimit, nonce
    )
    return generateSignaturesWithEthSign(dataHash, signers)
}

const buildValidationData = async (dataHash, signers, vaultConfig) => {
    const [indeces, hashes] = await buildProof(signers, vaultConfig.owners)
    const signatures = await generateSignaturesWithEthSign(dataHash, signers)
    const validationData = "0x" + rawEncode(
        ["uint256", "uint256", "address", "address", "uint256[]", "bytes32[]", "bytes"],
        [vaultConfig.threshold, vaultConfig.owners.length, Address0, Address0, indeces, hashes, toBuffer(signatures)]
    ).toString('hex')
    return validationData
}

const execVaultConfigChange = async (subject, vault, impl, signers, threshold, fallbackHandler, nonce, vaultConfig, executor) => {
    const dataHash = await vault.generateConfigChangeHash(
        impl, solidityPack(["address[]"], [signers]), threshold, Address0, Address0, fallbackHandler, nonce
    )
    const validationData = await buildValidationData(dataHash, vaultConfig.defaultSigners, vaultConfig)
    logGasUsage(subject, await vault.updateConfig(impl, signers, threshold, Address0, Address0, fallbackHandler, nonce, validationData, { from: executor }))
    vaultConfig.threshold = threshold
    vaultConfig.owners = signers
}

const execVaultTransaction = async (subject, vault, to, value, data, operation, gasLimit, nonce, signers, vaultConfig, executor, rejectOnFail) => {
    const dataHash = await vault.generateTxHash(
        to, value, data, operation, gasLimit, nonce
    )
    const validationData = await buildValidationData(dataHash, signers, vaultConfig)
    { // Debug logs
        /* 
        console.log({validationData})
        console.log({signers})
        console.log({vaultConfig})
        console.log({indeces})
        console.log({hashes})
        console.log({signatures})
        const dataHash = await vault.generateTxHash(
            to, value, data, operation, gasLimit, nonce
        )
        console.log({dataHash})
        for (i in signers) {
            console.log(await vault.recoverSigner(
                dataHash, signatures, i
            ))
        }
        const validationObject = await vault.decodeValidationData(validationData)
        console.log(validationObject)
        console.log(await vault.checkValidationData(
            dataHash, nonce, validationObject
        ))
        */
    }
    logGasUsage(subject, await vault.execTransaction(to, value, data, operation, gasLimit, nonce, validationData, !!rejectOnFail, { from: executor }))
}

Object.assign(exports, {
    buildValidationData,
    generateTxSignaturesWithTypedData,
    generateTxSignaturesWithEthSign,
    execVaultTransaction,
    execVaultConfigChange
})
