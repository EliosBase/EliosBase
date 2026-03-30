import {
  createBundlerClient,
  createPaymasterClient,
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  toSmartAccount,
} from 'viem/account-abstraction';
import {
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseEther,
  parseSignature,
  stringToHex,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  getAccount as getModuleAccount,
  getPermissionId,
  isSessionEnabled,
  SmartSessionMode,
} from '@rhinestone/module-sdk';
import type { Session as RhinestoneSession } from '@rhinestone/sdk';
import { buildMockSignature } from '@rhinestone/sdk/smart-sessions';
import { decryptSessionKey } from '@/lib/agentWalletSecrets';
import { getMaxPendingNonce } from '@/lib/baseRpc';
import { readEnv, readRequiredEnv } from '@/lib/env';
import {
  buildStoredSafe7579Session,
  ELIOS_POLICY_MANAGER_ABI,
  readSafe7579PolicySignerPrivateKey,
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  SAFE_7579_SMART_SESSIONS_ADDRESS,
  safe7579PublicClient,
  safeWalletChain,
  safeWalletRpcUrl,
} from '@/lib/agentWallet7579';
import { getPendingEip1559TxParams, isUnderpricedTransactionError } from '@/lib/txFees';
import type { AgentWalletModules, AgentWalletPolicy } from '@/lib/types';

const bundlerUrl = readEnv(process.env.SAFE7579_BUNDLER_URL)
  ?? `https://public.pimlico.io/v2/${safeWalletChain.id}/rpc`;
const paymasterUrl = readEnv(process.env.SAFE7579_PAYMASTER_URL);

function getPolicySignerAccount() {
  const privateKey = readRequiredEnv(
    'SAFE_POLICY_SIGNER_PRIVATE_KEY or PROOF_SUBMITTER_PRIVATE_KEY',
    readSafe7579PolicySignerPrivateKey(),
  ) as Hex;

  return privateKeyToAccount(privateKey);
}

export async function executePolicySignerCall(call: {
  to: Address;
  value: bigint;
  data: Hex;
}) {
  const account = getPolicySignerAccount();
  const walletClient = createWalletClient({
    account,
    chain: safeWalletChain,
    transport: http(safeWalletRpcUrl),
  });
  const hash = await sendPolicySignerTransaction(walletClient, getAddress(account.address), {
    account,
    to: call.to,
    value: call.value,
    data: call.data,
  });
  const receipt = await safe7579PublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Policy signer transaction reverted');
  }

  return {
    hash,
    blockNumber: Number(receipt.blockNumber),
  };
}

function encodeExecutionMode() {
  return encodePacked(
    ['bytes1', 'bytes1', 'bytes4', 'bytes4', 'bytes22'],
    [
      toHex(toBytes('0x00', { size: 1 })),
      toHex(toBytes('0x00', { size: 1 })),
      toHex(toBytes('0x0', { size: 4 })),
      toHex(toBytes('0x', { size: 4 })),
      toHex(toBytes('0x', { size: 22 })),
    ],
  );
}

function encodeSafe7579Call(params: {
  to: Address;
  value: bigint;
  data?: Hex;
}) {
  return encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'execute',
        inputs: [
          { name: 'execMode', type: 'bytes32' },
          { name: 'executionCalldata', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'payable',
      },
    ],
    functionName: 'execute',
    args: [
      encodeExecutionMode(),
      encodePacked(
        ['address', 'uint256', 'bytes'],
        [params.to, params.value, params.data ?? '0x'],
      ),
    ],
  });
}

function getValidatorNonceKey(validatorAddress: Address) {
  return BigInt(encodePacked(['address', 'bytes4'], [validatorAddress, '0x00000000']));
}

async function signSessionHash(sessionPrivateKey: Hex, hash: Hex) {
  const account = privateKeyToAccount(sessionPrivateKey);
  const signature = await account.signMessage({
    message: { raw: hash },
  });
  const { r, s, v } = parseSignature(signature);
  if (v === undefined) {
    throw new Error('Invalid session signature');
  }

  return encodePacked(['bytes32', 'bytes32', 'uint8'], [r, s, Number(v + 4n)]) as Hex;
}

