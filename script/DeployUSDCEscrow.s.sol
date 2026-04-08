// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/src/EliosUSDCEscrow.sol";

contract DeployUSDCEscrow is Script {
    // USDC on Base mainnet
    address constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        vm.startBroadcast();
        EliosUSDCEscrow escrow = new EliosUSDCEscrow(USDC_BASE);
        vm.stopBroadcast();

        console.log("EliosUSDCEscrow deployed at:", address(escrow));
    }
}
