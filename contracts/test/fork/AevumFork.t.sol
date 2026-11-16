// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {PayeeRegistry} from "../../src/PayeeRegistry.sol";
import {PayboundVault} from "../../src/PayboundVault.sol";

/// Runs the happy path against the *real* tUSD8 contract on an Aevum fork.
/// Skipped unless FORK=1:  FORK=1 forge test --match-contract AevumFork
contract AevumForkTest is Test {
    IERC20Metadata constant TUSD8 = IERC20Metadata(0x456569838f1d43009A91ebA4263147Afd7233483);

    function test_HappyPathOnRealTUSD8() public {
        if (!vm.envOr("FORK", false)) return;
        vm.createSelectFork(vm.envOr("AEVUM_RPC_URL", string("https://rpc-test.qday.info")));
        assertEq(block.chainid, 44005);
        assertEq(TUSD8.decimals(), 6);

        address creator = makeAddr("creator");
        address ada = makeAddr("ada");
        PayeeRegistry reg = new PayeeRegistry();
        PayboundVault vault = new PayboundVault(TUSD8, reg, address(this));
        deal(address(TUSD8), creator, 100e6);

        vm.startPrank(creator);
        TUSD8.approve(address(vault), 100e6);
        vault.deposit(100e6);
        uint256 id = reg.addPayee("Ada", ada);
        reg.confirmPayee(id, ada);
        vault.setPayeeLimit(id, 30e6, 50e6, 1 days, uint64(block.timestamp + 7 days));
        vault.pay(creator, id, 25e6, keccak256("draft-1"), "November thread");
        vm.expectRevert(
            abi.encodeWithSelector(PayboundVault.PaymentBlocked.selector, PayboundVault.Blocker.OverPayeePeriodCap)
        );
        vault.pay(creator, id, 26e6, bytes32(0), "");
        vm.stopPrank();
        assertEq(TUSD8.balanceOf(ada), 25e6);
        assertEq(vault.balanceOf(creator), 75e6);
    }
}
