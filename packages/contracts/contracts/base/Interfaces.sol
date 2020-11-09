// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

interface RequestGuard {
    function checkTx(
        address to, 
        uint256 value, 
        bytes calldata data, 
        uint8 operation, 
        uint256 minAvailableGas,
        uint256 nonce,
        bytes calldata validationBytes
    ) external view returns (bool);

    function checkConfig(
        address updatedImplementation,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedSignatureValidator,
        address updatedRequestGuard,
        address updatedFallbackHandler,
        bytes calldata hookBytes,
        uint256 nonce,
        bytes calldata validationBytes
    ) external view returns (bool);
}

interface SignatureValidator {
    function validate(address signer, bytes calldata signature, bytes32 dataHash) external view returns (bool);
}