import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseEther,
  type Address,
} from 'viem';
import type { DbAgent, DbAgentWalletTransfer } from '@/lib/types';
import type {
  AgentWalletExecutionMode,
  AgentWalletMigrationState,
  AgentWalletModules,
  AgentWalletPolicy,
  AgentWalletSessionState,
  AgentWalletStandard,
} from '@/lib/types';

const COMPAT_KEY = '__safe7579';

type CompatSessionState = AgentWalletSessionState & {
  ciphertext?: string;
  nonce?: string;
  tag?: string;
};

type CompatMeta = {
  migrationState?: AgentWalletMigrationState;
  modules?: AgentWalletModules;
  session?: CompatSessionState;
  revision?: number;
};

type AgentWalletRecord = Pick<
  DbAgent,
  | 'wallet_kind'
  | 'wallet_standard'
  | 'wallet_migration_state'
  | 'wallet_policy'
  | 'wallet_modules'
  | 'session_key_address'
  | 'session_key_expires_at'
  | 'session_key_rotated_at'
> & {
  session_key_ciphertext?: string | null;
  session_key_nonce?: string | null;
  session_key_tag?: string | null;
};

type TransferRecord = Pick<
  DbAgentWalletTransfer,
  'execution_mode' | 'approvals_required' | 'unlock_at' | 'safe_address' | 'destination' | 'amount_eth'
>;

function readCompatMeta(policy?: AgentWalletPolicy | null): CompatMeta {
  if (!policy || typeof policy !== 'object') {
    return {};
  }

  const raw = (policy as unknown as Record<string, unknown>)[COMPAT_KEY];
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return raw as CompatMeta;
}

export function getAgentWalletStandard(record: AgentWalletRecord): AgentWalletStandard {
  return record.wallet_standard
    ?? record.wallet_policy?.standard
    ?? record.wallet_kind
    ?? 'safe';
}

export function getAgentWalletMigrationState(record: AgentWalletRecord): AgentWalletMigrationState {
  if (record.wallet_migration_state) {
    return record.wallet_migration_state;
  }

  const compat = readCompatMeta(record.wallet_policy);
  if (compat.migrationState) {
    return compat.migrationState;
  }

  return getAgentWalletStandard(record) === 'safe7579' ? 'migrated' : 'legacy';
}

export function getAgentWalletModules(record: AgentWalletRecord): AgentWalletModules | undefined {
  return record.wallet_modules ?? readCompatMeta(record.wallet_policy).modules;
}

export function getAgentWalletSession(record: AgentWalletRecord): CompatSessionState | undefined {
  if (record.session_key_address) {
    return {
      address: record.session_key_address,
      validUntil: record.session_key_expires_at ?? undefined,
      rotatedAt: record.session_key_rotated_at ?? undefined,
      ciphertext: record.session_key_ciphertext ?? undefined,
      nonce: record.session_key_nonce ?? undefined,
      tag: record.session_key_tag ?? undefined,
    };
  }

  return readCompatMeta(record.wallet_policy).session;
}

export function isMigratedSafe7579(record: AgentWalletRecord) {
  return getAgentWalletStandard(record) === 'safe7579'
    && getAgentWalletMigrationState(record) === 'migrated';
}

export function mergeSafe7579Compatibility(
  policy: AgentWalletPolicy,
  updates: {
    migrationState?: AgentWalletMigrationState;
    modules?: AgentWalletModules;
    session?: CompatSessionState;
    revision?: number;
  },
): AgentWalletPolicy {
  const current = readCompatMeta(policy);
  const next = {
    ...current,
    ...updates,
    modules: updates.modules ?? current.modules,
    session: updates.session ?? current.session,
    revision: updates.revision ?? current.revision ?? 2,
  };

  return {
    ...policy,
    standard: 'safe7579',
    [COMPAT_KEY]: next,
  } as AgentWalletPolicy;
}

export function inferTransferExecutionMode(
  transfer: TransferRecord,
  agent: AgentWalletRecord,
): AgentWalletExecutionMode {
  if (transfer.execution_mode) {
    return transfer.execution_mode;
  }

  if (transfer.approvals_required > 1 || transfer.unlock_at) {
    return 'reviewed';
  }

  return isMigratedSafe7579(agent) ? 'session' : 'owner';
}

export function deriveReviewedIntentHash(
  transfer: Pick<TransferRecord, 'safe_address' | 'destination' | 'amount_eth'>,
) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'safe', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
      [
        getAddress(transfer.safe_address as Address),
        getAddress(transfer.destination as Address),
        parseEther(transfer.amount_eth),
      ],
    ),
  );
}
