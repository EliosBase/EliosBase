import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { collapseNoisyActivity } from '@/lib/productionData';
import { getConfiguredFramesBaseUrl, getConfiguredSiteUrl } from '@/lib/runtimeConfig';
import { getTaskIdFromDisputeSource, buildTaskDisputeSource } from '@/lib/taskDisputes';
import { toAgent, toTask } from '@/lib/transforms';
import { normalizeTransactionType } from '@/lib/transactions';
import { buildAgentExecutionSurface } from '@/lib/x402';
import {
  buildAbsoluteUrl,
  buildAgentShareText,
  buildTaskShareText,
  buildWarpcastComposeUrl,
  getAgentFramePath,
  getAgentPath,
  getTaskFramePath,
  getTaskPath,
} from '@/lib/web4Links';
import type {
  Agent,
  DbActivityEvent,
  DbAgent,
  DbAuditLogEntry,
  DbSecurityAlert,
  DbTask,
  DbTransaction,
  GraphActivityEvent,
  GraphEntityType,
  ReputationBreakdown,
  Task,
  AgentPassport,
  TaskReceipt,
  SessionKeyStatus,
  WalletPolicySummary,
} from '@/lib/types';

type GraphCursor = {
  occurredAt: string;
  id: string;
};

type GraphFeedParams = {
  limit: number;
  cursor?: string | null;
  entityType?: GraphEntityType | null;
  entityId?: string | null;
  eventType?: string | null;
};

type GraphFeedResult = {
  items: GraphActivityEvent[];
  nextCursor?: string;
};

type UrlContext = {
  siteUrl: string;
  framesBaseUrl: string;
};

type AgentMetricsInput = {
  agent: Agent;
  assignedTasks: Task[];
  relatedTransactions: DbTransaction[];
  relatedAlerts: DbSecurityAlert[];
};

type EntityIndex = {
  tasksById: Map<string, Task>;
  tasksByTitle: Map<string, Task>;
  tasksByNumericAlias: Map<string, Task>;
  agentsById: Map<string, Agent>;
  agentsByName: Map<string, Agent>;
};

const DEFAULT_SITE_URL = 'https://eliosbase.net';
const PUBLIC_FETCH_LIMIT = 250;
const RELATED_FETCH_LIMIT = 400;
const GRAPH_FEED_DEFAULT_LIMIT = 20;
const GRAPH_FEED_MAX_LIMIT = 100;
const UNCONFIGURED_POLICY_VALUE = '0';

type PartialWalletPolicy = Partial<NonNullable<Agent['walletPolicy']>>;

