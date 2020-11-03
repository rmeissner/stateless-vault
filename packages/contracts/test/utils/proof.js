const { soliditySHA3 } = require('ethereumjs-abi')
const { bufferToHex  } = require('ethereumjs-util')

const buildProof = async (signers, owners, log) => {
    if (log) console.log("BUILD PROOF")
    if (log) console.log({ owners })
    const ownersCopy = [...owners]
    const indeces = signers.map(signer => {
        const i = ownersCopy.indexOf(signer)
        ownersCopy[i] = null
        return i
    })
    const hashes = []
    const nodes = owners.map(owner => signers.indexOf(owner) < 0 ? bufferToHex(soliditySHA3(["uint256"], [owner])) : "0x0")
    if (log) console.log({ nodes })
    let nodesCount = nodes.length
    while (nodesCount > 1) {
        for (i = 0; i < nodesCount; i += 2) {
            let left = nodes[i]
            let right
            if (i + 1 < nodesCount) {
                right = nodes[i + 1]
            } else {
                right = bufferToHex(soliditySHA3(["uint256"], ["0x0"]))
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
            nodes[Math.floor(i / 2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
        }
        if (log) console.log({ hashes })
        nodesCount = Math.ceil(nodesCount / 2)
        if (log) console.log({ nodesCount })
        if (log) console.log({ nodes })
    }

    return [indeces, hashes]
}

const buildRoot = async (owners, log) => {
    if (log) console.log("BUILD ROOT")
    const nodes = owners.map(owner => bufferToHex(soliditySHA3(["uint256"], [owner])))
    if (log) console.log({ nodes })
    let nodesCount = nodes.length
    while (nodesCount > 1) {
        for (i = 0; i < nodesCount; i += 2) {
            let left = nodes[i]
            let right
            if (i + 1 < nodesCount) {
                right = nodes[i + 1]
            } else {
                right = bufferToHex(soliditySHA3(["uint256"], ["0x0"]))
            }
            nodes[Math.floor(i / 2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
        }
        nodesCount = Math.ceil(nodesCount / 2)
        if (log) console.log({ nodesCount })
        if (log) console.log({ nodes })
    }
    if (log) console.log(nodes[0])
    return nodes[0]
}

const verifyProof = async (signers, owners, indeces, hashes) => {
    console.log("VERIFY PROOF")
    const nodes = owners.map(owner => signers.indexOf(owner) < 0 ? "0x0" : bufferToHex(soliditySHA3(["uint256"], [owner])))
    console.log({ nodes })
    let nodesCount = nodes.length
    let hashIndex = 0;
    while (nodesCount > 1) {
        for (i = 0; i < nodesCount; i += 2) {
            let left = nodes[i]
            let right
            if (i + 1 < nodesCount) {
                right = nodes[i + 1]
            } else {
                right = "0x0"
            }
            if (left == "0x0" && right == "0x0") {
                nodes[Math.floor(i / 2)] = "0x0"
                continue;
            }
            if (left == "0x0") {
                left = hashes[hashIndex]
                hashIndex++
            }
            if (right == "0x0") {
                right = hashes[hashIndex]
                hashIndex++
            }
            nodes[Math.floor(i / 2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
        }
        nodesCount = Math.ceil(nodesCount / 2)
        console.log({ nodesCount })
        console.log({ nodes })
    }

    return [indeces, hashes]
}

Object.assign(exports, {
    buildProof,
    verifyProof,
    buildRoot
})