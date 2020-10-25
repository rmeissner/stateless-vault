// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "./base/VaultStorage.sol";
import "./base/SignatureCheck.sol";
import "./modules/ModuleExecutor.sol";

contract StatelessVault is VaultStorage, ModuleExecutor, SignatureCheck {
    
    event Configuration(
        address implementation,
        address[] signers,
        uint256 threshold,
        address fallbackHandler,
        uint256 currentNonce
    );

    event ExecutionFailure(
        uint usedNonce, bytes32 txHash
    );
    event ExecutionSuccess(
        uint usedNonce, bytes32 txHash
    );

    event ReceivedEther(
        address indexed sender, 
        uint amount
    );
    
    bytes32 constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(uint256 chainId,address verifyingContract)"
    );

    bytes32 constant TRANSACTION_TYPEHASH = keccak256(
        "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 gasLimit,uint256 nonce)"
    );

    // Owners are packed encoded (to avoid issues with EIP712)
    bytes32 constant CONFIG_CHANGE_TYPEHASH = keccak256(
        "ConfigChange(uint256 implementation,bytes signers, uint256 threshold,address fallbackHandler)"
    );
    
    constructor() {
        configHash = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    }
    
    function setup(
        address[] calldata signers,
        uint256 threshold,
        address _fallbackHandler
    ) public {
        require(configHash == bytes32(0), "Contract already initialised");
        require(threshold <= signers.length, "Threshold cannot be higher than amount of signers");
        fallbackHandler = _fallbackHandler;
    
        bytes32 signersHash = calculateSignersHash(signers);
        configHash = keccak256(abi.encodePacked(signersHash, threshold, uint256(0)));
        
        emit Configuration(implementation, signers, threshold, _fallbackHandler, 0);
    }
    
    function updateConfig(
        address updatedImplementation,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedFallbackHandler,
        uint256 nonce,
        // Validation information
        bytes memory validationData
    ) public {
        require(updatedThreshold <= updatedSigners.length, "Threshold cannot be higher than amount of signers");
        bytes32 dataHash;
        {
            (
                uint256 threshold,  
                uint256 signerCount,
                uint256[] memory signerIndeces,
                bytes32[] memory proofHashes,
                bytes memory signatures
            ) = abi.decode(validationData, (uint256, uint256, uint256[], bytes32[], bytes));
            dataHash = generateConfigChangeHash(updatedImplementation, abi.encodePacked(updatedSigners), updatedThreshold, updatedFallbackHandler, nonce);
            checkValidationData(dataHash, nonce, threshold, signerCount, signerIndeces, proofHashes, signatures);
        }
        
        implementation = updatedImplementation;
        fallbackHandler = updatedFallbackHandler;
        
        bytes32 signersHash = calculateSignersHash(updatedSigners);
        configHash = keccak256(abi.encodePacked(signersHash, updatedThreshold, nonce + 1));
        
        emit Configuration(updatedImplementation, updatedSigners, updatedThreshold, updatedFallbackHandler, nonce + 1);
    }
    
    function calculateSignersHash(address[] calldata updatedSigners) internal pure returns(bytes32) {
        // Calculate signers hash
        uint256 hashCount = updatedSigners.length;
        bytes32[] memory proofData = new bytes32[](updatedSigners.length);
        address lastSigner = address(0);
        for (uint i = 0; i < hashCount; i++) {
            address signer = updatedSigners[i];
            require(lastSigner < signer, "Signers need to be sorted case-insesitive ascending");
            proofData[i] = keccak256(abi.encode(signer));
        }
        while (hashCount > 1) {
            for (uint i = 0; i < hashCount; i+=2) {
                bytes32 left = proofData[i];
                bytes32 right = (i + 1 < hashCount) ? proofData[i + 1] : keccak256(abi.encodePacked(bytes32(0)));
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to cail the value
            // TODO SAFE MATH
            hashCount = (hashCount + 1) / 2;
        }
        return proofData[0];
    }
    
    fallback()
        external
        payable
    {
        if (msg.value > 0) {
            emit ReceivedEther(msg.sender, msg.value);
        }
        address handler = fallbackHandler;
        if (handler != address(0)) {
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                calldatacopy(0, 0, calldatasize())
                let success := call(gas(), handler, 0, 0, calldatasize(), 0, 0)
                returndatacopy(0, 0, returndatasize())
                if eq(success, 0) { revert(0, returndatasize()) }
                return(0, returndatasize())
            }
        }
    }
    
    receive()
        external
        payable
    {
        emit ReceivedEther(msg.sender, msg.value);
    }
    
    function execTransaction(
        // Tx information
        address to, 
        uint256 value, 
        bytes memory data, 
        uint8 operation, 
        uint256 gasLimit,
        uint256 nonce,
        // Validation information
        bytes memory validationData,
        bool revertOnFailure
    ) public payable returns(bool) {
        bytes32 newConfigHash;
        bytes32 dataHash;
        {
            dataHash = generateTxHash(to, value, data, operation, gasLimit, nonce);
            (
                uint256 threshold,  
                uint256 signerCount,
                uint256[] memory signerIndeces,
                bytes32[] memory proofHashes,
                bytes memory signatures
            ) = abi.decode(validationData, (uint256, uint256, uint256[], bytes32[], bytes));
            bytes32 signersHash = checkValidationData(dataHash, nonce, threshold, signerCount, signerIndeces, proofHashes, signatures);
            // TODO SAFE MATH
            newConfigHash = keccak256(abi.encodePacked(signersHash, threshold, nonce + 1));
        }
        // Store data for checking config consistency
        configHash = newConfigHash;
        address currentImplementation = implementation; // Always cheap as we read it to get here
        address currentFallbackHandler = fallbackHandler; // Probably always expensive as it is only read on fallback
        
        // If delegate call we add a check to avoid that the balance drops to 0, to protect against selfdestructs
        uint256 balance = (operation == 1) ? address(this).balance : 0;
        // TODO SAFE MATH
        require(gasleft() >= gasLimit * 64 / 63 + 3000, "Not enough gas to execute transaction");
        bool success = execute(to, value, data, operation, gasleft());
        
        // Perform balance-selfdestruc check
        require(balance == 0 || address(this).balance > 0, "It is not possible to transafer out all Ether with a delegate call");

        // Check that the transaction did not change the configuration
        require(configHash == newConfigHash, "Config hash should not change");
        require(implementation == currentImplementation , "Implementation should not change");
        require(fallbackHandler == currentFallbackHandler, "Fallback handler should not change");
        
        require(!revertOnFailure || success, "Transaction failed and revert on failure is set");

        if (success) emit ExecutionSuccess(nonce, dataHash);
        else emit ExecutionFailure(nonce, dataHash);
        
        return success;
    }
    
    function checkValidationData(
        bytes32 dataHash,
        uint256 nonce,
        uint256 threshold,
        uint256 signerCount,
        uint256[] memory signerIndeces,
        bytes32[] memory proofHashes,
        bytes memory signatures
    ) public view returns (bytes32) {
        uint256 recoveredSigner = 0;
        bytes32[] memory proofData = new bytes32[](signerCount);
        address prevSigner = address(0);
        for (uint i = 0; i < signerIndeces.length; i++) {
            address signer = recoverSigner(dataHash, signatures, i);
            require(signer > prevSigner, "signer > prevSigner");
            recoveredSigner++;
            uint256 signerIndex = signerIndeces[i];
            require(signerIndex < signerCount, "signerIndex < signerCount");
            proofData[signerIndex] = keccak256(abi.encode(signer));
        }
        require(recoveredSigner >= threshold, "recoveredSigner >= threshold");
        
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
                    left = proofHashes[proofIndex];
                    proofIndex++;
                }
                if (right == bytes32(0)) {
                    right = proofHashes[proofIndex];
                    proofIndex++;
                }
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to cail the value
            // TODO SAFE MATH
            hashCount = (hashCount + 1) / 2;
        }
        require(keccak256(abi.encodePacked(proofData[0], threshold, nonce)) == configHash, "Config hash is not the same");
        return proofData[0];
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public pure returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    function generateTxHash(
        address to, uint256 value, bytes memory data, uint8 operation, uint256 gasLimit, uint256 nonce
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 txHash = keccak256(
            abi.encode(TRANSACTION_TYPEHASH, to, value, data, operation, gasLimit, nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, txHash));
    }

    function generateConfigChangeHash(
        address _implementation, bytes memory signers, uint256 threshold, address _fallbackHandler, uint256 nonce
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 configChangeHash = keccak256(
            abi.encode(CONFIG_CHANGE_TYPEHASH, _implementation, signers, threshold, _fallbackHandler, nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, configChangeHash));
    }
    
    function execute(address to, uint256 value, bytes memory data, uint8 operation, uint256 txGas)
        override
        internal
        returns (bool success)
    {
        // TODO use solidity
        if (operation == 0)
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                success := call(txGas, to, value, add(data, 0x20), mload(data), 0, 0)
            }
        else if (operation == 1)
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                success := delegatecall(txGas, to, add(data, 0x20), mload(data), 0, 0)
            }
        else
            success = false;
    }
}