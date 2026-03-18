import type { DbAgent, DbTask, DbTransaction, DbSecurityAlert, DbGuardrail, DbAuditLogEntry, DbActivityEvent } from './types/database';
import type { Agent, Task, Transaction, SecurityAlert, Guardrail, AuditLogEntry, ActivityEvent } from './types';

export function toAgent(row: DbAgent): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilities: row.capabilities,
    reputation: row.reputation,
    tasksCompleted: row.tasks_completed,
    pricePerTask: row.price_per_task,
    status: row.status,
    type: row.type,
  };
}

export function toTask(row: DbTask): Task {
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
  };
}

export function toTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    amount: row.amount,
    token: row.token,
    status: row.status,
    timestamp: row.timestamp,
    txHash: row.tx_hash,
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
