// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import './HashGenerator.sol';
import './SignatureCheck.sol';
import './VaultStorage.sol';

contract VaultValidator is VaultStorage, SignatureCheck, HashGenerator {
    
    using SafeMath for uint256;

    struct ValidationData {
        uint256 threshold; // uint32
        uint256 signerCount; // uint64
        address signatureValidator;
        address requestGuard;
        uint256[] signerIndeces; // uint32
        bytes32[] proofHashes; // uint64 + bytes[]
        bytes signatures;
    }

    function checkValidationData(
        bytes32 dataHash,
        uint256 nonce,
        ValidationData memory validationData
    ) internal view returns (bytes32) {
        uint256 recoveredSigner = 0;
        bytes32[] memory proofData = new bytes32[](validationData.signerCount);
        uint256 prevSignerIndex = 0;
        for (uint i = 0; i < validationData.signerIndeces.length; i++) {
            address signer = recoverSigner(dataHash, validationData.signatureValidator, validationData.signatures, i);
            recoveredSigner++;
            uint256 signerIndex = validationData.signerIndeces[i];
            // Make sure we are not provided with duplicate indeces (add 1 to account for index 0)
            require(signerIndex + 1 > prevSignerIndex, "signerIndex + 1 > prevSignerIndex");
            prevSignerIndex = signerIndex + 1;
            require(signerIndex < validationData.signerCount, "signerIndex < signerCount");
            proofData[signerIndex] = keccak256(abi.encode(signer));
        }
        require(recoveredSigner >= validationData.threshold, "recoveredSigner >= threshold");
        
        uint256 proofIndex = 0;
        uint256 hashCount = proofData.length;
        while (hashCount > 1) {
            for (uint i = 0; i < hashCount; i+=2) {
                bytes32 left = proofData[i];
                bytes32 right = (i + 1 < hashCount) ? proofData[i + 1] : bytes32(0);
                if (left == bytes32(0) && right == bytes32(0)) {
                    proofData[i/2] = bytes32(0);
                    continue;
                }
                if (left == bytes32(0)) {
                    left = validationData.proofHashes[proofIndex];
                    proofIndex++;
                }
                if (right == bytes32(0)) {
                    right = validationData.proofHashes[proofIndex];
                    proofIndex++;
                }
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to ceil the value
            hashCount = hashCount.add(1).div(2);
        }
        require(
            generateConfigHash(
                proofData[0], 
                validationData.threshold, 
                validationData.signatureValidator, 
                validationData.requestGuard, 
                nonce
            ) == configHash, 
            "Config hash is not the same"
        );
        return proofData[0];
    }
    
    function calculateSignersHash(address[] memory updatedSigners) internal pure returns(bytes32) {
        // Calculate signers hash
        uint256 hashCount = updatedSigners.length;
        bytes32[] memory proofData = new bytes32[](updatedSigners.length);
        for (uint i = 0; i < hashCount; i++) {
            address signer = updatedSigners[i];
            require(signer != address(0), "Invalid signer provided");
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

    function decodeValidationData(bytes calldata validationBytes) internal pure returns (ValidationData memory validationData) {
        (
            uint256 threshold,
            uint256 signerCount,
            address signatureValidator,
            address requestGuard,
            uint256[] memory signerIndeces,
            bytes32[] memory proofHashes,
            bytes memory signatures
        ) = abi.decode(validationBytes, (uint256, uint256, address, address, uint256[], bytes32[], bytes));
        validationData = ValidationData(threshold, signerCount, signatureValidator, requestGuard, signerIndeces, proofHashes, signatures);
    }
}