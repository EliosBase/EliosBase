import crypto from 'node:crypto';
import fs from 'node:fs';
import Safe from '@safe-global/protocol-kit';
import {
  getSmartSessionsCompatibilityFallback,
  getSmartSessionsValidator,
} from '@rhinestone/module-sdk';
import { sealData } from 'iron-session';
import { SiweMessage } from 'siwe';
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  fallback,
  formatEther,
  getAddress,
  http,
  parseAbi,
  parseAbiParameters,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

hydrateEnvFile(process.env.ELIOS_ENV_FILE ?? '/tmp/elios-prod.env');

const baseUrl = (process.env.ELIOS_BASE_URL ?? 'https://eliosbase.net').replace(/\/$/, '');
const origin = new URL(baseUrl).origin;
const domain = new URL(baseUrl).host;
const rpcUrls = buildRpcUrls(process.env.BASE_RPC_URL);
const rpcUrl = rpcUrls[0];
const chainId = Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? 8453);
const sessionSecret = requiredEnv('SESSION_SECRET');
const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const policySignerPrivateKey = requiredEnv(
  'SAFE_POLICY_SIGNER_PRIVATE_KEY',
  process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY ?? process.env.PROOF_SUBMITTER_PRIVATE_KEY,
);

const publicClient = createPublicClient({
  chain: base,
  transport: fallback(rpcUrls.map((url) => http(url, { timeout: 10_000 }))),
});
const policySigner = privateKeyToAccount(policySignerPrivateKey);
const policyWalletClient = createWalletClient({
  account: policySigner,
  chain: base,
  transport: http(rpcUrl),
});
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const SAFE_FALLBACK_HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
const SAFE_GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
const ACCOUNT_7579_STATE_ABI = parseAbi([
  'function isModuleInstalled(uint256 moduleTypeId,address module,bytes additionalContext) external view returns (bool)',
  'function getValidatorsPaginated(address cursor,uint256 pageSize) external view returns (address[] memory,address)',
  'function getActiveHook() external view returns (address)',
]);
const SENTINEL_ADDRESS = '0x0000000000000000000000000000000000000001';

