# Contracts And Circuits Runbook

## Contracts

### Escrow

- Source: `contracts/src/EliosEscrow.sol`
- Deploy first.
- Record the deployed address in `NEXT_PUBLIC_ESCROW_ADDRESS`.

### Proof Verifier

- Source: `contracts/src/EliosProofVerifier.sol`
- Requires the Groth16 verifier address at deploy time.
- Record the deployed address in `NEXT_PUBLIC_VERIFIER_ADDRESS`.

## Circuit Artifacts

- Circuit source: `circuits/TaskCompletion.circom`
- Runtime artifacts expected by the frontend:
  - `frontend/public/circuits/TaskCompletion.wasm`
  - `frontend/public/circuits/TaskCompletion_final.zkey`

Keep the contract deployment, circuit artifacts, and runtime env vars in sync. A mismatched verifier or stale circuit artifact will break proof completion.

## Proof Submitter

- `frontend/src/lib/proofSubmitter.ts` expects `PROOF_SUBMITTER_PRIVATE_KEY`.
- The submitter account needs enough ETH on the target chain for proof verification transactions.
- Rotate the key through secret management, not through committed files.
