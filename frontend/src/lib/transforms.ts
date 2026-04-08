import type {
  DbAgent,
  DbTask,
  DbTransaction,
  DbSecurityAlert,
  DbGuardrail,
  DbAuditLogEntry,
  DbActivityEvent,
  DbAgentWalletTransfer,
} from './types/database';
import type {
  Agent,
  Task,
  Transaction,
  SecurityAlert,
  Guardrail,
  AuditLogEntry,
  ActivityEvent,
  AgentWalletTransfer,
} from './types';
import {
  getAgentWalletMigrationState,
  getAgentWalletModules,
  getAgentWalletSession,
  getAgentWalletStandard,
} from './agentWalletCompat';
import { getExecutionFailure, getExecutionResult } from './types/agentExecution';
import { normalizeTransactionType } from './transactions';

export function toAgent(row: DbAgent): Agent {
  const walletSession = getAgentWalletSession(row);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilities: row.capabilities,
    reputation: row.reputation,
    tasksCompleted: row.tasks_completed,
    pricePerTask: row.price_per_task,
    x402PriceUsd: row.x402_price_usd ?? undefined,
    status: row.status,
    type: row.type,
    ownerId: row.owner_id ?? undefined,
    walletAddress: row.wallet_address ?? undefined,
    walletKind: row.wallet_kind ?? undefined,
    walletStandard: getAgentWalletStandard(row),
    walletStatus: row.wallet_status ?? undefined,
    walletMigrationState: getAgentWalletMigrationState(row),
    walletPolicy: row.wallet_policy ?? undefined,
    walletModules: getAgentWalletModules(row),
    walletSession: walletSession
      ? {
        address: walletSession.address,
        validUntil: walletSession.validUntil,
        rotatedAt: walletSession.rotatedAt,
      }
      : undefined,
  };
}

export function toTask(row: DbTask): Task {
  const executionResult = getExecutionResult(row.execution_result);
  const executionFailure = getExecutionFailure(row.execution_result);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    currentStep: row.current_step,
    assignedAgent: row.agents?.name ?? row.assigned_agent ?? '',
    reward: row.reward,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at ?? undefined,
    zkProofId: row.zk_proof_id ?? undefined,
    zkCommitment: row.zk_commitment ?? undefined,
    zkVerifyTxHash: row.zk_verify_tx_hash ?? undefined,
    hasExecutionResult: executionResult !== null,
    executionFailureMessage: executionFailure?.message,
    executionFailureRetryable: executionFailure?.retryable,
    submitterId: row.submitter_id,
    agentOperatorAddress: row.agents?.users?.wallet_address ?? undefined,
    agentPayoutAddress: row.agents?.wallet_address ?? row.agents?.users?.wallet_address ?? undefined,
    agentWalletAddress: row.agents?.wallet_address ?? undefined,
    hasOpenDispute: row.has_open_dispute ?? false,
    escrowToken: (row.escrow_token as 'ETH' | 'USDC') ?? 'ETH',
    easAttestationUid: row.eas_attestation_uid ?? undefined,
  };
}

export function toTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    type: normalizeTransactionType(row),
    from: row.from,
    to: row.to,
    amount: row.amount,
    token: row.token,
    status: row.status,
    timestamp: row.timestamp,
    txHash: row.tx_hash,
    taskId: row.task_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    paymentNetwork: row.payment_network ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
  };
}

export function toSecurityAlert(row: DbSecurityAlert): SecurityAlert {
  return {
    id: row.id,
    severity: row.severity,
    title: row.title,
    description: row.description,
    source: row.source,
    timestamp: timeAgo(row.timestamp),
    resolved: row.resolved,
  };
}

export function toGuardrail(row: DbGuardrail): Guardrail {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    triggeredCount: row.triggered_count,
  };
}

export function toAuditLogEntry(row: DbAuditLogEntry): AuditLogEntry {
  const date = new Date(row.timestamp);
  const time = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return {
    timestamp: time,
    action: row.action,
    actor: row.actor,
    target: row.target,
    result: row.result,
  };
}

export function toActivityEvent(row: DbActivityEvent): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    timestamp: timeAgo(row.timestamp),
  };
}

export function toAgentWalletTransfer(row: DbAgentWalletTransfer): AgentWalletTransfer {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agents?.name ?? undefined,
    safeAddress: row.safe_address,
    destination: row.destination,
    amountEth: row.amount_eth,
    note: row.note,
    status: row.status,
    policyReason: row.policy_reason ?? undefined,
    approvalsRequired: row.approvals_required,
    approvalsReceived: row.approvals_received,
    unlockAt: row.unlock_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    executedAt: row.executed_at ?? undefined,
    executedBy: row.executed_by ?? undefined,
    txHash: row.tx_hash ?? undefined,
    executionMode: row.execution_mode ?? undefined,
    intentHash: row.intent_hash ?? undefined,
    userOpHash: row.user_op_hash ?? undefined,
    policyTxHash: row.policy_tx_hash ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

function timeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