function getUrlContext(): UrlContext {
  const siteUrl = getConfiguredSiteUrl() ?? DEFAULT_SITE_URL;
  const framesBaseUrl = getConfiguredFramesBaseUrl() ?? siteUrl;

  return { siteUrl, framesBaseUrl };
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function getWalletPolicy(agent: Agent): PartialWalletPolicy | null {
  const policy = agent.walletPolicy;
  if (!policy || typeof policy !== 'object') {
    return null;
  }

  return policy;
}

function getWalletPolicyOwners(policy: PartialWalletPolicy) {
  return Array.isArray(policy.owners) ? policy.owners : [];
}

function parseEthAmount(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numbersClose(left: number, right: number, tolerance = 0.000001) {
  return Math.abs(left - right) <= tolerance;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackRate(total: number, fallback: number) {
  return total > 0 ? undefined : clampScore(fallback);
}

function computeRate(matches: number, total: number, fallback: number) {
  const fallbackScore = fallbackRate(total, fallback);
  if (fallbackScore !== undefined) {
    return fallbackScore;
  }

  return clampScore((matches / total) * 100);
}

function relativeTime(isoDate: string) {
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

function getTaskNumericAlias(id: string) {
  const match = id.match(/(\d+)$/);
  return match?.[1]?.padStart(3, '0') ?? null;
}

function buildEntityIndex(tasks: Task[], agents: Agent[]): EntityIndex {
  const tasksById = new Map<string, Task>();
  const tasksByTitle = new Map<string, Task>();
  const tasksByNumericAlias = new Map<string, Task>();
  const agentsById = new Map<string, Agent>();
  const agentsByName = new Map<string, Agent>();

  tasks.forEach((task) => {
    tasksById.set(normalizeKey(task.id), task);
    tasksByTitle.set(normalizeKey(task.title), task);

    const numericAlias = getTaskNumericAlias(task.id);
    if (numericAlias) {
      tasksByNumericAlias.set(numericAlias, task);
    }
  });

  agents.forEach((agent) => {
    agentsById.set(normalizeKey(agent.id), agent);
    agentsByName.set(normalizeKey(agent.name), agent);
  });

  return {
    tasksById,
    tasksByTitle,
    tasksByNumericAlias,
    agentsById,
    agentsByName,
  };
}

function findTaskByHint(index: EntityIndex, hint: string | null | undefined) {
  const normalizedHint = normalizeKey(hint);
  if (!normalizedHint) {
    return null;
  }

  return index.tasksById.get(normalizedHint)
    ?? index.tasksByTitle.get(normalizedHint)
    ?? index.tasksByNumericAlias.get(normalizedHint)
    ?? null;
}

function findAgentByHint(index: EntityIndex, hint: string | null | undefined) {
  const normalizedHint = normalizeKey(hint);
  if (!normalizedHint) {
    return null;
  }

  return index.agentsById.get(normalizedHint)
    ?? index.agentsByName.get(normalizedHint)
    ?? null;
}

function getWalletPolicySummary(agent: Agent): WalletPolicySummary | null {
  const policy = getWalletPolicy(agent);
  if (!policy) {
    return null;
  }

  const owners = getWalletPolicyOwners(policy);
  const ownerCount = owners.length;
  const threshold = typeof policy.threshold === 'number' && Number.isFinite(policy.threshold)
    ? policy.threshold
    : 0;
  const timelockSeconds = typeof policy.timelockSeconds === 'number' && Number.isFinite(policy.timelockSeconds)
    ? policy.timelockSeconds
    : 0;

  return {
    standard: policy.standard ?? agent.walletStandard ?? 'safe',
    threshold: threshold > 0 && ownerCount > 0 ? `${threshold}-of-${ownerCount}` : 'unconfigured',
    ownerCount,
    dailySpendLimitEth: policy.dailySpendLimitEth ?? UNCONFIGURED_POLICY_VALUE,
    autoApproveThresholdEth: policy.autoApproveThresholdEth ?? UNCONFIGURED_POLICY_VALUE,
    reviewThresholdEth: policy.reviewThresholdEth ?? UNCONFIGURED_POLICY_VALUE,
    timelockThresholdEth: policy.timelockThresholdEth ?? UNCONFIGURED_POLICY_VALUE,
    timelockSeconds,
    blockedDestinationCount: Array.isArray(policy.blockedDestinations) ? policy.blockedDestinations.length : 0,
    allowlistedContractCount: Array.isArray(policy.allowlistedContracts) ? policy.allowlistedContracts.length : 0,
  };
}

function getSessionStatus(agent: Agent): SessionKeyStatus {
  const validUntil = agent.walletSession?.validUntil;
  if (!agent.walletSession?.address || !validUntil) {
    return { status: 'absent' };
  }

  const isExpired = new Date(validUntil).getTime() <= Date.now();
  return {
    status: isExpired ? 'expired' : 'active',
    address: agent.walletSession.address,
    validUntil,
    rotatedAt: agent.walletSession.rotatedAt,
  };
}

function isAgentAlert(alert: DbSecurityAlert, agent: Agent) {
  const haystack = [
    alert.title,
    alert.description,
    alert.source,
  ].join(' ').toLowerCase();

  return [
    agent.id,
    agent.name,
    agent.walletAddress,
  ].some((value) => {
    const normalized = normalizeKey(value);
    return normalized ? haystack.includes(normalized) : false;
  });
}

function getWalletSafetyScore(agent: Agent, alerts: DbSecurityAlert[]) {
  if (!agent.walletAddress || !agent.walletStandard) {
    return 0;
  }

  const policy = getWalletPolicy(agent);
  if (!policy) {
    return 30;
  }

  const hasCorePolicyControls = Boolean(
    policy.dailySpendLimitEth
    && policy.reviewThresholdEth
    && policy.timelockThresholdEth
    && (policy.timelockSeconds ?? 0) > 0,
  );
  const hasBlockingAlerts = alerts.some((alert) => (
    !alert.resolved
    && ['critical', 'high'].includes(alert.severity)
    && isAgentAlert(alert, agent)
  ));

  if (hasCorePolicyControls && !hasBlockingAlerts) {
    return 100;
  }

  return 70;
}

function getTaskProofStatus(task: Pick<Task, 'status' | 'currentStep' | 'zkProofId' | 'zkVerifyTxHash'>): TaskReceipt['proof']['proofStatus'] {
  if (task.zkProofId || task.zkVerifyTxHash) {
    return 'verified';
  }

  if (task.currentStep === 'ZK Verifying') {
    return 'verifying';
  }

  if (task.status === 'failed') {
    return 'failed';
  }

  return 'pending';
}

function getDisputedTaskIds(alerts: DbSecurityAlert[]) {
  return new Set(
    alerts
      .map((alert) => getTaskIdFromDisputeSource(alert.source))
      .filter((taskId): taskId is string => Boolean(taskId)),
  );
}

function buildAgentMetrics({ agent, assignedTasks, relatedTransactions, relatedAlerts }: AgentMetricsInput) {
  const completedTasks = assignedTasks.filter((task) => task.status === 'completed');
  const disputedTaskIds = getDisputedTaskIds(relatedAlerts);
  const disputedTasks = assignedTasks.filter((task) => disputedTaskIds.has(task.id));
  const verifiedTasks = completedTasks.filter((task) => getTaskProofStatus(task) === 'verified');
  const releaseTransactions = relatedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release');
  const confirmedReleaseTransactions = releaseTransactions.filter((row) => row.status === 'confirmed');
  const walletSafetyScore = getWalletSafetyScore(agent, relatedAlerts);

  const completionRate = computeRate(completedTasks.length, assignedTasks.length, agent.reputation);
  const proofVerificationRate = computeRate(verifiedTasks.length, completedTasks.length, agent.reputation);
  const disputeFreeRate = computeRate(
    assignedTasks.length - disputedTasks.length,
    assignedTasks.length,
    agent.reputation,
  );
  const payoutSuccessRate = computeRate(
    confirmedReleaseTransactions.length,
    completedTasks.length,
    agent.reputation,
  );

  const score = clampScore(
    completionRate * 0.35
    + proofVerificationRate * 0.25
    + disputeFreeRate * 0.20
    + payoutSuccessRate * 0.10
    + walletSafetyScore * 0.10,
  );

  const reputationBreakdown: ReputationBreakdown = {
    completionRate,
    proofVerificationRate,
    disputeFreeRate,
    payoutSuccessRate,
    walletSafetyScore,
    score,
  };

  return {
    completedTasks,
    disputedTasks,
    reputationBreakdown,
    walletSafetyScore,
  };
}

function resolveEntityUrl(entityType: GraphEntityType | undefined, entityId: string | undefined, urls: UrlContext) {
  if (!entityType || !entityId) {
    return undefined;
  }

  if (entityType === 'agent') {
    return buildAbsoluteUrl(getAgentPath(entityId), urls.siteUrl);
  }

  if (entityType === 'task' || entityType === 'proof' || entityType === 'payment') {
    return buildAbsoluteUrl(getTaskPath(entityId), urls.siteUrl);
  }

  return undefined;
}

function resolveActivityEntity(message: string, type: GraphActivityEvent['type'], index: EntityIndex) {
  const taskIdMatch = message.match(/\b(task-[a-z0-9-]+)\b/i);
  if (taskIdMatch) {
    const task = findTaskByHint(index, taskIdMatch[1]);
    if (task) {
      return { entityType: 'task' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  const numberedTaskMatch = message.match(/\bTask\s+#(\d+)\b/i);
  if (numberedTaskMatch) {
    const task = findTaskByHint(index, numberedTaskMatch[1].padStart(3, '0'));
    if (task) {
      return { entityType: 'task' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  const quotedTaskMatch = message.match(/Task\s+"([^"]+)"/i);
  if (quotedTaskMatch) {
    const task = findTaskByHint(index, quotedTaskMatch[1]);
    if (task) {
      return { entityType: 'task' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  const titledTaskMatch = message.match(/(?:for task|task completed|task deleted|task:)\s*:?\s*(.+)$/i);
  if (titledTaskMatch) {
    const task = findTaskByHint(index, titledTaskMatch[1]);
    if (task) {
      return { entityType: 'task' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  const proofTaskMatch = message.match(/ZK proof (?:submitted|generated|verified) for(?: task)?:\s+(.+)$/i);
  if (proofTaskMatch) {
    const task = findTaskByHint(index, proofTaskMatch[1]);
    if (task) {
      return { entityType: 'proof' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  if (type === 'agent') {
    const agentMatch = message.match(/(?:Agent hired|Agent available):\s+(.+)$/i)
      ?? message.match(/^(.+?)\s+completed\s+\d[\d,]*(?:th|st|nd|rd)\s+task milestone/i)
      ?? message.match(/^(.+?)\s+reputation updated:/i);

    if (agentMatch) {
      const agent = findAgentByHint(index, agentMatch[1]);
      if (agent) {
        return { entityType: 'agent' as const, entityId: agent.id };
      }
    }
  }

  if (type === 'payment' && /escrow/i.test(message)) {
    const task = Array.from(index.tasksById.values()).find((candidate) => (
      message.toLowerCase().includes(candidate.title.toLowerCase())
    ));
    if (task) {
      return { entityType: 'payment' as const, entityId: task.id, proofId: task.zkProofId ?? task.zkVerifyTxHash ?? undefined };
    }
  }

  if (type === 'security' && /dispute/i.test(message)) {
    const disputeMatch = message.match(/\b(task-[a-z0-9-]+)\b/i);
    if (disputeMatch) {
      return { entityType: 'security' as const, entityId: disputeMatch[1] };
    }
  }

  return {};
}

function getActivityEventType(message: string, type: GraphActivityEvent['type']) {
  const normalized = message.toLowerCase();

  if (type === 'task') {
    if (normalized.includes('execution started')) return 'execution.started';
    if (normalized.includes('execution completed')) return 'execution.completed';
    if (normalized.includes('execution failed')) return 'execution.failed';
    if (normalized.includes('assigned')) return 'task.assigned';
    if (normalized.includes('completed')) return 'task.completed';
    if (normalized.includes('deleted')) return 'task.deleted';
    if (normalized.includes('decomposed')) return 'task.decomposed';
    if (normalized.includes('advanced') || normalized.includes('moved to')) return 'task.step_changed';
    return 'task.updated';
  }

  if (type === 'agent') {
    if (normalized.includes('hired')) return 'agent.hired';
    if (normalized.includes('available')) return 'agent.available';
    if (normalized.includes('milestone')) return 'agent.milestone';
    if (normalized.includes('reputation')) return 'agent.reputation';
    return 'agent.updated';
  }

  if (type === 'payment') {
    if (normalized.includes('payment required')) return 'payment.required';
    if (normalized.includes('x402 payment accepted')) return 'payment.accepted';
    if (normalized.includes('locked')) return 'payment.escrow_locked';
    if (normalized.includes('released')) return 'payment.escrow_released';
    if (normalized.includes('refunded')) return 'payment.escrow_refunded';
    if (normalized.includes('synced')) return 'payment.synced';
    return 'payment.updated';
  }

  if (type === 'proof') {
    if (normalized.includes('verified')) return 'proof.verified';
    if (normalized.includes('submitted')) return 'proof.submitted';
    if (normalized.includes('generated')) return 'proof.generated';
    return 'proof.updated';
  }

  if (normalized.includes('guardrail')) return 'security.guardrail';
  if (normalized.includes('alert')) return 'security.alert';
  return 'security.updated';
}

export function buildGraphActivityEvents(params: {
  activityRows: DbActivityEvent[];
  tasks: Task[];
  agents: Agent[];
  urls: UrlContext;
}) {
  const index = buildEntityIndex(params.tasks, params.agents);

  return collapseNoisyActivity(params.activityRows)
    .map<GraphActivityEvent>((row) => {
      const resolved = resolveActivityEntity(row.message, row.type, index);
      return {
        id: row.id,
        type: row.type,
        message: row.message,
        timestamp: relativeTime(row.timestamp),
        source: 'activity',
        occurredAt: row.timestamp,
        eventType: getActivityEventType(row.message, row.type),
        entityType: resolved.entityType,
        entityId: resolved.entityId,
        entityUrl: resolveEntityUrl(resolved.entityType, resolved.entityId, params.urls),
        proofId: resolved.proofId,
      };
    })
    .sort((left, right) => (
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    ));
}

function compareEventCursor(left: GraphActivityEvent, right: GraphCursor) {
  const leftTime = new Date(left.occurredAt).getTime();
  const rightTime = new Date(right.occurredAt).getTime();

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

export function encodeGraphCursor(event: GraphActivityEvent) {
  return Buffer.from(JSON.stringify({ occurredAt: event.occurredAt, id: event.id })).toString('base64url');
}

export function decodeGraphCursor(cursor: string | null | undefined): GraphCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.occurredAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as GraphCursor;
    }
  } catch {
    return null;
  }

  return null;
}

export function paginateGraphActivityEvents(events: GraphActivityEvent[], params: GraphFeedParams): GraphFeedResult {
  const cursor = decodeGraphCursor(params.cursor);
  const limit = Math.min(Math.max(params.limit || GRAPH_FEED_DEFAULT_LIMIT, 1), GRAPH_FEED_MAX_LIMIT);

  let filtered = events;

  if (params.entityType) {
    filtered = filtered.filter((event) => event.entityType === params.entityType);
  }

  if (params.entityId) {
    filtered = filtered.filter((event) => event.entityId === params.entityId);
  }

  if (params.eventType) {
    filtered = filtered.filter((event) => event.eventType === params.eventType);
  }

  if (cursor) {
    filtered = filtered.filter((event) => compareEventCursor(event, cursor) < 0);
  }

  const items = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = hasMore ? encodeGraphCursor(filtered[limit - 1]) : undefined;

  return { items, nextCursor };
}

function auditEntityTarget(taskId: string | undefined, agentId: string | undefined, urls: UrlContext) {
  if (taskId) {
    return {
      entityType: 'task' as const,
      entityId: taskId,
      entityUrl: buildAbsoluteUrl(getTaskPath(taskId), urls.siteUrl),
    };
  }

  if (agentId) {
    return {
      entityType: 'agent' as const,
      entityId: agentId,
      entityUrl: buildAbsoluteUrl(getAgentPath(agentId), urls.siteUrl),
    };
  }

  return {};
}

function formatAuditMessage(row: DbAuditLogEntry) {
  const action = row.action.toLowerCase().replace(/_/g, ' ');
  return `Audit ${action}: ${row.target}`;
}

function buildAuditEvent(row: DbAuditLogEntry, taskId: string | undefined, agentId: string | undefined, urls: UrlContext): GraphActivityEvent {
  const resolved = auditEntityTarget(taskId, agentId, urls);
  return {
    id: `audit-${row.id}`,
    type: taskId ? 'task' : agentId ? 'agent' : 'security',
    message: formatAuditMessage(row),
    timestamp: relativeTime(row.timestamp),
    source: 'audit',
    occurredAt: row.timestamp,
    eventType: `audit.${row.action.toLowerCase()}`,
    ...resolved,
  };
}

function buildSecurityEvent(alert: DbSecurityAlert, taskId: string | undefined, urls: UrlContext): GraphActivityEvent {
  return {
    id: `security-${alert.id}`,
    type: 'security',
    message: `${alert.title}: ${alert.description}`,
    timestamp: relativeTime(alert.timestamp),
    source: 'security',
    occurredAt: alert.timestamp,
    eventType: taskId ? 'security.dispute' : 'security.alert',
    entityType: taskId ? 'security' : undefined,
    entityId: taskId,
    entityUrl: taskId ? buildAbsoluteUrl(getTaskPath(taskId), urls.siteUrl) : undefined,
  };
}

function buildTransactionEvent(row: DbTransaction, taskId: string, urls: UrlContext): GraphActivityEvent {
  const normalizedType = normalizeTransactionType(row);
  const isX402Payment = normalizedType === 'payment' && row.payment_method === 'x402';
  const eventType = isX402Payment
    ? row.status === 'confirmed'
      ? 'payment.accepted'
      : row.status === 'failed'
        ? 'payment.failed'
        : 'payment.pending'
    : normalizedType === 'escrow_lock'
    ? 'payment.escrow_locked'
    : normalizedType === 'escrow_release'
      ? 'payment.escrow_released'
      : normalizedType === 'escrow_refund'
        ? 'payment.escrow_refunded'
        : `payment.${normalizedType}`;

  const message = isX402Payment
    ? `X402 payment accepted for task: ${taskId}`
    : normalizedType === 'escrow_lock'
    ? `Escrow locked on Base: ${row.amount} ${row.token}`
    : normalizedType === 'escrow_release'
      ? `Escrow released on Base: ${row.amount} ${row.token}`
      : normalizedType === 'escrow_refund'
        ? `Escrow refunded on Base: ${row.amount} ${row.token}`
        : `Transaction recorded on Base: ${row.amount} ${row.token}`;

  return {
    id: `transaction-${row.id}`,
    type: 'payment',
    message,
    timestamp: relativeTime(row.timestamp),
    source: 'transaction',
    occurredAt: row.timestamp,
    eventType,
    entityType: 'payment',
    entityId: taskId,
    entityUrl: buildAbsoluteUrl(getTaskPath(taskId), urls.siteUrl),
    txHash: row.tx_hash,
  };
}

function buildTaskPaymentEvent(task: Task, urls: UrlContext): GraphActivityEvent | null {
  if (task.payment?.method !== 'x402' || !task.payment.txHash) {
    return null;
  }

  return {
    id: `task-payment-${task.id}`,
    type: 'payment',
    message: task.payment.status === 'failed'
      ? `X402 payment failed for task: ${task.title}`
      : `X402 payment accepted for task: ${task.title}`,
    timestamp: relativeTime(task.submittedAt),
    source: 'transaction',
    occurredAt: task.submittedAt,
    eventType: task.payment.status === 'failed' ? 'payment.failed' : 'payment.accepted',
    entityType: 'payment',
    entityId: task.id,
    entityUrl: buildAbsoluteUrl(getTaskPath(task.id), urls.siteUrl),
    txHash: task.payment.txHash,
  };
}

function pickClosestTransaction(transactions: DbTransaction[], referenceAt: string) {
  const referenceTime = new Date(referenceAt).getTime();
  return [...transactions].sort((left, right) => (
    Math.abs(new Date(left.timestamp).getTime() - referenceTime)
    - Math.abs(new Date(right.timestamp).getTime() - referenceTime)
  ))[0];
}

function pickTaskTransactions(task: Task, transactions: DbTransaction[], agent: Agent | null) {
  const directTaskMatches = transactions.filter((row) => row.task_id === task.id);
  const directAgentMatches = agent
    ? transactions.filter((row) => row.agent_id === agent.id)
    : [];
  const rewardAmount = parseEthAmount(task.reward);
  const agentHints = [
    normalizeKey(agent?.id),
    normalizeKey(agent?.name),
    normalizeKey(agent?.walletAddress),
    normalizeKey(task.agentWalletAddress),
    normalizeKey(task.agentPayoutAddress),
    normalizeKey(task.assignedAgent),
  ].filter(Boolean);

  const rewardMatches = transactions.filter((row) => numbersClose(parseEthAmount(row.amount), rewardAmount));
  const relatedByHint = rewardMatches.filter((row) => {
    const fromTo = `${row.from} ${row.to}`.toLowerCase();
    return agentHints.length === 0 || agentHints.some((hint) => fromTo.includes(hint));
  });

  const lockReference = task.submittedAt;
  const completionReference = task.completedAt ?? task.submittedAt;

  const relatedTransactions = [...directTaskMatches, ...directAgentMatches, ...relatedByHint];
  const lockCandidates = relatedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_lock');
  const releaseCandidates = relatedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release');
  const refundCandidates = relatedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_refund');
  const paymentCandidates = relatedTransactions.filter((row) => normalizeTransactionType(row) === 'payment');

  return {
    lock: pickClosestTransaction(lockCandidates, lockReference),
    release: pickClosestTransaction(releaseCandidates, completionReference),
    refund: pickClosestTransaction(refundCandidates, completionReference),
    payment: pickClosestTransaction(paymentCandidates, lockReference),
  };
}

function buildTaskTimeline(params: {
  task: Task;
  agent: Agent | null;
  activityRows: DbActivityEvent[];
  auditRows: DbAuditLogEntry[];
  alerts: DbSecurityAlert[];
  transactions: DbTransaction[];
  urls: UrlContext;
}) {
  const activityEvents = buildGraphActivityEvents({
    activityRows: params.activityRows,
    tasks: [params.task],
    agents: params.agent ? [params.agent] : [],
    urls: params.urls,
  }).filter((event) => event.entityId === params.task.id);

  const taskAuditEvents = params.auditRows
    .filter((row) => {
      const taskTarget = row.target.split(':')[0]?.trim();
      return taskTarget === params.task.id || row.target.includes(params.task.id);
    })
    .map((row) => buildAuditEvent(row, params.task.id, params.agent?.id, params.urls));

  const disputeEvents = params.alerts
    .filter((alert) => alert.source === buildTaskDisputeSource(params.task.id))
    .map((alert) => buildSecurityEvent(alert, params.task.id, params.urls));

  const taskTransactions = pickTaskTransactions(params.task, params.transactions, params.agent);
  const fallbackPaymentEvent = taskTransactions.payment ? null : buildTaskPaymentEvent(params.task, params.urls);
  const transactionEvents = [taskTransactions.payment, taskTransactions.lock, taskTransactions.release, taskTransactions.refund]
    .filter((row): row is DbTransaction => Boolean(row))
    .map((row) => buildTransactionEvent(row, params.task.id, params.urls));

  return [...activityEvents, ...taskAuditEvents, ...disputeEvents, ...transactionEvents, ...(fallbackPaymentEvent ? [fallbackPaymentEvent] : [])]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 12);
}

export function buildAgentPassport(params: {
  agent: Agent;
  assignedTasks: Task[];
  activityRows: DbActivityEvent[];
  transactions: DbTransaction[];
  alerts: DbSecurityAlert[];
  urls: UrlContext;
}): AgentPassport {
  const relatedTransactions = params.transactions.filter((row) => {
    if (row.agent_id === params.agent.id) {
      return true;
    }

    if (row.task_id && params.assignedTasks.some((task) => task.id === row.task_id)) {
      return true;
    }

    const fromTo = `${row.from} ${row.to}`.toLowerCase();
    const agentKeys = [
      normalizeKey(params.agent.name),
      normalizeKey(params.agent.walletAddress),
      normalizeKey(params.agent.id),
    ].filter(Boolean);

    return agentKeys.some((key) => fromTo.includes(key));
  });

  const metrics = buildAgentMetrics({
    agent: params.agent,
    assignedTasks: params.assignedTasks,
    relatedTransactions,
    relatedAlerts: params.alerts.filter((alert) => isAgentAlert(alert, params.agent)),
  });

  const pageUrl = buildAbsoluteUrl(getAgentPath(params.agent.id), params.urls.siteUrl);
  const frameUrl = buildAbsoluteUrl(getAgentFramePath(params.agent.id), params.urls.framesBaseUrl);
  const shareText = buildAgentShareText(
    params.agent.name,
    params.agent.tasksCompleted,
    metrics.reputationBreakdown.score,
  );
  const recentActivity = buildGraphActivityEvents({
    activityRows: params.activityRows,
    tasks: params.assignedTasks,
    agents: [params.agent],
    urls: params.urls,
  }).filter((event) => {
    if (event.entityType === 'agent' && event.entityId === params.agent.id) {
      return true;
    }

    return event.entityType === 'task'
      && params.assignedTasks.some((task) => task.id === event.entityId);
  }).slice(0, 5);

  const badges = [
    metrics.completedTasks.some((task) => getTaskProofStatus(task) === 'verified') ? 'zk-verified' : null,
    metrics.walletSafetyScore >= 70 ? 'policy-guarded' : null,
    getSessionStatus(params.agent).status === 'active' ? 'session-active' : null,
    metrics.disputedTasks.length === 0 && params.assignedTasks.length > 0 ? 'dispute-free' : null,
  ].filter((value): value is string => Boolean(value));
  const paymentSurface = buildAgentExecutionSurface({
    agentId: params.agent.id,
    agentName: params.agent.name,
    description: params.agent.description,
    priceUsd: params.agent.x402PriceUsd,
    payTo: params.agent.walletAddress,
    siteUrl: params.urls.siteUrl,
    framesBaseUrl: params.urls.framesBaseUrl,
  });

  return {
    identity: {
      id: params.agent.id,
      name: params.agent.name,
      description: params.agent.description,
      type: params.agent.type,
      status: params.agent.status,
      capabilities: params.agent.capabilities,
    },
    performance: {
      tasksCompleted: params.agent.tasksCompleted,
      completionRate: metrics.reputationBreakdown.completionRate,
      proofVerificationRate: metrics.reputationBreakdown.proofVerificationRate,
      disputeRate: clampScore(100 - metrics.reputationBreakdown.disputeFreeRate),
      payoutSuccessRate: metrics.reputationBreakdown.payoutSuccessRate,
    },
    trust: {
      reputationScore: metrics.reputationBreakdown.score,
      reputationBreakdown: metrics.reputationBreakdown,
      badges,
    },
    wallet: {
      walletAddress: params.agent.walletAddress,
      walletStandard: params.agent.walletStandard,
      walletStatus: params.agent.walletStatus,
      walletPolicySummary: getWalletPolicySummary(params.agent),
      sessionKeyStatus: getSessionStatus(params.agent),
    },
    pricingSummary: paymentSurface.pricingSummary,
    payableCapabilities: paymentSurface.payableCapabilities,
    paymentMethods: paymentSurface.paymentMethods,
    pageUrl,
    frameUrl,
    capabilitiesUrl: paymentSurface.capabilitiesUrl,
    executeUrl: paymentSurface.executeUrl,
    warpcastShareUrl: buildWarpcastComposeUrl(shareText, pageUrl),
    activity: recentActivity,
  };
}

export function buildTaskReceipt(params: {
  task: Task;
  agent: Agent | null;
  activityRows: DbActivityEvent[];
  auditRows: DbAuditLogEntry[];
  alerts: DbSecurityAlert[];
  transactions: DbTransaction[];
  urls: UrlContext;
}): TaskReceipt {
  const taskTransactions = pickTaskTransactions(params.task, params.transactions, params.agent);
  const proofStatus = getTaskProofStatus(params.task);
  const pageUrl = buildAbsoluteUrl(getTaskPath(params.task.id), params.urls.siteUrl);
  const frameUrl = buildAbsoluteUrl(getTaskFramePath(params.task.id), params.urls.framesBaseUrl);
  const payment: TaskReceipt['payment'] = taskTransactions.payment
    ? {
      method: taskTransactions.payment.payment_method === 'x402' ? 'x402' : 'escrow',
      amount: taskTransactions.payment.amount,
      currency: taskTransactions.payment.token,
      network: taskTransactions.payment.payment_network ?? undefined,
      payer: taskTransactions.payment.from,
      status: taskTransactions.payment.status === 'confirmed'
        ? 'settled'
        : taskTransactions.payment.status === 'failed'
          ? 'failed'
          : 'accepted',
      txHash: taskTransactions.payment.tx_hash,
      paymentReference: taskTransactions.payment.payment_reference ?? taskTransactions.payment.tx_hash,
    }
    : params.task.payment
      ? params.task.payment
    : {
      method: taskTransactions.lock || taskTransactions.release || taskTransactions.refund ? 'escrow' : 'none',
      status: 'none' as const,
    };

  return {
    identity: {
      id: params.task.id,
      title: params.task.title,
      description: params.task.description,
      status: params.task.status,
      currentStep: params.task.currentStep,
    },
    economics: {
      reward: params.task.reward,
      submitterId: params.task.submitterId,
      assignedAgent: params.agent
        ? {
          id: params.agent.id,
          name: params.agent.name,
          type: params.agent.type,
          status: params.agent.status,
        }
        : params.task.assignedAgent
          ? { name: params.task.assignedAgent }
          : null,
    },
    escrow: {
      lockTxHash: taskTransactions.lock?.tx_hash ?? undefined,
      releaseTxHash: taskTransactions.release?.tx_hash ?? undefined,
      refundTxHash: taskTransactions.refund?.tx_hash ?? undefined,
      escrowStatus: taskTransactions.refund
        ? 'refunded'
        : taskTransactions.release
          ? 'released'
          : taskTransactions.lock || params.task.assignedAgent
            ? 'locked'
            : 'awaiting-lock',
    },
    proof: {
      zkProofId: params.task.zkProofId,
      zkVerifyTxHash: params.task.zkVerifyTxHash,
      proofStatus,
    },
    resolution: {
      completedAt: params.task.completedAt,
      hasOpenDispute: params.task.hasOpenDispute ?? false,
      executionFailureMessage: params.task.executionFailureMessage,
    },
    payment,
    pageUrl,
    frameUrl,
    warpcastShareUrl: buildWarpcastComposeUrl(buildTaskShareText(params.task.title, proofStatus), pageUrl),
    timeline: buildTaskTimeline(params),
  };
}

export async function getAgentPassport(id: string) {
  const supabase = createServiceClient();
  const urls = getUrlContext();

  const [agentRes, tasksRes, activityRes, transactionsRes, alertsRes] = await Promise.all([
    supabase
      .from('agents')
      .select('*, users:owner_id(wallet_address)')
      .eq('id', id)
      .single(),
    supabase
      .from('tasks')
      .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, wallet_standard, wallet_migration_state, type, description, capabilities, users:owner_id(wallet_address))')
      .eq('assigned_agent', id)
      .order('submitted_at', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('activity_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('transactions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(RELATED_FETCH_LIMIT),
    supabase
      .from('security_alerts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
  ]);

  if (agentRes.error || !agentRes.data) {
    return null;
  }

  const agent = toAgent(agentRes.data as DbAgent);
  const tasks = (tasksRes.data ?? []).map((row) => {
    const openDispute = (alertsRes.data ?? []).some((alert) => getTaskIdFromDisputeSource(alert.source) === row.id && !alert.resolved);
    return toTask({
      ...(row as DbTask),
      has_open_dispute: openDispute,
    });
  });

  return buildAgentPassport({
    agent,
    assignedTasks: tasks,
    activityRows: (activityRes.data ?? []) as DbActivityEvent[],
    transactions: (transactionsRes.data ?? []) as DbTransaction[],
    alerts: (alertsRes.data ?? []) as DbSecurityAlert[],
    urls,
  });
}

export async function getTaskReceipt(id: string) {
  const supabase = createServiceClient();
  const urls = getUrlContext();

  const [taskRes, alertsRes, activityRes, auditRes, transactionsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, wallet_standard, wallet_migration_state, type, description, capabilities, users:owner_id(wallet_address))')
      .eq('id', id)
      .single(),
    supabase
      .from('security_alerts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('activity_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('transactions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(RELATED_FETCH_LIMIT),
  ]);

  if (taskRes.error || !taskRes.data) {
    return null;
  }

  const taskAlerts = (alertsRes.data ?? []) as DbSecurityAlert[];
  const task = toTask({
    ...(taskRes.data as DbTask),
    has_open_dispute: taskAlerts.some((alert) => alert.source === buildTaskDisputeSource(id) && !alert.resolved),
  });
  const agent = taskRes.data.agents
    ? toAgent({
      id: task.assignedAgent,
      name: taskRes.data.agents.name,
      description: taskRes.data.agents.description ?? '',
      capabilities: taskRes.data.agents.capabilities ?? [],
      reputation: 0,
      tasks_completed: 0,
      price_per_task: task.reward,
      status: 'online',
      type: taskRes.data.agents.type ?? 'executor',
      owner_id: taskRes.data.agents.owner_id ?? null,
      wallet_address: taskRes.data.agents.wallet_address ?? null,
      wallet_status: taskRes.data.agents.wallet_status ?? null,
      wallet_standard: taskRes.data.agents.wallet_standard ?? null,
      wallet_policy: taskRes.data.agents.wallet_policy ?? null,
      wallet_migration_state: taskRes.data.agents.wallet_migration_state ?? null,
      created_at: task.submittedAt,
    } as DbAgent)
    : null;

  return buildTaskReceipt({
    task,
    agent,
    activityRows: (activityRes.data ?? []) as DbActivityEvent[],
    auditRows: (auditRes.data ?? []) as DbAuditLogEntry[],
    alerts: taskAlerts,
    transactions: (transactionsRes.data ?? []) as DbTransaction[],
    urls,
  });
}

export async function getPublicActivityFeed(params: GraphFeedParams) {
  const supabase = createServiceClient();
  const urls = getUrlContext();
  const [activityRes, tasksRes, agentsRes] = await Promise.all([
    supabase
      .from('activity_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('tasks')
      .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, wallet_standard, wallet_migration_state, type, description, capabilities, users:owner_id(wallet_address))')
      .order('submitted_at', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
    supabase
      .from('agents')
      .select('*')
      .order('reputation', { ascending: false })
      .limit(PUBLIC_FETCH_LIMIT),
  ]);

  const tasks = (tasksRes.data ?? []).map((row) => toTask(row as DbTask));
  const agents = (agentsRes.data ?? []).map((row) => toAgent(row as DbAgent));
  const events = buildGraphActivityEvents({
    activityRows: (activityRes.data ?? []) as DbActivityEvent[],
    tasks,
    agents,
    urls,
  });

  return paginateGraphActivityEvents(events, params);
}
