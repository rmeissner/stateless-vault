const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')

const { soliditySHA3, solidityPack } = require('ethereumjs-abi')
const { bufferToHex  } = require('ethereumjs-util')
const { buildRoot } = require('./utils/proof.js')
const { execVaultTransaction, buildValidationData } = require('./utils/vault.js')
const { Address0 } = require('./utils/general.js')

const utils = require('@gnosis.pm/safe-contracts/test/utils/general')
const truffleContract = require("@truffle/contract")

const GnosisSafeBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json")
const GnosisSafe = truffleContract(GnosisSafeBuildInfo)
GnosisSafe.setProvider(web3.currentProvider)
const GnosisSafeProxyBuildInfo = require("@gnosis.pm/safe-contracts/build/contracts/GnosisSafeProxy.json")
const GnosisSafeProxy = truffleContract(GnosisSafeProxyBuildInfo)
GnosisSafeProxy.setProvider(web3.currentProvider)

const SafeToVaultMigration = artifacts.require("./SafeV120ToVaultV1Migration.sol")
const VaultToSafeMigration = artifacts.require("./VaultV1ToSafeV120Migration.sol")
const VaultToSafeMigrationCoordinator = artifacts.require("./VaultV1ToSafeV120MigrationCoordinator.sol")
const VaultStorageReader = artifacts.require("./VaultStorageReader.sol")
const Vault = artifacts.require("./StatelessVault.sol")
const IProxy = artifacts.require("./IProxy.sol")

contract('StatelessVault', function(accounts) {

    let lw
    let vaultReader
    let vaultImplAddrs
    let safeImplAddrs
    let migration
    let migrationCoordinator
    let executor = accounts[8]

    let execSafeTransaction = async function(safe, to, value, data, operation, message) {
        let nonce = await safe.nonce()
        let transactionHash = await safe.getTransactionHash(to, value, data, operation, 0, 0, 0, Address0, Address0, nonce)
        let sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
        assert.ok(await safe.execTransaction.call(to, value, data, operation, 0, 0, 0, Address0, Address0, sigs, { from: executor }))
        let tx = await safe.execTransaction(to, value, data, operation, 0, 0, 0, Address0, Address0, sigs, { from: executor })
        utils.logGasUsage(
            'execTransaction ' + message,
            tx
        )
    }

    beforeEach(async () => {
        lw = await utils.createLightwallet()
        vaultReader = await VaultStorageReader.deployed()

        const gnosisSafeMasterCopy = await GnosisSafe.new({ from: accounts[0] })
        safeImplAddrs = gnosisSafeMasterCopy.address

        const vaultImplementation = await Vault.deployed()
        vaultImplAddrs = vaultImplementation.address;
        {
            const { contractAddress } = await deployTruffleContract(web3, SafeToVaultMigration, vaultImplAddrs)
            migration = await SafeToVaultMigration.at(contractAddress)
        }

        {
            const migrationInfo = await deployTruffleContract(web3, VaultToSafeMigration, safeImplAddrs)
            const coordinatorInfo = await deployTruffleContract(web3, VaultToSafeMigrationCoordinator, migrationInfo.contractAddress)
            migrationCoordinator = await VaultToSafeMigrationCoordinator.at(coordinatorInfo.contractAddress)
        }

        const proxy = await GnosisSafeProxy.new(safeImplAddrs, { from: accounts[0] })
        gnosisSafe = await GnosisSafe.at(proxy.address)
        await gnosisSafe.setup([lw.accounts[0], lw.accounts[1], accounts[0], accounts[1]], 2, Address0, "0x", accounts[9], Address0, 0, Address0, { from: executor })
    })

    it('migrate Safe to Vault and back', async () => {
        
        const proxy = await IProxy.at(gnosisSafe.address)
        assert.equal(
            await proxy.masterCopy(),
            safeImplAddrs
        )
        const owners = await gnosisSafe.getOwners()
        const threshold = await gnosisSafe.getThreshold()
        const nonce = await gnosisSafe.nonce()
        const fallbackHandlerAddress = await web3.eth.getStorageAt(gnosisSafe.address, "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5")

        const migrationData = await migration.contract.methods.migrate().encodeABI()
        await execSafeTransaction(gnosisSafe, migration.address, 0, migrationData, 1, "migrate to vault")

        assert.equal(
            await proxy.masterCopy(),
            vaultImplAddrs
        )
        const fallbackHandlerAddressVault = await web3.eth.getStorageAt(gnosisSafe.address, "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5")
        assert.equal(
            "0x0",
            fallbackHandlerAddressVault
        )

        const vault = await Vault.at(gnosisSafe.address)
        assert.equal(
            (await vaultReader.getFallbackHandler(vault.address)).toLowerCase(),
            fallbackHandlerAddress
        )
        const signersHash = await buildRoot(owners)
        assert.equal(
            await vaultReader.getConfigHash(vault.address),
            bufferToHex(soliditySHA3(["bytes32", "uint256", "address", "address", "uint256"], [signersHash, threshold, "0x0", "0x0", nonce + 1]))
        )

        const config = {
            owners,
            defaultSigners: [accounts[0], accounts[1]].sort(),
            threshold: 2
        }
        // Deposit 1 ETH + some spare money for execution 
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        // Withdraw 1 ETH
        await execVaultTransaction('executeTransaction withdraw 0.5 ETH', vault, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, 0, 1, config.defaultSigners, config, executor, true)
        assert.equal(await web3.eth.getBalance(vault.address), 0)

        //console.log((await vault.getPastEvents("Configuration", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionSuccess", { fromBlock: "earliest" })).map(e => e.args))
        //console.log((await vault.getPastEvents("ExecutionFailure", { fromBlock: "earliest" })).map(e => e.args))

        const configNonce = 2
        const migrationAddr = await migrationCoordinator.migration()
        const dataHash = await vault.generateConfigChangeHash(
            migrationAddr, solidityPack(["address[]"], [owners]), threshold, Address0, Address0, fallbackHandlerAddress, "0x", configNonce
        )
        const validationData = await buildValidationData(dataHash, config.defaultSigners, config)
        utils.logGasUsage(
            "migrate to Safe",
            await migrationCoordinator.migrate(
                vault.address,
                owners,
                threshold,
                fallbackHandlerAddress,
                configNonce,
                validationData
            )
        )
        
        const implFinal = await proxy.masterCopy()
        assert.equal(safeImplAddrs, implFinal)
        const ownersFinal = await gnosisSafe.getOwners()
        assert.deepEqual(owners, ownersFinal)
        const thresholdFinal = await gnosisSafe.getThreshold()
        assert.equal(threshold.toNumber(), thresholdFinal.toNumber())
        const nonceFinal = await gnosisSafe.nonce()
        assert.equal(3, nonceFinal)
        const fallbackHandlerAddressFinal = await web3.eth.getStorageAt(gnosisSafe.address, "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5")
        assert.equal(fallbackHandlerAddress, fallbackHandlerAddressFinal)

        // Deposit 1 ETH + some spare money for execution 
        assert.equal(await web3.eth.getBalance(vault.address), 0)
        await web3.eth.sendTransaction({from: accounts[9], to: vault.address, value: web3.utils.toWei("1.0", 'ether')})
        assert.equal(await web3.eth.getBalance(vault.address), web3.utils.toWei("1.0", 'ether'))

        // Withdraw 1 ETH
        await execSafeTransaction(gnosisSafe, accounts[9], web3.utils.toWei("1.0", 'ether'), "0x", 0, "withdraw 0.5 ETH")
        assert.equal(await web3.eth.getBalance(vault.address), 0)
    })
})
