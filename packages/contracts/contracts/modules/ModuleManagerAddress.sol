// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "./ModuleManager.sol";
import "./CodeProvider.sol";

contract ModuleManagerAddress {
    
    bytes32 immutable moduleManagerCodeHash;
    
    constructor() {
        moduleManagerCodeHash = keccak256(type(ModuleManager).creationCode);
    }

    bytes32 constant MODULE_MANAGER_SALT = keccak256("stateless_vault_module_manager_v1");
    
    function moduleManagerAddress() internal view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(byte(0xff), this, MODULE_MANAGER_SALT, moduleManagerCodeHash))));
    }
}