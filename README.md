# Stateless Vault

Keep the used storage to a minimum. Currently that is 3 slots (implementation address, fallback handler address, config hash)

## Key advantages

- Secure transaction execution (check that delegate calls don't change config)
- No hidden information
- Similar features as Gnosis Safe with less storage access and therefore lower (and constant) gas costs