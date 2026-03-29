import Safe, {
  EthSafeSignature,
  type PredictedSafeProps,
} from '@safe-global/protocol-kit';
import {
  createWalletClient,
  getAddress,
  isAddress,
  keccak256,
  parseEther,
  stringToHex,
  zeroAddress,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { ESCROW_CONTRACT_ADDRESS, VERIFIER_CONTRACT_ADDRESS } from '@/lib/contracts';
import { readEnv, readFloatEnv, readIntEnv, readRequiredEnv } from '@/lib/env';
import { publicClient } from '@/lib/viemClient';
import type { AgentWalletPolicy, AgentWalletStatus } from '@/lib/types';

type AgentWalletRecord = {
  id: string;
  wallet_address?: string | null;
  wallet_policy?: AgentWalletPolicy | null;
  wallet_status?: AgentWalletStatus | null;
  users?: { wallet_address?: string | null } | Array<{ wallet_address?: string | null }> | null;
};

type AgentWalletProvisioning = {
  address: Address;
  policy: AgentWalletPolicy;
  status: AgentWalletStatus;
};

type AgentWalletTransferDecision = {
  status: 'blocked' | 'queued' | 'approved';
  policyReason: string;
  approvalsRequired: number;
  approvalsReceived: number;
  unlockAt: string | null;
};

type PreparedAgentWalletTransfer = {
  safeTxHash: Hex;
  txData: AgentWalletTransactionData;
  chainId: number;
  safeVersion: string;
};

export type AgentWalletTransactionData = {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
};

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';
const chain = isTestnet ? baseSepolia : base;
const rpcUrl = readEnv(process.env.BASE_RPC_URL)
  || (isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org');

function getOptionalPolicySignerPrivateKey() {
  return readEnv(process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY)
    || readEnv(process.env.PROOF_SUBMITTER_PRIVATE_KEY);
}

function getRequiredPolicySignerPrivateKey() {
  return readRequiredEnv(
    'SAFE_POLICY_SIGNER_PRIVATE_KEY or PROOF_SUBMITTER_PRIVATE_KEY',
    process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY || process.env.PROOF_SUBMITTER_PRIVATE_KEY,
  ) as Hex;
}

export function getPolicySignerAddress() {
  const privateKey = getOptionalPolicySignerPrivateKey();
  if (!privateKey) {
    return undefined;
  }

  return privateKeyToAccount(privateKey as Hex).address;
}

function getWalletOwners(ownerWallet: Address) {
  const policySigner = getPolicySignerAddress();
  if (!policySigner) {
    throw new Error('Agent wallet policy signer is not configured');
  }

  return [getAddress(ownerWallet), getAddress(policySigner)];
}

function getWalletSaltNonce(agentId: string) {
  return BigInt(keccak256(stringToHex(agentId))).toString();
}

function getDefaultBlockedDestinations() {
  const configured = (readEnv(process.env.AGENT_WALLET_BLOCKED_DESTINATIONS) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      [zeroAddress, ESCROW_CONTRACT_ADDRESS, VERIFIER_CONTRACT_ADDRESS, ...configured]
        .filter((value): value is Address => isAddress(value)),
    ),
  );
}

export function buildAgentWalletPolicy(ownerWallet: Address): AgentWalletPolicy {
  const owners = getWalletOwners(ownerWallet);

  return {
    standard: 'safe',
    owner: getAddress(ownerWallet),
    policySigner: owners[1],
    owners,
    threshold: 2,
    dailySpendLimitEth: readFloatEnv(process.env.AGENT_WALLET_DAILY_LIMIT_ETH, 0.5).toFixed(2),
    autoApproveThresholdEth: readFloatEnv(
      process.env.AGENT_WALLET_AUTO_APPROVE_THRESHOLD_ETH || process.env.AGENT_WALLET_COSIGN_THRESHOLD_ETH,
      0.25,
    ).toFixed(2),
    reviewThresholdEth: readFloatEnv(process.env.AGENT_WALLET_COSIGN_THRESHOLD_ETH, 0.25).toFixed(2),
    timelockThresholdEth: readFloatEnv(process.env.AGENT_WALLET_TIMELOCK_THRESHOLD_ETH, 1).toFixed(2),
    timelockSeconds: readIntEnv(process.env.AGENT_WALLET_TIMELOCK_SECONDS, 24 * 60 * 60),
    blockedDestinations: getDefaultBlockedDestinations(),
    allowlistedContracts: [],
  };
}

export function createPredictedAgentSafe(agentId: string, ownerWallet: Address): PredictedSafeProps {
  const policy = buildAgentWalletPolicy(ownerWallet);

  return {
    safeAccountConfig: {
      owners: policy.owners,
      threshold: policy.threshold,
    },
    safeDeploymentConfig: {
      saltNonce: getWalletSaltNonce(agentId),
    },
  };
}

export async function predictAgentWalletAddress(agentId: string, ownerWallet: Address) {
  const safe = await Safe.init({
    provider: rpcUrl,
    predictedSafe: createPredictedAgentSafe(agentId, ownerWallet),
  });

  return getAddress(await safe.getAddress());
}

async function isSafeDeployed(address: Address) {
  const bytecode = await publicClient.getBytecode({ address });
  return !!bytecode && bytecode !== '0x';
}

async function deployPredictedSafe(agentId: string, ownerWallet: Address, address: Address) {
  if (await isSafeDeployed(address)) {
    return 'active' as const;
  }

  const privateKey = getRequiredPolicySignerPrivateKey();
  const account = privateKeyToAccount(privateKey);
  const safe = await Safe.init({
    provider: rpcUrl,
    signer: privateKey,
    predictedSafe: createPredictedAgentSafe(agentId, ownerWallet),
  });
  const deployment = await safe.createSafeDeploymentTransaction();
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.sendTransaction({
    account,
    to: getAddress(deployment.to),
    data: deployment.data as Hex,
    value: BigInt(deployment.value),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== 'success') {
    throw new Error('Safe deployment transaction reverted');
  }

  return 'active' as const;
}

export async function provisionAgentWallet(agentId: string, ownerWallet: Address): Promise<AgentWalletProvisioning> {
  const policy = buildAgentWalletPolicy(ownerWallet);
  const address = await predictAgentWalletAddress(agentId, ownerWallet);

  try {
    const status = await deployPredictedSafe(agentId, ownerWallet, address);
    return { address, policy, status };
  } catch (error) {
    console.error('[agent-wallet] failed to deploy Safe:', error);
    return { address, policy, status: 'predicted' };
  }
}

export async function resolveAgentWallet(record: AgentWalletRecord): Promise<AgentWalletProvisioning | null> {
  if (record.wallet_address && record.wallet_policy) {
    return {
      address: getAddress(record.wallet_address),
      policy: record.wallet_policy,
      status: record.wallet_status ?? 'predicted',
    };
  }

  const ownerRelation = Array.isArray(record.users) ? record.users[0] : record.users;
  const ownerWallet = ownerRelation?.wallet_address;
  if (!ownerWallet || !isAddress(ownerWallet)) {
    return null;
  }

  const policy = buildAgentWalletPolicy(ownerWallet);
  const address = await predictAgentWalletAddress(record.id, ownerWallet);

  return {
    address,
    policy,
    status: 'predicted',
  };
}

type AgentWalletTransferShape = {
  safeAddress: Address;
  destination: Address;
  amountEth: string;
};

function toSafeTransferValue(amountEth: string) {
  return parseEther(amountEth).toString();
}

async function createSafeTransferTransaction(
  safeAddress: Address,
  transfer: AgentWalletTransferShape,
  nonce?: number,
  signer?: Hex,
) {
  const safe = await Safe.init({
    provider: rpcUrl,
    signer,
    safeAddress,
  });
  const safeTransaction = await safe.createTransaction({
    transactions: [{
      to: transfer.destination,
      value: toSafeTransferValue(transfer.amountEth),
      data: '0x',
      operation: 0,
    }],
    options: nonce === undefined ? undefined : { nonce },
  });

  return { safe, safeTransaction };
}

export async function prepareAgentWalletTransferExecution(
  transfer: AgentWalletTransferShape,
  nonce?: number,
): Promise<PreparedAgentWalletTransfer> {
  if (!await isSafeDeployed(transfer.safeAddress)) {
    throw new Error('Agent Safe is not deployed on Base yet');
  }

  const { safe, safeTransaction } = await createSafeTransferTransaction(transfer.safeAddress, transfer, nonce);

  return {
    safeTxHash: await safe.getTransactionHash(safeTransaction) as Hex,
    txData: safeTransaction.data,
    chainId: Number(await safe.getChainId()),
    safeVersion: safe.getContractVersion(),
  };
}

function sameHexValue(left: string, right: string) {
  return BigInt(left) === BigInt(right);
}

export async function executeAgentWalletTransfer(params: {
  safeAddress: Address;
  destination: Address;
  amountEth: string;
  ownerAddress: Address;
  ownerSignature: Hex;
  txData: AgentWalletTransactionData;
}): Promise<{ hash: Hex; blockNumber: number }> {
  if (!await isSafeDeployed(params.safeAddress)) {
    throw new Error('Agent Safe is not deployed on Base yet');
  }

  const { safe, safeTransaction } = await createSafeTransferTransaction(
    params.safeAddress,
    {
      safeAddress: params.safeAddress,
      destination: params.destination,
      amountEth: params.amountEth,
    },
    params.txData.nonce,
    getRequiredPolicySignerPrivateKey(),
  );

  if (!sameHexValue(safeTransaction.data.value, params.txData.value)) {
    throw new Error('Prepared Safe transfer value does not match the approved transfer');
  }
  if (getAddress(safeTransaction.data.to) !== getAddress(params.txData.to)) {
    throw new Error('Prepared Safe transfer destination does not match the approved transfer');
  }
  if ((params.txData.data ?? '0x') !== '0x') {
    throw new Error('Agent Safe transfers only support direct ETH sends');
  }

  safeTransaction.addSignature(new EthSafeSignature(getAddress(params.ownerAddress), params.ownerSignature));
  const signedTransaction = await safe.signTransaction(safeTransaction);
  const execution = await safe.executeTransaction(signedTransaction);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: execution.hash as Hex,
  });

  if (receipt.status !== 'success') {
    throw new Error('Agent Safe execution reverted onchain');
  }

  return {
    hash: execution.hash as Hex,
    blockNumber: Number(receipt.blockNumber),
  };
}

