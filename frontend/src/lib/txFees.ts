const MIN_PRIORITY_FEE_PER_GAS = 1_000_000n;
const L2_DATA_FEE_RESERVE_WEI = 5_000_000_000n;

type FeeClient = {
  estimateFeesPerGas(args: { type: 'eip1559' }): Promise<{
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }>;
  getBlock(): Promise<{
    baseFeePerGas?: bigint | null;
  }>;
  getTransactionCount(args: {
    address: `0x${string}`;
    blockTag: 'pending';
  }): Promise<number>;
};

type GasEstimateClient = {
  estimateGas(args: {
    account?: `0x${string}`;
    to: `0x${string}`;
    value?: bigint;
    data?: `0x${string}`;
  }): Promise<bigint>;
  getBalance?(args: {
    address: `0x${string}`;
  }): Promise<bigint>;
};

export type Eip1559Fees = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

export async function getPendingEip1559TxParams(
  client: FeeClient,
  address: `0x${string}`,
  attempt = 0,
  resolvePendingNonce?: (address: `0x${string}`) => Promise<number>,
) {
  const [estimate, block, nonce] = await Promise.all([
    client.estimateFeesPerGas({ type: 'eip1559' }).catch(() => undefined),
    client.getBlock().catch(() => undefined),
    resolvePendingNonce
      ? resolvePendingNonce(address)
      : client.getTransactionCount({ address, blockTag: 'pending' }),
  ]);

  const multiplier = 2n ** BigInt(attempt);
  const baseFeePerGas = block?.baseFeePerGas ?? 0n;
  const estimatedPriorityFee = estimate?.maxPriorityFeePerGas ?? 0n;
  const estimatedMaxFee = estimate?.maxFeePerGas ?? 0n;

  let maxPriorityFeePerGas = max(
    estimatedPriorityFee,
    MIN_PRIORITY_FEE_PER_GAS * multiplier,
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
    baseFeePerGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

export function isUnderpricedTransactionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('underpriced')
    || normalized.includes('replacement transaction underpriced')
    || normalized.includes('fee too low');
}

export async function estimateGasLimitWithHeadroom(
  client: GasEstimateClient,
  request: {
    account?: `0x${string}`;
    to: `0x${string}`;
    value?: bigint;
    data?: `0x${string}`;
  },
  numerator = 15n,
  denominator = 10n,
) {
  const gas = await client.estimateGas(request);
  return ceilRatio(gas, numerator, denominator);
}

export async function estimateGasLimitWithinBalance(
  client: GasEstimateClient,
  request: {
    account?: `0x${string}`;
    to: `0x${string}`;
    value?: bigint;
    data?: `0x${string}`;
  },
  params: {
    address: `0x${string}`;
    maxFeePerGas: bigint;
    numerator?: bigint;
    denominator?: bigint;
  },
) {
  const gas = await client.estimateGas(request);
  const preferredGas = ceilRatio(gas, params.numerator ?? 15n, params.denominator ?? 10n);

  if (!client.getBalance || params.maxFeePerGas <= 0n) {
    return preferredGas;
  }

  const balance = await client.getBalance({ address: params.address });
  const transferableBalance = balance - (request.value ?? 0n) - L2_DATA_FEE_RESERVE_WEI;
  if (transferableBalance < 0n) {
    throw new Error('Policy signer balance is lower than the transaction value');
  }

  const preferredCost = preferredGas * params.maxFeePerGas;
  if (preferredCost <= transferableBalance) {
    return preferredGas;
  }

  const affordableGas = transferableBalance / params.maxFeePerGas;
  if (affordableGas < gas) {
    throw new Error('Policy signer balance is too low to cover the estimated gas for this transaction');
  }

  return affordableGas;
}

export function fitEip1559FeesWithinBalance(params: {
  balance: bigint;
  value?: bigint;
  gasEstimate: bigint;
  baseFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}) {
  const transferableBalance = params.balance - (params.value ?? 0n) - L2_DATA_FEE_RESERVE_WEI;
  if (transferableBalance < 0n) {
    throw new Error('Policy signer balance is lower than the transaction value');
  }

  const affordableMaxFeePerGas = transferableBalance / params.gasEstimate;
  if (affordableMaxFeePerGas <= 0n) {
    throw new Error('Policy signer balance is too low to cover the estimated gas for this transaction');
  }

  let maxFeePerGas = min(params.maxFeePerGas, affordableMaxFeePerGas);
  let maxPriorityFeePerGas = min(
    params.maxPriorityFeePerGas,
    maxFeePerGas > params.baseFeePerGas ? maxFeePerGas - params.baseFeePerGas : 0n,
  );

  if (maxPriorityFeePerGas < MIN_PRIORITY_FEE_PER_GAS) {
    maxPriorityFeePerGas = MIN_PRIORITY_FEE_PER_GAS;
  }

  const minimumMaxFeePerGas = max(
    params.baseFeePerGas + maxPriorityFeePerGas,
    maxPriorityFeePerGas * 2n,
  );

  if (affordableMaxFeePerGas < minimumMaxFeePerGas) {
    throw new Error('Policy signer balance is too low to cover the estimated gas for this transaction');
  }

  maxFeePerGas = min(maxFeePerGas, affordableMaxFeePerGas);
  if (maxFeePerGas < minimumMaxFeePerGas) {
    maxFeePerGas = minimumMaxFeePerGas;
  }

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

function ceilRatio(value: bigint, numerator: bigint, denominator: bigint) {
  return (value * numerator + denominator - 1n) / denominator;
}

function max(left: bigint, right: bigint) {
  return left > right ? left : right;
}

function min(left: bigint, right: bigint) {
  return left < right ? left : right;
}
