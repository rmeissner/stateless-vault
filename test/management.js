const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')
const { execVaultTransaction, execVaultConfigChange } = require('./utils/vault.js')
const { buildRoot } = require('./utils/proof.js')
const { Address0, getParamFromTxEvent, assertRejects } = require('./utils/general.js')
const { soliditySHA3 } = require('ethereumjs-abi')
const { bufferToHex  } = require('ethereumjs-util')

const Vault = artifacts.require("./StatelessVault.sol")
const ProxyFactory = artifacts.require("./GnosisSafeProxyFactory.sol")

contract('StatelessVault', function(accounts) {

    let vault
    let vaultImplAddrs
    let config
    let executor = accounts[8]

    beforeEach(async () => {
        let { contractAddress } = await deployTruffleContract(web3, ProxyFactory)
        let proxyFactory = await ProxyFactory.at(contractAddress)
        let vaultImplementation = await Vault.deployed()
        vaultImplAddrs = vaultImplementation.address
        // Create Vault       
        config = {
            owners: [accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5]].sort(),
            defaultSigners: [accounts[0], accounts[1]].sort(),
            threshold: 2
        }
        let vaultData = await vaultImplementation.contract.methods.setup(
            config.owners, config.threshold, Address0
        ).encodeABI()
        vault = await getParamFromTxEvent(
            await proxyFactory.deploy(vaultImplementation.address, vaultData, 0),
            'ProxyCreation', 'proxy', proxyFactory.address, Vault, 'create Proxy',
        )
    })

    it('change owners and threshold', async () => {
        // Deposit 1 ETH
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        // Withdraw 1 ETH
        await execVaultTransaction('executeTransaction withdraw 1.0 ETH', vault, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, 0, 0, config.defaultSigners, config, executor, true)
        assert.equal(await web3.eth.getBalance(vault.address), 0)

        await execVaultConfigChange('change owners and threshold', vault, vaultImplAddrs, [accounts[0], accounts[1], accounts[2]].sort(), 3, Address0, 1, config, executor, true)
        const signersHash = await buildRoot(config.owners)
        assert.equal(
            await vault.configHash(),
            bufferToHex(soliditySHA3(["bytes32", "uint256", "uint256"], [signersHash, "0x3", "0x2"]))
        )

        // Deposit 1 ETH
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        assertRejects(
            execVaultTransaction('executeTransaction withdraw 1.0 ETH', vault, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, 0, 2, config.defaultSigners, config, executor, true),
            "Revert if transaction fails"
        )

        config.defaultSigners = [accounts[0], accounts[1], accounts[2]].sort()
        // Withdraw 1 ETH
        await execVaultTransaction('executeTransaction withdraw 1.0 ETH', vault, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, 0, 2, config.defaultSigners, config, executor, true)
        assert.equal(await web3.eth.getBalance(vault.address), 0)

        console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))
    })
})
