import * as snarkjs from 'snarkjs';
import { readFile } from 'fs/promises';
import path from 'path';
import { poseidon3 } from 'poseidon-lite';
import { keccak256, toBytes } from 'viem';

const BN128_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Convert a string ID to a field element for the circuit.
 */
function stringToField(s: string): bigint {
  const hash = keccak256(toBytes(s));
  return BigInt(hash) % BN128_SCALAR_FIELD;
}

export interface ZkProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  commitment: string;
}

/**
 * Generate a Groth16 proof for task completion.
 * Reads circuit artifacts from the filesystem at runtime (server-side only).
 */
export async function generateTaskProof(
  taskId: string,
  agentId: string,
  resultData: string
): Promise<ZkProofResult> {
  const taskField = stringToField(taskId);
  const agentField = stringToField(agentId);
  const resultField = stringToField(resultData);

  // Compute expected commitment
  const commitment = poseidon3([taskField, agentField, resultField]);

  const input = {
    taskId: taskField.toString(),
    agentId: agentField.toString(),
    resultHash: resultField.toString(),
  };

  // Read circuit artifacts at runtime
  const wasmPath = path.join(process.cwd(), 'public/circuits/TaskCompletion.wasm');
  const zkeyPath = path.join(process.cwd(), 'public/circuits/TaskCompletion_final.zkey');

  const wasmBuffer = await readFile(wasmPath);
  const zkeyBuffer = await readFile(zkeyPath);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    new Uint8Array(wasmBuffer),
    new Uint8Array(zkeyBuffer)
  );

  return {
    proof,
    publicSignals,
    commitment: commitment.toString(),
  };
}

/**
 * Format proof for Solidity contract call.
 * snarkjs proof format → Solidity verifyProof parameters.
 */
export function formatProofForContract(proofResult: ZkProofResult) {
  const { proof, publicSignals } = proofResult;
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as [[bigint, bigint], [bigint, bigint]],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
    pubSignals: [BigInt(publicSignals[0])] as [bigint],
  };
}
