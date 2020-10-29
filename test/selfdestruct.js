const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')
const { execVaultTransaction } = require('./utils/vault.js')
const { Address0, getParamFromTxEvent, assertRejects } = require('./utils/general.js')

const Vault = artifacts.require("./StatelessVault.sol")
const Suicider = artifacts.require("./Suicider.sol")
const ProxyFactory = artifacts.require("./GnosisSafeProxyFactory.sol")

contract('StatelessVault', function(accounts) {

    let vault
    let config
    let executor = accounts[8]

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
            config.owners, config.threshold, Address0, Address0, Address0
        ).encodeABI()
        vault = await getParamFromTxEvent(
            await proxyFactory.deploy(vaultImplementation.address, vaultData, 0),
            'ProxyCreation', 'proxy', proxyFactory.address, Vault, 'create Proxy',
        )
    })

    it('protect against suicide', async () => {
        let suicider = await Suicider.new()
        //console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        // Deposit 1 ETH + some spare money for execution 
        const vaultCode = await web3.eth.getCode(vault.address)
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: 1})
        assert.equal(await web3.eth.getBalance(vault.address), 1)

        // Should fail as selfdestruct would transfer out all funds
        assertRejects(
            execVaultTransaction('selfdestruct vault', vault, suicider.address, 0, "0x", 1, 0, 0, config.defaultSigners, config, executor, true),
            "Revert if transaction fails"
        )
        assert.equal(await web3.eth.getBalance(vault.address), 1)
        assert.equal(await web3.eth.getCode(vault.address), vaultCode)

        // Withdraw all eth
        await execVaultTransaction('transfer out all ETH', vault, accounts[9], 1, "0x", 0, 0, 0, config.defaultSigners, config, executor, true)
        assert.equal(await web3.eth.getBalance(vault.address), 0)

        await execVaultTransaction('selfdestruct vault', vault, suicider.address, 0, "0x", 1, 0, 1, config.defaultSigners, config, executor, true)
        assert.equal(await web3.eth.getCode(vault.address), "0x")

        //console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))
    })
})
