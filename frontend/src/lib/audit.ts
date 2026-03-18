import { createServiceClient } from '@/lib/supabase/server';

// ─── Audit Log Actions ──────────────────────────────────────────
export type AuditAction =
  | 'TASK_CREATE'
  | 'TASK_ASSIGN'
  | 'TASK_COMPLETE'
  | 'TASK_UPDATE'
  | 'ESCROW_LOCK'
  | 'ESCROW_RELEASE'
  | 'AGENT_REGISTER'
  | 'AGENT_HIRE'
  | 'SPENDING_LIMIT'
  | 'RATE_LIMIT'
  | 'PROOF_SUBMIT'
  | 'PROOF_VERIFY'
  | 'ALERT_CREATE'
  | 'ALERT_RESOLVE'
  | 'GUARDRAIL_TOGGLE';

export type AuditResult = 'ALLOW' | 'DENY' | 'FLAG';

/**
 * Write an entry to the audit_log table.
 * Fire-and-forget — callers should not await unless they need confirmation.
 */
export async function logAudit(params: {
  action: AuditAction;
  actor: string;   // wallet address or agent ID
  target: string;  // resource identifier
  result: AuditResult;
}) {
  const supabase = createServiceClient();
  await supabase.from('audit_log').insert({
    action: params.action,
    actor: params.actor,
    target: params.target,
    result: params.result,
  });
}

// ─── Activity Event Types ───────────────────────────────────────
export type ActivityType = 'task' | 'agent' | 'payment' | 'security' | 'proof';

/**
 * Write an entry to the activity_events table.
 */
export async function logActivity(params: {
  type: ActivityType;
  message: string;
  userId?: string | null;
}) {
  const supabase = createServiceClient();
  await supabase.from('activity_events').insert({
    id: `ev-${Date.now().toString(36)}`,
    type: params.type,
    message: params.message,
    user_id: params.userId ?? null,
  });
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
  const id = `alert-${Date.now().toString(36)}`;

  const { error } = await supabase.from('security_alerts').insert({
    id,
    severity: params.severity,
    title: params.title,
    description: params.description,
    source: params.source,
    resolved: false,
  });

  if (!error) {
    // Log to audit trail
    await logAudit({
      action: 'ALERT_CREATE',
      actor: params.actor ?? params.source,
      target: id,
      result: 'FLAG',
    });
    // Log to activity feed
    await logActivity({
      type: 'security',
      message: `Security alert: ${params.title}`,
    });
  }

  return { id, error };
}

// ─── Guardrail Check Helpers ────────────────────────────────────

/**
 * Check spending limit guardrail. Returns { allowed, guardrailId }.
 */
export async function checkSpendingLimit(rewardAmount: number): Promise<{ allowed: boolean }> {
  const supabase = createServiceClient();

  // Fetch the spending limits guardrail
  const { data: guardrail } = await supabase
    .from('guardrails')
    .select('*')
    .ilike('name', '%spending%')
    .single();

  if (!guardrail || guardrail.status === 'paused') {
    return { allowed: true };
  }

  // Per-task cap: 1 ETH (configurable — could move to guardrail description or a config table)
  const PER_TASK_CAP = 1.0;
  const amount = rewardAmount;

  if (amount > PER_TASK_CAP) {
    // Increment triggered count
    await supabase
      .from('guardrails')
      .update({
        triggered_count: guardrail.triggered_count + 1,
        status: 'triggered',
      })
      .eq('id', guardrail.id);

    // Create security alert
    await createSecurityAlert({
      severity: 'high',
      title: 'Spending limit exceeded',
      description: `Task reward ${amount} ETH exceeds per-task cap of ${PER_TASK_CAP} ETH`,
      source: 'Guardrail: Spending Limits',
    });

    return { allowed: false };
  }

  return { allowed: true };
}

/**
 * Check rate limit guardrail. Tracks API calls per agent within a time window.
 */
export async function checkRateLimit(agentId: string): Promise<{ allowed: boolean }> {
  const supabase = createServiceClient();

  // Fetch the rate limiting guardrail
  const { data: guardrail } = await supabase
    .from('guardrails')
    .select('*')
    .ilike('name', '%rate%')
    .single();

  if (!guardrail || guardrail.status === 'paused') {
    return { allowed: true };
  }

  // Check tasks assigned to this agent in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_agent', agentId)
    .gte('submitted_at', oneHourAgo);

  const RATE_LIMIT = 50; // max tasks per agent per hour

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
      description: `Agent ${agentId} exceeded ${RATE_LIMIT} tasks/hour threshold`,
      source: 'Guardrail: Rate Limiting',
      actor: agentId,
    });

    return { allowed: false };
  }

  return { allowed: true };
}
