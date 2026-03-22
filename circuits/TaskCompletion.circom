pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";

// Proves: "I know taskId, agentId, resultHash such that
//          Poseidon(taskId, agentId, resultHash) == commitment"
template TaskCompletion() {
    // Private inputs (known only to the prover)
    signal input taskId;
    signal input agentId;
    signal input resultHash;

    // Public output (verified on-chain)
    signal output commitment;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== taskId;
    hasher.inputs[1] <== agentId;
    hasher.inputs[2] <== resultHash;

    commitment <== hasher.out;
}

component main = TaskCompletion();
