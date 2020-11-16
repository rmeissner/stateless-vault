const Address0 = "0x".padEnd(42, '0')

const assertRejects = async (q, msg) => {
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

const signTypedData = async (account, data) => {
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

const ethSign = async function(account, hash) {
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

const checkTxEvent = (transaction, eventName, contract, exists, subject) => {
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

const logGasUsage = (subject, transactionOrReceipt) => {
    let receipt = transactionOrReceipt.receipt || transactionOrReceipt
    console.log("    Gas costs for " + subject + ": " + receipt.gasUsed)
}

const getParamFromTxEvent = async (transaction, eventName, paramName, contract, contractFactory, subject) => {
    assert.isObject(transaction)
    if (subject != null) {
        logGasUsage(subject, transaction)
    }
    let logs = transaction.logs
    console.log(transaction.rawLogs)
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

Object.assign(exports, {
    Address0,
    assertRejects,
    signTypedData,
    ethSign,
    getParamFromTxEvent,
    logGasUsage,
    checkTxEvent
})