require('dotenv').config()
const { deployTruffleContract } = require('@gnosis.pm/singleton-deployer-truffle')
const fs = require('fs')
const path = require('path')
const ProxyFactory = artifacts.require("./GnosisSafeProxyFactory.sol")
const ProxyFactoryWithInitializor = artifacts.require("ProxyFactoryWithInitializor")
const Initializor = artifacts.require("Initializor")

const gnosisProxyFactoryAddress = process.env.PROXY_FACTORY_ADDRESS;

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

const deployFactory = async() => {
  const { contractAddress } = await deployTruffleContract(web3, ProxyFactory);
  return contractAddress;
}

module.exports = function (deployer, network) {
  deployer.then(async () => {
    const factoryAddress = (network !== "development" && gnosisProxyFactoryAddress) || await deployFactory();
    const { contractAddress } = await deployTruffleContract(web3, Initializor);
    await deployTruffleContract(web3, ProxyFactoryWithInitializor, factoryAddress, contractAddress);
    await writeImmutableMeta(ProxyFactoryWithInitializor.address, network, [
        web3.eth.abi.encodeParameter('address', factoryAddress).slice(2),
        web3.eth.abi.encodeParameter('address', contractAddress).slice(2),
    ]);
  })
};
