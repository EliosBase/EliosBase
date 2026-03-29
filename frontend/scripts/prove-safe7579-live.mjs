import crypto from 'node:crypto';
import fs from 'node:fs';
import Safe from '@safe-global/protocol-kit';
import { sealData } from 'iron-session';
import { SiweMessage } from 'siwe';
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

hydrateEnvFile(process.env.ELIOS_ENV_FILE ?? '/tmp/elios-prod.env');

const baseUrl = (process.env.ELIOS_BASE_URL ?? 'https://eliosbase.net').replace(/\/$/, '');
const origin = new URL(baseUrl).origin;
const domain = new URL(baseUrl).host;
const rpcUrl = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
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
  transport: http(rpcUrl),
});
const policySigner = privateKeyToAccount(policySignerPrivateKey);
const policyWalletClient = createWalletClient({
  account: policySigner,
  chain: base,
  transport: http(rpcUrl),
});
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const accountAbi = [
  {
    type: 'function',
    name: 'isModuleInstalled',
    inputs: [
      { name: 'moduleTypeId', type: 'uint256' },
      { name: 'module', type: 'address' },
      { name: 'additionalContext', type: 'bytes' },
    ],
    outputs: [{ name: 'isInstalled', type: 'bool' }],
    stateMutability: 'view',
  },
] ;

const safeAbi = [
  {
    type: 'function',
    name: 'getGuard',
    inputs: [],
    outputs: [{ name: 'guard', type: 'address' }],
    stateMutability: 'view',
  },
];

async function main() {
  const ownerPrivateKey = `0x${crypto.randomBytes(32).toString('hex')}`;
  const owner = privateKeyToAccount(ownerPrivateKey);
  const sessionDestination = privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`).address;
  const reviewedDestination = privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`).address;
  const ownerJar = new CookieJar();

  const auth = await authenticateOwner(ownerJar, owner);
  const operator = await loadOperator();
  const operatorCookie = await sealSessionCookie({
    userId: operator.id,
    walletAddress: operator.wallet_address,
    chainId,
    role: operator.role,
  });

  const agent = await registerAgent(ownerJar);
  const safeAddress = getAddress(agent.walletAddress);
  const policy = agent.walletPolicy;
  const fundAmountEth = '0.000020';

  const fundHash = await policyWalletClient.sendTransaction({
    to: safeAddress,
    value: parseEther(fundAmountEth),
  });
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
  if (fundReceipt.status !== 'success') {
    throw new Error('Funding the agent Safe reverted');
  }

  const preparedMigration = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/safe7579/prepare`);
  const migrationSignature = await signPreparedSafeExecution(ownerPrivateKey, safeAddress, preparedMigration);
  const migration = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/safe7579/execute`, {
    ownerSignature: migrationSignature,
    txData: preparedMigration.txData,
  });

  const sessionStatus = await apiJson(ownerJar, 'GET', `/api/agents/${agent.id}/wallet/session`);
  if (!sessionStatus.enabled) {
    throw new Error('Safe7579 session key is not enabled after migration');
  }

  const migratedAgent = await fetchAgent(agent.id);
  const modules = migratedAgent.wallet_policy.__safe7579.modules;

  const installedModules = await Promise.all([
    checkModule(safeAddress, 1n, modules.ownerValidator),
    checkModule(safeAddress, 1n, modules.smartSessionsValidator),
    checkModule(safeAddress, 3n, modules.compatibilityFallback),
    checkModule(safeAddress, 4n, modules.hook),
  ]);
  const guard = await publicClient.readContract({
    address: safeAddress,
    abi: safeAbi,
    functionName: 'getGuard',
  });

  const sessionTransferAmount = normalizeAmount(policy.autoApproveThresholdEth);
  const sessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers`, {
    destination: sessionDestination,
    amountEth: sessionTransferAmount,
    note: 'safe7579 session proof',
  });
  const preparedSessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${sessionTransfer.id}/prepare`);
  const executedSessionTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${sessionTransfer.id}/execute`, {});
  const sessionTransferRecord = await fetchTransfer(agent.id, sessionTransfer.id);

  const reviewedTransferAmount = bumpAmount(policy.timelockThresholdEth, 1n);
  const reviewedTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers`, {
    destination: reviewedDestination,
    amountEth: reviewedTransferAmount,
    note: 'safe7579 reviewed proof',
  });
  if (!reviewedTransfer.unlockAt) {
    throw new Error('Reviewed transfer did not enter the timelock lane');
  }

  const waitMs = Math.max(0, new Date(reviewedTransfer.unlockAt).getTime() - Date.now()) + 2_000;
  await sleep(waitMs);

  const approvedTransfer = await apiJson(
    null,
    'POST',
    `/api/agents/${agent.id}/wallet/transfers/${reviewedTransfer.id}/approve`,
    undefined,
    operatorCookie,
  );
  const preparedReviewedTransfer = await apiJson(ownerJar, 'POST', `/api/agents/${agent.id}/wallet/transfers/${reviewedTransfer.id}/prepare`);
  const reviewedSignature = await signPreparedSafeExecution(ownerPrivateKey, safeAddress, preparedReviewedTransfer);
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
      sessionEnabled: sessionStatus.enabled,
      installedModules: {
        ownerValidator: installedModules[0],
        smartSessionsValidator: installedModules[1],
        compatibilityFallback: installedModules[2],
        hook: installedModules[3],
        guard: guard.toLowerCase() === modules.guard.toLowerCase(),
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
  const payload = await response.json().catch(async () => ({ error: await response.text() }));
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

async function checkModule(safeAddress, moduleTypeId, moduleAddress) {
  return publicClient.readContract({
    address: safeAddress,
    abi: accountAbi,
    functionName: 'isModuleInstalled',
    args: [moduleTypeId, getAddress(moduleAddress), '0x'],
  });
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
