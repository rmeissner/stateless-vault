// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.8.0;
pragma experimental ABIEncoderV2;

contract ModuleManager {
    
    event EnableModule(address indexed vault, address indexed module, bool empowered);
    event DisableModule(address indexed vault, address indexed module);
    
    address public immutable vault;
    
    address internal constant SENTINEL = address(0x1);

    struct ModuleState {
        address next;
        bool empowered;
    }
    mapping (address => ModuleState) internal modules;
    
    constructor() {
        vault = msg.sender;
        modules[SENTINEL] = ModuleState(SENTINEL, false);
    }
    
    function getStatus(address module) public view returns(bool enabled, bool empowered) {
        ModuleState memory state = modules[module];
        enabled = SENTINEL != module && state.next != address(0);
        return (enabled, state.empowered);
    }

    function enabledModule(address module, bool empowered)
        public
    {
        require(msg.sender == vault, "This can only be done by the owner");
        // Member address cannot be null or sentinel.
        require(module != address(0) && module != SENTINEL, "Invalid module address provided");
        ModuleState memory state = modules[module];
        if (state.next == address(0)) {
            modules[module] = ModuleState(modules[SENTINEL].next, empowered);
            modules[SENTINEL].next = module;
        } else if (state.empowered != empowered) {
            modules[module].empowered = empowered;
        } else {
            return;
        }
        emit EnableModule(vault, module, empowered);
    }

    function disableModule(address prevModule, address module)
        public
    {
        require(msg.sender == vault, "This can only be done by the owner");
        // Validate module address and check that it corresponds to module index.
        require(module != address(0) && module != SENTINEL, "Invalid module address provided");
        require(modules[prevModule].next == module, "Invalid prevModule, module pair provided");
        modules[prevModule].next = modules[module].next;
        delete modules[module];
        emit DisableModule(vault, module);
    }

    function getModuleAddresses()
        public
        view
        returns (address[] memory out)
    {
        (ModuleState[] memory array,) = getModulesPaginated(SENTINEL, 10);
        out = new address[](array.length);
        for (uint256 i = 0; i < array.length; i++) {
            out[i] = array[i].next;
        }
    }

    function getModules()
        public
        view
        returns (ModuleState[] memory)
    {
        (ModuleState[] memory array,) = getModulesPaginated(SENTINEL, 10);
        return array;
    }

    function getModulesPaginated(address start, uint256 pageSize)
        public
        view
        returns (ModuleState[] memory array, address next)
    {
        // Init array with max page size
        array = new ModuleState[](pageSize);

        // Populate return array
        uint256 count = 0;
        ModuleState memory current = modules[start];
        while(current.next != address(0x0) && current.next != SENTINEL && count < pageSize) {
            array[count] = current;
            current = modules[current.next];
            count++;
        }
        next = current.next;
        // Set correct size of returned array
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            mstore(array, count)
        }
    }
}