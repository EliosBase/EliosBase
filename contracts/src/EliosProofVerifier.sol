// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[1] calldata _pubSignals
    ) external view returns (bool);
}

/**
 * @title EliosProofVerifier
 * @notice Verifies Groth16 ZK proofs for task completion and records results on-chain.
 *         Works alongside the immutable EliosEscrow contract.
 */
contract EliosProofVerifier {
    IGroth16Verifier public immutable groth16;
    address public immutable owner;

    // taskId (bytes32) => verified
    mapping(bytes32 => bool) public taskVerified;
    // taskId => commitment hash
    mapping(bytes32 => uint256) public taskCommitment;

    event ProofVerified(bytes32 indexed taskId, uint256 commitment, address submitter);
    event ProofRejected(bytes32 indexed taskId, address submitter);

    error AlreadyVerified();
    error InvalidProof();

    constructor(address _groth16Verifier) {
        groth16 = IGroth16Verifier(_groth16Verifier);
        owner = msg.sender;
    }

    /// @notice Verify a Groth16 proof for a task and record result.
    function verifyTaskProof(
        bytes32 taskId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[1] calldata _pubSignals
    ) external {
        if (taskVerified[taskId]) revert AlreadyVerified();

        bool valid = groth16.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!valid) {
            emit ProofRejected(taskId, msg.sender);
            revert InvalidProof();
        }

        taskVerified[taskId] = true;
        taskCommitment[taskId] = _pubSignals[0];

        emit ProofVerified(taskId, _pubSignals[0], msg.sender);
    }

    /// @notice Check if a task has been ZK-verified.
    function isVerified(bytes32 taskId) external view returns (bool) {
        return taskVerified[taskId];
    }
}
