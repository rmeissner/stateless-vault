
import {  VaultConfig } from '../index'
import { constants, utils } from 'ethers'

export const buildProof = async (txSigners: string[], allSigners: string[]): Promise<{ indeces: number[], hashes: string[] }> => {
    const ownersCopy: (string | null)[] = [...allSigners]
    const indeces = txSigners.map(signer => {
        const i = ownersCopy.indexOf(signer)
        ownersCopy[i] = null
        return i
    })
    const hashes = []
    const nodes = allSigners.map(signer => txSigners.indexOf(signer) < 0 ? utils.solidityKeccak256(["uint256"], [signer]) : "0x0")
    let nodesCount = nodes.length
    while (nodesCount > 1) {
        for (let i = 0; i < nodesCount; i += 2) {
            let left = nodes[i]
            let right
            if (i + 1 < nodesCount) {
                right = nodes[i + 1]
            } else {
                right = utils.solidityKeccak256(["uint256"], ["0x0"])
            }
            if (left == "0x0" && right == "0x0") {
                nodes[Math.floor(i / 2)] = "0x0"
                continue;
            }
            if (left == "0x0") {
                hashes.push(right)
                nodes[Math.floor(i / 2)] = "0x0"
                continue;
            }
            if (right == "0x0") {
                hashes.push(left)
                nodes[Math.floor(i / 2)] = "0x0"
                continue;
            }
            nodes[Math.floor(i / 2)] = utils.solidityKeccak256(["bytes32", "bytes32"], [left, right]);
        }
        nodesCount = Math.ceil(nodesCount / 2)
    }

    return { indeces, hashes }
}

export const buildValidationData = async (vaultConfig: VaultConfig, signatures: string, signers: string[]): Promise<string> => {
    const { indeces, hashes } = await buildProof(signers, vaultConfig.signers)
    const validationData = utils.defaultAbiCoder.encode(
        ["uint256", "uint256", "address", "address", "uint256[]", "bytes32[]", "bytes"],
        [vaultConfig.threshold, vaultConfig.signers.length, constants.AddressZero, constants.AddressZero, indeces, hashes, signatures]
    )
    return validationData
}