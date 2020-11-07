// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '../base/SignatureCheck.sol';
import '../base/Executor.sol';

interface ProxyFactory {
    function createProxyWithNonce(address implementation, bytes calldata initializer, uint256 saltNonce) external returns (address payable);
}

contract Initializor is SignatureCheck, Executor {
    bytes32 constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(uint256 chainId,address verifyingContract)"
    );

    // Validatory are packed encoded (to avoid issues with EIP712)
    bytes32 constant SETUP_TYPEHASH = keccak256(
        "Setup(address implementation,address initializerTo,uint256 initializerValue,bytes initializerData,uint8 initializerOperation,bytes validators)"
    );

    // Used to setup correct implementation after payment
    address private impl;
    // Store expected creation validators between calls
    address[] private vdors;

    constructor() {
        // Make implementation useless, this contract should only be used via proxies
        vdors = [address(0)];
    }

    function setValidators(
        address[] calldata validators
    ) external {
        require(vdors.length == 0, "Validators already set");
        vdors = validators;
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() internal pure returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    function generateSetupHash(
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes memory initializerData,
        uint8 initializerOperation,
        bytes memory validatorsBytes
    ) internal view returns (bytes32) {
        return generateSetupHashForAddress(address(this), implementation, initializerTo, initializerValue, initializerData, initializerOperation, validatorsBytes);
    }

    function generateSetupHashForAddress(
        address verifier,
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes memory initializerData,
        uint8 initializerOperation,
        bytes memory validatorsBytes
    ) public pure returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, verifier));
        bytes32 setupHash = keccak256(
            abi.encode(SETUP_TYPEHASH, implementation, initializerTo, initializerValue, keccak256(initializerData), initializerOperation, validatorsBytes)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, setupHash));
    }

    function initialize(
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes calldata initializerData,
        uint8 initializerOperation,
        bytes calldata signatures
    ) external payable {
        address[] memory validators = vdors;
        bytes32 setupHash = generateSetupHash(
            implementation,
            initializerTo,
            initializerValue,
            initializerData,
            initializerOperation,
            abi.encodePacked(validators)
        );
        uint256 validatorCount = validators.length;
        for (uint256 i = 0; i < validatorCount; i++) {
            address validator = recoverSigner(setupHash, address(0), signatures, i);
            require(validator == validators[i], "Could not validate setup");
            delete vdors[i];
        }
        delete vdors;
        impl = implementation;
        address payable initializerTarget = initializerTo == address(0) ? address(this) : initializerTo;
        require(execute(initializerTarget, initializerValue, initializerData, initializerOperation, gasleft()), "Could not execute initializer");
    }

    /*
     * Fallback logic
     */

    event ReceivedEther(
        address indexed sender, 
        uint amount
    );
    
    fallback()
        external
        payable
    {
        if (msg.value > 0) {
            emit ReceivedEther(msg.sender, msg.value);
        }
    }
    
    receive()
        external
        payable
    {
        emit ReceivedEther(msg.sender, msg.value);
    }
}

contract ProxyFactoryWithInitializor {
 
    ProxyFactory public immutable factory;
    Initializor public immutable initializor;

    constructor(ProxyFactory _factory, Initializor _initializor) {
        factory = _factory;
        initializor = _initializor;
    }

    function createProxyWithInitializor(
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes memory initializerData,
        uint8 initializerOperation,
        address[] memory validators,
        bytes memory signatures,
        uint256 nonce
    ) public payable returns (address payable proxy) {
        {
            bytes memory init = abi.encodeWithSignature("setValidators(address[])", validators);
            proxy = factory.createProxyWithNonce(address(initializor), init, nonce);
            require(proxy != address(0), "Proxy creation failed");
        }
        Initializor(proxy).initialize{ value: msg.value }(
            implementation, 
            initializerTo, 
            initializerValue,
            initializerData,
            initializerOperation,
            signatures
        );
    }
}