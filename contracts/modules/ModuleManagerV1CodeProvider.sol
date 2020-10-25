// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "./AddressManager.sol";
import "./CodeProvider.sol";

contract ModuleManagerV1CodeProvider is CodeProvider {
    function deploymentData() override external pure returns (bytes memory) {
        return type(AddressManager).creationCode;
    }
}