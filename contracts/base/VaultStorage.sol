// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract VaultStorage {
    address internal implementation;
    bytes32 public configHash;
    address public fallbackHandler;
}