// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./base/Executor.sol";
import './base/Interfaces.sol';
import "./base/VaultValidator.sol";
import "./base/StorageAccessible.sol";
import "./modules/ModuleManagerAddress.sol";

contract StatelessVault is 
    VaultValidator,  // Has state
    Executor,
    ModuleManagerAddress,
    StorageAccessible {
    
    using SafeMath for uint256;
    
    event Configuration(
        address implementation,
        address[] signers,
        uint256 threshold,
        address signatureChecker,
        address requestGuard,
        address fallbackHandler,
        uint256 currentNonce
    );

    event ConfigurationUpdate(
        uint indexed usedNonce, bytes32 indexed txHash
    );
    event ExecutionFailure(
        uint indexed usedNonce, bytes32 indexed txHash
    );
    event ExecutionSuccess(
        uint indexed usedNonce, bytes32 indexed txHash
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

    function internalValidateConfigChange(
        address updatedImplementation,
        address[] memory updatedSigners,
        uint256 updatedThreshold,
        address updatedSignatureValidator,
        address updatedRequestGuard,
        address updatedFallbackHandler,
        bytes memory hookBytes,
        uint256 nonce,
        bytes32 metaHash,
        // Validation information
        ValidationData memory validationData
    ) internal {
        bytes32 dataHash = generateConfigChangeHash(
            updatedImplementation, 
            abi.encodePacked(updatedSigners), 
            updatedThreshold, 
            updatedSignatureValidator,
            updatedRequestGuard,
            updatedFallbackHandler,
            hookBytes,
            nonce,
            metaHash
        );
        emit ConfigurationUpdate(nonce, dataHash);
        checkValidationData(dataHash, nonce, validationData);
    }

    function internalExecuteConfigChange(
        address updatedImplementation,
        address[] memory updatedSigners,
        uint256 updatedThreshold,
        address updatedSignatureValidator,
        address updatedRequestGuard,
        address updatedFallbackHandler,
        uint256 nonce
    ) internal returns (bytes32 updateConfigHash) {
        if (updatedImplementation != address(0)) {
            implementation = updatedImplementation;
        }
        fallbackHandler = updatedFallbackHandler;
        
        bytes32 signersHash = calculateSignersHash(updatedSigners);
        updateConfigHash = generateConfigHash(signersHash, updatedThreshold, updatedSignatureValidator, updatedRequestGuard, nonce + 1);
        configHash = updateConfigHash;
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
    
    function updateConfig(
        address updatedImplementation,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedSignatureValidator,
        address updatedRequestGuard,
        address updatedFallbackHandler,
        bytes calldata hookBytes,
        uint256 nonce,
        bytes32 metaHash,
        // Validation information
        bytes calldata validationBytes
    ) external {
        require(updatedThreshold <= updatedSigners.length, "Threshold cannot be higher than amount of signers");
        {
            ValidationData memory validationData = decodeValidationData(validationBytes);
            internalValidateConfigChange(
                updatedImplementation, updatedSigners, updatedThreshold, updatedSignatureValidator,
                updatedRequestGuard, updatedFallbackHandler, hookBytes, nonce, metaHash, validationData
            );
            if (validationData.requestGuard != address(0)) {
                require(RequestGuard(validationData.requestGuard).checkConfig(
                    updatedImplementation, updatedSigners, updatedThreshold, updatedSignatureValidator,
                    updatedRequestGuard, updatedFallbackHandler, hookBytes, nonce, 
                    validationBytes
                ));
            }
        }
        
        internalExecuteConfigChange(
            updatedImplementation, updatedSigners, updatedThreshold, updatedSignatureValidator,
            updatedRequestGuard, updatedFallbackHandler, nonce
        );
        
        if (hookBytes.length == 0) return;
        postConfigUpdateHook(hookBytes);
    }

    function postConfigUpdateHook(
        bytes calldata hookBytes
    ) internal {
        (
            address payable hookTo,
            uint256 hookValue,
            bytes memory hookData,
            uint8 hookOperation
        ) = abi.decode(hookBytes, (address, uint256, bytes, uint8));

        require(checkedExecute(
            hookTo, hookValue, hookData, hookOperation, 0,
            true, configHash, implementation, fallbackHandler
        ), "Post config update hook failed");
    }

    function internalValidateTx(
        // Tx information
        address to, 
        uint256 value, 
        bytes calldata data, 
        uint8 operation, 
        uint256 minAvailableGas,
        uint256 nonce,
        bytes32 metaHash,
        bytes calldata validationBytes
    ) internal view returns (bytes32 configHash, bytes32 txHash) {
        txHash = generateTxHash(to, value, data, operation, minAvailableGas, nonce, metaHash);
        ValidationData memory validationData = decodeValidationData(validationBytes);
        (bytes32 signersHash,) = checkValidationData(txHash, nonce, validationData);
        configHash = generateConfigHash(
            signersHash, 
            validationData.threshold, 
            validationData.signatureValidator, 
            validationData.requestGuard, 
            nonce.add(1)
        );
        if (validationData.requestGuard != address(0)) {
            require(RequestGuard(validationData.requestGuard).checkTx(
                to, value, data, operation, minAvailableGas, nonce, 
                validationBytes
            ));
        }
    }

    function internalExecTx(
        bytes32 newConfigHash,
        address payable to, 
        uint256 value, 
        bytes memory data, 
        uint8 operation, 
        uint256 minAvailableGas,
        bool revertOnFailure
    ) internal returns (bool success) {
        // Store data for checking config consistency
        configHash = newConfigHash;
        
        success = checkedExecute(
            to, value, data, operation, minAvailableGas,
            true, newConfigHash, implementation, fallbackHandler
        );
        
        require(!revertOnFailure || success, "Transaction failed and revert on failure is set");
    }

    function execTransaction(
        // Tx information
        address payable to, 
        uint256 value, 
        bytes calldata data, 
        uint8 operation, 
        uint256 minAvailableGas,
        uint256 nonce,
        bytes32 metaHash,
        // Validation information
        bytes calldata validationBytes,
        bool revertOnFailure
    ) external payable returns(bool success) {
        (
            bytes32 newConfigHash, 
            bytes32 txHash
        ) = internalValidateTx(
            to, value, data, operation, minAvailableGas, nonce, metaHash, validationBytes
        );
        
        success = internalExecTx(
            newConfigHash, to, value, data, operation, minAvailableGas, revertOnFailure
        );
        
        if (success) emit ExecutionSuccess(nonce, txHash);
        else emit ExecutionFailure(nonce, txHash);
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
    function execTransactionFromModule(address payable to, uint256 value, bytes memory data, uint8 operation)
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
        
        success = checkedExecute(
            to, value, data, operation, 0, 
            !empowered, currentConfigHash, currentImplementation, currentFallbackHandler
        );

        if (success) emit ExecutionFromModuleSuccess(msg.sender);
        else emit ExecutionFromModuleFailure(msg.sender);
    }

    /// @dev Allows a Module to execute a transaction without any further confirmations and return data
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModuleReturnData(address payable to, uint256 value, bytes memory data, uint8 operation)
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
     * Execute logic
     */ 

    function checkedExecute(
        address payable to, 
        uint256 value, 
        bytes memory data, 
        uint8 operation, 
        uint256 minAvailableGas,
        bool check,
        bytes32 expectedConfigHash,
        address expectedImplementation,
        address expectedFallbackHandler
    ) internal returns (bool success) {
        
        // If delegate call we add a check to avoid that the balance drops to 0, to protect against selfdestructs
        uint256 balance = (operation != 0) ? address(this).balance : 0;

        require(gasleft() >= minAvailableGas.mul(64).div(63).add(3000), "Not enough gas to execute transaction");
        success = execute(to, value, data, operation, gasleft());
        
        // Perform balance-selfdestruc check
        require(balance == 0 || address(this).balance > 0, "It is not possible to transfer out all Ether with a delegate call");

        // Check that the transaction did not change the configuration if not empowered
        if (check || operation != 0) {
            require(configHash == expectedConfigHash, "Config hash should not change");
            require(implementation == expectedImplementation, "Implementation should not change");
            require(fallbackHandler == expectedFallbackHandler, "Fallback handler should not change");
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