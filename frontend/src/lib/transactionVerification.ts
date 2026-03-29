import { decodeEventLog, stringToHex, type Address, type Hash, type TransactionReceipt } from 'viem';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';
import { publicClient } from '@/lib/viemClient';

type VerificationOptions = {
  expectedFrom?: Address | string;
  allowLoggedAddressMatch?: boolean;
};

type VerificationResult = {
  txStatus: 'confirmed' | 'pending';
  blockNumber: number | null;
};

type EscrowAction = 'lock' | 'release' | 'refund';

type EscrowVerificationOptions = {
  action: EscrowAction;
  taskId: string;
  agentId?: string;
  depositor?: Address | string;
  recipient?: Address | string;
};

function receiptMentionsAddress(receipt: TransactionReceipt, address: Address | string) {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  const padded = normalized.padStart(64, '0');

  return receipt.logs.some((log) => (
    log.address.toLowerCase() === address.toLowerCase()
    || log.topics.some((topic) => topic.toLowerCase().includes(padded))
    || log.data.toLowerCase().includes(padded)
  ));
}

async function readTransactionState(hash: Hash) {
  const tx = await publicClient.getTransaction({ hash });

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('Transaction reverted on-chain');
    }

    return {
      tx,
      receipt,
      txStatus: 'confirmed' as const,
      blockNumber: Number(receipt.blockNumber),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Transaction reverted on-chain') {
      throw error;
    }

    return {
      tx,
      receipt: null,
      txStatus: 'pending' as const,
      blockNumber: null,
    };
  }
}

export async function verifyOnchainTransaction(
  hash: Hash,
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  const { tx, receipt, txStatus, blockNumber } = await readTransactionState(hash);

  if (options.expectedFrom) {
    const matchesTopLevelSender = tx.from.toLowerCase() === options.expectedFrom.toLowerCase();
    const matchesLogs = receipt ? receiptMentionsAddress(receipt, options.expectedFrom) : false;

    if (!matchesTopLevelSender && !(options.allowLoggedAddressMatch && matchesLogs)) {
      throw new Error('Transaction sender does not match your wallet');
    }
  }

  return { txStatus, blockNumber };
}

export async function verifyEscrowActionTransaction(
  hash: Hash,
  options: EscrowVerificationOptions,
): Promise<VerificationResult> {
  const { txStatus, blockNumber, receipt } = await readTransactionState(hash);
  if (!receipt) {
    return { txStatus, blockNumber };
  }

  const taskId = stringToHex(options.taskId, { size: 32 });
  const agentId = options.agentId ? stringToHex(options.agentId, { size: 32 }) : null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ESCROW_CONTRACT_ADDRESS.toLowerCase()) {
      continue;
    }

    try {
      const event = decodeEventLog({
        abi: ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (options.action === 'lock' && event.eventName === 'FundsLocked') {
        if (event.args.taskId !== taskId || event.args.agentId !== agentId) {
          continue;
        }

        if (options.depositor && event.args.depositor.toLowerCase() !== options.depositor.toLowerCase()) {
          throw new Error('Transaction sender does not match your wallet');
        }

        return { txStatus, blockNumber };
      }

      if (options.action === 'release' && event.eventName === 'FundsReleased') {
        if (event.args.taskId !== taskId) {
          continue;
        }

        if (options.recipient && event.args.recipient.toLowerCase() !== options.recipient.toLowerCase()) {
          continue;
        }

        return { txStatus, blockNumber };
      }

      if (options.action === 'refund' && event.eventName === 'FundsRefunded') {
        if (event.args.taskId !== taskId) {
          continue;
        }

        if (options.depositor && event.args.depositor.toLowerCase() !== options.depositor.toLowerCase()) {
          throw new Error('Transaction sender does not match your wallet');
        }

        return { txStatus, blockNumber };
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Transaction ')) {
        throw error;
      }
    }
  }

  throw new Error('Transaction is not to the escrow contract');
}
