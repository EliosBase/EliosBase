const MIN_PRIORITY_FEE_PER_GAS = 1_000_000_000n;

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

function ceilRatio(value: bigint, numerator: bigint, denominator: bigint) {
  return (value * numerator + denominator - 1n) / denominator;
}

function max(left: bigint, right: bigint) {
  return left > right ? left : right;
}
