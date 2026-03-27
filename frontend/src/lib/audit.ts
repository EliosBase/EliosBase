import { createServiceClient } from '@/lib/supabase/server';
import { readEnv } from '@/lib/env';

// ─── Audit Log Actions ──────────────────────────────────────────
export type AuditAction =
  | 'TASK_CREATE'
  | 'TASK_ASSIGN'
  | 'TASK_COMPLETE'
  | 'TASK_UPDATE'
  | 'ESCROW_LOCK'
  | 'ESCROW_RELEASE'
  | 'ESCROW_REFUND'
  | 'PAYMENT'
  | 'REWARD'
  | 'STAKE'
  | 'AGENT_REGISTER'
  | 'AGENT_HIRE'
  | 'SPENDING_LIMIT'
  | 'RATE_LIMIT'
  | 'PROOF_SUBMIT'
  | 'PROOF_VERIFY'
  | 'AGENT_EXECUTE'
  | 'ALERT_CREATE'
  | 'ALERT_RESOLVE'
  | 'GUARDRAIL_TOGGLE'
  | 'TASK_RESULT_VIEW'
  | 'TASK_RETRY'
  | 'TASK_REASSIGN'
  | 'TASK_CANCEL'
  | 'TASK_DISPUTE';

export type AuditResult = 'ALLOW' | 'DENY' | 'FLAG';

/**
 * Write an entry to the audit_log table.
 * Best-effort — errors are caught so they never break the parent request.
 */
export async function logAudit(params: {
  action: AuditAction;
  actor: string;
  target: string;
  result: AuditResult;
}) {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('audit_log').insert({
      action: params.action,
      actor: params.actor,
      target: params.target,
      result: params.result,
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (err) {
    console.error('[audit] unexpected error:', err);
  }
}

// ─── Activity Event Types ───────────────────────────────────────
export type ActivityType = 'task' | 'agent' | 'payment' | 'security' | 'proof';

/**
 * Write an entry to the activity_events table.
 * Best-effort — errors are caught so they never break the parent request.
 */
export async function logActivity(params: {
  type: ActivityType;
  message: string;
  userId?: string | null;
}) {
  try {
    const supabase = createServiceClient();
    const id = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from('activity_events').insert({
      id,
      type: params.type,
      message: params.message,
      user_id: params.userId ?? null,
    });
    if (error) console.error('[activity] insert failed:', error.message);
  } catch (err) {
    console.error('[activity] unexpected error:', err);
  }
}

// ─── Security Alert Creation ────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Programmatically create a security alert and log it.
 */
export async function createSecurityAlert(params: {
  severity: AlertSeverity;
  title: string;
  description: string;
  source: string;
  actor?: string;
}) {
  const supabase = createServiceClient();
  const id = `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await supabase.from('security_alerts').insert({
    id,
    severity: params.severity,
    title: params.title,
    description: params.description,
    source: params.source,
    resolved: false,
  });

  if (!error) {
    await logAudit({
      action: 'ALERT_CREATE',
      actor: params.actor ?? params.source,
      target: id,
      result: 'FLAG',
    });
    await logActivity({
      type: 'security',
      message: `Security alert: ${params.title}`,
    });

    // Fire webhook for critical/high alerts (Discord/Slack compatible)
    const webhookUrl = readEnv(process.env.ALERT_WEBHOOK_URL);
    if (webhookUrl && ['critical', 'high'].includes(params.severity)) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[${params.severity.toUpperCase()}] ${params.title}: ${params.description}`,
        }),
      }).catch(() => {}); // best-effort, non-blocking
    }
  }

  return { id, error };
}

// ─── Guardrail Check Helpers ────────────────────────────────────

/**
 * Safely parse a reward string like "0.05 ETH" to a number.
 * Returns 0 for any unparseable input (never NaN).
 */
export function parseRewardAmount(reward: unknown): number {
  if (typeof reward !== 'string') return 0;
  const stripped = reward.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(stripped);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Check spending limit guardrail. Returns { allowed }.
 */
export async function checkSpendingLimit(rewardAmount: number): Promise<{ allowed: boolean }> {
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    return { allowed: true };
  }

  const supabase = createServiceClient();

  const { data: guardrail } = await supabase
    .from('guardrails')
    .select('*')
    .ilike('name', '%spending%')
    .single();

  if (!guardrail || guardrail.status === 'paused') {
    return { allowed: true };
  }

  const PER_TASK_CAP = 1.0;

  if (rewardAmount > PER_TASK_CAP) {
    await supabase
      .from('guardrails')
      .update({
        triggered_count: guardrail.triggered_count + 1,
        status: 'triggered',
      })
      .eq('id', guardrail.id);

    await createSecurityAlert({
      severity: 'high',
      title: 'Spending limit exceeded',
      description: `Task reward ${rewardAmount} ETH exceeds per-task cap of ${PER_TASK_CAP} ETH`,
      source: 'Guardrail: Spending Limits',
    });

    return { allowed: false };
  }

  return { allowed: true };
}

/**
 * Check rate limit guardrail. Counts active tasks assigned to agent in the last hour.
 */
export async function checkRateLimit(agentId: string): Promise<{ allowed: boolean }> {
  const supabase = createServiceClient();

  const { data: guardrail } = await supabase
    .from('guardrails')
    .select('*')
    .ilike('name', '%rate%')
    .single();

  if (!guardrail || guardrail.status === 'paused') {
    return { allowed: true };
  }

  // Count active/executing tasks for this agent (not historical completed ones)
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_agent', agentId)
    .eq('status', 'active');

  const RATE_LIMIT = 50;

  if ((count ?? 0) >= RATE_LIMIT) {
    await supabase
      .from('guardrails')
      .update({
        triggered_count: guardrail.triggered_count + 1,
        status: 'triggered',
      })
      .eq('id', guardrail.id);

    await createSecurityAlert({
      severity: 'medium',
      title: 'Rate limit exceeded',
      description: `Agent ${agentId} has ${count} active tasks, exceeding threshold of ${RATE_LIMIT}`,
      source: 'Guardrail: Rate Limiting',
      actor: agentId,
    });

    return { allowed: false };
  }

  return { allowed: true };
}

/**
 * Map a transaction type to the correct audit action.
 */
export function txTypeToAuditAction(type: string): AuditAction {
  switch (type) {
    case 'escrow_lock': return 'ESCROW_LOCK';
    case 'escrow_release': return 'ESCROW_RELEASE';
    case 'escrow_refund': return 'ESCROW_REFUND';
    case 'payment': return 'PAYMENT';
    case 'reward': return 'REWARD';
    case 'stake': return 'STAKE';
    default: return 'PAYMENT';
  }
}

/**
 * Generate a collision-resistant ID with prefix.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
