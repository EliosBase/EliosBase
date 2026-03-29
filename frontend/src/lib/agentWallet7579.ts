import { randomBytes } from 'crypto';
import {
  CallType,
  SafeHookType,
  encodeModuleInstallationData,
  getAccount,
  getEnableSessionsAction,
  getOwnableValidator,
  getPermissionId,
  getRemoveSessionAction,
  getSmartSessionsCompatibilityFallback,
  getSmartSessionsValidator,
  getTimeFramePolicy,
  getValueLimitPolicy,
  moduleTypeIds,
  type Session,
} from '@rhinestone/module-sdk';
import {
  concatHex,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { createPublicClient } from 'viem';
import { readEnv } from '@/lib/env';
import { privateKeyToAccount } from 'viem/accounts';
import type { AgentWalletModules, AgentWalletPolicy } from '@/lib/types';

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';
export const safeWalletChain = isTestnet ? baseSepolia : base;

export const SAFE_7579_ADAPTER_ADDRESS = getAddress(
  readEnv(process.env.SAFE7579_ADAPTER_ADDRESS) ?? '0x7579f2ad53b01c3d8779fe17928e0d48885b0003',
);

export const SAFE_7579_OWNER_VALIDATOR_ADDRESS = getAddress(
  readEnv(process.env.SAFE7579_OWNER_VALIDATOR_ADDRESS) ?? '0x000000000013fdB5234E4E3162a810F54d9f7E98',
);

export const SAFE_7579_SMART_SESSIONS_ADDRESS = getAddress(
  readEnv(process.env.SAFE7579_SMART_SESSIONS_ADDRESS) ?? '0x00000000008bDABA73cD9815d79069c247Eb4bDA',
);

export const SAFE_7579_COMPATIBILITY_FALLBACK_ADDRESS = getAddress(
  readEnv(process.env.SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS) ?? '0x000000000052e9685932845660777DF43C2dC496',
);

export const SAFE_7579_POLICY_MANAGER_ADDRESS = readEnv(process.env.SAFE7579_POLICY_MANAGER_ADDRESS);
export const SAFE_7579_GUARD_ADDRESS = readEnv(process.env.SAFE7579_GUARD_ADDRESS);
export const SAFE_7579_HOOK_ADDRESS = readEnv(process.env.SAFE7579_HOOK_ADDRESS);

const rpcUrl = readEnv(process.env.BASE_RPC_URL)
  || (isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org');

export const safe7579PublicClient = createPublicClient({
  chain: safeWalletChain,
  transport: http(rpcUrl),
});

export const SAFE_ABI = parseAbi([
  'function enableModule(address module)',
  'function setFallbackHandler(address handler)',
  'function setGuard(address guard)',
]);

export const ACCOUNT_7579_ABI = parseAbi([
  'function installModule(uint256 moduleTypeId,address module,bytes calldata initData)',
]);

export const ELIOS_POLICY_MANAGER_ABI = parseAbi([
  'function configureSafe(address safe,(address owner,address policySigner,uint96 dailyLimit,uint96 autoApproveLimit,uint96 reviewThreshold,uint96 timelockThreshold,uint32 timelockSeconds,bool allowContractRecipients) config,address[] blocked,address[] allowlisted,(address adapter,address ownerValidator,address smartSessionsValidator,address compatibilityFallback,address hook,address guard,address policyManager) modules)',
  'function rotateSessionKey(address safe,address sessionKey,uint64 validUntil)',
  'function revokeSessionKey(address safe)',
  'function approveReviewedIntent(bytes32 intentHash)',
  'function queueReviewedIntent(address safe,address to,uint256 value,bytes32 noteHash) returns (bytes32)',
]);

type SafeInstallModule = ReturnType<typeof getOwnableValidator> & {
  hookType?: SafeHookType;
  selector?: Hex;
  functionSig?: Hex;
  callType?: CallType;
};

export function readSafe7579PolicySignerPrivateKey() {
  return readEnv(process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY)
    ?? readEnv(process.env.PROOF_SUBMITTER_PRIVATE_KEY);
}

export function buildSafe7579Policy(ownerWallet: Address): AgentWalletPolicy {
  const policySignerKey = readSafe7579PolicySignerPrivateKey();
  const policySigner = policySignerKey
    ? privateKeyToAccount(policySignerKey as Hex).address
    : undefined;
  const owners = policySigner
    ? [getAddress(ownerWallet), getAddress(policySigner)]
    : [getAddress(ownerWallet)];

  return {
    standard: 'safe7579',
    owner: getAddress(ownerWallet),
    policySigner,
    owners,
    threshold: owners.length > 1 ? 2 : 1,
    dailySpendLimitEth: (readEnv(process.env.AGENT_WALLET_DAILY_LIMIT_ETH) ?? '0.50'),
    autoApproveThresholdEth: (readEnv(process.env.AGENT_WALLET_AUTO_APPROVE_THRESHOLD_ETH) ?? '0.05'),
    reviewThresholdEth: (readEnv(process.env.AGENT_WALLET_COSIGN_THRESHOLD_ETH) ?? '0.25'),
    timelockThresholdEth: (readEnv(process.env.AGENT_WALLET_TIMELOCK_THRESHOLD_ETH) ?? '1.00'),
    timelockSeconds: Number(readEnv(process.env.AGENT_WALLET_TIMELOCK_SECONDS) ?? `${24 * 60 * 60}`),
    blockedDestinations: [],
    allowlistedContracts: [],
  };
}

export function buildSessionDefinition(params: {
  sessionKeyAddress: Address;
  policy: AgentWalletPolicy;
  hookAddress: Address;
  validUntil: number;
  salt?: Hex;
}): Session {
  const sessionValidator = getOwnableValidator({
    threshold: 1,
    owners: [getAddress(params.sessionKeyAddress)],
    hook: params.hookAddress,
  });

  return {
    sessionValidator: getAddress(sessionValidator.address),
    sessionValidatorInitData: sessionValidator.initData,
    salt: params.salt ?? `0x${Buffer.from(randomBytes(32)).toString('hex')}` as Hex,
    userOpPolicies: [
      getValueLimitPolicy({
        limit: parseEthToPolicyUint(params.policy.autoApproveThresholdEth),
      }),
      getTimeFramePolicy({
        validAfter: Math.floor(Date.now() / 1000),
        validUntil: params.validUntil,
      }),
    ],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [],
    permitERC4337Paymaster: false,
    chainId: BigInt(safeWalletChain.id),
  };
}

export function buildSafe7579Modules(params: {
  ownerWallet: Address;
  hookAddress: Address;
  session?: Session;
}) {
  const ownerValidator = getOwnableValidator({
    threshold: 1,
    owners: [getAddress(params.ownerWallet)],
    hook: params.hookAddress,
  });
  const smartSessions = getSmartSessionsValidator({
    hook: params.hookAddress,
    sessions: params.session ? [params.session] : [],
  });
  const rawCompatibilityFallback = getSmartSessionsCompatibilityFallback();
  const compatibilityFallback: SafeInstallModule = {
    ...rawCompatibilityFallback,
    functionSig: rawCompatibilityFallback.selector,
  };
  const hookModule: SafeInstallModule = {
    address: params.hookAddress,
    module: params.hookAddress,
    initData: '0x',
    deInitData: '0x',
    additionalContext: '0x',
    type: 'hook',
    hookType: SafeHookType.GLOBAL,
  };

  return {
    ownerValidator,
    smartSessions,
    compatibilityFallback,
    hookModule,
  };
}

export function buildSafe7579ModuleMetadata(params: {
  policyManager: Address;
  guard: Address;
  hook: Address;
  sessionSalt?: Hex;
}): AgentWalletModules {
  return {
    adapter: SAFE_7579_ADAPTER_ADDRESS,
    ownerValidator: SAFE_7579_OWNER_VALIDATOR_ADDRESS,
    smartSessionsValidator: SAFE_7579_SMART_SESSIONS_ADDRESS,
    compatibilityFallback: SAFE_7579_COMPATIBILITY_FALLBACK_ADDRESS,
    hook: getAddress(params.hook),
    guard: getAddress(params.guard),
    policyManager: getAddress(params.policyManager),
    sessionSalt: params.sessionSalt,
  };
}

export function buildStoredSafe7579Session(params: {
  sessionKeyAddress: Address;
  sessionKeyValidUntil: number;
  policy: AgentWalletPolicy;
  modules: AgentWalletModules;
}): Session {
  if (!params.modules.hook || !params.modules.sessionSalt) {
    throw new Error('Safe7579 session metadata is incomplete');
  }

  return buildSessionDefinition({
    sessionKeyAddress: getAddress(params.sessionKeyAddress),
    policy: params.policy,
    hookAddress: getAddress(params.modules.hook),
    validUntil: params.sessionKeyValidUntil,
    salt: params.modules.sessionSalt as Hex,
  });
}

export function getSafe7579SessionPermissionId(session: Session) {
  return getPermissionId({ session });
}

export function buildEnableSessionCall(session: Session) {
  const action = getEnableSessionsAction({ sessions: [session] });

  return {
    to: getAddress(action.to),
    value: action.value,
    data: hexOrEmpty(action.data),
  };
}

export function buildRemoveSessionCall(permissionId: Hex) {
  const action = getRemoveSessionAction({ permissionId });

  return {
    to: getAddress(action.to),
    value: action.value,
    data: hexOrEmpty(action.data),
  };
}

export function buildSafe7579MigrationCalls(params: {
  safeAddress: Address;
  ownerWallet: Address;
  session?: Session;
  hookAddress: Address;
  guardAddress: Address;
}) {
  const modules = buildSafe7579Modules({
    ownerWallet: params.ownerWallet,
    hookAddress: params.hookAddress,
    session: params.session,
  });
  const account = getAccount({
    address: params.safeAddress,
    type: 'safe',
    deployedOnChains: [safeWalletChain.id],
  });

  const moduleCalls = [
    modules.ownerValidator,
    modules.smartSessions,
    modules.compatibilityFallback,
    modules.hookModule,
  ].map((module) => ({
    to: params.safeAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: ACCOUNT_7579_ABI,
      functionName: 'installModule',
      args: [
        BigInt(moduleTypeIds[module.type]),
        getAddress(module.module),
        encodeModuleInstallationData({ account, module }),
      ],
    }),
  }));

  const adapterCalls = [
    {
      to: params.safeAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: SAFE_ABI,
        functionName: 'enableModule',
        args: [SAFE_7579_ADAPTER_ADDRESS],
      }),
    },
    {
      to: params.safeAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: SAFE_ABI,
        functionName: 'setFallbackHandler',
        args: [SAFE_7579_ADAPTER_ADDRESS],
      }),
    },
    {
      to: params.safeAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: SAFE_ABI,
        functionName: 'setGuard',
        args: [getAddress(params.guardAddress)],
      }),
    },
  ];

  return [...adapterCalls, ...moduleCalls];
}

