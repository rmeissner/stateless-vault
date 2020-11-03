// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract Executor {
    function execute(address payable to, uint256 value, bytes memory data, uint8 operation, uint256 txGas)
        internal
        returns (bool success)
    {
        if (operation == 0)
            (success,) = to.call{value: value, gas: txGas}(data);
        else if (operation == 1)
            (success,) = to.delegatecall{gas: txGas}(data);
        else
            success = false;
    }
}