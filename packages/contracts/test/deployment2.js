const { generateSignaturesWithEthSign, execVaultTransaction } = require('./utils/vault.js')
const { logGasUsage } = require('./utils/general.js')
const { Address0, assertRejects } = require('./utils/general.js')
const { stripHexPrefix } = require("ethereumjs-util")
const { solidityPack } = require('ethereumjs-abi')

const Vault = artifacts.require("./StatelessVault.sol")
const Factory = artifacts.require("./ProxyFactoryWithInitializor2.sol")
const MultiSend = artifacts.require("./MultiSend.sol")

contract('StatelessVault', function(accounts) {

    let vault
    let config
    let executor = accounts[8]

    let encodeData = function(operation, to, value, data) {
        let dataBuffer = Buffer.from(stripHexPrefix(data), "hex")
        let encoded = solidityPack(["uint8", "address", "uint256", "uint256", "bytes"], [operation, to, value, dataBuffer.length, dataBuffer])
        return encoded.toString("hex")
    }

    it('create with initializor2 and deposit and withdraw 1 ETH', async () => {
        const factory = await Factory.deployed()
        const vaultImplementation = await Vault.deployed()
        // Create Vault       
        config = {
            owners: [accounts[0], accounts[1]],
            defaultSigners: [accounts[0], accounts[1]],
            threshold: 2
        }

        const deploymentValidators = [accounts[0]]
        const vaultAddress = await factory.calculateProxyAddress(deploymentValidators, 0)
        console.log({vaultAddress})

        const vaultData = await vaultImplementation.contract.methods.setup(
            config.owners, config.threshold, Address0, Address0, Address0
        ).encodeABI()

        const setupHash = await factory.generateSetupHash(
            vaultAddress,
            vaultImplementation.address,
            Address0,
            0,
            vaultData, 
            0,
            solidityPack(["address[]"], [deploymentValidators])
        )
        console.log({setupHash})
        const signatures = await generateSignaturesWithEthSign(setupHash, deploymentValidators)
        
        // Test invalid setup data
        const invalidVaultData = await vaultImplementation.contract.methods.setup(
            config.owners, config.threshold - 1, Address0, Address0, Address0
        ).encodeABI()
        await assertRejects(
            factory.createProxyWithInitializor(
                vaultImplementation.address, 
                Address0,
                0,
                invalidVaultData, 
                0,
                deploymentValidators,
                signatures,
                0,
                { from: executor }
            ),
            "Revert if initializor data is changed"
        )
        
        // Test invalid implementation
        const maliciousVault = await Vault.new(Address0)  
        await assertRejects(
            factory.createProxyWithInitializor(
                maliciousVault.address, 
                Address0,
                0,
                vaultData, 
                0,
                deploymentValidators,
                signatures,
                0,
                { from: executor }
            ),
            "Revert if implementation is changed"
        )

        // Test valid data
        logGasUsage("Proxy deployment", await factory.createProxyWithInitializor(
            vaultImplementation.address, 
            Address0,
            0,
            vaultData, 
            0,
            deploymentValidators,
            signatures,
            0,
            { from: executor }
        ))
        vault = await Vault.at(vaultAddress)

        //console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        // Deposit 1 ETH + some spare money for execution 
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        // Withdraw 1 ETH
        await execVaultTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, 0, 0, config.defaultSigners, config, executor, true)

        //console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))
        assert.equal(await web3.eth.getBalance(vault.address), 0)
    })

    it('create with initializor2 and deposit and withdraw 1 ETH', async () => {
        const multiSend = await MultiSend.new()
        const factory = await Factory.deployed()
        const vaultImplementation = await Vault.deployed()
        // Create Vault       
        config = {
            owners: [accounts[0], accounts[1], accounts[2]],
            defaultSigners: [accounts[0], accounts[1]],
            threshold: 2
        }

        const deploymentValidators = config.defaultSigners

        const vaultAddress = await factory.calculateProxyAddress(deploymentValidators, 0)

        const vaultData = await vaultImplementation.contract.methods.setup(
            config.owners, config.threshold, Address0, Address0, Address0
        ).encodeABI()

        const nestedTransactionData = '0x' +
            encodeData(0, vaultAddress, 0, vaultData) +
            encodeData(0, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x")

        const multiSendData = await multiSend.contract.methods.multiSend(nestedTransactionData).encodeABI()

        const setupHash = await factory.generateSetupHash(
            vaultAddress,
            vaultImplementation.address,
            multiSend.address,
            0,
            multiSendData, 
            1,
            solidityPack(["address[]"], [deploymentValidators])
        )
        const signatures = await generateSignaturesWithEthSign(setupHash, deploymentValidators)

        // Test not enough funds
        await assertRejects(
            factory.createProxyWithInitializor(
                vaultImplementation.address, 
                multiSend.address,
                0,
                multiSendData, 
                1,
                deploymentValidators,
                signatures,
                0,
                { from: executor }
            ),
            "Revert if not enough funds"
        )

        // Deposit 1 ETH
        assert.equal(await web3.eth.getBalance(vaultAddress), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vaultAddress, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vaultAddress), web3.utils.toWei("1.0", 'ether'))

        // Test valid data
        logGasUsage("Proxy deployment", await factory.createProxyWithInitializor(
            vaultImplementation.address, 
            multiSend.address,
            0,
            multiSendData, 
            1,
            deploymentValidators,
            signatures,
            0,
            { from: executor }
        ))
        vault = await Vault.at(vaultAddress)

        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("0.5", 'ether'))

        // Withdraw 1 ETH
        await execVaultTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("0.5", 'ether'), "0x", 0, 0, 0, config.defaultSigners, config, executor, true)

        //console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))
        assert.equal(await web3.eth.getBalance(vault.address), 0)
    })
})
