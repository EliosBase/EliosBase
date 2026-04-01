/**
 * Centralized query key factory.
 * Prevents key mismatches across hooks and ensures type-safe invalidation.
 */

export const queryKeys = {
  // ── Tasks ───────────────────────────────────────────────
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: { status?: string }) => ['tasks', filters] as const,
    detail: (id: string) => ['tasks', id] as const,
    result: (id: string) => ['task-result', id] as const,
  },

  // ── Agents ──────────────────────────────────────────────
  agents: {
    all: ['agents'] as const,
    list: (opts?: { type?: string; status?: string; search?: string }) =>
      ['agents', opts] as const,
    detail: (id: string) => ['agents', id] as const,
  },

  // ── Activity ────────────────────────────────────────────
  activity: {
    all: ['activity'] as const,
  },

  // ── Transactions ────────────────────────────────────────
  transactions: {
    all: ['transactions'] as const,
  },

  // ── Security ────────────────────────────────────────────
  security: {
    alerts: ['security-alerts'] as const,
    guardrails: ['guardrails'] as const,
    auditLog: ['audit-log'] as const,
  },

  // ── Wallet ──────────────────────────────────────────────
  wallet: {
    stats: ['wallet-stats'] as const,
  },

  // ── Dashboard ───────────────────────────────────────────
  dashboard: {
    stats: ['dashboard-stats'] as const,
  },

  // ── Admin ───────────────────────────────────────────────
  admin: {
    overview: ['admin-overview'] as const,
  },
} as const;
