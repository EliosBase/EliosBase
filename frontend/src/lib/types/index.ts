// ─── Frontend Interfaces ─────────────────────────────────────────

export type {
  AgentExecutionSeverity,
  AgentExecutionFinding,
  AgentExecutionMetadata,
  AgentExecutionResult,
  RunningTaskExecution,
  FailedTaskExecution,
  SucceededTaskExecution,
  TaskExecutionState,
} from './agentExecution';

export {
  getExecutionFailure,
  getExecutionResult,
  isAgentExecutionResult,
} from './agentExecution';

export interface StatItem {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  reputation: number;
  tasksCompleted: number;
  pricePerTask: string;
  status: 'online' | 'busy' | 'offline';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  ownerId?: string;
  walletAddress?: string;
  walletKind?: import('./agentWallet').AgentWalletStandard;
  walletStandard?: import('./agentWallet').AgentWalletStandard;
  walletStatus?: import('./agentWallet').AgentWalletStatus;
  walletMigrationState?: import('./agentWallet').AgentWalletMigrationState;
  walletPolicy?: import('./agentWallet').AgentWalletPolicy;
  walletModules?: import('./agentWallet').AgentWalletModules;
  walletSession?: import('./agentWallet').AgentWalletSessionState;
}

export type TaskStep = 'Submitted' | 'Decomposed' | 'Assigned' | 'Executing' | 'ZK Verifying' | 'Complete';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  currentStep: TaskStep;
  assignedAgent: string;
  reward: string;
  submittedAt: string;
  completedAt?: string;
  zkProofId?: string;
  zkCommitment?: string;
  zkVerifyTxHash?: string;
  hasExecutionResult?: boolean;
  executionFailureMessage?: string;
  executionFailureRetryable?: boolean;
  submitterId?: string;
  agentOperatorAddress?: string;
  agentPayoutAddress?: string;
  agentWalletAddress?: string;
  hasOpenDispute?: boolean;
}

export type {
  AgentWalletExecutionMode,
  AgentWalletMigrationState,
  AgentWalletModules,
  AgentWalletPolicy,
  AgentWalletSessionState,
  AgentWalletStandard,
  AgentWalletStatus,
  AgentWalletTransfer,
  AgentWalletTransferStatus,
} from './agentWallet';

export interface ActivityEvent {
  id: string;
  type: 'task' | 'agent' | 'payment' | 'security' | 'proof';
  message: string;
  timestamp: string;
}

export interface Transaction {
  id: string;
  type: 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'payment' | 'reward' | 'stake';
  from: string;
  to: string;
  amount: string;
  token: string;
  status: 'confirmed' | 'pending' | 'failed';
  timestamp: string;
  txHash: string;
}

export interface SecurityAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  resolved: boolean;
}

export interface Guardrail {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'triggered';
  triggeredCount: number;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  result: 'ALLOW' | 'DENY' | 'FLAG';
}

// ─── Database Row Types ──────────────────────────────────────────

export type {
  DbUser,
  DbAgent,
  DbTask,
  DbTransaction,
  DbSecurityAlert,
  DbGuardrail,
  DbAuditLogEntry,
  DbActivityEvent,
  DbAgentWalletTransfer,
} from './database';
