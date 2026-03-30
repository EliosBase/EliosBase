import { getAddress, encodeAbiParameters, parseAbi, parseAbiParameters, zeroAddress, type Address, type Hex } from 'viem';
import { buildSafe7579Modules, safe7579PublicClient } from '@/lib/agentWallet7579';

const SAFE_FALLBACK_HANDLER_SLOT =
  '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5' as const;
const SAFE_GUARD_SLOT =
  '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8' as const;
const ACCOUNT_7579_STATE_ABI = parseAbi([
  'function isModuleInstalled(uint256 moduleTypeId,address module,bytes additionalContext) external view returns (bool)',
  'function getValidatorsPaginated(address cursor,uint256 pageSize) external view returns (address[] memory,address)',
  'function getActiveHook() external view returns (address)',
]);
const SENTINEL_ADDRESS = '0x0000000000000000000000000000000000000001' as const;

export async function getSafeGuardAddress(safeAddress: Address) {
  const value = await safe7579PublicClient.getStorageAt({
    address: safeAddress,
    slot: SAFE_GUARD_SLOT,
  });

  return storageWordToAddress(value);
}

export async function getSafeFallbackHandlerAddress(safeAddress: Address) {
  const value = await safe7579PublicClient.getStorageAt({
    address: safeAddress,
    slot: SAFE_FALLBACK_HANDLER_SLOT,
  });

  return storageWordToAddress(value);
}

export function storageWordToAddress(value?: Hex | null) {
  if (!value || value === '0x') {
    return zeroAddress;
  }

  return getAddress(`0x${value.slice(-40)}`);
}

export async function isSafe7579ValidatorInstalled(
  safeAddress: Address,
  validatorAddress: Address,
) {
  try {
    const result = await safe7579PublicClient.readContract({
      address: safeAddress,
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'getValidatorsPaginated',
      args: [SENTINEL_ADDRESS, 20n],
    });
    const [validators] = result as unknown as [Address[], Address];

    return validators.some((validator) => getAddress(validator) === getAddress(validatorAddress));
  } catch {
    return false;
  }
}

export async function isSafe7579FallbackInstalled(
  safeAddress: Address,
  fallbackAddress: Address,
  functionSig: Hex,
) {
  try {
    return await safe7579PublicClient.readContract({
      address: safeAddress,
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'isModuleInstalled',
      args: [
        3n,
        getAddress(fallbackAddress),
        encodeAbiParameters(parseAbiParameters('bytes4 functionSig'), [functionSig]),
      ],
    });
  } catch {
    return false;
  }
}

export async function getSafe7579ActiveHookAddress(safeAddress: Address) {
  try {
    return await safe7579PublicClient.readContract({
      address: safeAddress,
      abi: ACCOUNT_7579_STATE_ABI,
      functionName: 'getActiveHook',
    });
  } catch {
    return zeroAddress;
  }
}

export async function readSafe7579InstallationState(
  params: {
    safeAddress: Address;
    ownerWallet: Address;
    hookAddress: Address;
    guardAddress?: Address;
    fallbackHandlerAddress?: Address;
  },
) {
  const modules = buildSafe7579Modules({
    ownerWallet: params.ownerWallet,
    hookAddress: params.hookAddress,
  });
  const compatibilityFunctionSig = modules.compatibilityFallback.functionSig ?? '0x00000000';
  const checks = await Promise.all([
    isSafe7579ValidatorInstalled(params.safeAddress, getAddress(modules.smartSessions.module)),
    isSafe7579FallbackInstalled(
      params.safeAddress,
      getAddress(modules.compatibilityFallback.module),
      compatibilityFunctionSig,
    ),
    getSafe7579ActiveHookAddress(params.safeAddress),
    getSafeGuardAddress(params.safeAddress),
    getSafeFallbackHandlerAddress(params.safeAddress),
  ]);

  const [
    smartSessionsValidator,
    compatibilityFallback,
    hook,
    guard,
    fallbackHandler,
  ] = checks;

  return {
    smartSessionsValidator,
    compatibilityFallback,
    hook: getAddress(hook) === getAddress(params.hookAddress),
    guard: params.guardAddress
      ? guard.toLowerCase() === getAddress(params.guardAddress).toLowerCase()
      : false,
    fallbackHandler: params.fallbackHandlerAddress
      ? fallbackHandler.toLowerCase() === getAddress(params.fallbackHandlerAddress).toLowerCase()
      : false,
    fallbackHandlerAddress: fallbackHandler,
    guardAddress: guard,
  };
}
