import type { Transaction } from './types';
import type { DbTransaction } from './types/database';

type TransactionType = Transaction['type'];

type TransactionLike = Pick<DbTransaction, 'type' | 'from' | 'to'>;

type InsertTransactionPayload = {
  id: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: string;
  token: string;
  status: 'confirmed' | 'pending' | 'failed';
  tx_hash: string;
  user_id: string;
  block_number?: number | null;
};

type UpdateTransactionPayload = {
  status: 'confirmed' | 'pending' | 'failed';
  block_number?: number | null;
};

type SupabaseInsertResult<T> = PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>;
type SupabaseUpdateResult = PromiseLike<{ error: { code?: string; message?: string } | null }>;

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function looksLikeAddress(value: string | null | undefined) {
  return typeof value === 'string' && /^0x[a-f0-9]{40}$/i.test(value.trim());
}

export function normalizeTransactionType(row: TransactionLike): TransactionType {
  if (row.type === 'escrow_release') {
    if (sameAddress(row.from, row.to)) {
      return 'escrow_refund';
    }

    if (row.from === 'Escrow Vault' && looksLikeAddress(row.to)) {
      return 'escrow_refund';
    }
  }

  return row.type;
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string) {
  return error?.code === 'PGRST204' && error.message?.includes(`'${column}' column`) === true;
}

function isTransactionTypeConstraintError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '23514' && error.message?.includes('transactions_type_check') === true;
}

function withoutBlockNumber<T extends { block_number?: number | null }>(payload: T): Omit<T, 'block_number'> {
  const rest = { ...payload };
  delete rest.block_number;
  return rest;
}

function buildInsertAttempts(payload: InsertTransactionPayload, allowLegacyRefundAlias: boolean) {
  const attempts: InsertTransactionPayload[] = [payload];

  if (payload.block_number !== undefined) {
    attempts.push(withoutBlockNumber(payload) as InsertTransactionPayload);
  }

  if (allowLegacyRefundAlias && payload.type === 'escrow_refund') {
    const aliasPayload = { ...payload, type: 'escrow_release' as const };
    attempts.push(aliasPayload);
    if (aliasPayload.block_number !== undefined) {
      attempts.push(withoutBlockNumber(aliasPayload) as InsertTransactionPayload);
    }
  }

  return attempts.filter((attempt, index, all) => (
    all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(attempt)) === index
  ));
}

export async function insertTransactionRecord<T extends DbTransaction>(
  supabase: {
    from: (table: 'transactions') => {
      insert: (payload: Record<string, unknown>) => {
        select: () => {
          single: () => SupabaseInsertResult<T>;
        };
      };
    };
  },
  payload: InsertTransactionPayload,
  options: { allowLegacyRefundAlias?: boolean } = {},
) {
  const attempts = buildInsertAttempts(payload, !!options.allowLegacyRefundAlias);
  let lastError: { code?: string; message?: string } | null = null;
  let storedType = payload.type;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const { data, error } = await supabase
      .from('transactions')
      .insert(attempt)
      .select()
      .single();

    if (!error && data) {
      storedType = attempt.type;
      return { data, error: null, storedType };
    }

    lastError = error;
    storedType = attempt.type;

    const retryable = isMissingColumnError(error, 'block_number')
      || (payload.type === 'escrow_refund' && isTransactionTypeConstraintError(error));

    if (!retryable || index === attempts.length - 1) {
      break;
    }
  }

  return { data: null, error: lastError, storedType };
}

export async function updateTransactionRecord(
  supabase: {
    from: (table: 'transactions') => {
      update: (payload: Record<string, unknown>) => {
        eq: (column: 'id', value: string) => SupabaseUpdateResult;
      };
    };
  },
  id: string,
  payload: UpdateTransactionPayload,
) {
  let result = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id);

  if (!result.error || !isMissingColumnError(result.error, 'block_number') || payload.block_number === undefined) {
    return result;
  }

  result = await supabase
    .from('transactions')
    .update(withoutBlockNumber(payload))
    .eq('id', id);

  return result;
}
