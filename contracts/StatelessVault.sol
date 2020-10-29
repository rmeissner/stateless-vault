// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "./base/VaultStorage.sol";
import "./base/SignatureCheck.sol";
import "./base/StorageAccessible.sol";
import "./modules/ModuleManagerAddress.sol";

contract StatelessVault is VaultStorage, ModuleManagerAddress, SignatureCheck, StorageAccessible {
    
    event Configuration(
        address implementation,
        address[] signers,
        uint256 threshold,
        address signatureChecker,
        address requestGuard,
        address fallbackHandler,
        uint256 currentNonce
    );

    event ExecutionFailure(
        uint usedNonce, bytes32 txHash
    );
    event ExecutionSuccess(
        uint usedNonce, bytes32 txHash
    );

    event ExecutionFromModuleSuccess(
        address indexed module
    );
    event ExecutionFromModuleFailure(
        address indexed module
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
        "ConfigChange(uint256 implementation,bytes signers, uint256 threshold,address signatureValidator,address requestGuard,address fallbackHandler)"
    );

    struct ValidationData {
        uint256 threshold;
        uint256 signerCount;
        address signatureValidator;
        address requestGuard;
        uint256[] signerIndeces;
        bytes32[] proofHashes;
        bytes signatures;
    }

    address immutable public defaultStateReader;
    
    constructor(address stateReader) {
        configHash = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        defaultStateReader = stateReader;
    }
    
    function setup(
        address[] calldata signers,
        uint256 threshold,
        address signatureValidator,
        address requestGuard,
        address _fallbackHandler
    ) public {
        require(configHash == bytes32(0), "Contract already initialised");
        require(threshold <= signers.length, "Threshold cannot be higher than amount of signers");
        fallbackHandler = _fallbackHandler;
    
        bytes32 signersHash = calculateSignersHash(signers);
        configHash = generateConfigHash(signersHash, threshold, signatureValidator, requestGuard, uint256(0));
        
        emit Configuration(implementation, signers, threshold, signatureValidator, requestGuard, _fallbackHandler, 0);
    }
    
    function updateConfig(
        address updatedImplementation,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedSignatureValidator,
        address updatedRequestGuard,
        address updatedFallbackHandler,
        uint256 nonce,
        // Validation information
        bytes memory validationBytes
    ) public {
        require(updatedThreshold <= updatedSigners.length, "Threshold cannot be higher than amount of signers");
        bytes32 dataHash;
        {
            dataHash = generateConfigChangeHash(
                updatedImplementation, 
                abi.encodePacked(updatedSigners), 
                updatedThreshold, 
                updatedSignatureValidator,
                updatedRequestGuard,
                updatedFallbackHandler, 
                nonce
            );
            ValidationData memory validationData = decodeValidationData(validationBytes);
            checkValidationData(dataHash, nonce, validationData);
        }
        
        implementation = updatedImplementation;
        fallbackHandler = updatedFallbackHandler;
        
        bytes32 signersHash = calculateSignersHash(updatedSigners);
        configHash = generateConfigHash(signersHash, updatedThreshold, updatedSignatureValidator, updatedRequestGuard, nonce + 1);
        
        emit Configuration(
            updatedImplementation, 
            updatedSigners, 
            updatedThreshold, 
            updatedSignatureValidator, 
            updatedRequestGuard, 
            updatedFallbackHandler, 
            nonce + 1
        );
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
        bytes memory validationBytes,
        bool revertOnFailure
    ) public payable returns(bool) {
        bytes32 newConfigHash;
        bytes32 dataHash;
        {
            dataHash = generateTxHash(to, value, data, operation, gasLimit, nonce);
            ValidationData memory validationData = decodeValidationData(validationBytes);
            bytes32 signersHash = checkValidationData(dataHash, nonce, validationData);
            // TODO SAFE MATH
            newConfigHash = generateConfigHash(
                signersHash, 
                validationData.threshold, 
                validationData.signatureValidator, 
                validationData.requestGuard, 
                nonce + 1
            );
            // TODO call request guard
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
        require(balance == 0 || address(this).balance > 0, "It is not possible to transfer out all Ether with a delegate call");

        // Check that the transaction did not change the configuration
        require(configHash == newConfigHash, "Config hash should not change");
        require(implementation == currentImplementation , "Implementation should not change");
        require(fallbackHandler == currentFallbackHandler, "Fallback handler should not change");
        
        require(!revertOnFailure || success, "Transaction failed and revert on failure is set");

        if (success) emit ExecutionSuccess(nonce, dataHash);
        else emit ExecutionFailure(nonce, dataHash);
        
        return success;
    }
    
    function execute(address to, uint256 value, bytes memory data, uint8 operation, uint256 txGas)
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

    function checkValidationData(
        bytes32 dataHash,
        uint256 nonce,
        ValidationData memory validationData
    ) public view returns (bytes32) {
        uint256 recoveredSigner = 0;
        bytes32[] memory proofData = new bytes32[](validationData.signerCount);
        address prevSigner = address(0);
        for (uint i = 0; i < validationData.signerIndeces.length; i++) {
            address signer = recoverSigner(dataHash, validationData.signatureValidator, validationData.signatures, i);
            require(signer > prevSigner, "signer > prevSigner");
            recoveredSigner++;
            uint256 signerIndex = validationData.signerIndeces[i];
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
            // +1 to cail the value
            // TODO SAFE MATH
            hashCount = (hashCount + 1) / 2;
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
    
    /*
     * Getters and generators
     */
    
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

    function decodeValidationData(bytes memory validationBytes) public pure returns (ValidationData memory validationData) {
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

    /// @dev Returns the chain id used by this contract.
    function getChainId() public pure returns (uint256) {
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
        address _implementation, 
        bytes memory signers, 
        uint256 threshold, 
        address signatureValidator, 
        address requestGuard, 
        address _fallbackHandler, 
        uint256 nonce
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 configChangeHash = keccak256(
            abi.encode(CONFIG_CHANGE_TYPEHASH, _implementation, signers, threshold, signatureValidator, requestGuard, _fallbackHandler, nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, configChangeHash));
    }

    /*
     * Modules logic
     */

    function deployModuleManager(CodeProvider codeProvider) public {
        address expectedAddress = moduleManagerAddress();
        bytes32 salt = MODULE_MANAGER_SALT;
        address moduleManager;
        bytes memory deploymentData = codeProvider.deploymentData();
         // solium-disable-next-line security/no-inline-assembly
        assembly {
            moduleManager := create2(0, add(0x20, deploymentData), mload(deploymentData), salt)
        }
        require(moduleManager == expectedAddress, "Could not deploy contract");
    }

    /// @dev Allows a Module to execute a transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes memory data, uint8 operation)
        public
        returns (bool success)
    {
        address moduleManager = moduleManagerAddress();
        // Only whitelisted modules are allowed.
        (bool enabled, bool empowered) = ModuleManager(moduleManager).getStatus(msg.sender);
        require(enabled, "Method can only be called from an enabled module");
         // Store data for checking config consistency if not empowered
        bytes32 currentConfigHash;
        address currentImplementation;
        address currentFallbackHandler;
         // Store data for checking config consistency if not empowered
        if (!empowered) {
            currentConfigHash = configHash; // Probably always expensive as it is not used here
            currentImplementation = implementation; // Always cheap as we read it to get here
            currentFallbackHandler = fallbackHandler; // Probably always expensive as it is only read on fallback
        }
        
        // If delegate call we add a check to avoid that the balance drops to 0, to protect against selfdestructs
        uint256 balance = (operation == 1) ? address(this).balance : 0;

        // Execute transaction without further confirmations.
        success = execute(to, value, data, operation, gasleft());
        
        // Perform balance-selfdestruc check
        require(balance == 0 || address(this).balance > 0, "It is not possible to transfer out all Ether with a delegate call");

        // Check that the transaction did not change the configuration if not empowered
        if (!empowered) {
            require(configHash == currentConfigHash, "Config hash should not change");
            require(implementation == currentImplementation , "Implementation should not change");
            require(fallbackHandler == currentFallbackHandler, "Fallback handler should not change");
        }

        if (success) emit ExecutionFromModuleSuccess(msg.sender);
        else emit ExecutionFromModuleFailure(msg.sender);
    }

    /// @dev Allows a Module to execute a transaction without any further confirmations and return data
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModuleReturnData(address to, uint256 value, bytes memory data, uint8 operation)
        public
        returns (bool success, bytes memory returnData)
    {
        success = execTransactionFromModule(to, value, data, operation);
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            // Load free memory location
            let ptr := mload(0x40)
            // We allocate memory for the return data by setting the free memory location to
            // current free memory location + data size + 32 bytes for data size value
            mstore(0x40, add(ptr, add(returndatasize(), 0x20)))
            // Store the size
            mstore(ptr, returndatasize())
            // Store the data
            returndatacopy(add(ptr, 0x20), 0, returndatasize())
            // Point the return data to the correct memory location
            returnData := ptr
        }
    }

    /*
     * Fallback logic
     */
    
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
}