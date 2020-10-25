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