export function buildPolicyManagerConfigureCall(params: {
  safeAddress: Address;
  policy: AgentWalletPolicy;
  modules: AgentWalletModules;
}) {
  if (!SAFE_7579_POLICY_MANAGER_ADDRESS) {
    throw new Error('SAFE7579_POLICY_MANAGER_ADDRESS not configured');
  }

  return {
    to: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIOS_POLICY_MANAGER_ABI,
      functionName: 'configureSafe',
      args: [
        params.safeAddress,
        {
          owner: getAddress(params.policy.owner),
          policySigner: getAddress(params.policy.policySigner ?? params.policy.owner),
          dailyLimit: parseEthToPolicyUint(params.policy.dailySpendLimitEth),
          autoApproveLimit: parseEthToPolicyUint(params.policy.autoApproveThresholdEth),
          reviewThreshold: parseEthToPolicyUint(params.policy.reviewThresholdEth),
          timelockThreshold: parseEthToPolicyUint(params.policy.timelockThresholdEth),
          timelockSeconds: params.policy.timelockSeconds,
          allowContractRecipients: false,
        },
        params.policy.blockedDestinations.map((address) => getAddress(address)),
        (params.policy.allowlistedContracts ?? []).map((address) => getAddress(address)),
        {
          adapter: getAddress(params.modules.adapter ?? SAFE_7579_ADAPTER_ADDRESS),
          ownerValidator: getAddress(params.modules.ownerValidator ?? SAFE_7579_OWNER_VALIDATOR_ADDRESS),
          smartSessionsValidator: getAddress(params.modules.smartSessionsValidator ?? SAFE_7579_SMART_SESSIONS_ADDRESS),
          compatibilityFallback: getAddress(params.modules.compatibilityFallback ?? SAFE_7579_COMPATIBILITY_FALLBACK_ADDRESS),
          hook: getAddress(params.modules.hook ?? params.modules.policyManager ?? params.safeAddress),
          guard: getAddress(params.modules.guard ?? params.modules.policyManager ?? params.safeAddress),
          policyManager: getAddress(params.modules.policyManager ?? SAFE_7579_POLICY_MANAGER_ADDRESS),
        },
      ],
    }),
  };
}

export function buildRotateSessionKeyCall(params: {
  safeAddress: Address;
  sessionKeyAddress: Address;
  validUntil: number;
}) {
  if (!SAFE_7579_POLICY_MANAGER_ADDRESS) {
    throw new Error('SAFE7579_POLICY_MANAGER_ADDRESS not configured');
  }

  return {
    to: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIOS_POLICY_MANAGER_ABI,
      functionName: 'rotateSessionKey',
      args: [params.safeAddress, params.sessionKeyAddress, BigInt(params.validUntil)],
    }),
  };
}

export function parseEthToPolicyUint(value: string) {
  const [whole, fraction = ''] = value.split('.');
  const normalized = `${whole}${fraction.padEnd(18, '0').slice(0, 18)}`;
  return BigInt(normalized);
}

export function hexOrEmpty(value?: string | null) {
  return value && value.startsWith('0x') ? value as Hex : '0x';
}

export function flattenCalldata(calls: Array<{ to: Address; value: bigint; data: Hex }>) {
  return concatHex(calls.map((call) => call.data));
}
