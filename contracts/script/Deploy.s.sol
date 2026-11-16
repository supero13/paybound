// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PayeeRegistry} from "../src/PayeeRegistry.sol";
import {PayboundVault} from "../src/PayboundVault.sol";

/// Usage (from contracts/):
///   source ../.env && forge script script/Deploy.s.sol --rpc-url aevum --broadcast --legacy
contract Deploy is Script {
    address constant TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483; // official, 6 decimals

    function run() external returns (PayeeRegistry reg, PayboundVault vault) {
        require(block.chainid == 44005 || block.chainid == 31337, "Aevum testnet (44005) only");
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address guardian = vm.envOr("GUARDIAN_ADDRESS", deployer);
        vm.startBroadcast(pk);
        reg = new PayeeRegistry();
        vault = new PayboundVault(IERC20(TUSD8), reg, guardian);
        vm.stopBroadcast();
        console2.log("PayeeRegistry:", address(reg));
        console2.log("PayboundVault:", address(vault));
        console2.log("Guardian:", guardian);
    }
}
