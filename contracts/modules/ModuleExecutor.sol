// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "./AddressManager.sol";
import "./CodeProvider.sol";

abstract contract ModuleExecutor {
    
    bytes32 immutable fallbackManagerCodeHash;

    function execute(address to, uint256 value, bytes memory data, uint8 operation, uint256 txGas) virtual internal returns (bool);
    
    constructor() {
        fallbackManagerCodeHash = keccak256(type(AddressManager).creationCode);
    }
    
    event ExecutionFromModuleSuccess(
        address indexed module
    );
    event ExecutionFromModuleFailure(
        address indexed module
    );
    
    bytes32 constant MODULE_MANAGER_SALT = keccak256("stateless_vault_module_manager_v1");
    
    function moduleManagerAddress() public view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(byte(0xff), this, MODULE_MANAGER_SALT, fallbackManagerCodeHash))));
    }
    
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
        require(AddressManager(moduleManager).isMember(msg.sender), "Method can only be called from an enabled module");
        // Execute transaction without further confirmations.
        success = execute(to, value, data, operation, gasleft());
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
}