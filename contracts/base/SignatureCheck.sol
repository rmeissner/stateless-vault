// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import './Interfaces.sol';

contract SignatureCheck {
    function recoverSigner(bytes32 dataHash, address signatureValidator, bytes memory signatures, uint256 pos) public view returns(address) {
        address signer;
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = signatureSplit(signatures, pos);
        // If v is 0 then it is a contract signature
        if (v == 0) {
            require(signatureValidator != address(0), "No signature validator set");
            
            // When handling contract signatures the address of the contract is encoded into r
            signer = address(uint256(r));

            // Check that signature data pointer (s) is in bounds (points to the length of data -> 32 bytes)
            require(uint256(s) + 32 <= signatures.length, "Invalid contract signature location: length not present");

            // Check if the contract signature is in bounds: start of data is s + 32 and end is start + signature length
            uint256 contractSignatureLen;
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                contractSignatureLen := mload(add(add(signatures, s), 0x20))
            }
            require(uint256(s) + 32 + contractSignatureLen <= signatures.length, "Invalid contract signature location: data not complete");

            // Check signature
            bytes memory contractSignature;
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                // The signature data for contract signatures is appended to the concatenated signatures and the offset is stored in s
                contractSignature := add(add(signatures, s), 0x20)
            }
            require(SignatureValidator(signatureValidator).validate(signer, contractSignature, dataHash), "Invalid contract signature provided");
        } else if (v == 1) {
            // When handling approved hashes the address of the approver is encoded into r
            signer = address(uint256(r));
            // Hashes are automatically approved by the sender of the message or when they have been pre-approved via a separate transaction
            require(msg.sender == signer);
        } else if (v > 30) {
            // To support eth_sign and similar we adjust v and hash the messageHash with the Ethereum message prefix before applying ecrecover
            signer = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash)), v - 4, r, s);
        } else {
            // Use ecrecover with the messageHash for EOA signatures
            signer = ecrecover(dataHash, v, r, s);
        }
        return signer;
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