async function main() {
  logStep('authenticating owner');
  const ownerPrivateKey = `0x${crypto.randomBytes(32).toString('hex')}`;
  const owner = privateKeyToAccount(ownerPrivateKey);
  const sessionDestination = privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`).address;
  const reviewedDestination = privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`).address;
  const ownerJar = new CookieJar();

  const auth = await authenticateOwner(ownerJar, owner);
  logStep('loading operator');
  const operator = await loadOperator();
  const operatorCookie = await sealSessionCookie({
    userId: operator.id,
    walletAddress: operator.wallet_address,
    chainId,
    role: operator.role,
  });

  logStep('registering agent');
  const agent = await registerAgent(ownerJar);
  const safeAddress = getAddress(agent.walletAddress);
  const policy = agent.walletPolicy;
  const fundAmountEth = '0.000020';

  logStep(`funding safe ${safeAddress}`);
  const fundHash = await sendPolicyTransaction(policyWalletClient, policySigner.address, {
    account: policySigner,
    to: safeAddress,
    value: parseEther(fundAmountEth),
  });
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
  if (fundReceipt.status !== 'success') {
    throw new Error('Funding the agent Safe reverted');
  }

  logStep('preparing migration');
  const preparedMigration = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/safe7579/prepare`);
  logStep('signing migration');
  const migrationSignature = await signPreparedSafeExecution(ownerPrivateKey, safeAddress, preparedMigration);
  logStep('executing migration');
  const migration = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/safe7579/execute`, {
    ownerSignature: migrationSignature,
    txData: preparedMigration.txData,
  });

  logStep('preparing session rotation');
  const preparedSession = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/session/rotate`);
  logStep('signing session rotation');
  const sessionSignature = await signPreparedSafeExecution(ownerPrivateKey, safeAddress, preparedSession);
  logStep('executing session rotation');
  const enabledSession = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/session/execute`, {
    ownerSignature: sessionSignature,
    txData: preparedSession.txData,
    pendingSession: preparedSession.pendingSession,
  });

  logStep('verifying session status');
  const sessionStatus = await apiJson(ownerJar, 'GET', `/api/agents/${agent.id}/wallet/session`);
  if (!sessionStatus.sessionEnabled) {
    throw new Error('Safe7579 session key is not enabled after migration');
  }

  logStep('reading migrated agent');
  const migratedAgent = await fetchAgent(agent.id);
  const modules = migratedAgent.wallet_policy.__safe7579.modules;
  const installedModules = await readInstalledModules(safeAddress, modules.hook);
  const guard = await getStorageAddress(safeAddress, SAFE_GUARD_SLOT);
  const fallbackHandler = await getFallbackHandlerAddress(safeAddress);

  const sessionTransferAmount = normalizeAmount(policy.autoApproveThresholdEth);
  logStep('creating session transfer');
  const sessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers`, {
    destination: sessionDestination,
    amountEth: sessionTransferAmount,
    note: 'safe7579 session proof',
  });
  logStep('preparing session transfer');
  const preparedSessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${sessionTransfer.id}/prepare`);
  logStep('executing session transfer');
  const executedSessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${sessionTransfer.id}/execute`, {});
  const sessionTransferRecord = await fetchTransfer(agent.id, sessionTransfer.id);

  const reviewedTransferAmount = bumpAmount(policy.timelockThresholdEth, 1n);
  logStep('creating reviewed transfer');
  const reviewedTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers`, {
    destination: reviewedDestination,
    amountEth: reviewedTransferAmount,
    note: 'safe7579 reviewed proof',
  });
  if (!reviewedTransfer.unlockAt) {
    throw new Error('Reviewed transfer did not enter the timelock lane');
  }

  const waitMs = Math.max(0, new Date(reviewedTransfer.unlockAt).getTime() - Date.now()) + 2_000;
  logStep(`waiting ${waitMs}ms for timelock`);
  await sleep(waitMs);

  logStep('approving reviewed transfer');
  const approvedTransfer = await apiJson(
    null,
    'POST',
    `/api/agents/${agent.id}/wallet/transfers/${reviewedTransfer.id}/approve`,
    undefined,
    operatorCookie,
  );
  logStep('preparing reviewed transfer');
  const preparedReviewedTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${reviewedTransfer.id}/prepare`);
  logStep('signing reviewed transfer');
  const reviewedSignature = await signPreparedSafeExecution(ownerPrivateKey, safeAddress, preparedReviewedTransfer);
  logStep('executing reviewed transfer');
  const executedReviewedTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${reviewedTransfer.id}/execute`, {
    ownerSignature: reviewedSignature,
    txData: preparedReviewedTransfer.txData,
  });
  const reviewedTransferRecord = await fetchTransfer(agent.id, reviewedTransfer.id);

  const sessionDestinationBalance = await publicClient.getBalance({ address: getAddress(sessionDestination) });
  const reviewedDestinationBalance = await publicClient.getBalance({ address: getAddress(reviewedDestination) });
  const safeBalance = await publicClient.getBalance({ address: safeAddress });

  const result = {
    owner: {
      userId: auth.userId,
      walletAddress: auth.walletAddress,
    },
    operator: {
      userId: operator.id,
      walletAddress: operator.wallet_address,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      safeAddress,
    },
    funding: {
      amountEth: fundAmountEth,
      txHash: fundHash,
      blockNumber: Number(fundReceipt.blockNumber),
    },
    migration: {
      safeTxHash: migration.safeTxHash,
      managerTxHashes: migration.managerTxHashes,
      sessionEnableTxHash: enabledSession.safeTxHash,
      sessionPolicyTxHash: enabledSession.managerTxHash,
      sessionEnabled: sessionStatus.sessionEnabled,
      installedModules: {
        smartSessionsValidator: installedModules.smartSessionsValidator,
        compatibilityFallback: installedModules.compatibilityFallback,
        hook: installedModules.hook,
        guard: guard.toLowerCase() === modules.guard.toLowerCase(),
        fallbackHandler: fallbackHandler.toLowerCase() === modules.adapter.toLowerCase(),
      },
    },
    sessionTransfer: {
      id: sessionTransfer.id,
      executionMode: preparedSessionTransfer.executionMode,
      userOpHash: sessionTransferRecord.user_op_hash,
      txHash: sessionTransferRecord.tx_hash,
      destination: sessionDestination,
      destinationBalanceEth: formatEther(sessionDestinationBalance),
      executedAt: sessionTransferRecord.executed_at,
      response: executedSessionTransfer,
    },
    reviewedTransfer: {
      id: reviewedTransfer.id,
      unlockAt: reviewedTransfer.unlockAt,
      approvedAt: approvedTransfer.approvedAt,
      txHash: reviewedTransferRecord.tx_hash,
      policyTxHash: reviewedTransferRecord.policy_tx_hash,
      destination: reviewedDestination,
      destinationBalanceEth: formatEther(reviewedDestinationBalance),
      executedAt: reviewedTransferRecord.executed_at,
      response: executedReviewedTransfer,
    },
    policy: {
      standard: migratedAgent.wallet_policy.standard,
      threshold: migratedAgent.wallet_policy.threshold,
      reviewThresholdEth: migratedAgent.wallet_policy.reviewThresholdEth,
      timelockThresholdEth: migratedAgent.wallet_policy.timelockThresholdEth,
      timelockSeconds: migratedAgent.wallet_policy.timelockSeconds,
    },
    balances: {
      safeBalanceEth: formatEther(safeBalance),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

function requiredEnv(name, value = process.env[name]) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
  return String(value).trim();
}

function hydrateEnvFile(path) {
  if (!path || !fs.existsSync(path)) {
    return;
  }

  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    if (!key) continue;

    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '').trim();

    if (!value) continue;
    if (!process.env[key] || String(process.env[key]).includes('\\n')) {
      process.env[key] = value;
    }
  }
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  setFromResponse(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(';', 1);
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      this.map.set(name, value);
    }
  }

  header() {
    return Array.from(this.map.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

async function authenticateOwner(jar, owner) {
  const nonceResponse = await fetch(`${baseUrl}/api/auth/nonce`, { redirect: 'manual' });
  jar.setFromResponse(nonceResponse);
  const { nonce } = await nonceResponse.json();
  const message = new SiweMessage({
    domain,
    address: owner.address,
    statement: 'Sign in to EliosBase',
    uri: origin,
    version: '1',
    chainId,
    nonce,
  }).prepareMessage();
  const signature = await owner.signMessage({ message });
  const verifyResponse = await fetch(`${baseUrl}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: jar.header(),
    },
    body: JSON.stringify({ message, signature }),
  });
  jar.setFromResponse(verifyResponse);
  if (!verifyResponse.ok) {
    throw new Error(`Owner auth failed: ${await verifyResponse.text()}`);
  }
  return verifyResponse.json();
}

async function loadOperator() {
  const { data, error } = await supabase
    .from('users')
    .select('id,wallet_address,role')
    .in('role', ['operator', 'admin'])
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(`Failed to load operator session: ${error?.message ?? 'missing operator user'}`);
  }
  return data;
}

async function sealSessionCookie(session) {
  return sealData(session, {
    password: sessionSecret,
    ttl: 60 * 60 * 24,
  });
}

async function registerAgent(ownerJar) {
  const nonce = crypto.randomBytes(3).toString('hex');
  return apiJson(ownerJar, 'POST', '/api/agents/register', {
    name: `Safe7579 Proof ${nonce}`,
    description: 'Live Safe7579 proof agent',
    capabilities: ['prove', 'safe7579'],
    type: 'executor',
    pricePerTask: '0.0001 ETH',
  });
}

async function signPreparedSafeExecution(ownerPrivateKey, safeAddress, prepared) {
  const owner = privateKeyToAccount(ownerPrivateKey);
  const safe = await Safe.init({
    provider: rpcUrl,
    signer: ownerPrivateKey,
    safeAddress,
  });
  const safeTransaction = await safe.createTransaction({
    transactions: [{
      to: prepared.txData.to,
      value: prepared.txData.value,
      data: prepared.txData.data,
      operation: prepared.txData.operation,
    }],
    options: {
      nonce: prepared.txData.nonce,
      safeTxGas: prepared.txData.safeTxGas,
      baseGas: prepared.txData.baseGas,
      gasPrice: prepared.txData.gasPrice,
      gasToken: prepared.txData.gasToken,
      refundReceiver: prepared.txData.refundReceiver,
    },
  });
  const signed = await safe.signTransaction(safeTransaction);
  const signature = signed.getSignature(getAddress(owner.address))?.data
    ?? signed.getSignature(getAddress(owner.address).toLowerCase())?.data;
  if (!signature) {
    throw new Error('Owner signature not found in signed Safe transaction');
  }
  return signature;
}

async function apiJson(jar, method, path, body, manualCookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      ...(jar?.header() ? { cookie: jar.header() } : {}),
      ...(manualCookie ? { cookie: `eliosbase_session=${manualCookie}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.setFromResponse(response);
  const raw = await response.text();
  const payload = raw ? safeJsonParse(raw) ?? { error: raw } : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${payload.error ?? JSON.stringify(payload)}`);
  }
  return payload;
}

async function fetchAgent(id) {
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,wallet_address,wallet_policy')
    .eq('id', id)
    .single();
  if (error || !data) {
    throw new Error(`Failed to read agent ${id}: ${error?.message ?? 'missing row'}`);
  }
  return data;
}

async function fetchTransfer(agentId, transferId) {
  const { data, error } = await supabase
    .from('agent_wallet_transfers')
    .select('*')
    .eq('agent_id', agentId)
    .eq('id', transferId)
    .single();
  if (error || !data) {
    throw new Error(`Failed to read transfer ${transferId}: ${error?.message ?? 'missing row'}`);
  }
  return data;
}

async function readInstalledModules(safeAddress, hookAddress) {
  const smartSessions = getSmartSessionsValidator({
    hook: getAddress(hookAddress),
    sessions: [],
  });
  const rawCompatibilityFallback = getSmartSessionsCompatibilityFallback();
  const compatibilityFallback = {
    ...rawCompatibilityFallback,
    functionSig: rawCompatibilityFallback.selector,
  };
  const [validators, fallbackInstalled, hookInstalled] = await Promise.all([
    publicClient.readContract({
      address: getAddress(safeAddress),
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'getValidatorsPaginated',
      args: [SENTINEL_ADDRESS, 20n],
    }).catch(() => [[], SENTINEL_ADDRESS]),
    publicClient.readContract({
      address: getAddress(safeAddress),
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'isModuleInstalled',
      args: [
        3n,
        getAddress(compatibilityFallback.module),
        encodeAbiParameters(parseAbiParameters('bytes4 functionSig'), [compatibilityFallback.functionSig]),
      ],
    }).catch(() => false),
    publicClient.readContract({
      address: getAddress(safeAddress),
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'getActiveHook',
    }).then((activeHook) => getAddress(activeHook) === getAddress(hookAddress)).catch(() => false),
  ]);
  const [installedValidators] = validators;
  const smartSessionsInstalled = installedValidators
    .map((validator) => getAddress(validator))
    .includes(getAddress(smartSessions.module));

  return {
    smartSessionsValidator: smartSessionsInstalled,
    compatibilityFallback: fallbackInstalled,
    hook: hookInstalled,
  };
}

async function getFallbackHandlerAddress(safeAddress) {
  return getStorageAddress(safeAddress, SAFE_FALLBACK_HANDLER_SLOT);
}

async function getStorageAddress(safeAddress, slot) {
  const value = await publicClient.getStorageAt({
    address: getAddress(safeAddress),
    slot,
  });

  if (!value || value === '0x') {
    return '0x0000000000000000000000000000000000000000';
  }

  return getAddress(`0x${value.slice(-40)}`);
}

function normalizeAmount(amountEth) {
  return formatEther(parseEther(amountEth));
}

function bumpAmount(amountEth, weiDelta) {
  return formatEther(parseEther(amountEth) + weiDelta);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(message) {
  console.error(`[prove-safe7579-live] ${new Date().toISOString()} ${message}`);
}

async function sendPolicyTransaction(walletClient, address, request) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await getPendingEip1559TxParams(address, attempt);

    try {
      return await walletClient.sendTransaction({
        ...request,
        ...tx,
      });
    } catch (error) {
      if (attempt === 2 || !isUnderpricedTransactionError(error)) {
        throw error;
      }
    }
  }

  throw new Error('Policy funding fee retries exhausted');
}

async function getPendingEip1559TxParams(address, attempt = 0) {
  const [estimate, block, nonce] = await Promise.all([
    publicClient.estimateFeesPerGas({ type: 'eip1559' }).catch(() => undefined),
    publicClient.getBlock().catch(() => undefined),
    getMaxPendingNonce(address),
  ]);

  const multiplier = 2n ** BigInt(attempt);
  const baseFeePerGas = block?.baseFeePerGas ?? 0n;
  const estimatedPriorityFee = estimate?.maxPriorityFeePerGas ?? 0n;
  const estimatedMaxFee = estimate?.maxFeePerGas ?? 0n;

  let maxPriorityFeePerGas = max(
    estimatedPriorityFee,
    1_000_000_000n * multiplier,
  );
  let maxFeePerGas = max(
    estimatedMaxFee,
    baseFeePerGas * 2n + maxPriorityFeePerGas,
  );

  maxPriorityFeePerGas = ceilRatio(maxPriorityFeePerGas, 12n, 10n);
  maxFeePerGas = max(
    ceilRatio(maxFeePerGas, 12n, 10n),
    maxPriorityFeePerGas * 2n,
  );

  return {
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

async function getMaxPendingNonce(address) {
  const settled = await Promise.allSettled(
    rpcUrls.map(async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [address, 'pending'],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.result) {
        throw new Error(`Failed to fetch pending nonce from ${url}`);
      }
      return Number.parseInt(payload.result, 16);
    }),
  );

  const counts = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (counts.length === 0) {
    throw new Error('Failed to fetch a pending nonce from any Base RPC');
  }

  return Math.max(...counts);
}

function isUnderpricedTransactionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('underpriced')
    || normalized.includes('replacement transaction underpriced')
    || normalized.includes('fee too low');
}

function ceilRatio(value, numerator, denominator) {
  return (value * numerator + denominator - 1n) / denominator;
}

function max(left, right) {
  return left > right ? left : right;
}

function buildRpcUrls(primary) {
  return Array.from(new Set([
    ...(primary && primary !== 'https://mainnet.base.org' ? [primary] : []),
    'https://base-rpc.publicnode.com',
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://1rpc.io/base',
    'https://base-mainnet.public.blastapi.io',
  ]));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
