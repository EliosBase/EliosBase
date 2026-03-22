// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EliosEscrow} from "../contracts/src/EliosEscrow.sol";

contract DeployEliosEscrow is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        EliosEscrow escrow = new EliosEscrow();

        vm.stopBroadcast();

        console.log("EliosEscrow deployed to:", address(escrow));
        console.log("Owner:", escrow.owner());
    }
}
