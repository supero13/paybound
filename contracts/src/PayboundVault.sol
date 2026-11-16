// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PayeeRegistry} from "./PayeeRegistry.sol";

/// @title PayboundVault
/// @notice Holds a creator's tUSD8 and only releases it to *confirmed* payees, inside
///         per-payee spending limits (per-transaction cap, rolling period cap, expiry).
///         Creators can optionally grant a scoped, revocable "session" to an agent key
///         with its own caps and expiry. The AI assistant never needs a session: by default
///         it only drafts, and the creator signs every payment.
/// @dev Multi-tenant: each creator's balance, limits, sessions and pause flag are isolated.
///      The contract owner is an emergency guardian that can pause *payments* globally but
///      can never move, withdraw or redirect anyone's funds. Withdrawals always work.
///      Amounts are raw token units (tUSD8 = 6 decimals).
contract PayboundVault is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice A spending limit. Used both for payee policies and agent sessions.
    struct Limit {
        uint128 perTxCap; // max per single payment
        uint128 periodCap; // max total per period window
        uint128 spentInPeriod; // spent in current window
        uint64 periodLength; // seconds, e.g. 1 days / 7 days
        uint64 periodStart; // start of current window
        uint64 expiresAt; // unix seconds; payments at/after this revert
        bool active;
    }

    /// @notice Why a payment would be blocked. Returned by previewPayment for UI / AI drafts.
    enum Blocker {
        None,
        GloballyPaused,
        CreatorPaused,
        ZeroAmount,
        PayeeNotConfirmed,
        NoPayeeLimit,
        PayeeLimitExpired,
        OverPayeeTxCap,
        OverPayeePeriodCap,
        NotAuthorized,
        SessionExpired,
        OverSessionTxCap,
        OverSessionPeriodCap,
        InsufficientBalance
    }

    uint256 public constant MAX_MEMO_LENGTH = 140;
    uint64 public constant MIN_PERIOD = 1 hours;
    uint64 public constant MAX_PERIOD = 365 days;

    IERC20 public immutable token;
    PayeeRegistry public immutable registry;

    bool public globallyPaused;
    uint256 public receiptCount;

    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public creatorPaused;
    mapping(address => mapping(uint256 => Limit)) private _payeeLimits;
    mapping(address => mapping(address => Limit)) private _sessions;

    event Deposited(address indexed creator, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed creator, uint256 amount, uint256 newBalance);
    event PayeeLimitSet(
        address indexed creator,
        uint256 indexed payeeId,
        uint128 perTxCap,
        uint128 periodCap,
        uint64 periodLength,
        uint64 expiresAt
    );
    event PayeeLimitRevoked(address indexed creator, uint256 indexed payeeId);
    event SessionGranted(
        address indexed creator,
        address indexed agent,
        uint128 perTxCap,
        uint128 periodCap,
        uint64 periodLength,
        uint64 expiresAt
    );
    event SessionRevoked(address indexed creator, address indexed agent);
    event CreatorPauseSet(address indexed creator, bool paused);
    event GlobalPauseSet(bool paused);
    /// @notice The on-chain receipt. `ref` links back to an off-chain draft (e.g. hash of the AI draft).
    event PaymentExecuted(
        uint256 indexed receiptId,
        address indexed creator,
        address indexed payee,
        uint256 payeeId,
        address executor,
        uint256 amount,
        bytes32 ref,
        string memo
    );

    error ZeroAmount();
    error InsufficientBalance(uint256 balance, uint256 needed);
    error InvalidLimit();
    error InvalidAgent();
    error MemoTooLong();
    error PaymentBlocked(Blocker reason);
    error NoSuchLimit();

    constructor(IERC20 token_, PayeeRegistry registry_, address guardian) Ownable(guardian) {
        token = token_;
        registry = registry_;
    }

    // ------------------------------------------------------------ funds

    /// @notice Deposit tUSD8 (requires prior approve). Credits the actual amount received.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        uint256 nb = balanceOf[msg.sender] + received;
        balanceOf[msg.sender] = nb;
        emit Deposited(msg.sender, received, nb);
    }

    /// @notice Withdraw back to the creator. Always allowed, even while paused.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balanceOf[msg.sender];
        if (amount > bal) revert InsufficientBalance(bal, amount);
        unchecked {
            balanceOf[msg.sender] = bal - amount;
        }
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, bal - amount);
    }

    // ------------------------------------------------------------ policies

    /// @notice Set (or tighten / loosen) the spending limit for a confirmed payee.
    /// @dev Spend already used in the current window is preserved so re-setting a limit
    ///      cannot be used to reset the period budget.
    function setPayeeLimit(uint256 payeeId, uint128 perTxCap, uint128 periodCap, uint64 periodLength, uint64 expiresAt)
        external
    {
        (bool ok,) = registry.confirmedWallet(msg.sender, payeeId);
        if (!ok) revert PaymentBlocked(Blocker.PayeeNotConfirmed);
        _validateLimit(perTxCap, periodCap, periodLength, expiresAt);
        _writeLimit(_payeeLimits[msg.sender][payeeId], perTxCap, periodCap, periodLength, expiresAt);
        emit PayeeLimitSet(msg.sender, payeeId, perTxCap, periodCap, periodLength, expiresAt);
    }

    function revokePayeeLimit(uint256 payeeId) external {
        Limit storage l = _payeeLimits[msg.sender][payeeId];
        if (!l.active) revert NoSuchLimit();
        l.active = false;
        emit PayeeLimitRevoked(msg.sender, payeeId);
    }

    /// @notice Grant a scoped, expiring session to an agent key that may execute payments
    ///         on the creator's behalf. Payee limits still apply on top of the session caps.
    function grantSession(address agent, uint128 perTxCap, uint128 periodCap, uint64 periodLength, uint64 expiresAt)
        external
    {
        if (agent == address(0) || agent == msg.sender) revert InvalidAgent();
        _validateLimit(perTxCap, periodCap, periodLength, expiresAt);
        _writeLimit(_sessions[msg.sender][agent], perTxCap, periodCap, periodLength, expiresAt);
        emit SessionGranted(msg.sender, agent, perTxCap, periodCap, periodLength, expiresAt);
    }

    function revokeSession(address agent) external {
        Limit storage s = _sessions[msg.sender][agent];
        if (!s.active) revert NoSuchLimit();
        s.active = false;
        emit SessionRevoked(msg.sender, agent);
    }

    function setCreatorPaused(bool paused) external {
        creatorPaused[msg.sender] = paused;
        emit CreatorPauseSet(msg.sender, paused);
    }

    /// @notice Guardian emergency stop for all payments. Cannot touch funds.
    function setGlobalPaused(bool paused) external onlyOwner {
        globallyPaused = paused;
        emit GlobalPauseSet(paused);
    }

    // ------------------------------------------------------------ payments

    /// @notice Pay a confirmed payee from `creator`'s vault balance.
    /// @param creator Vault owner whose funds are used. Caller must be creator or an active session agent.
    /// @param ref Optional reference (e.g. keccak256 of the AI draft) recorded in the receipt.
    function pay(address creator, uint256 payeeId, uint256 amount, bytes32 ref, string calldata memo)
        external
        nonReentrant
        returns (uint256 receiptId)
    {
        if (bytes(memo).length > MAX_MEMO_LENGTH) revert MemoTooLong();
        (Blocker b, address wallet) = _check(creator, msg.sender, payeeId, amount);
        if (b != Blocker.None) revert PaymentBlocked(b);

        _consume(_payeeLimits[creator][payeeId], amount);
        if (msg.sender != creator) _consume(_sessions[creator][msg.sender], amount);
        balanceOf[creator] -= amount;

        receiptId = ++receiptCount;
        token.safeTransfer(wallet, amount);
        emit PaymentExecuted(receiptId, creator, wallet, payeeId, msg.sender, amount, ref, memo);
    }

    // ------------------------------------------------------------ views

    /// @notice Dry-run a payment. Used by the UI and the AI draft layer to show blockers
    ///         *before* asking the creator to sign.
    function previewPayment(address creator, address executor, uint256 payeeId, uint256 amount)
        external
        view
        returns (Blocker blocker, address payeeWallet)
    {
        return _check(creator, executor, payeeId, amount);
    }

    function payeeLimit(address creator, uint256 payeeId) external view returns (Limit memory) {
        return _payeeLimits[creator][payeeId];
    }

    function session(address creator, address agent) external view returns (Limit memory) {
        return _sessions[creator][agent];
    }

    /// @notice Max amount payable to this payee right now (ignores sessions and vault balance).
    function remainingForPayee(address creator, uint256 payeeId) external view returns (uint256) {
        return _remaining(_payeeLimits[creator][payeeId]);
    }

    function remainingForSession(address creator, address agent) external view returns (uint256) {
        return _remaining(_sessions[creator][agent]);
    }

    // ------------------------------------------------------------ internals

    function _check(address creator, address executor, uint256 payeeId, uint256 amount)
        internal
        view
        returns (Blocker, address)
    {
        if (globallyPaused) return (Blocker.GloballyPaused, address(0));
        if (creatorPaused[creator]) return (Blocker.CreatorPaused, address(0));
        if (amount == 0) return (Blocker.ZeroAmount, address(0));

        if (executor != creator) {
            Limit storage s = _sessions[creator][executor];
            if (!s.active) return (Blocker.NotAuthorized, address(0));
            if (block.timestamp >= s.expiresAt) return (Blocker.SessionExpired, address(0));
            if (amount > s.perTxCap) return (Blocker.OverSessionTxCap, address(0));
            if (_spent(s) + amount > s.periodCap) return (Blocker.OverSessionPeriodCap, address(0));
        }

        (bool ok, address wallet) = registry.confirmedWallet(creator, payeeId);
        if (!ok) return (Blocker.PayeeNotConfirmed, address(0));

        Limit storage l = _payeeLimits[creator][payeeId];
        if (!l.active) return (Blocker.NoPayeeLimit, wallet);
        if (block.timestamp >= l.expiresAt) return (Blocker.PayeeLimitExpired, wallet);
        if (amount > l.perTxCap) return (Blocker.OverPayeeTxCap, wallet);
        if (_spent(l) + amount > l.periodCap) return (Blocker.OverPayeePeriodCap, wallet);

        if (amount > balanceOf[creator]) return (Blocker.InsufficientBalance, wallet);
        return (Blocker.None, wallet);
    }

    function _validateLimit(uint128 perTxCap, uint128 periodCap, uint64 periodLength, uint64 expiresAt) internal view {
        if (perTxCap == 0 || perTxCap > periodCap) revert InvalidLimit();
        if (periodLength < MIN_PERIOD || periodLength > MAX_PERIOD) revert InvalidLimit();
        if (expiresAt <= block.timestamp) revert InvalidLimit();
    }

    function _writeLimit(Limit storage l, uint128 perTxCap, uint128 periodCap, uint64 periodLength, uint64 expiresAt)
        internal
    {
        // Keep current-window spend if the window is still open; otherwise start fresh.
        if (!l.active || block.timestamp >= uint256(l.periodStart) + l.periodLength) {
            // casting to 'uint64' is safe because timestamps fit in uint64 for billions of years.
            // forge-lint: disable-next-line(unsafe-typecast)
            l.periodStart = uint64(block.timestamp);
            l.spentInPeriod = 0;
        }
        l.perTxCap = perTxCap;
        l.periodCap = periodCap;
        l.periodLength = periodLength;
        l.expiresAt = expiresAt;
        l.active = true;
    }

    function _spent(Limit storage l) internal view returns (uint256) {
        if (block.timestamp >= uint256(l.periodStart) + l.periodLength) return 0;
        return l.spentInPeriod;
    }

    function _remaining(Limit storage l) internal view returns (uint256) {
        if (!l.active || block.timestamp >= l.expiresAt) return 0;
        uint256 spent = _spent(l);
        if (spent >= l.periodCap) return 0;
        uint256 room = l.periodCap - spent;
        return room < l.perTxCap ? room : l.perTxCap;
    }

    function _consume(Limit storage l, uint256 amount) internal {
        if (block.timestamp >= uint256(l.periodStart) + l.periodLength) {
            // casting to 'uint64' is safe because timestamps fit in uint64 for billions of years.
            // forge-lint: disable-next-line(unsafe-typecast)
            l.periodStart = uint64(block.timestamp);
            l.spentInPeriod = 0;
        }
        // casting to 'uint128' is safe because amount <= perTxCap (a uint128) was checked in _check.
        // forge-lint: disable-next-line(unsafe-typecast)
        l.spentInPeriod += uint128(amount);
    }
}
