// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PayeeRegistry
/// @notice Creator-owned address book with an explicit "Confirmation of Payee" step.
/// @dev Every creator (msg.sender) has their own isolated payee list. A payee is only
///      payable by PayboundVault once it is Confirmed. Confirming requires re-entering the
///      full address (catches typos / lookalike / poisoned addresses copied from history)
///      and, optionally, waiting a creator-chosen cooling-off delay after it was added.
contract PayeeRegistry {
    enum Status {
        None,
        Pending,
        Confirmed,
        Removed
    }

    struct Payee {
        address wallet;
        uint64 addedAt;
        uint64 confirmedAt;
        Status status;
        string label;
    }

    uint64 public constant MAX_CONFIRM_DELAY = 7 days;
    uint256 public constant MAX_LABEL_LENGTH = 64;

    /// @dev owner => payees; payeeId = index + 1 (0 means "none").
    mapping(address => Payee[]) private _payees;
    /// @dev owner => wallet => active (Pending or Confirmed) payeeId.
    mapping(address => mapping(address => uint256)) public activePayeeIdOf;
    /// @dev owner => cooling-off delay between add and confirm.
    mapping(address => uint64) public confirmDelayOf;

    event PayeeAdded(address indexed owner, uint256 indexed payeeId, address indexed wallet, string label);
    event PayeeConfirmed(address indexed owner, uint256 indexed payeeId, address indexed wallet);
    event PayeeRemoved(address indexed owner, uint256 indexed payeeId, address indexed wallet);
    event ConfirmDelaySet(address indexed owner, uint64 delay);

    error ZeroAddress();
    error SelfPayee();
    error InvalidLabel();
    error AlreadyActive(uint256 payeeId);
    error UnknownPayee(uint256 payeeId);
    error NotPending(uint256 payeeId);
    error AddressMismatch(address expected, address provided);
    error ConfirmTooEarly(uint64 confirmableAt);
    error DelayTooLong(uint64 maxDelay);

    function setConfirmDelay(uint64 delay) external {
        if (delay > MAX_CONFIRM_DELAY) revert DelayTooLong(MAX_CONFIRM_DELAY);
        confirmDelayOf[msg.sender] = delay;
        emit ConfirmDelaySet(msg.sender, delay);
    }

    /// @notice Add a payee in Pending state. It cannot be paid until confirmed.
    function addPayee(string calldata label, address wallet) external returns (uint256 payeeId) {
        if (wallet == address(0)) revert ZeroAddress();
        if (wallet == msg.sender) revert SelfPayee();
        uint256 len = bytes(label).length;
        if (len == 0 || len > MAX_LABEL_LENGTH) revert InvalidLabel();
        uint256 existing = activePayeeIdOf[msg.sender][wallet];
        if (existing != 0) revert AlreadyActive(existing);

        _payees[msg.sender].push(
            Payee({
                wallet: wallet,
                // forge-lint: disable-next-line(unsafe-typecast)
                addedAt: uint64(block.timestamp),
                confirmedAt: 0,
                status: Status.Pending,
                label: label
            })
        );
        payeeId = _payees[msg.sender].length;
        activePayeeIdOf[msg.sender][wallet] = payeeId;
        emit PayeeAdded(msg.sender, payeeId, wallet, label);
    }

    /// @notice Confirm a pending payee by re-entering its full address.
    function confirmPayee(uint256 payeeId, address reenteredWallet) external {
        Payee storage p = _get(msg.sender, payeeId);
        if (p.status != Status.Pending) revert NotPending(payeeId);
        if (p.wallet != reenteredWallet) revert AddressMismatch(p.wallet, reenteredWallet);
        uint64 confirmableAt = p.addedAt + confirmDelayOf[msg.sender];
        if (block.timestamp < confirmableAt) revert ConfirmTooEarly(confirmableAt);
        p.status = Status.Confirmed;
        // forge-lint: disable-next-line(unsafe-typecast)
        p.confirmedAt = uint64(block.timestamp);
        emit PayeeConfirmed(msg.sender, payeeId, p.wallet);
    }

    /// @notice Remove a payee (pending or confirmed). Removal is permanent for this id;
    ///         re-adding the same wallet creates a fresh id that needs confirming again.
    function removePayee(uint256 payeeId) external {
        Payee storage p = _get(msg.sender, payeeId);
        if (p.status != Status.Pending && p.status != Status.Confirmed) revert UnknownPayee(payeeId);
        p.status = Status.Removed;
        delete activePayeeIdOf[msg.sender][p.wallet];
        emit PayeeRemoved(msg.sender, payeeId, p.wallet);
    }

    // ----------------------------------------------------------------- views

    function payeeCount(address owner) external view returns (uint256) {
        return _payees[owner].length;
    }

    function getPayee(address owner, uint256 payeeId) external view returns (Payee memory) {
        if (payeeId == 0 || payeeId > _payees[owner].length) revert UnknownPayee(payeeId);
        return _payees[owner][payeeId - 1];
    }

    /// @notice Returns (true, wallet) only when the payee is Confirmed.
    function confirmedWallet(address owner, uint256 payeeId) external view returns (bool ok, address wallet) {
        if (payeeId == 0 || payeeId > _payees[owner].length) return (false, address(0));
        Payee storage p = _payees[owner][payeeId - 1];
        if (p.status != Status.Confirmed) return (false, p.wallet);
        return (true, p.wallet);
    }

    function _get(address owner, uint256 payeeId) private view returns (Payee storage) {
        if (payeeId == 0 || payeeId > _payees[owner].length) revert UnknownPayee(payeeId);
        return _payees[owner][payeeId - 1];
    }
}
