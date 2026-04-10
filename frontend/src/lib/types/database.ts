import type { TaskExecutionState } from './agentExecution';
import type {
  AgentWalletExecutionMode,
  AgentWalletMigrationState,
  AgentWalletModules,
  AgentWalletPolicy,
  AgentWalletStandard,
  AgentWalletStatus,
  AgentWalletTransferStatus,
} from './agentWallet';

export interface DbUser {
  id: string;
  wallet_address: string;
  role: 'submitter' | 'operator' | 'admin';
  created_at: string;
  last_seen_at: string;
}

export interface DbAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  reputation: number;
  tasks_completed: number;
  price_per_task: string;
  x402_price_usd?: string | null;
  status: 'online' | 'busy' | 'offline' | 'suspended';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  owner_id: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  suspended_by?: string | null;
  wallet_address?: string | null;
  wallet_kind?: AgentWalletStandard | null;
  wallet_standard?: AgentWalletStandard | null;
  wallet_status?: AgentWalletStatus | null;
  wallet_migration_state?: AgentWalletMigrationState | null;
  wallet_policy?: AgentWalletPolicy | null;
  wallet_modules?: AgentWalletModules | null;
  session_key_address?: string | null;
  session_key_expires_at?: string | null;
  session_key_rotated_at?: string | null;
  worldid_verified?: boolean | null;
  users?: { wallet_address?: string | null } | null;
  created_at: string;
}

export interface DbTask {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  current_step: 'Submitted' | 'Decomposed' | 'Assigned' | 'Executing' | 'ZK Verifying' | 'Complete';
  assigned_agent: string | null;
  reward: string;
  submitter_id: string;
  submitted_at: string;
  completed_at: string | null;
  execution_result: TaskExecutionState | null;
  zk_proof_id: string | null;
  zk_commitment: string | null;
  zk_verify_tx_hash: string | null;
  step_changed_at?: string | null;
  has_open_dispute?: boolean;
  agents?: {
    name: string;
    wallet_address?: string | null;
    wallet_policy?: AgentWalletPolicy | null;
    wallet_status?: AgentWalletStatus | null;
    wallet_standard?: AgentWalletStandard | null;
    wallet_migration_state?: AgentWalletMigrationState | null;
    type?: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
    description?: string;
    capabilities?: string[];
    owner_id?: string | null;
    users?: { wallet_address: string } | null;
  };
  escrow_token?: string | null;
  eas_attestation_uid?: string | null;
  eas_attestation_tx?: string | null;
}

export interface DbTransaction {
  id: string;
  type: 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'payment' | 'reward' | 'stake';
  from: string;
  to: string;
  amount: string;
  token: string;
  status: 'confirmed' | 'pending' | 'failed';
  timestamp: string;
  tx_hash: string;
  user_id: string | null;
  task_id?: string | null;
  agent_id?: string | null;
  payment_network?: string | null;
  payment_reference?: string | null;
  payment_method?: string | null;
}

export interface DbSecurityAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  resolved: boolean;
}

export interface DbGuardrail {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'triggered';
  triggered_count: number;
}

export interface DbAuditLogEntry {
  id: number;
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  result: 'ALLOW' | 'DENY' | 'FLAG';
}

export interface DbActivityEvent {
  id: string;
  type: 'task' | 'agent' | 'payment' | 'security' | 'proof';
  message: string;
  timestamp: string;
  user_id: string | null;
}

export interface DbAgentWalletTransfer {
  id: string;
  agent_id: string;
  agents?: {
    name: string;
  } | null;
  safe_address: string;
  destination: string;
  amount_eth: string;
  note: string;
  status: AgentWalletTransferStatus;
  policy_reason: string | null;
  approvals_required: number;
  approvals_received: number;
  unlock_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  executed_at: string | null;
  executed_by: string | null;
  tx_hash: string | null;
  execution_mode: AgentWalletExecutionMode | null;
  intent_hash: string | null;
  user_op_hash: string | null;
  policy_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
}
