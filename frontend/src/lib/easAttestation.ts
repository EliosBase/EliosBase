import { createWalletClient, createPublicClient, http, encodeAbiParameters, parseAbiParameters, stringToHex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readRequiredEnv } from '@/lib/env';

const EAS_CONTRACT = '0x4200000000000000000000000000000000000021' as const;

const EAS_ABI = [
  {
    type: 'function',
    name: 'attest',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const;

interface TaskAttestationData {
  taskId: string;
  agentId: string;
  submitterAddress: string;
  reward: string;
  zkProofHash: string;
  completedAt: number;
}

function toBytes32(value: string): `0x${string}` {
  return stringToHex(value, { size: 32 });
}

export async function mintTaskCompletionAttestation(data: TaskAttestationData): Promise<{
  attestationUid: string;
  txHash: string;
}> {
  const privKey = readRequiredEnv('PROOF_SUBMITTER_PRIVATE_KEY', process.env.PROOF_SUBMITTER_PRIVATE_KEY);
  const schemaUid = process.env.EAS_SCHEMA_UID;

  if (!schemaUid) {
    throw new Error('EAS_SCHEMA_UID not configured');
  }

  const account = privateKeyToAccount(privKey as `0x${string}`);

  const walletClient = createWalletClient({
    chain: base,
    account,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  // Encode attestation data matching the schema:
  // bytes32 taskId, bytes32 agentId, address submitter, string reward, bytes32 zkProofHash, uint64 completedAt
  const encodedData = encodeAbiParameters(
    parseAbiParameters('bytes32, bytes32, address, string, bytes32, uint64'),
    [
      toBytes32(data.taskId),
      toBytes32(data.agentId),
      data.submitterAddress as `0x${string}`,
      data.reward,
      (data.zkProofHash.startsWith('0x') ? data.zkProofHash : `0x${data.zkProofHash}`) as `0x${string}`,
      BigInt(data.completedAt),
    ],
  );

  // The recipient of the attestation is the agent's submitter (task creator gets reputation proof)
  const txHash = await walletClient.writeContract({
    address: EAS_CONTRACT,
    abi: EAS_ABI,
    functionName: 'attest',
    args: [
      {
        schema: schemaUid as `0x${string}`,
        data: {
          recipient: data.submitterAddress as `0x${string}`,
          expirationTime: 0n, // No expiration
          revocable: false,
          refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
          data: encodedData,
          value: 0n,
        },
      },
    ],
    value: 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Attestation UID is in the first log's first topic (after the event signature)
  const attestationUid = receipt.logs[0]?.topics[1] ?? txHash;

  return {
    attestationUid,
    txHash,
  };
}
