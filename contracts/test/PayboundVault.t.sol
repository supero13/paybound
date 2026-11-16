// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayeeRegistry} from "../src/PayeeRegistry.sol";
import {PayboundVault} from "../src/PayboundVault.sol";
import {MockUSD} from "./mocks/MockUSD.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PayboundVaultTest is Test {
    MockUSD usd;
    PayeeRegistry reg;
    PayboundVault vault;

    address guardian = makeAddr("guardian");
    address creator = makeAddr("creator");
    address other = makeAddr("otherCreator");
    address ada = makeAddr("ada");
    address bola = makeAddr("bola");
    address agent = makeAddr("agent");
    address attacker = makeAddr("attacker");

    uint256 constant ONE = 1e6; // 1 tUSD8 (6 decimals)
    uint256 adaId;

    function setUp() public {
        vm.warp(1_700_000_000);
        usd = new MockUSD();
        reg = new PayeeRegistry();
        vault = new PayboundVault(usd, reg, guardian);

        usd.mint(creator, 1_000 * ONE);
        usd.mint(other, 1_000 * ONE);
        vm.startPrank(creator);
        usd.approve(address(vault), type(uint256).max);
        vault.deposit(500 * ONE);
        adaId = reg.addPayee("Ada", ada);
        reg.confirmPayee(adaId, ada);
        // 50 per tx, 100 per day, valid 30 days
        vault.setPayeeLimit(adaId, uint128(50 * ONE), uint128(100 * ONE), 1 days, uint64(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function _pay(address as_, uint256 id, uint256 amt) internal returns (uint256) {
        vm.prank(as_);
        return vault.pay(creator, id, amt, bytes32("draft"), "November thread");
    }

    function _blocked(PayboundVault.Blocker b) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(PayboundVault.PaymentBlocked.selector, b);
    }

    // ---------------------------------------------------------------- funds

    function test_DepositAndWithdraw() public {
        assertEq(vault.balanceOf(creator), 500 * ONE);
        assertEq(usd.balanceOf(address(vault)), 500 * ONE);
        vm.prank(creator);
        vault.withdraw(200 * ONE);
        assertEq(vault.balanceOf(creator), 300 * ONE);
        assertEq(usd.balanceOf(creator), 700 * ONE);
    }

    function test_WithdrawMoreThanBalanceReverts() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(PayboundVault.InsufficientBalance.selector, 500 * ONE, 501 * ONE));
        vault.withdraw(501 * ONE);
    }

    function test_ZeroDepositWithdrawRevert() public {
        vm.startPrank(creator);
        vm.expectRevert(PayboundVault.ZeroAmount.selector);
        vault.deposit(0);
        vm.expectRevert(PayboundVault.ZeroAmount.selector);
        vault.withdraw(0);
        vm.stopPrank();
    }

    function test_CannotWithdrawSomeoneElsesFunds() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(PayboundVault.InsufficientBalance.selector, 0, ONE));
        vault.withdraw(ONE);
    }

    function test_WithdrawWorksWhilePaused() public {
        vm.prank(guardian);
        vault.setGlobalPaused(true);
        vm.startPrank(creator);
        vault.setCreatorPaused(true);
        vault.withdraw(500 * ONE);
        vm.stopPrank();
        assertEq(usd.balanceOf(creator), 1_000 * ONE);
    }

    // ---------------------------------------------------------------- happy path

    function test_PayConfirmedPayeeEmitsReceipt() public {
        vm.expectEmit(true, true, true, true);
        emit PayboundVault.PaymentExecuted(
            1, creator, ada, adaId, creator, 25 * ONE, bytes32("draft"), "November thread"
        );
        uint256 r = _pay(creator, adaId, 25 * ONE);
        assertEq(r, 1);
        assertEq(usd.balanceOf(ada), 25 * ONE);
        assertEq(vault.balanceOf(creator), 475 * ONE);
        assertEq(vault.remainingForPayee(creator, adaId), 50 * ONE);
        assertEq(vault.receiptCount(), 1);
    }

    // ---------------------------------------------------------------- confirmation of payee

    function test_UnconfirmedPayeeBlocked() public {
        vm.prank(creator);
        uint256 bolaId = reg.addPayee("Bola", bola);
        vm.prank(creator);
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        vault.setPayeeLimit(bolaId, uint128(ONE), uint128(ONE), 1 days, uint64(block.timestamp + 1 days));
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        _pay(creator, bolaId, ONE);
    }

    function test_RemovedPayeeBlockedEvenWithLimit() public {
        vm.prank(creator);
        reg.removePayee(adaId);
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        _pay(creator, adaId, ONE);
    }

    function test_UnknownPayeeIdBlocked() public {
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        _pay(creator, 42, ONE);
    }

    function test_ConfirmedButNoLimitBlocked() public {
        vm.startPrank(creator);
        uint256 bolaId = reg.addPayee("Bola", bola);
        reg.confirmPayee(bolaId, bola);
        vm.stopPrank();
        vm.expectRevert(_blocked(PayboundVault.Blocker.NoPayeeLimit));
        _pay(creator, bolaId, ONE);
    }

    // ---------------------------------------------------------------- caps

    function test_OverPerTxCapBlocked() public {
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverPayeeTxCap));
        _pay(creator, adaId, 50 * ONE + 1);
    }

    function test_PeriodCapAndRollover() public {
        _pay(creator, adaId, 50 * ONE);
        _pay(creator, adaId, 50 * ONE);
        assertEq(vault.remainingForPayee(creator, adaId), 0);
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverPayeePeriodCap));
        _pay(creator, adaId, 1);
        vm.warp(block.timestamp + 1 days);
        assertEq(vault.remainingForPayee(creator, adaId), 50 * ONE);
        _pay(creator, adaId, 50 * ONE);
        assertEq(usd.balanceOf(ada), 150 * ONE);
    }

    function test_ResettingLimitDoesNotResetSpend() public {
        _pay(creator, adaId, 50 * ONE);
        _pay(creator, adaId, 50 * ONE);
        vm.prank(creator);
        vault.setPayeeLimit(adaId, uint128(50 * ONE), uint128(120 * ONE), 1 days, uint64(block.timestamp + 30 days));
        assertEq(vault.remainingForPayee(creator, adaId), 20 * ONE);
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverPayeePeriodCap));
        _pay(creator, adaId, 21 * ONE);
        _pay(creator, adaId, 20 * ONE);
    }

    function test_ExpiredLimitBlocked() public {
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeLimitExpired));
        _pay(creator, adaId, ONE);
        assertEq(vault.remainingForPayee(creator, adaId), 0);
    }

    function test_RevokedLimitBlocksNextPayment() public {
        _pay(creator, adaId, 10 * ONE);
        vm.prank(creator);
        vault.revokePayeeLimit(adaId);
        vm.expectRevert(_blocked(PayboundVault.Blocker.NoPayeeLimit));
        _pay(creator, adaId, ONE);
        vm.prank(creator);
        vm.expectRevert(PayboundVault.NoSuchLimit.selector);
        vault.revokePayeeLimit(adaId);
    }

    function test_InsufficientVaultBalance() public {
        vm.prank(creator);
        vault.withdraw(495 * ONE);
        vm.expectRevert(_blocked(PayboundVault.Blocker.InsufficientBalance));
        _pay(creator, adaId, 6 * ONE);
    }

    function test_InvalidLimitsRejected() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        vm.startPrank(creator);
        vm.expectRevert(PayboundVault.InvalidLimit.selector);
        vault.setPayeeLimit(adaId, 0, uint128(ONE), 1 days, exp); // zero per-tx
        vm.expectRevert(PayboundVault.InvalidLimit.selector);
        vault.setPayeeLimit(adaId, uint128(2 * ONE), uint128(ONE), 1 days, exp); // perTx > period
        vm.expectRevert(PayboundVault.InvalidLimit.selector);
        vault.setPayeeLimit(adaId, uint128(ONE), uint128(ONE), 10 minutes, exp); // period too short
        vm.expectRevert(PayboundVault.InvalidLimit.selector);
        vault.setPayeeLimit(adaId, uint128(ONE), uint128(ONE), 366 days, exp); // too long
        vm.expectRevert(PayboundVault.InvalidLimit.selector);
        vault.setPayeeLimit(adaId, uint128(ONE), uint128(ONE), 1 days, uint64(block.timestamp)); // already expired
        vm.stopPrank();
    }

    function test_ZeroAmountAndLongMemo() public {
        vm.expectRevert(_blocked(PayboundVault.Blocker.ZeroAmount));
        _pay(creator, adaId, 0);
        vm.prank(creator);
        vm.expectRevert(PayboundVault.MemoTooLong.selector);
        vault.pay(creator, adaId, ONE, bytes32(0), string(new bytes(141)));
    }

    // ---------------------------------------------------------------- pause

    function test_CreatorPause() public {
        vm.prank(creator);
        vault.setCreatorPaused(true);
        vm.expectRevert(_blocked(PayboundVault.Blocker.CreatorPaused));
        _pay(creator, adaId, ONE);
        vm.prank(creator);
        vault.setCreatorPaused(false);
        _pay(creator, adaId, ONE);
    }

    function test_GlobalPauseOnlyGuardian() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        vault.setGlobalPaused(true);
        vm.prank(guardian);
        vault.setGlobalPaused(true);
        vm.expectRevert(_blocked(PayboundVault.Blocker.GloballyPaused));
        _pay(creator, adaId, ONE);
    }

    function test_GuardianCannotMoveFunds() public {
        vm.prank(guardian);
        vm.expectRevert(_blocked(PayboundVault.Blocker.NotAuthorized));
        vault.pay(creator, adaId, ONE, bytes32(0), "");
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(PayboundVault.InsufficientBalance.selector, 0, ONE));
        vault.withdraw(ONE);
    }

    // ---------------------------------------------------------------- sessions (agent permissions)

    function _grant(uint128 perTx, uint128 period, uint64 ttl) internal {
        vm.prank(creator);
        vault.grantSession(agent, perTx, period, 1 days, uint64(block.timestamp + ttl));
    }

    function test_StrangerCannotPay() public {
        vm.expectRevert(_blocked(PayboundVault.Blocker.NotAuthorized));
        _pay(attacker, adaId, ONE);
    }

    function test_SessionAgentCanPayWithinCaps() public {
        _grant(uint128(10 * ONE), uint128(15 * ONE), 7 days);
        _pay(agent, adaId, 10 * ONE);
        assertEq(vault.remainingForSession(creator, agent), 5 * ONE);
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverSessionTxCap));
        _pay(agent, adaId, 11 * ONE);
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverSessionPeriodCap));
        _pay(agent, adaId, 6 * ONE);
        _pay(agent, adaId, 5 * ONE);
        assertEq(usd.balanceOf(ada), 15 * ONE);
    }

    function test_SessionStillBoundByPayeeLimit() public {
        _grant(uint128(100 * ONE), uint128(1_000 * ONE), 7 days);
        vm.expectRevert(_blocked(PayboundVault.Blocker.OverPayeeTxCap));
        _pay(agent, adaId, 60 * ONE);
    }

    function test_SessionCannotPayUnconfirmedPayee() public {
        _grant(uint128(100 * ONE), uint128(1_000 * ONE), 7 days);
        vm.prank(creator);
        uint256 bolaId = reg.addPayee("Bola", bola);
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        _pay(agent, bolaId, ONE);
    }

    function test_SessionRevokeIsImmediate() public {
        _grant(uint128(10 * ONE), uint128(50 * ONE), 7 days);
        _pay(agent, adaId, ONE);
        vm.prank(creator);
        vault.revokeSession(agent);
        vm.expectRevert(_blocked(PayboundVault.Blocker.NotAuthorized));
        _pay(agent, adaId, ONE);
    }

    function test_SessionExpires() public {
        _grant(uint128(10 * ONE), uint128(50 * ONE), 2 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(_blocked(PayboundVault.Blocker.SessionExpired));
        _pay(agent, adaId, ONE);
    }

    function test_SessionIsScopedToCreator() public {
        _grant(uint128(10 * ONE), uint128(50 * ONE), 7 days);
        // other creator funds a vault and confirms ada too, but never grants the agent
        vm.startPrank(other);
        usd.approve(address(vault), type(uint256).max);
        vault.deposit(100 * ONE);
        uint256 id = reg.addPayee("Ada", ada);
        reg.confirmPayee(id, ada);
        vault.setPayeeLimit(id, uint128(50 * ONE), uint128(100 * ONE), 1 days, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(_blocked(PayboundVault.Blocker.NotAuthorized));
        vault.pay(other, id, ONE, bytes32(0), "");
    }

    function test_InvalidSessionAgent() public {
        vm.startPrank(creator);
        vm.expectRevert(PayboundVault.InvalidAgent.selector);
        vault.grantSession(address(0), uint128(ONE), uint128(ONE), 1 days, uint64(block.timestamp + 1 days));
        vm.expectRevert(PayboundVault.InvalidAgent.selector);
        vault.grantSession(creator, uint128(ONE), uint128(ONE), 1 days, uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function test_AgentCannotManagePolicies() public {
        _grant(uint128(10 * ONE), uint128(50 * ONE), 7 days);
        // An agent calling setPayeeLimit only affects its own (empty) namespace.
        vm.prank(agent);
        vm.expectRevert(_blocked(PayboundVault.Blocker.PayeeNotConfirmed));
        vault.setPayeeLimit(adaId, uint128(1_000 * ONE), uint128(1_000 * ONE), 1 days, uint64(block.timestamp + 1 days));
        // and cannot withdraw creator funds
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PayboundVault.InsufficientBalance.selector, 0, ONE));
        vault.withdraw(ONE);
    }

    // ---------------------------------------------------------------- preview

    function test_PreviewMatchesPay() public view {
        (PayboundVault.Blocker b, address w) = vault.previewPayment(creator, creator, adaId, 25 * ONE);
        assertEq(uint8(b), uint8(PayboundVault.Blocker.None));
        assertEq(w, ada);
        (b,) = vault.previewPayment(creator, creator, adaId, 51 * ONE);
        assertEq(uint8(b), uint8(PayboundVault.Blocker.OverPayeeTxCap));
        (b,) = vault.previewPayment(creator, attacker, adaId, ONE);
        assertEq(uint8(b), uint8(PayboundVault.Blocker.NotAuthorized));
    }

    // ---------------------------------------------------------------- fuzz

    /// Whatever sequence of amounts is attempted inside one window, total paid never exceeds periodCap.
    function testFuzz_NeverExceedsPeriodCap(uint256[8] memory amts) public {
        uint256 paid;
        for (uint256 i; i < amts.length; i++) {
            uint256 a = bound(amts[i], 1, 60 * ONE);
            (PayboundVault.Blocker b,) = vault.previewPayment(creator, creator, adaId, a);
            if (b == PayboundVault.Blocker.None) {
                _pay(creator, adaId, a);
                paid += a;
            } else {
                vm.prank(creator);
                vm.expectRevert(_blocked(b));
                vault.pay(creator, adaId, a, bytes32(0), "");
            }
        }
        assertLe(paid, 100 * ONE);
        assertEq(usd.balanceOf(ada), paid);
        assertEq(vault.balanceOf(creator) + paid, 500 * ONE);
    }

    function testFuzz_DepositWithdrawAccounting(uint96 dep, uint96 wd) public {
        uint256 d = bound(dep, 1, 500 * ONE);
        uint256 w = bound(wd, 1, 1_000 * ONE);
        vm.startPrank(creator);
        vault.deposit(d);
        uint256 bal = 500 * ONE + d;
        if (w > bal) {
            vm.expectRevert(abi.encodeWithSelector(PayboundVault.InsufficientBalance.selector, bal, w));
            vault.withdraw(w);
        } else {
            vault.withdraw(w);
            assertEq(vault.balanceOf(creator), bal - w);
        }
        vm.stopPrank();
        assertEq(usd.balanceOf(address(vault)), vault.balanceOf(creator));
    }
}
