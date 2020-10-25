const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')
const { rawEncode, soliditySHA3 } = require('ethereumjs-abi')
const { toBuffer, bufferToHex  } = require('ethereumjs-util')

const Vault = artifacts.require("./StatelessVault.sol")
const ProxyFactory = artifacts.require("./GnosisSafeProxyFactory.sol")

function checkTxEvent(transaction, eventName, contract, exists, subject) {
  assert.isObject(transaction)
  if (subject && subject != null) {
      logGasUsage(subject, transaction)
  }
  let logs = transaction.logs
  if(eventName != null) {
      logs = logs.filter((l) => l.event === eventName && l.address === contract)
  }
  assert.equal(logs.length, exists ? 1 : 0, exists ? 'event was not present' : 'event should not be present')
  return exists ? logs[0] : null
}

function logGasUsage(subject, transactionOrReceipt) {
    let receipt = transactionOrReceipt.receipt || transactionOrReceipt
    console.log("    Gas costs for " + subject + ": " + receipt.gasUsed)
}

async function getParamFromTxEvent(transaction, eventName, paramName, contract, contractFactory, subject) {
    assert.isObject(transaction)
    if (subject != null) {
        logGasUsage(subject, transaction)
    }
    let logs = transaction.logs
    if(eventName != null) {
        logs = logs.filter((l) => l.event === eventName && l.address === contract)
    }
    assert.equal(logs.length, 1, 'too many logs found!')
    let param = logs[0].args[paramName]
    if(contractFactory != null) {
        let contract = await contractFactory.at(param)
        assert.isObject(contract, `getting ${paramName} failed for ${param}`)
        return contract
    } else {
        return param
    }
}