function createSafe7579BundlerClient() {
  return createBundlerClient({
    client: safe7579PublicClient,
    transport: http(bundlerUrl),
    paymaster: paymasterUrl
      ? createPaymasterClient({
        transport: http(paymasterUrl),
      })
      : undefined,
  });
}

async function createSessionSmartAccount(params: {
  safeAddress: Address;
  validatorAddress: Address;
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address;
  sessionKeyValidAfter?: number;
  sessionKeyValidUntil: number;
  policy: AgentWalletPolicy;
  modules: AgentWalletModules;
}) {
  const session = buildStoredSafe7579Session({
    sessionKeyAddress: params.sessionKeyAddress,
    sessionKeyValidAfter: params.sessionKeyValidAfter,
    sessionKeyValidUntil: params.sessionKeyValidUntil,
    policy: params.policy,
    modules: params.modules,
  });
  const permissionId = getPermissionId({ session });
  const mockSession: RhinestoneSession = {
    chain: safeWalletChain,
    owners: {
      type: 'ecdsa',
      accounts: [privateKeyToAccount(params.sessionPrivateKey)],
    },
  };

  return {
    smartAccount: await toSmartAccount({
      client: safe7579PublicClient,
      entryPoint: {
        abi: entryPoint07Abi,
        address: entryPoint07Address,
        version: '0.7',
      },
      async decodeCalls() {
        throw new Error('Decoding Safe7579 calls is not implemented');
      },
      async encodeCalls(calls) {
        if (calls.length !== 1) {
          throw new Error('Safe7579 session execution currently supports one call at a time');
        }

        const [call] = calls;
        return encodeSafe7579Call({
          to: getAddress(call.to),
          value: call.value ?? 0n,
          data: call.data ?? '0x',
        });
      },
      async getAddress() {
        return params.safeAddress;
      },
      async getFactoryArgs() {
        return {};
      },
      async getNonce() {
        return safe7579PublicClient.readContract({
          address: entryPoint07Address,
          abi: entryPoint07Abi,
          functionName: 'getNonce',
          args: [params.safeAddress, getValidatorNonceKey(params.validatorAddress)],
        });
      },
      async getStubSignature() {
        return buildMockSignature(mockSession);
      },
      async signMessage() {
        throw new Error('Message signing is not implemented for Safe7579 session execution');
      },
      async signTypedData() {
        throw new Error('Typed-data signing is not implemented for Safe7579 session execution');
      },
      async signUserOperation(parameters) {
        const { chainId = safeWalletChain.id, ...userOperation } = parameters;
        const hash = getUserOperationHash({
          userOperation: {
            ...userOperation,
            sender: userOperation.sender ?? params.safeAddress,
            signature: '0x',
          },
          entryPointAddress: entryPoint07Address,
          entryPointVersion: '0.7',
          chainId,
        });
        const signature = await signSessionHash(params.sessionPrivateKey, hash);
        return encodePacked(
          ['bytes1', 'bytes32', 'bytes'],
          [SmartSessionMode.USE, permissionId, signature],
        ) as Hex;
      },
    }),
    permissionId,
    session,
  };
}

export async function queueSafe7579ReviewedIntent(params: {
  safeAddress: Address;
  destination: Address;
  amountEth: string;
  note: string;
}) {
  if (!SAFE_7579_POLICY_MANAGER_ADDRESS) {
    throw new Error('SAFE7579 policy manager is not configured');
  }

  const account = getPolicySignerAccount();
  const walletClient = createWalletClient({
    account,
    chain: safeWalletChain,
    transport: http(safeWalletRpcUrl),
  });
  const value = parseEther(params.amountEth);
  const intentHash = keccak256(
    encodeAbiParameters(
      [
        { name: 'safe', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
      [params.safeAddress, params.destination, value],
    ),
  );
  const hash = await sendPolicySignerTransaction(walletClient, getAddress(account.address), {
    account,
    to: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIOS_POLICY_MANAGER_ABI,
      functionName: 'queueReviewedIntent',
      args: [
        params.safeAddress,
        params.destination,
        value,
        keccak256(stringToHex(params.note)),
      ],
    }),
  });
  const receipt = await safe7579PublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Safe7579 reviewed intent queue transaction reverted');
  }

  return { hash, intentHash };
}

