// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

contract AddressManager {
    
    event AddMember(address indexed owner, address member);
    event RemoveMember(address indexed owner, address member);
    
    address public immutable owner;
    
    address internal constant SENTINEL_MEMBER = address(0x1);

    mapping (address => address) internal members;
    
    constructor() {
        owner = msg.sender;
        members[SENTINEL_MEMBER] = SENTINEL_MEMBER;
    }
    
    function isMember(address member) public view returns(bool) {
        return SENTINEL_MEMBER != member && members[member] != address(0);
    }

    /// @dev Allows to add a member
    /// @notice Adds the member `member`.
    /// @param member Address that should be added.
    function addMember(address member)
        public
    {
        require(msg.sender == owner, "This can only be done by the owner");
        // Member address cannot be null or sentinel.
        require(member != address(0) && member != SENTINEL_MEMBER, "Invalid member address provided");
        require(members[member] == address(0), "Member has already been added");
        members[member] = members[SENTINEL_MEMBER];
        members[SENTINEL_MEMBER] = member;
        emit AddMember(owner, member);
    }

    /// @dev Allows to remove a member
    /// @notice Removes the member `member`.
    /// @param prevMember An address that points to the address to be removed in the linked list
    /// @param member Address that should be removed.
    function removeMember(address prevMember, address member)
        public
    {
        require(msg.sender == owner, "This can only be done by the owner");
        // Validate module address and check that it corresponds to module index.
        require(member != address(0) && member != SENTINEL_MEMBER, "Invalid member address provided");
        require(members[prevMember] == member, "Invalid prevMember, member pair provided");
        members[prevMember] = members[member];
        members[member] = address(0);
        emit RemoveMember(owner, member);
    }

    /// @dev Returns array of first 10 modules.
    /// @return Array of members.
    function getMembers()
        public
        view
        returns (address[] memory)
    {
        (address[] memory array,) = getMembersPaginated(SENTINEL_MEMBER, 10);
        return array;
    }

    /// @dev Returns array, next: members and pagination parameter.
    /// @param start Start of the page.
    /// @param pageSize Maximum number of members that should be returned.
    function getMembersPaginated(address start, uint256 pageSize)
        public
        view
        returns (address[] memory array, address next)
    {
        // Init array with max page size
        array = new address[](pageSize);

        // Populate return array
        uint256 memberCount = 0;
        address currentMember = members[start];
        while(currentMember != address(0x0) && currentMember != SENTINEL_MEMBER && memberCount < pageSize) {
            array[memberCount] = currentMember;
            currentMember = members[currentMember];
            memberCount++;
        }
        next = currentMember;
        // Set correct size of returned array
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            mstore(array, memberCount)
        }
    }
}

interface CodeProvider {
    function deploymentData() external pure returns (bytes memory);
}

contract ModuleManagerV1CodeProvider is CodeProvider {
    function deploymentData() override external pure returns (bytes memory) {
        return type(AddressManager).creationCode;
    }
}

