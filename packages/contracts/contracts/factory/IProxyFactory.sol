// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

interface ProxyFactory {
    function createProxyWithNonce(address implementation, bytes calldata initializer, uint256 saltNonce) external returns (address payable);
    function proxyCreationCode() external pure returns (bytes memory);
}