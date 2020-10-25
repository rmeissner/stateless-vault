# Stateless Vault

Keep the used storage to a minimum. Currently that is 3 slots (implementation address, fallback handler address, config hash)

## Key advantages

- Secure transaction execution 
  - Check that delegate calls don't change config
  - Simple seldestruction protection (as long as there is ETH in the vault it cannot be selfdestructed)
- No "hidden" information
  - All information used for authorization and method handling is easily accessible off-chain
- Similar features as Gnosis Safe with less storage access and therefore lower (and constant) gas costs

## Migration from/to Safe

It is possible to migrate the Safe to or from the Vault. For this migration contracts have been provided. 

To migrate from the Safe to the Vault you need to perform a delegate call to an instance of the [`SafeV120ToVaultV1Migration`](./contracts/migration/SafeToVault.sol) contract from a Safe.

To migrate from the Vault to a Safe you need to authorize a configuration change where the implementation is changed to the address of an instance of the [`VaultV1ToSafeV120Migration`](./contracts/migration/VaultToSafe.sol) contract. The generated `validationData` needs to be passed to an instance of the [`VaultV1ToSafeV120MigrationCoordinator`](./contracts/migration/VaultToSafe.sol) contract. 

More information can be found in the [migration test](./test/migration.js)