// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EliosStaking} from "../contracts/src/EliosStaking.sol";

/**
 * @notice Deploys the EliosStaking contract.
 *
 *         Required env vars:
 *           DEPLOYER_PRIVATE_KEY  Hex private key for the deployer EOA.
 *           ELIOS_TOKEN_ADDRESS   Address of the deployed $ELIOS ERC20.
 *                                 On Base mainnet this is the canonical
 *                                 EliosBase token at
 *                                 0x002B28FA26982Da609f069383Ee424b4D36f1b07.
 *
 *         Optional env vars:
 *           STAKING_OWNER         Address that will own the deployed
 *                                 staking contract (slash + cooldown).
 *                                 Defaults to the deployer if unset. See
 *                                 STAKING_OWNER_TODO.md — the long-term
 *                                 plan is for this to be a multisig
 *                                 before any production launch.
 *           STAKING_COOLDOWN      Initial unstake cooldown in seconds.
 *                                 Defaults to 7 days. Bounded by
 *                                 EliosStaking.MAX_COOLDOWN (30 days).
 *
 *         Example:
 *           DEPLOYER_PRIVATE_KEY=0x... \
 *           ELIOS_TOKEN_ADDRESS=0x002B28FA26982Da609f069383Ee424b4D36f1b07 \
 *           forge script script/DeployStaking.s.sol --rpc-url base --broadcast --verify
 */
contract DeployEliosStaking is Script {
    uint64 internal constant DEFAULT_COOLDOWN = 7 days;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address eliosToken = vm.envAddress("ELIOS_TOKEN_ADDRESS");
        address deployer = vm.addr(deployerKey);

        // Owner defaults to the deployer EOA. The deployer is expected
        // to immediately transfer ownership to a multisig before any
        // user funds enter the contract — see STAKING_OWNER_TODO.md.
        address owner = vm.envOr("STAKING_OWNER", deployer);
        uint64 cooldown = uint64(vm.envOr("STAKING_COOLDOWN", uint256(DEFAULT_COOLDOWN)));

        console.log("Deployer:        ", deployer);
        console.log("ELIOS token:     ", eliosToken);
        console.log("Initial owner:   ", owner);
        console.log("Cooldown (sec):  ", cooldown);

        vm.startBroadcast(deployerKey);

        EliosStaking staking = new EliosStaking(eliosToken, owner, cooldown);

        vm.stopBroadcast();

        console.log("EliosStaking deployed to:", address(staking));
        console.log("Owner:                   ", staking.owner());
        console.log("Cooldown:                ", staking.unstakeCooldown());

        if (owner == deployer) {
            console.log("");
            console.log("WARNING: owner == deployer EOA.");
            console.log("Transfer ownership to a multisig before launch.");
            console.log("See STAKING_OWNER_TODO.md.");
        }
    }
}