export async function approveSafe7579ReviewedIntent(intentHash: Hex) {
  if (!SAFE_7579_POLICY_MANAGER_ADDRESS) {
    throw new Error('SAFE7579 policy manager is not configured');
  }

  const account = getPolicySignerAccount();
  const walletClient = createWalletClient({
    account,
    chain: safeWalletChain,
    transport: http(safeWalletRpcUrl),
  });
  const hash = await sendPolicySignerTransaction(walletClient, getAddress(account.address), {
    account,
    to: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIOS_POLICY_MANAGER_ABI,
      functionName: 'approveReviewedIntent',
      args: [intentHash],
    }),
  });
  const receipt = await safe7579PublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error('Safe7579 reviewed intent approval reverted');
  }

  return { hash };
}

export async function executeSafe7579SessionTransfer(params: {
  safeAddress: Address;
  destination: Address;
  amountEth: string;
  policy: AgentWalletPolicy;
  modules: AgentWalletModules;
  sessionKeyAddress: Address;
  sessionKeyValidAfter?: number;
  sessionKeyValidUntil: number;
  sessionKeyCiphertext: string;
  sessionKeyNonce: string;
  sessionKeyTag: string;
}) {
  const sessionPrivateKey = decryptSessionKey({
    ciphertext: params.sessionKeyCiphertext,
    nonce: params.sessionKeyNonce,
    tag: params.sessionKeyTag,
  });
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  if (getAddress(sessionKeyAccount.address) !== getAddress(params.sessionKeyAddress)) {
    throw new Error('Stored Safe7579 session key does not match the recorded session address');
  }

  const validatorAddress = getAddress(
    params.modules.smartSessionsValidator ?? SAFE_7579_SMART_SESSIONS_ADDRESS,
  );
  const { smartAccount, permissionId } = await createSessionSmartAccount({
    safeAddress: params.safeAddress,
    validatorAddress,
    sessionPrivateKey,
    sessionKeyAddress: params.sessionKeyAddress,
    sessionKeyValidAfter: params.sessionKeyValidAfter,
    sessionKeyValidUntil: params.sessionKeyValidUntil,
    policy: params.policy,
    modules: params.modules,
  });
  const account = getModuleAccount({
    address: params.safeAddress,
    type: 'safe',
    deployedOnChains: [safeWalletChain.id],
  });
  const enabled = await isSessionEnabled({
    client: safe7579PublicClient as never,
    account,
    permissionId,
  });
  if (!enabled) {
    throw new Error('Safe7579 session is not enabled onchain');
  }

  const bundlerClient = createSafe7579BundlerClient();
  const userOpHash = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls: [{
      to: params.destination,
      value: parseEther(params.amountEth),
      data: '0x',
    }],
  });
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

  if (!receipt.receipt || receipt.receipt.status !== 'success') {
    throw new Error('Safe7579 session transfer reverted');
  }

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
    blockNumber: Number(receipt.receipt.blockNumber),
  };
}

async function sendPolicySignerTransaction(
  walletClient: ReturnType<typeof createWalletClient>,
  address: Address,
  request: {
    account: ReturnType<typeof getPolicySignerAccount>;
    to: Address;
    value: bigint;
    data: Hex;
  },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await getPendingEip1559TxParams(
      safe7579PublicClient,
      address as `0x${string}`,
      attempt,
      (target) => getMaxPendingNonce(safeWalletChain.id !== 8453, target),
    );

    try {
      return await walletClient.sendTransaction({
        ...request,
        ...tx,
        chain: safeWalletChain,
      });
    } catch (error) {
      if (attempt === 2 || !isUnderpricedTransactionError(error)) {
        throw error;
      }
    }
  }

  throw new Error('Policy signer transaction fee retries exhausted');
}
