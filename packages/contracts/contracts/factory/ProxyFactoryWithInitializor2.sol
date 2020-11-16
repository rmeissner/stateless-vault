// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import '../base/SignatureCheck.sol';
import '../base/Executor.sol';
import './IProxyFactory.sol';

contract Initializor2 is Executor {

    // Used to setup correct implementation after payment
    address private impl;
    // Store expected creation validators between calls
    address private deployer;

    constructor() {
        // Make implementation useless, this contract should only be used via proxies
        deployer = address(1);
    }

    function setDeployer(
        address _deployer
    ) external {
        require(deployer == address(0), "Deployer already set");
        deployer = _deployer;
    }

    function initialize(
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes calldata initializerData,
        uint8 initializerOperation
    ) external payable {
        require(msg.sender == deployer, "Only deployer can call this method");
        deployer = address(0);
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

contract ProxyFactoryWithInitializor2 is SignatureCheck {

    using Address for address;

    bytes32 constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(uint256 chainId,address verifyingContract)"
    );

    // Validatory are packed encoded (to avoid issues with EIP712)
    bytes32 constant SETUP_TYPEHASH = keccak256(
        "Setup(address proxy,address implementation,address initializerTo,uint256 initializerValue,bytes initializerData,uint8 initializerOperation,bytes validators)"
    );
 
    ProxyFactory public immutable factory;
    Initializor2 public immutable initializor;

    constructor(ProxyFactory _factory, Initializor2 _initializor) {
        factory = _factory;
        initializor = _initializor;
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
        address proxy,
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes memory initializerData,
        uint8 initializerOperation,
        bytes memory validatorsBytes
    ) public view returns (bytes32) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, address(this)));
        bytes32 setupHash = keccak256(
            abi.encode(SETUP_TYPEHASH, proxy, implementation, initializerTo, initializerValue, keccak256(initializerData), initializerOperation, validatorsBytes)
        );
        return keccak256(abi.encodePacked(byte(0x19), byte(0x01), domainSeparator, setupHash));
    }

    function calculateProxyAddress(
        address[] memory validators,
        uint256 nonce
    ) public view returns (address payable) {
        bytes memory init = abi.encodeWithSignature("setDeployer(address)", this);
        uint256 saltNonce = uint256(keccak256(abi.encodePacked(nonce, validators)));
        return internalCalcProxyAddress(keccak256(init), saltNonce);
    }

    function internalCalcProxyAddress(
        bytes32 initHash, uint256 saltNonce
    ) internal view returns (address payable) {
        // Taken from https://github.com/gnosis/safe-contracts/blob/development/contracts/proxies/GnosisSafeProxyFactory.sol#L47
        bytes32 salt = keccak256(abi.encodePacked(initHash, saltNonce));
        bytes32 deploymentDataHash = keccak256(abi.encodePacked(factory.proxyCreationCode(), uint256(address(initializor))));
        return address(uint256(keccak256(abi.encodePacked(byte(0xff), address(factory), salt, deploymentDataHash))));
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
            bytes memory init = abi.encodeWithSignature("setDeployer(address)", this);
            // Calculate proxy address
            // Taken from https://github.com/gnosis/safe-contracts/blob/development/contracts/proxies/GnosisSafeProxyFactory.sol#L47
            uint256 saltNonce = uint256(keccak256(abi.encodePacked(nonce, validators)));
            proxy = internalCalcProxyAddress(keccak256(init), saltNonce);
            // Check if deployment is required
            if (!address(proxy).isContract()) {
                require(factory.createProxyWithNonce(address(initializor), init, saltNonce) == proxy, "Proxy creation failed");
            }
        }
        initProxy(
            proxy,
            implementation, 
            initializerTo, 
            initializerValue,
            initializerData,
            initializerOperation,
            validators,
            signatures
        );
    }

    function initProxy(
        address payable proxy,
        address implementation,
        address payable initializerTo,
        uint256 initializerValue,
        bytes memory initializerData,
        uint8 initializerOperation,
        address[] memory validators,
        bytes memory signatures
    ) internal {
        bytes32 setupHash = generateSetupHash(
            proxy,
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
        }
        Initializor2(proxy).initialize{ value: msg.value }(
            implementation, 
            initializerTo, 
            initializerValue,
            initializerData,
            initializerOperation
        );
    }
}