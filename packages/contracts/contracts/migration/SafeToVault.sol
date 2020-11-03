// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract SafeV120ToVaultV1Migration {
    
    using SafeMath for uint256;
     
    event Configuration(
        address implementation,
        address[] signers,
        uint256 threshold,
        address fallbackHandler,
        uint256 currentNonce
    );

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

    address immutable public vault;

    constructor(address _vault) {
        vault = _vault;
    }

    function migrate() public {
        domainSeparator = 0;
        implementation = vault;

        // Modules
        resetModules();

        // Owners
        (address[] memory signers, uint256 configThreshold, uint256 configNonce) = calculateConfig();

        // Fallback manager
        address handler = updateFallbackHandler();
        emit Configuration(vault, signers, configThreshold, handler, configNonce);
    }
    
    function calculateConfig()
        internal
        returns (address[] memory, uint256, uint256)
    {
        address[] memory ownersArray = new address[](ownerCount);

        // populate return array
        uint256 index = 0;
        address currentOwner = owners[SENTINEL_OWNERS];
        owners[SENTINEL_OWNERS] = address(0);
        while(currentOwner != SENTINEL_OWNERS) {
            ownersArray[index] = currentOwner;
            address nextOwner = owners[currentOwner];
            owners[currentOwner] = address(0);
            currentOwner = nextOwner;
            index ++;
        }
        uint configNonce = nonce;
        uint configThreshold = threshold;

        // Reset Safe storage
        threshold = 0;
        nonce = 0;
        ownerCount = 0;

        bytes32 signersHash = calculateSignersHash(ownersArray);
        bytes32 configHash = keccak256(abi.encodePacked(signersHash, configThreshold, address(0), address(0), configNonce));
        bytes32 slot = bytes32(uint256(0x1));
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            sstore(slot, configHash)
        }
        return (ownersArray, configThreshold, configNonce);
    }
    
    function calculateSignersHash(address[] memory updatedSigners) internal pure returns(bytes32) {
        // Calculate signers hash
        uint256 hashCount = updatedSigners.length;
        bytes32[] memory proofData = new bytes32[](updatedSigners.length);
        for (uint i = 0; i < hashCount; i++) {
            address signer = updatedSigners[i];
            proofData[i] = keccak256(abi.encode(signer));
        }
        while (hashCount > 1) {
            for (uint i = 0; i < hashCount; i+=2) {
                bytes32 left = proofData[i];
                bytes32 right = (i + 1 < hashCount) ? proofData[i + 1] : keccak256(abi.encodePacked(bytes32(0)));
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to ceil the value
            hashCount = hashCount.add(1).div(2);
        }
        return proofData[0];
    }
    
    // We disable all modules
    function resetModules()
        internal
    {
        address currentModule = modules[SENTINEL_MODULES];
        modules[SENTINEL_MODULES] = address(0);
        while(currentModule != SENTINEL_MODULES) {
            address nextModule = modules[currentModule];
            modules[currentModule] = address(0);
            currentModule = nextModule;
        }
    }

    function updateFallbackHandler() internal returns (address handler) {
        bytes32 newSlot = bytes32(uint256(0x2));
        bytes32 currentSlot = FALLBACK_HANDLER_STORAGE_SLOT;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            handler := sload(currentSlot)
            sstore(newSlot, handler)
            sstore(currentSlot, 0)
        }
    }
}