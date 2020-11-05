// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract HashGenerator {
    
    bytes32 constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(uint256 chainId,address verifyingContract)"
    );

    bytes32 constant TRANSACTION_TYPEHASH = keccak256(
        "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 minAvailableGas,uint256 nonce)"
    );

    // Owners are packed encoded (to avoid issues with EIP712)
    bytes32 constant CONFIG_CHANGE_TYPEHASH = keccak256(
        "ConfigChange(uint256 implementation,bytes signers,uint256 threshold,address signatureValidator,address requestGuard,address fallbackHandler,bytes hookBytes,uint256 nonce,bytes32 metaHash)"
    );

    /// @dev Returns the chain id used by this contract.
    function getChainId() internal pure returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    function generateConfigHash(
        bytes32 signersHash,
        uint256 threshold,
        address signatureValidator,
        address requestGuard,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(signersHash, threshold, signatureValidator, requestGuard, nonce));
    }

    function generateTxHash(
        address to, uint256 value, bytes memory data, uint8 operation, uint256 minAvailableGas, uint256 nonce, bytes32 metaHash
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 txHash = keccak256(
            abi.encode(TRANSACTION_TYPEHASH, to, value, keccak256(data), operation, minAvailableGas, nonce, metaHash)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, txHash));
    }

    function generateConfigChangeHash(
        address _implementation, 
        bytes memory signers, 
        uint256 threshold, 
        address signatureValidator, 
        address requestGuard, 
        address _fallbackHandler, 
        bytes memory hookBytes, 
        uint256 nonce
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 configChangeHash = keccak256(
            abi.encode(CONFIG_CHANGE_TYPEHASH, _implementation, keccak256(signers), threshold, signatureValidator, requestGuard, _fallbackHandler, keccak256(hookBytes), nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, configChangeHash));
    }
}