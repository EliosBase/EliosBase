import type { TaskExecutionState } from './agentExecution';

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
  status: 'online' | 'busy' | 'offline';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  owner_id: string | null;
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
    type?: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
    description?: string;
    capabilities?: string[];
    owner_id?: string | null;
    users?: { wallet_address: string } | null;
  };
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
