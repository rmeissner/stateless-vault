// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract VaultStorage {
    address internal implementation;
    bytes32 internal configHash;
    address internal fallbackHandler;
}

import "./StorageAccessible.sol";
import "../modules/ModuleExecutor.sol";
contract VaultStorageReader is VaultStorage, ModuleExecutorAddress {
    function readImplementation() public view returns (address) {
        return implementation;
    }

    function getImplementation(StorageAccessible target) public view returns (address) {
        address result = abi.decode(
            target.simulateStaticDelegatecall(
                address(this),
                abi.encodeWithSelector(this.readImplementation.selector)
            ), (address));
        return result;
    }

    function readConfigHash() public view returns (bytes32) {
        return configHash;
    }

    function getConfigHash(StorageAccessible target) public view returns (bytes32) {
        bytes32 result = abi.decode(
            target.simulateStaticDelegatecall(
                address(this),
                abi.encodeWithSelector(this.readConfigHash.selector)
            ), (bytes32));
        return result;
    }

    function readFallbackHandler() public view returns (address) {
        return fallbackHandler;
    }

    function getFallbackHandler(StorageAccessible target) public view returns (address) {
        address result = abi.decode(
            target.simulateStaticDelegatecall(
                address(this),
                abi.encodeWithSelector(this.readFallbackHandler.selector)
            ), (address));
        return result;
    }

    function readModules() public view returns (address[] memory) {
        return AddressManager(moduleManagerAddress()).getMembers();
    }

    function getModules(StorageAccessible target) public view returns (address[] memory) {
        address[] memory result = abi.decode(
            target.simulateStaticDelegatecall(
                address(this),
                abi.encodeWithSelector(this.readModules.selector)
            ), (address[]));
        return result;
    }

    function checkModuleEnabled(address module) public view returns (bool) {
        return AddressManager(moduleManagerAddress()).isMember(module);
    }

    function isModuleEnabled(StorageAccessible target, address module) public view returns (bool) {
        bool result = abi.decode(
            target.simulateStaticDelegatecall(
                address(this),
                abi.encodeWithSelector(this.checkModuleEnabled.selector, module)
            ), (bool));
        return result;
    }
}