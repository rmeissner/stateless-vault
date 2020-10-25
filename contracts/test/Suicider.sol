// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract Suicider {
    fallback()
        external
        payable 
    {
        selfdestruct(address(0));
    }
}