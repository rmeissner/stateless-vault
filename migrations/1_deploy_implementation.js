const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle');
const VaultStorageReader = artifacts.require("VaultStorageReader");
const StatelessVault = artifacts.require("StatelessVault");

module.exports = function (deployer) {
  deployer.then(async () => {
    const { contractAddress } = await deployTruffleContract(web3, VaultStorageReader);
    await deployTruffleContract(web3, StatelessVault, contractAddress);
  })
};