contract StatelessVault {
    
    event Configuration(
        address implementation,
        address[] signers,
        uint256 threshold,
        address fallbackHandler
    );
    event ExecutionFailure(
        bytes32 txHash, uint nonce
    );
    event ExecutionSuccess(
        bytes32 txHash, uint nonce
    );
    
    event ExecutionFromModuleSuccess(
        address indexed module
    );
    event ExecutionFromModuleFailure(
        address indexed module
    );
    event ReceivedEther(
        address indexed sender, 
        uint amount
    );
    
    address internal implementation;
    bytes32 public configHash;
    address public fallbackHandler;
    
    bytes32 constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(uint256 chainId,address verifyingContract)"
    );

    bytes32 constant TRANSACTION_TYPEHASH = keccak256(
        "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 gasLimit,uint256 nonce)"
    );

    // Owners are packed encoded (to avoid issues with EIP712)
    bytes32 constant CONFIG_CHANGE_TYPEHASH = keccak256(
        "ConfigChange(uint256 implementation,bytes signers, uint256 threshold,address fallbackHandler)"
    );
    
    bytes32 constant FALLBACK_HANDLER_SALT = keccak256("stateless_vault_module_manager_v1");
    
    bytes32 immutable fallbackManagerCodeHash;
    
    constructor() {
        fallbackManagerCodeHash = keccak256(type(AddressManager).creationCode);
        // Set invalid hash to avoid that the mastercopy is used
        configHash = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    }
    
    function setup(
        address[] calldata signers,
        uint256 threshold,
        address _fallbackHandler
    ) public {
        require(configHash == bytes32(0), "Contract already initialised");
        require(threshold <= signers.length, "Threshold cannot be higher than amount of signers");
        fallbackHandler = _fallbackHandler;
    
        bytes32 signersHash = calculateSignersHash(signers);
        configHash = keccak256(abi.encodePacked(signersHash, threshold, uint256(0)));
        
        emit Configuration(implementation, signers, threshold, _fallbackHandler);
    }
    
    function deployModuleManager(bytes memory deploymentData) public {
        address expectedAddress = moduleManagerAddress();
        bytes32 salt = FALLBACK_HANDLER_SALT;
        address moduleManager;
         // solium-disable-next-line security/no-inline-assembly
        assembly {
            moduleManager := create2(0, add(0x20, deploymentData), mload(deploymentData), salt)
        }
        require(moduleManager == expectedAddress, "Could not deploy contract");
    }
    
    function deployModuleManager(CodeProvider codeProvider) public {
        address expectedAddress = moduleManagerAddress();
        bytes32 salt = FALLBACK_HANDLER_SALT;
        address moduleManager;
        bytes memory deploymentData = codeProvider.deploymentData();
         // solium-disable-next-line security/no-inline-assembly
        assembly {
            moduleManager := create2(0, add(0x20, deploymentData), mload(deploymentData), salt)
        }
        require(moduleManager == expectedAddress, "Could not deploy contract");
    }
    
    function updateConfig(
        address updatedImplementation,
        address[] calldata updatedSigners,
        uint256 updatedThreshold,
        address updatedFallbackHandler,
        uint256 nonce,
        // Validation information
        bytes memory validationData
    ) public {
        require(updatedThreshold <= updatedSigners.length, "Threshold cannot be higher than amount of signers");
        bytes32 dataHash;
        {
            (
                uint256 threshold,  
                uint256 signerCount,
                uint256[] memory signerIndeces,
                bytes32[] memory proofHashes,
                bytes memory signatures
            ) = abi.decode(validationData, (uint256, uint256, uint256[], bytes32[], bytes));
            dataHash = generateConfigChangeHash(updatedImplementation, abi.encodePacked(updatedSigners), updatedThreshold, updatedFallbackHandler, nonce);
            checkValidationData(dataHash, nonce, threshold, signerCount, signerIndeces, proofHashes, signatures);
        }
        
        implementation = updatedImplementation;
        fallbackHandler = updatedFallbackHandler;
        
        bytes32 signersHash = calculateSignersHash(updatedSigners);
        configHash = keccak256(abi.encodePacked(signersHash, updatedThreshold, nonce + 1));
        
        emit Configuration(updatedImplementation, updatedSigners, updatedThreshold, updatedFallbackHandler);
    }
    
    function calculateSignersHash(address[] calldata updatedSigners) internal pure returns(bytes32) {
        // Calculate signers hash
        uint256 hashCount = updatedSigners.length;
        bytes32[] memory proofData = new bytes32[](updatedSigners.length);
        address lastSigner = address(0);
        for (uint i = 0; i < hashCount; i++) {
            address signer = updatedSigners[i];
            require(lastSigner < signer, "Signers need to be sorted case-insesitive ascending");
            proofData[i] = keccak256(abi.encode(signer));
        }
        while (hashCount > 1) {
            for (uint i = 0; i < hashCount; i+=2) {
                bytes32 left = proofData[i];
                bytes32 right = (i + 1 < hashCount) ? proofData[i + 1] : keccak256(abi.encodePacked(bytes32(0)));
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to cail the value
            hashCount = (hashCount + 1) / 2;
        }
        return proofData[0];
    }
    
    fallback()
        external
        payable
    {
        if (msg.value > 0) {
            emit ReceivedEther(msg.sender, msg.value);
        }
        address handler = fallbackHandler;
        if (handler != address(0)) {
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                calldatacopy(0, 0, calldatasize())
                let success := call(gas(), handler, 0, 0, calldatasize(), 0, 0)
                returndatacopy(0, 0, returndatasize())
                if eq(success, 0) { revert(0, returndatasize()) }
                return(0, returndatasize())
            }
        }
    }
    
    receive()
        external
        payable
    {
        emit ReceivedEther(msg.sender, msg.value);
    }
    
    function execTransaction(
        // Tx information
        address to, 
        uint256 value, 
        bytes memory data, 
        uint8 operation, 
        uint256 gasLimit,
        uint256 nonce,
        // Validation information
        bytes memory validationData,
        bool revertOnFailure
    ) public payable returns(bool) {
        bytes32 newConfigHash;
        bytes32 dataHash;
        {
            dataHash = generateTxHash(to, value, data, operation, gasLimit, nonce);
            (
                uint256 threshold,  
                uint256 signerCount,
                uint256[] memory signerIndeces,
                bytes32[] memory proofHashes,
                bytes memory signatures
            ) = abi.decode(validationData, (uint256, uint256, uint256[], bytes32[], bytes));
            bytes32 signersHash = checkValidationData(dataHash, nonce, threshold, signerCount, signerIndeces, proofHashes, signatures);
            newConfigHash = keccak256(abi.encodePacked(signersHash, threshold, nonce + 1));
        }
        // Store data for checking config consistency
        configHash = newConfigHash;
        address currentImplementation = implementation; // Always cheap as we read it to get here
        address currentFallbackHandler = fallbackHandler; // Probably always expensive as it is only read on fallback
        
        require(gasleft() >= gasLimit * 64 / 63 + 3000, "Not enough gas to execute transaction");
        bool success = execute(to, value, data, operation, gasleft());
        
        // Check that the transaction did not change the configuration
        require(configHash == newConfigHash, "Config hash should not change");
        require(implementation == currentImplementation , "Implementation should not change");
        require(fallbackHandler == currentFallbackHandler, "Fallback handler should not change");
        
        require(!revertOnFailure || success, "Transaction failed and revert on failure is set");

        if (success) emit ExecutionSuccess(dataHash, nonce);
        else emit ExecutionFailure(dataHash, nonce);
        
        return success;
    }
    
    function execute(address to, uint256 value, bytes memory data, uint8 operation, uint256 txGas)
        internal
        returns (bool success)
    {
        if (operation == 0)
            success = executeCall(to, value, data, txGas);
        else if (operation == 1)
            success = executeDelegateCall(to, data, txGas);
        else
            success = false;
    }

    function executeCall(address to, uint256 value, bytes memory data, uint256 txGas)
        internal
        returns (bool success)
    {
        // TODO use solidity
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := call(txGas, to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    function executeDelegateCall(address to, bytes memory data, uint256 txGas)
        internal
        returns (bool success)
    {
        // TODO use solidity
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := delegatecall(txGas, to, add(data, 0x20), mload(data), 0, 0)
        }
    }
    
    function checkValidationData(
        bytes32 dataHash,
        uint256 nonce,
        uint256 threshold,
        uint256 signerCount,
        uint256[] memory signerIndeces,
        bytes32[] memory proofHashes,
        bytes memory signatures
    ) public view returns (bytes32) {
        uint256 recoveredSigner = 0;
        bytes32[] memory proofData = new bytes32[](signerCount);
        address prevSigner = address(0);
        for (uint i = 0; i < signerIndeces.length; i++) {
            address signer = recoverSigner(dataHash, signatures, i);
            require(signer > prevSigner, "signer > prevSigner");
            recoveredSigner++;
            uint256 signerIndex = signerIndeces[i];
            require(signerIndex < signerCount);
            proofData[signerIndex] = keccak256(abi.encode(signer));
        }
        require(recoveredSigner >= threshold, "recoveredSigner >= threshold");
        
        uint256 proofIndex = 0;
        uint256 hashCount = proofData.length;
        while (hashCount > 1) {
            for (uint i = 0; i < hashCount; i+=2) {
                bytes32 left = proofData[i];
                bytes32 right = (i + 1 < hashCount) ? proofData[i + 1] : bytes32(0);
                if (left == bytes32(0) && right == bytes32(0)) {
                    proofData[i/2] = bytes32(0);
                    continue;
                }
                if (left == bytes32(0)) {
                    left = proofHashes[proofIndex];
                    proofIndex++;
                }
                if (right == bytes32(0)) {
                    right = proofHashes[proofIndex];
                    proofIndex++;
                }
                proofData[i/2] = keccak256(abi.encodePacked(left, right));
            }
            // +1 to cail the value
            hashCount = (hashCount + 1) / 2;
        }
        require(keccak256(abi.encodePacked(proofData[0], threshold, nonce)) == configHash);
        return proofData[0];
    }
    
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

    /// @dev Returns the chain id used by this contract.
    function getChainId() public pure returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    function generateTxHash(
        address to, uint256 value, bytes memory data, uint8 operation, uint256 gasLimit, uint256 nonce
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 txHash = keccak256(
            abi.encode(TRANSACTION_TYPEHASH, to, value, data, operation, gasLimit, nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, txHash));
    }

    function generateConfigChangeHash(
        address _implementation, bytes memory signers, uint256 threshold, address _fallbackHandler, uint256 nonce
    ) private view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this));
        bytes32 configChangeHash = keccak256(
            abi.encode(CONFIG_CHANGE_TYPEHASH, _implementation, signers, threshold, _fallbackHandler, nonce)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, configChangeHash));
    }
    
    function moduleManagerAddress() public view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(byte(0xff), this, FALLBACK_HANDLER_SALT, fallbackManagerCodeHash))));
    }

    /// @dev Allows a Module to execute a transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes memory data, uint8 operation)
        public
        returns (bool success)
    {
        address moduleManager = moduleManagerAddress();
        // Only whitelisted modules are allowed.
        require(AddressManager(moduleManager).isMember(msg.sender), "Method can only be called from an enabled module");
        // Execute transaction without further confirmations.
        success = execute(to, value, data, operation, gasleft());
        if (success) emit ExecutionFromModuleSuccess(msg.sender);
        else emit ExecutionFromModuleFailure(msg.sender);
    }

    /// @dev Allows a Module to execute a transaction without any further confirmations and return data
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModuleReturnData(address to, uint256 value, bytes memory data, uint8 operation)
        public
        returns (bool success, bytes memory returnData)
    {
        success = execTransactionFromModule(to, value, data, operation);
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            // Load free memory location
            let ptr := mload(0x40)
            // We allocate memory for the return data by setting the free memory location to
            // current free memory location + data size + 32 bytes for data size value
            mstore(0x40, add(ptr, add(returndatasize(), 0x20)))
            // Store the size
            mstore(ptr, returndatasize())
            // Store the data
            returndatacopy(add(ptr, 0x20), 0, returndatasize())
            // Point the return data to the correct memory location
            returnData := ptr
        }
    }
}