contract('StatelessVault', function(accounts) {

    const Address0 = "0x".padEnd(42, '0')
    let vault
    let config
    let executor = accounts[8]

    let assertRejects = async (q, msg) => {
        let res, catchFlag = false
        try {
            res = await q
        } catch(e) {
            catchFlag = true
        } finally {
            if(!catchFlag)
                assert.fail(res, null, msg)
        }
        return res
    }

    let signTypedData = async (account, data) => {
        return new Promise(function (resolve, reject) {
            web3.currentProvider.send({
                jsonrpc: "2.0", 
                method: "eth_signTypedData",
                params: [account, data],
                id: new Date().getTime()
            }, function(err, response) {
                if (err) { 
                    return reject(err);
                }
                resolve(response.result);
            });
        });
    }

    let ethSign = async function(account, hash) {
        return new Promise(function (resolve, reject) {
            web3.currentProvider.send({
                jsonrpc: "2.0", 
                method: "eth_sign",
                params: [account, hash],
                id: new Date().getTime()
            }, function(err, response) {
                if (err) { 
                    return reject(err);
                }
                resolve(response.result);
            });
        });
    }

    let sign = async function(vault, to, value, data, operation, gasLimit, nonce, signers) {
        let chainId = (await vault.getChainId()).toNumber()
        console.log({chainId})
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
        for (var i=0; i<signers.length; i++) {
            const signature = await signTypedData(signers[i], typedData)
            signatureBytes += (signature).replace('0x', '')
        }
        return signatureBytes
    }

    let sign2 = async function(vault, to, value, data, operation, gasLimit, nonce, signers) {
        const dataHash = await vault.generateTxHash(
            to, value, data, operation, gasLimit, nonce
        )
        let signatureBytes = "0x"
        for (var i=0; i<signers.length; i++) {
            // Adjust v (it is + 27 => EIP-155 and + 4 to differentiate them from typed data signatures in the Safe)
            let signature = (await ethSign(signers[i], dataHash)).replace('0x', '').replace(/00$/,"1f").replace(/01$/,"20")
            signatureBytes += (signature)
        }
        return signatureBytes
    }

    let buildProof = async (signers, owners, log) => {
        if (log) console.log("BUILD PROOF")
        const indeces = signers.map(signer => owners.indexOf(signer))
        const hashes = []
        const nodes = owners.map(owner => signers.indexOf(owner) < 0 ? bufferToHex(soliditySHA3(["uint256"], [owner])) : "0x0" )
        if (log) console.log({nodes})
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
                    nodes[Math.floor(i/2)] = "0x0"
                    continue;
                }
                if (left== "0x0") {
                    hashes.push(right)
                    nodes[Math.floor(i/2)] = "0x0"
                    continue;
                }
                if (right == "0x0") {
                    hashes.push(left)
                    nodes[Math.floor(i/2)] = "0x0"
                    continue;
                }
                nodes[Math.floor(i/2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
            }
            if (log) console.log({hashes})
            nodesCount = Math.ceil(nodesCount / 2)
            if (log) console.log({nodesCount})
            if (log) console.log({nodes})
        }

        return [indeces, hashes]
    }

    let buildRoot = async (owners) => {
        console.log("BUILD ROOT")
        const nodes = owners.map(owner => bufferToHex(soliditySHA3(["uint256"], [owner])))
        console.log({nodes})
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
                nodes[Math.floor(i/2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
            }
            nodesCount = Math.ceil(nodesCount / 2)
            console.log({nodesCount})
            console.log({nodes})
        }
        console.log(nodes[0])

    }

    let verifyProof = async (signers, owners, indeces, hashes) => {
        console.log("VERIFY PROOF")
        const nodes = owners.map(owner => signers.indexOf(owner) < 0 ? "0x0" : bufferToHex(soliditySHA3(["uint256"], [owner])))
        console.log({nodes})
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
                    nodes[Math.floor(i/2)] = "0x0"
                    continue;
                }
                if (left== "0x0") {
                    left = hashes[hashIndex]
                    hashIndex++
                }
                if (right == "0x0") {
                    right = hashes[hashIndex]
                    hashIndex++
                }
                nodes[Math.floor(i/2)] = bufferToHex(soliditySHA3(["bytes32", "bytes32"], [left, right]));
            }
            nodesCount = Math.ceil(nodesCount / 2)
            console.log({nodesCount})
            console.log({nodes})
        }

        return [indeces, hashes]
    }

    let execTransaction = async (subject, vault, to, value, data, operation, gasLimit, nonce, signers, vaultConfig, executor, rejectOnFail) => {
        //await buildRoot(vaultConfig.owners)
        const [ indeces, hashes ] = await buildProof(signers, vaultConfig.owners)
        //await verifyProof(signers, vaultConfig.owners, indeces, hashes)
        const signatures = await sign2(vault, to, value, data, operation, gasLimit, nonce, signers)
        /*
        (
                uint256 threshold,  
                uint256 signerCount,
                uint256[] memory signerIndeces,
                bytes32[] memory proofHashes,
                bytes memory signatures
            ) = abi.decode(validationData, (uint256, uint256, uint256[], bytes32[], bytes));
        */
        const validationData = "0x" + rawEncode(
            ["uint256", "uint256", "uint256[]", "bytes32[]", "bytes"],
            [vaultConfig.threshold, vaultConfig.owners.length, indeces, hashes, toBuffer(signatures)]
        ).toString('hex')

        // Debug logs
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
        console.log(await vault.checkValidationData(
            dataHash, nonce, vaultConfig.threshold, vaultConfig.owners.length, indeces, hashes, signatures
        ))
        */
       logGasUsage(subject, await vault.execTransaction(to, value, data, operation, gasLimit, nonce, validationData, !!rejectOnFail, { from: executor }))
    }

    beforeEach(async () => {
        let { contractAddress } = await deployTruffleContract(web3, ProxyFactory)
        let proxyFactory = await ProxyFactory.at(contractAddress)
        let vaultImplementation = await Vault.deployed()
        // Create Vault       
        config = {
            owners: [accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5]].sort(),
            defaultSigners: [accounts[0], accounts[1], accounts[2]].sort(),
            threshold: 3
        }
        let vaultData = await vaultImplementation.contract.methods.setup(
            config.owners, config.threshold, Address0
        ).encodeABI()
        vault = await getParamFromTxEvent(
            await proxyFactory.deploy(vaultImplementation.address, vaultData, 0),
            'ProxyCreation', 'proxy', proxyFactory.address, Vault, 'create Proxy',
        )
    })

    it('should deposit and withdraw 1 ETH', async () => {
        console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        // Deposit 1 ETH + some spare money for execution 
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        // Withdraw 1 ETH
        await execTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x", 0, 0, 0, config.defaultSigners, config, executor, true)

        await execTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x", 0, 0, 1, config.defaultSigners, config, executor, true)

        // Should fail as it is over the balance (payment should still happen)
        assertRejects(
            execTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x", 0, 0, 2, config.defaultSigners, config, executor, true),
            "Revert if transaction fails"
        )

        await execTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x", 0, 0, 2, config.defaultSigners, config, executor, false)

        console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))
        assert.equal(await web3.eth.getBalance(vault.address), 0)
    })
})
