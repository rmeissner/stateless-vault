// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

/// @title StorageAccessible - generic base contract that allows callers to access all internal storage.
// Based on https://github.com/gnosis/util-contracts/blob/9a515141ae07f2391ee0e35f1e402cf0e6bbf8fc/contracts/StorageAccessible.sol
contract StorageAccessible {
    bytes4 internal constant SIMULATE_DELEGATECALL_INTERNAL_SELECTOR = bytes4(
        keccak256("simulateDelegatecallInternal(address,bytes)")
    );

    function handleInternalResponse(bytes memory response) internal pure returns (bytes memory) {
        bool innerSuccess = response[response.length - 1] == 0x01;
        setLength(response, response.length - 1);
        if (innerSuccess) {
            return response;
        } else {
            revertWith(response);
        }
    }

    /**
     * @dev Performs a delegetecall on a targetContract in the context of self.
     * Internally reverts execution to avoid side effects (making it static). Catches revert and returns encoded result as bytes.
     * @param targetContract Address of the contract containing the code to execute.
     * @param calldataPayload Calldata that should be sent to the target contract (encoded method name and arguments).
     */
    function simulateDelegatecall(
        address targetContract,
        bytes memory calldataPayload
    ) public returns (bytes memory) {
        bytes memory innerCall = abi.encodeWithSelector(
            SIMULATE_DELEGATECALL_INTERNAL_SELECTOR,
            targetContract,
            calldataPayload
        );
        (, bytes memory response) = address(this).call(innerCall);
        return handleInternalResponse(response);
    }

    /**
     * @dev Same as simulateDelegatecall but with view modifier (only uses static context)
     * @param targetContract Address of the contract containing the code to execute.
     * @param calldataPayload Calldata that should be sent to the target contract (encoded method name and arguments).
     */
    function simulateStaticDelegatecall(
        address targetContract,
        bytes memory calldataPayload
    ) public view returns (bytes memory) {
        bytes memory innerCall = abi.encodeWithSelector(
            SIMULATE_DELEGATECALL_INTERNAL_SELECTOR,
            targetContract,
            calldataPayload
        );
        (, bytes memory response) = address(this).staticcall(innerCall);
        return handleInternalResponse(response);
    }

    /**
     * @dev Performs a delegetecall on a targetContract in the context of self.
     * Internally reverts execution to avoid side effects (making it static). Returns encoded result as revert message
     * concatenated with the success flag of the inner call as a last byte.
     * @param targetContract Address of the contract containing the code to execute.
     * @param calldataPayload Calldata that should be sent to the target contract (encoded method name and arguments).
     */
    function simulateDelegatecallInternal(
        address targetContract,
        bytes memory calldataPayload
    ) public returns (bytes memory) {
        (bool success, bytes memory response) = targetContract.delegatecall(
            calldataPayload
        );
        revertWith(abi.encodePacked(response, success));
    }

    function revertWith(bytes memory response) internal pure {
        assembly {
            revert(add(response, 0x20), mload(response))
        }
    }

    function setLength(bytes memory buffer, uint256 length) internal pure {
        assembly {
            mstore(buffer, length)
        }
    }
}