// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract Executor {
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
}