# Stateless Vault

A secure and flexible smart contract wallet with minimized gas usage.

## Key features

- Secure transaction execution 
  - Check that delegate calls don't change config
  - Simple seldestruction protection (as long as there is ETH in the Vault it cannot be selfdestructed)
- No "hidden" information
  - All information used for authorization and method handling is easily accessible off-chain
- Similar features as Gnosis Safe with less storage access and therefore lower (and constant) gas costs
  - Multisignature support with threshold
  - Fallback handler support to react to incoming calls
  - Delegate call support to easily extend functionality
  - Module support to allow special access configurations

## Overview

This contract uses merkle proofs and counterfactual addresses to keep the used storage slots to a minimum. Currently **three** storage slots are in use: implementation address, fallback handler address, config hash.

The config hash is the hash of the concatination of the `nonce`, `threshold` and `signersHash`. The `signersHash` is the merkle root hash for the signers of the Vault. When executing a transaction these information need to be provided (e.g. as a merkle proof) as they are not stored on-chain.

It is possible to whitelist addresses for which the multisignature check is ignored. These addresses are known as modules. As modules are normally contracts providing the merkle proof is not very feasable (also this would break compatibility to Gnosis Safe based modules). Therefore a separate contract is used to store the enabled module addresses. Therefore delegate calls cannot directly temper with the storage creating unexpected behaviour (as it is [possible in the Gnosis Safe](https://github.com/gnosis/safe-contracts/issues/198)). To avoid additional storage the address of this management contract is calculated using `create2`. If modules are not used it is not necessary to deploy the management contract therefore saving gas.

## Security measures

### Config change protection

Normal Vault transactions cannot change any of the storage slots that make up the configuration (implementation address, fallback handler address, config hash) else the Ethereum transaction will revert. 

If any of these values should be adjusted it is required to use the `updateConfig`, therefore making it very explicit if changes to the config are performed.

### Selfdestruct protection

To provide a minimal protection for the Vault against potential delegate calls that execute the `selfdestruct` opcode (that would result in a deletion of the Vault contract) a simple limitation is put in place: it is not possible to transfer out all Ether with a delegate call (this is the only state change triggered by `selfdestruct` that can be checked during contract execution currently).

Note: To prevent that the implementation contract (aka master copy) can be selfdestructed a [singleton factory](https://github.com/gnosis/singleton-deployer) is used. For more information see the [Ethereum Magicians thread](https://ethereum-magicians.org/t/erc-2470-singleton-factory/3933)

P.S.: The measures mentioned above are not required anymore once it is possible to mark contracts as [indestructable (EIP-2937)](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-2937.md)

## Migration from/to Gnosis Safe

It is possible to migrate the [Gnosis Safe](https://github.com/gnosis/safe-contracts) to or from the Vault. For this migration contracts have been provided. 

To migrate from the Safe to the Vault you need to perform a delegate call to an instance of the [`SafeV120ToVaultV1Migration`](./contracts/migration/SafeToVault.sol) contract from a Safe.

To migrate from the Vault to a Safe you need to authorize a configuration change where the implementation is changed to the address of an instance of the [`VaultV1ToSafeV120Migration`](./contracts/migration/VaultToSafe.sol) contract. The generated `validationData` needs to be passed to an instance of the [`VaultV1ToSafeV120MigrationCoordinator`](./contracts/migration/VaultToSafe.sol) contract. 

More information can be found in the [migration test](./test/migration.js)