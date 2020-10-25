// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract SignatureCheck {
    function recoverSigner(bytes32 dataHash, bytes memory signatures, uint256 pos) public view returns(address) {
        address signers;
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = signatureSplit(signatures, pos);
        // If v is 0 then it is a contract signature
        if (v == 0) {
            // TODO
            require(false, "Not implemented");
        } else if (v == 1) {
            // When handling approved hashes the address of the approver is encoded into r
            signers = address(uint256(r));
            // Hashes are automatically approved by the sender of the message or when they have been pre-approved via a separate transaction
            require(msg.sender == signers);
        } else if (v > 30) {
            // To support eth_sign and similar we adjust v and hash the messageHash with the Ethereum message prefix before applying ecrecover
            signers = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash)), v - 4, r, s);
        } else {
            // Use ecrecover with the messageHash for EOA signatures
            signers = ecrecover(dataHash, v, r, s);
        }
        return signers;
    }
    
    function signatureSplit(bytes memory signatures, uint256 pos)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            let signaturePos := mul(0x41, pos)
            r := mload(add(signatures, add(signaturePos, 0x20)))
            s := mload(add(signatures, add(signaturePos, 0x40)))
            // Here we are loading the last 32 bytes, including 31 bytes
            // of 's'. There is no 'mload8' to do this.
            //
            // 'byte' is not working due to the Solidity parser, so lets
            // use the second best option, 'and'
            v := and(mload(add(signatures, add(signaturePos, 0x41))), 0xff)
        }
    }
}