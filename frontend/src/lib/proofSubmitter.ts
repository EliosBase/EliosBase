import { createWalletClient, createPublicClient, http, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { getBaseRpcTransport, getBaseRpcUrl } from '@/lib/baseRpc';
import { readEnv, readRequiredEnv } from '@/lib/env';
import { VERIFIER_ABI, VERIFIER_CONTRACT_ADDRESS } from './contracts';
import { formatProofForContract, type ZkProofResult } from './zkProof';

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';
const chain = isTestnet ? baseSepolia : base;
const rpcUrl = getBaseRpcUrl(isTestnet);

/**
 * Submit a ZK proof to the EliosProofVerifier contract on-chain.
 * Returns the transaction hash on success.
 */
export async function submitProofOnChain(
  taskId: string,
  proofResult: ZkProofResult
): Promise<string> {
  const privateKey = readRequiredEnv(
    'PROOF_SUBMITTER_PRIVATE_KEY',
    process.env.PROOF_SUBMITTER_PRIVATE_KEY,
  );

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: getBaseRpcTransport(isTestnet),
  });

  const taskIdBytes32 = stringToHex(taskId, { size: 32 });
  const { pA, pB, pC, pubSignals } = formatProofForContract(proofResult);

  const txHash = await walletClient.writeContract({
    address: VERIFIER_CONTRACT_ADDRESS,
    abi: VERIFIER_ABI,
    functionName: 'verifyTaskProof',
    args: [taskIdBytes32, pA, pB, pC, pubSignals],
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('Proof verification transaction reverted');
  }

  return txHash;
}
