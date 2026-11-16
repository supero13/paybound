// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayeeRegistry} from "../src/PayeeRegistry.sol";

contract PayeeRegistryTest is Test {
    PayeeRegistry reg;
    address creator = makeAddr("creator");
    address ada = makeAddr("ada");
    address lookalike = address(uint160(uint256(uint160(makeAddr("ada"))) ^ 1));

    function setUp() public {
        reg = new PayeeRegistry();
    }

    function _add(string memory label, address w) internal returns (uint256 id) {
        vm.prank(creator);
        id = reg.addPayee(label, w);
    }

    function test_AddIsPendingAndNotPayable() public {
        uint256 id = _add("Ada", ada);
        assertEq(id, 1);
        PayeeRegistry.Payee memory p = reg.getPayee(creator, id);
        assertEq(uint8(p.status), uint8(PayeeRegistry.Status.Pending));
        assertEq(p.wallet, ada);
        assertEq(p.label, "Ada");
        (bool ok,) = reg.confirmedWallet(creator, id);
        assertFalse(ok);
        assertEq(reg.activePayeeIdOf(creator, ada), 1);
    }

    function test_ConfirmRequiresExactAddress() public {
        uint256 id = _add("Ada", ada);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.AddressMismatch.selector, ada, lookalike));
        reg.confirmPayee(id, lookalike);

        vm.prank(creator);
        reg.confirmPayee(id, ada);
        (bool ok, address w) = reg.confirmedWallet(creator, id);
        assertTrue(ok);
        assertEq(w, ada);
    }

    function test_ConfirmTwiceReverts() public {
        uint256 id = _add("Ada", ada);
        vm.startPrank(creator);
        reg.confirmPayee(id, ada);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotPending.selector, id));
        reg.confirmPayee(id, ada);
        vm.stopPrank();
    }

    function test_ConfirmDelayEnforced() public {
        vm.prank(creator);
        reg.setConfirmDelay(1 hours);
        uint256 id = _add("Ada", ada);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(PayeeRegistry.ConfirmTooEarly.selector, uint64(block.timestamp + 1 hours))
        );
        reg.confirmPayee(id, ada);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        reg.confirmPayee(id, ada);
    }

    function test_ConfirmDelayCapped() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.DelayTooLong.selector, uint64(7 days)));
        reg.setConfirmDelay(8 days);
    }

    function test_RejectsBadInputs() public {
        vm.startPrank(creator);
        vm.expectRevert(PayeeRegistry.ZeroAddress.selector);
        reg.addPayee("x", address(0));
        vm.expectRevert(PayeeRegistry.SelfPayee.selector);
        reg.addPayee("me", creator);
        vm.expectRevert(PayeeRegistry.InvalidLabel.selector);
        reg.addPayee("", ada);
        vm.expectRevert(PayeeRegistry.InvalidLabel.selector);
        reg.addPayee(string(new bytes(65)), ada);
        reg.addPayee("Ada", ada);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.AlreadyActive.selector, 1));
        reg.addPayee("Ada again", ada);
        vm.stopPrank();
    }

    function test_RemoveThenReAddNeedsFreshConfirm() public {
        uint256 id = _add("Ada", ada);
        vm.startPrank(creator);
        reg.confirmPayee(id, ada);
        reg.removePayee(id);
        (bool ok,) = reg.confirmedWallet(creator, id);
        assertFalse(ok);
        assertEq(reg.activePayeeIdOf(creator, ada), 0);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.UnknownPayee.selector, id));
        reg.removePayee(id);
        uint256 id2 = reg.addPayee("Ada", ada);
        vm.stopPrank();
        assertEq(id2, 2);
        (ok,) = reg.confirmedWallet(creator, id2);
        assertFalse(ok);
    }

    function test_CreatorsAreIsolated() public {
        uint256 id = _add("Ada", ada);
        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.UnknownPayee.selector, id));
        reg.confirmPayee(id, ada);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.UnknownPayee.selector, id));
        reg.removePayee(id);
        assertEq(reg.payeeCount(other), 0);
    }

    function test_UnknownIdsAreSafe() public view {
        (bool ok, address w) = reg.confirmedWallet(creator, 0);
        assertFalse(ok);
        assertEq(w, address(0));
        (ok,) = reg.confirmedWallet(creator, 99);
        assertFalse(ok);
    }

    function test_EmitsEvents() public {
        vm.expectEmit(true, true, true, true);
        emit PayeeRegistry.PayeeAdded(creator, 1, ada, "Ada");
        _add("Ada", ada);
        vm.expectEmit(true, true, true, true);
        emit PayeeRegistry.PayeeConfirmed(creator, 1, ada);
        vm.prank(creator);
        reg.confirmPayee(1, ada);
    }
}
