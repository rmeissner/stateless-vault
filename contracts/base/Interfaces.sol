// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

interface RequestGuard {
    function check(
        address to, 
        uint256 value, 
        bytes calldata data, 
        uint8 operation, 
        uint256 minAvailableGas,
        uint256 nonce,
        uint256 signerCount, 
        uint256 threshold,
        bytes calldata signatures
    ) external view returns (bool);
}

interface SignatureValidator {
    function validate(address signer, bytes calldata signature, bytes32 dataHash) external view returns (bool);
}