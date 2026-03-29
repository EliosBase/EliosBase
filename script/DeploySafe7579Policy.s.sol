// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EliosPolicyManager} from "../contracts/src/EliosPolicyManager.sol";
import {EliosPolicyHook} from "../contracts/src/EliosPolicyHook.sol";
import {EliosSafeGuard} from "../contracts/src/EliosSafeGuard.sol";

contract DeploySafe7579Policy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        EliosPolicyManager manager = new EliosPolicyManager();
        EliosSafeGuard guard = new EliosSafeGuard(address(manager));
        EliosPolicyHook hook = new EliosPolicyHook(address(manager));

        vm.stopBroadcast();

        console.log("EliosPolicyManager deployed to:", address(manager));
        console.log("EliosSafeGuard deployed to:", address(guard));
        console.log("EliosPolicyHook deployed to:", address(hook));
    }
}
