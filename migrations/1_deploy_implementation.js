const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle');
const StatelessVault = artifacts.require("StatelessVault");

module.exports = function(deployer) {
  deployer.then(async () => {
    await deployTruffleContract(web3, StatelessVault);
  })
};
