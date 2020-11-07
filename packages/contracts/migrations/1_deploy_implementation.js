const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')
const fs = require('fs')
const path = require('path')
const VaultStorageReader = artifacts.require("VaultStorageReader")
const StatelessVault = artifacts.require("StatelessVault")
const ModuleManager = artifacts.require("ModuleManager")

const writeImmutableMeta = async (address, network, immutables) => {
  const metaDir = path.join(process.cwd(), "build", "meta")
  if (!fs.existsSync(metaDir)) {
      fs.mkdirSync(metaDir);
  }
  const immutableMetaFile = path.join(metaDir, 'immutableMeta.json')
  const immutableMeta = fs.existsSync(immutableMetaFile) ? JSON.parse(fs.readFileSync(immutableMetaFile)) : {}
  if (!immutableMeta[network])
    immutableMeta[network] = {}
  immutableMeta[network][address] = immutables
  fs.writeFileSync(immutableMetaFile, JSON.stringify(immutableMeta))
}

module.exports = function (deployer, network) {
  deployer.then(async () => {
    const { contractAddress } = await deployTruffleContract(web3, VaultStorageReader);
    await deployTruffleContract(web3, StatelessVault, contractAddress);
    await writeImmutableMeta(StatelessVault.address, network, [
        web3.eth.abi.encodeParameter('bytes32', web3.utils.sha3(ModuleManager.bytecode)).slice(2),
        web3.eth.abi.encodeParameter('address', VaultStorageReader.address).slice(2),
    ]);
  })
};
