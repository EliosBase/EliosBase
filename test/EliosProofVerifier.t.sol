// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/src/EliosProofVerifier.sol";

contract MockGroth16Verifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool value) external {
        shouldVerify = value;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[1] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}

contract EliosProofVerifierTest is Test {
    MockGroth16Verifier private groth16;
    EliosProofVerifier private verifier;

    bytes32 private taskId = keccak256("task-1");
    uint[2] private pA;
    uint[2][2] private pB;
    uint[2] private pC;
    uint[1] private pubSignals;

    function setUp() public {
        groth16 = new MockGroth16Verifier();
        verifier = new EliosProofVerifier(address(groth16));
        pubSignals[0] = 123456789;
    }

    function testVerifyTaskProofRecordsCommitment() public {
        verifier.verifyTaskProof(taskId, pA, pB, pC, pubSignals);

        assertTrue(verifier.isVerified(taskId));
        assertEq(verifier.taskCommitment(taskId), pubSignals[0]);
    }

    function testRejectsInvalidProof() public {
        groth16.setShouldVerify(false);

        vm.expectRevert(EliosProofVerifier.InvalidProof.selector);
        verifier.verifyTaskProof(taskId, pA, pB, pC, pubSignals);
    }

    function testCannotVerifyTwice() public {
        verifier.verifyTaskProof(taskId, pA, pB, pC, pubSignals);

        vm.expectRevert(EliosProofVerifier.AlreadyVerified.selector);
        verifier.verifyTaskProof(taskId, pA, pB, pC, pubSignals);
    }
}
