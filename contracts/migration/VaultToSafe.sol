// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "../StatelessVault.sol";

contract VaultV1ToSafeV120Migration {
    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH = 0x035aff83d86937d35b32e04f0ddc6ff469290eef2f1b692d8a815c89404d4749;

    // Safe storage layout
    // Master copy
    address internal implementation;

    // Modules
    address internal constant SENTINEL_MODULES = address(0x1);
    mapping (address => address) internal modules;

    // Owners
    address internal constant SENTINEL_OWNERS = address(0x1);
    mapping(address => address) internal owners;
    uint256 ownerCount;
    uint256 internal threshold;

    // Fallback manager
    // keccak256("fallback_manager.handler.address")
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT = 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    // Execution
    uint256 public nonce;
    bytes32 public domainSeparator;

    address immutable safe;

    constructor(address _safe) {
        safe = _safe;
    }

    function migrate(
        address[] calldata targetSigners,
        uint256 targetThreshold,
        address targetFallbackHandler,
        uint256 targetNonce
    ) public {
        implementation = safe;

        // Reset config and nonce
        assembly {
            sstore(1, 0)
            sstore(2, 0)
        }

        // Modules
        setupModules();

        // Owners
        setupOwners(targetSigners, targetThreshold);

        // Fallback manager
        internalSetFallbackHandler(targetFallbackHandler);

        // Execution
        domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, this));
        nonce = targetNonce;
    }
    
    function setupOwners(address[] memory _owners, uint256 _threshold)
        internal
    {
        // Validate that threshold is smaller than number of added owners.
        require(_threshold <= _owners.length, "Threshold cannot exceed owner count");
        // There has to be at least one Safe owner.
        require(_threshold >= 1, "Threshold needs to be greater than 0");
        // Initializing Safe owners.
        address currentOwner = SENTINEL_OWNERS;
        for (uint256 i = 0; i < _owners.length; i++) {
            // Owner address cannot be null.
            address owner = _owners[i];
            require(owner != address(0) && owner != SENTINEL_OWNERS, "Invalid owner address provided");
            // No duplicate owners allowed.
            require(owners[owner] == address(0), "Duplicate owner address provided");
            owners[currentOwner] = owner;
            currentOwner = owner;
        }
        owners[currentOwner] = SENTINEL_OWNERS;
        ownerCount = _owners.length;
        threshold = _threshold;
    }
    
    // We disable all modules
    function setupModules()
        internal
    {
        modules[SENTINEL_MODULES] = SENTINEL_MODULES;
    }

    function internalSetFallbackHandler(address handler) internal {
        bytes32 slot = FALLBACK_HANDLER_STORAGE_SLOT;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            sstore(slot, handler)
        }
    }
}

contract VaultV1ToSafeV120MigrationCoordinator {

    VaultV1ToSafeV120Migration immutable public migration;

    constructor(VaultV1ToSafeV120Migration _migration) {
        migration = _migration;
    }

    function migrate(
        StatelessVault vault,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedFallbackHandler,
        uint256 nonce,
        // Validation information
        bytes memory validationData
    ) public {
        vault.updateConfig(
            address(migration), updatedSigners, updatedThreshold, updatedFallbackHandler, nonce, validationData
        );
        VaultV1ToSafeV120Migration(address(vault)).migrate(updatedSigners, updatedThreshold, updatedFallbackHandler, nonce + 1);
    }
}