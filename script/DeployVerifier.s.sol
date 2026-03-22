// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Groth16Verifier} from "../contracts/src/Groth16Verifier.sol";
import {EliosProofVerifier} from "../contracts/src/EliosProofVerifier.sol";

contract DeployVerifier is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        Groth16Verifier groth16 = new Groth16Verifier();
        console.log("Groth16Verifier deployed to:", address(groth16));

        EliosProofVerifier verifier = new EliosProofVerifier(address(groth16));
        console.log("EliosProofVerifier deployed to:", address(verifier));

        vm.stopBroadcast();
    }
}