function parsePolicyAmount(value: string) {
  return parseEther(value);
}

export async function evaluateAgentWalletTransfer(params: {
  safeAddress: Address;
  destination: string;
  amountEth: string;
  policy: AgentWalletPolicy;
  spentTodayEth: string;
}): Promise<AgentWalletTransferDecision> {
  if (!isAddress(params.destination)) {
    return {
      status: 'blocked',
      policyReason: 'Destination must be a valid Base address.',
      approvalsRequired: 0,
      approvalsReceived: 0,
      unlockAt: null,
    };
  }

  const destination = getAddress(params.destination);
  const blocked = new Set(params.policy.blockedDestinations.map((address) => getAddress(address)));
  const safeAddress = getAddress(params.safeAddress);

  if (destination === safeAddress) {
    return {
      status: 'blocked',
      policyReason: 'Agent Safe cannot send funds back to itself.',
      approvalsRequired: 0,
      approvalsReceived: 0,
      unlockAt: null,
    };
  }

  if (blocked.has(destination)) {
    return {
      status: 'blocked',
      policyReason: 'Destination is blocked by the agent wallet policy.',
      approvalsRequired: 0,
      approvalsReceived: 0,
      unlockAt: null,
    };
  }

  try {
    const bytecode = await publicClient.getBytecode({ address: destination });
    if (bytecode && bytecode !== '0x') {
      return {
        status: 'blocked',
        policyReason: 'Unapproved contract destinations are blocked automatically.',
        approvalsRequired: 0,
        approvalsReceived: 0,
        unlockAt: null,
      };
    }
  } catch {
    // If RPC classification fails, keep the transfer reviewable rather than auto-blocking it.
  }

  const amountWei = parsePolicyAmount(params.amountEth);
  const spentTodayWei = parsePolicyAmount(params.spentTodayEth);
  const dailyLimitWei = parsePolicyAmount(params.policy.dailySpendLimitEth);

  if (spentTodayWei + amountWei > dailyLimitWei) {
    return {
      status: 'blocked',
      policyReason: `Daily spend limit of ${params.policy.dailySpendLimitEth} ETH would be exceeded.`,
      approvalsRequired: 0,
      approvalsReceived: 0,
      unlockAt: null,
    };
  }

  const requiresCoSign = amountWei >= parsePolicyAmount(params.policy.reviewThresholdEth);
  const requiresTimelock = amountWei >= parsePolicyAmount(params.policy.timelockThresholdEth);
  const unlockAt = requiresTimelock
    ? new Date(Date.now() + params.policy.timelockSeconds * 1000).toISOString()
    : null;

  if (requiresCoSign || requiresTimelock) {
    const policyReason = requiresTimelock
      ? `Transfer is queued behind a ${Math.round(params.policy.timelockSeconds / 3600)}h timelock and operator co-approval.`
      : 'Transfer requires operator co-approval before Safe execution.';

    return {
      status: 'queued',
      policyReason,
      approvalsRequired: 2,
      approvalsReceived: 1,
      unlockAt,
    };
  }

  return {
    status: 'approved',
    policyReason: 'Transfer is within the agent Safe auto-approval lane.',
    approvalsRequired: 1,
    approvalsReceived: 1,
    unlockAt: null,
  };
}
