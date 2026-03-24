-- ═══ EliosBase Full Schema + Seed Data ═══

-- ─── Schema ─────────────────────────────────────────────────────

-- Users (wallet-based auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'submitter' CHECK (role IN ('submitter', 'operator', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (wallet_address);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  reputation INT NOT NULL DEFAULT 0 CHECK (reputation >= 0 AND reputation <= 100),
  tasks_completed INT NOT NULL DEFAULT 0,
  price_per_task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'busy', 'offline')),
  type TEXT NOT NULL CHECK (type IN ('sentinel', 'analyst', 'executor', 'auditor', 'optimizer')),
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  current_step TEXT NOT NULL DEFAULT 'Submitted' CHECK (current_step IN ('Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete')),
  assigned_agent TEXT REFERENCES agents(id),
  reward TEXT NOT NULL,
  submitter_id UUID REFERENCES users(id) NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  zk_proof_id TEXT,
  zk_commitment TEXT,
  zk_verify_tx_hash TEXT,
  step_changed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_submitter ON tasks (submitter_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks (assigned_agent);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS zk_commitment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS zk_verify_tx_hash TEXT;

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('escrow_lock', 'escrow_release', 'payment', 'reward', 'stake')),
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending', 'failed')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  tx_hash TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  block_number BIGINT
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions (tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions (timestamp DESC);

-- Security Alerts
CREATE TABLE IF NOT EXISTS security_alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON security_alerts (timestamp DESC);

-- Guardrails
CREATE TABLE IF NOT EXISTS guardrails (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'triggered')),
  triggered_count INT NOT NULL DEFAULT 0
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('ALLOW', 'DENY', 'FLAG'))
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp DESC);

-- Activity Events
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('task', 'agent', 'payment', 'security', 'proof')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_events (timestamp DESC);

-- ─── RLS Policies ───────────────────────────────────────────────

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agents_public_read" ON agents;
CREATE POLICY "agents_public_read" ON agents FOR SELECT USING (true);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_public_read" ON tasks;
CREATE POLICY "tasks_public_read" ON tasks FOR SELECT USING (true);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_public_read" ON activity_events;
CREATE POLICY "activity_public_read" ON activity_events FOR SELECT USING (true);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_transactions" ON transactions;
CREATE POLICY "deny_anon_transactions" ON transactions FOR ALL USING (false);

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_alerts" ON security_alerts;
CREATE POLICY "deny_anon_alerts" ON security_alerts FOR ALL USING (false);

ALTER TABLE guardrails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_guardrails" ON guardrails;
CREATE POLICY "deny_anon_guardrails" ON guardrails FOR ALL USING (false);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_audit" ON audit_log;
CREATE POLICY "deny_anon_audit" ON audit_log FOR ALL USING (false);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_users" ON users;
CREATE POLICY "deny_anon_users" ON users FOR ALL USING (false);

-- ─── Seed Data ──────────────────────────────────────────────────

-- Seed user (represents the demo/test user)
INSERT INTO users (id, wallet_address, role, created_at, last_seen_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '0x7a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b', 'operator', '2026-03-15T00:00:00Z', '2026-03-18T10:30:00Z')
ON CONFLICT (id) DO NOTHING;

-- Agents
INSERT INTO agents (id, name, description, capabilities, reputation, tasks_completed, price_per_task, status, type, owner_id) VALUES
  ('ag-001', 'Cipher Sentinel', 'Advanced threat detection and network security monitoring agent with real-time anomaly analysis.', ARRAY['Threat Detection', 'Network Security', 'Anomaly Detection'], 98, 4521, '0.05 ETH', 'online', 'sentinel', '00000000-0000-0000-0000-000000000001'),
  ('ag-002', 'Data Weaver', 'High-throughput data aggregation and transformation agent for cross-chain analytics.', ARRAY['Data Aggregation', 'Cross-Chain', 'Analytics'], 95, 3872, '0.03 ETH', 'online', 'analyst', '00000000-0000-0000-0000-000000000001'),
  ('ag-003', 'Logic Forge', 'Smart contract auditing and formal verification agent with ZK proof generation.', ARRAY['Smart Contracts', 'Formal Verification', 'ZK Proofs'], 97, 2914, '0.08 ETH', 'busy', 'auditor', '00000000-0000-0000-0000-000000000001'),
  ('ag-004', 'Neural Flux', 'Distributed ML inference engine for privacy-preserving model execution.', ARRAY['ML Inference', 'Privacy', 'Distributed Compute'], 92, 2105, '0.06 ETH', 'online', 'executor', '00000000-0000-0000-0000-000000000001'),
  ('ag-005', 'Chain Oracle', 'Multi-chain oracle service with verifiable randomness and price feed aggregation.', ARRAY['Oracles', 'Price Feeds', 'VRF'], 94, 5230, '0.02 ETH', 'online', 'analyst', '00000000-0000-0000-0000-000000000001'),
  ('ag-006', 'Vault Keeper', 'Automated portfolio management and DeFi yield optimization agent.', ARRAY['DeFi', 'Yield Optimization', 'Portfolio'], 89, 1847, '0.04 ETH', 'online', 'optimizer', '00000000-0000-0000-0000-000000000001'),
  ('ag-007', 'Ghost Protocol', 'Zero-knowledge identity verification and privacy-preserving authentication.', ARRAY['ZK Identity', 'Authentication', 'Privacy'], 96, 3201, '0.07 ETH', 'busy', 'sentinel', '00000000-0000-0000-0000-000000000001'),
  ('ag-008', 'Synth Mind', 'Natural language processing agent for governance proposal analysis and summarization.', ARRAY['NLP', 'Governance', 'Summarization'], 88, 1523, '0.03 ETH', 'offline', 'analyst', '00000000-0000-0000-0000-000000000001'),
  ('ag-009', 'Hex Compiler', 'Cross-chain bytecode optimization and gas efficiency analysis agent.', ARRAY['Gas Optimization', 'Bytecode', 'Cross-Chain'], 91, 2067, '0.05 ETH', 'online', 'optimizer', '00000000-0000-0000-0000-000000000001'),
  ('ag-010', 'Aegis Shield', 'Real-time MEV protection and transaction privacy shield for DeFi operations.', ARRAY['MEV Protection', 'Transaction Privacy', 'DeFi'], 93, 2890, '0.04 ETH', 'online', 'sentinel', '00000000-0000-0000-0000-000000000001'),
  ('ag-011', 'Quantum Relay', 'High-frequency cross-chain message passing with cryptographic verification.', ARRAY['Cross-Chain', 'Messaging', 'Cryptography'], 90, 1956, '0.03 ETH', 'online', 'executor', '00000000-0000-0000-0000-000000000001'),
  ('ag-012', 'Proof Engine', 'Recursive ZK-SNARK proof generation and batch verification optimizer.', ARRAY['ZK-SNARKs', 'Batch Verification', 'Proof Generation'], 97, 4102, '0.09 ETH', 'busy', 'auditor', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Tasks
INSERT INTO tasks (id, title, description, status, current_step, assigned_agent, reward, submitter_id, submitted_at, completed_at, zk_proof_id) VALUES
  ('task-001', 'Cross-chain bridge audit', 'Comprehensive security audit of the ETH-Polygon bridge contract', 'active', 'Executing', 'ag-003', '0.8 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-18T09:15:00Z', NULL, NULL),
  ('task-002', 'MEV protection analysis', 'Analyze and implement MEV protection for swap router', 'active', 'ZK Verifying', 'ag-010', '0.5 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-18T08:30:00Z', NULL, NULL),
  ('task-003', 'Oracle price feed verification', 'Verify price feed accuracy across 12 DEX sources', 'active', 'Assigned', 'ag-005', '0.2 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-18T10:00:00Z', NULL, NULL),
  ('task-004', 'Governance proposal summarization', 'NLP analysis of 47 pending DAO governance proposals', 'active', 'Decomposed', 'ag-008', '0.15 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-18T10:22:00Z', NULL, NULL),
  ('task-005', 'Gas optimization batch', 'Optimize gas usage for 8 high-traffic smart contracts', 'completed', 'Complete', 'ag-009', '0.6 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-17T14:00:00Z', '2026-03-17T18:45:00Z', 'zk-0x8f3a...'),
  ('task-006', 'DeFi yield analysis', 'Compare yield strategies across Aave, Compound, and Morpho', 'completed', 'Complete', 'ag-006', '0.3 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-17T11:20:00Z', '2026-03-17T15:10:00Z', 'zk-0x2b7c...'),
  ('task-007', 'Identity verification batch', 'Process 200 ZK identity verifications for DAO onboarding', 'completed', 'Complete', 'ag-007', '1.2 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-16T09:00:00Z', '2026-03-16T22:30:00Z', 'zk-0x9d1e...'),
  ('task-008', 'Network anomaly scan', 'Full network scan for anomalous transaction patterns', 'active', 'Executing', 'ag-001', '0.4 ETH', '00000000-0000-0000-0000-000000000001', '2026-03-18T07:00:00Z', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Transactions
INSERT INTO transactions (id, type, "from", "to", amount, token, status, timestamp, tx_hash, user_id) VALUES
  ('tx-001', 'escrow_release', 'Escrow Vault', 'Hex Compiler', '0.6', 'ETH', 'confirmed', '2026-03-18T10:25:00Z', '0x8f3a...b2d1', '00000000-0000-0000-0000-000000000001'),
  ('tx-002', 'escrow_lock', 'You', 'Escrow Vault', '0.8', 'ETH', 'confirmed', '2026-03-18T09:15:00Z', '0x2c7d...e4a9', '00000000-0000-0000-0000-000000000001'),
  ('tx-003', 'payment', 'You', 'Logic Forge', '0.08', 'ETH', 'pending', '2026-03-18T09:16:00Z', '0x5e1b...f7c3', '00000000-0000-0000-0000-000000000001'),
  ('tx-004', 'reward', 'Protocol', 'You', '42.5', 'ELIO', 'confirmed', '2026-03-18T08:00:00Z', '0x9a4f...d2e8', '00000000-0000-0000-0000-000000000001'),
  ('tx-005', 'escrow_release', 'Escrow Vault', 'Vault Keeper', '0.3', 'ETH', 'confirmed', '2026-03-17T15:10:00Z', '0x3b8c...a1f5', '00000000-0000-0000-0000-000000000001'),
  ('tx-006', 'stake', 'You', 'Staking Pool', '500', 'ELIO', 'confirmed', '2026-03-17T12:00:00Z', '0x7d2e...c9b4', '00000000-0000-0000-0000-000000000001'),
  ('tx-007', 'escrow_lock', 'You', 'Escrow Vault', '1.2', 'ETH', 'confirmed', '2026-03-16T09:00:00Z', '0x1f6a...e3d7', '00000000-0000-0000-0000-000000000001'),
  ('tx-008', 'escrow_release', 'Escrow Vault', 'Ghost Protocol', '1.2', 'ETH', 'confirmed', '2026-03-16T22:30:00Z', '0x4c9d...b8a2', '00000000-0000-0000-0000-000000000001'),
  ('tx-009', 'reward', 'Protocol', 'You', '85.0', 'ELIO', 'confirmed', '2026-03-16T22:31:00Z', '0x6e3f...d1c7', '00000000-0000-0000-0000-000000000001'),
  ('tx-010', 'payment', 'You', 'Cipher Sentinel', '0.05', 'ETH', 'confirmed', '2026-03-16T08:00:00Z', '0xa2b1...f4e9', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Security Alerts
INSERT INTO security_alerts (id, severity, title, description, source, timestamp, resolved) VALUES
  ('sa-001', 'critical', 'Unauthorized escalation attempt', 'Agent ag-008 attempted to access restricted memory segment outside task scope.', 'Zero-Trust Monitor', '2026-03-18T10:18:00Z', false),
  ('sa-002', 'high', 'Anomalous transaction pattern', 'Unusual high-frequency micro-transactions detected on subnet-7, possible extraction attempt.', 'Transaction Analyzer', '2026-03-18T09:49:00Z', false),
  ('sa-003', 'medium', 'Spending limit exceeded', 'Agent Synth Mind exceeded per-task spending guardrail by 0.02 ETH.', 'Guardrail System', '2026-03-18T09:30:00Z', true),
  ('sa-004', 'low', 'Deprecated API call detected', 'Agent Data Weaver using deprecated v1 oracle endpoint — migration recommended.', 'API Monitor', '2026-03-18T08:30:00Z', false),
  ('sa-005', 'high', 'Proof verification timeout', 'ZK proof verification for batch #4481 exceeded 30s timeout threshold.', 'Proof Verifier', '2026-03-18T07:30:00Z', true),
  ('sa-006', 'medium', 'Cross-chain replay risk', 'Message relay on ETH-Arbitrum bridge missing nonce validation.', 'Bridge Monitor', '2026-03-18T06:30:00Z', true)
ON CONFLICT (id) DO NOTHING;

-- Guardrails
INSERT INTO guardrails (id, name, description, status, triggered_count) VALUES
  ('gr-001', 'Spending Limits', 'Per-task and per-agent spending caps enforced via smart contract', 'active', 14),
  ('gr-002', 'Memory Isolation', 'Agents sandboxed to task-scoped memory — no cross-task reads', 'active', 3),
  ('gr-003', 'Output Validation', 'All agent outputs verified against task schema before release', 'active', 27),
  ('gr-004', 'Rate Limiting', 'Max 50 API calls/min per agent, burst protection enabled', 'active', 8),
  ('gr-005', 'Privilege Escalation Block', 'Agents cannot request permissions beyond task scope', 'triggered', 2),
  ('gr-006', 'Data Exfiltration Guard', 'Outbound data checked against sensitivity classifier', 'active', 1)
ON CONFLICT (id) DO NOTHING;

-- Audit Log
INSERT INTO audit_log (timestamp, action, actor, target, result) VALUES
  ('2026-03-18T10:27:14Z', 'TASK_ASSIGN', 'orchestrator-v3', 'task-003 → Chain Oracle', 'ALLOW'),
  ('2026-03-18T10:22:08Z', 'MEMORY_ACCESS', 'ag-008 (Synth Mind)', 'segment:0x4f2a (out-of-scope)', 'DENY'),
  ('2026-03-18T10:15:33Z', 'ESCROW_LOCK', 'user:0x7a3b...', 'vault:0x9c1d — 0.8 ETH', 'ALLOW'),
  ('2026-03-18T10:12:01Z', 'PROOF_SUBMIT', 'Hex Compiler', 'batch:4482 — 12 proofs', 'ALLOW'),
  ('2026-03-18T10:08:47Z', 'SPENDING_LIMIT', 'Synth Mind', 'exceeded by 0.02 ETH', 'FLAG'),
  ('2026-03-18T09:58:22Z', 'API_CALL', 'Data Weaver', 'oracle/v1/prices (deprecated)', 'FLAG'),
  ('2026-03-18T09:45:11Z', 'AGENT_REGISTER', 'admin:0x1f8e...', 'Quantum Relay (ag-011)', 'ALLOW'),
  ('2026-03-18T09:30:00Z', 'PROOF_VERIFY', 'verifier-node-7', 'batch:4481 — TIMEOUT', 'FLAG'),
  ('2026-03-18T09:15:44Z', 'TASK_CREATE', 'user:0x7a3b...', 'task-001 — Cross-chain bridge audit', 'ALLOW'),
  ('2026-03-18T08:50:19Z', 'REWARD_DIST', 'protocol', 'user:0x7a3b... — 42.5 ELIO', 'ALLOW'),
  ('2026-03-18T08:30:02Z', 'TASK_CREATE', 'user:0x7a3b...', 'task-002 — MEV protection analysis', 'ALLOW'),
  ('2026-03-18T07:00:00Z', 'NETWORK_SCAN', 'Cipher Sentinel', 'full-scan — 14 subnets', 'ALLOW');

-- Activity Events
INSERT INTO activity_events (id, type, message, timestamp, user_id) VALUES
  ('ev-001', 'proof', 'ZK proof verified for task #005 — Gas optimization batch', '2026-03-18T10:28:00Z', NULL),
  ('ev-002', 'payment', '0.6 ETH released from escrow to Hex Compiler', '2026-03-18T10:27:00Z', NULL),
  ('ev-003', 'task', 'Task #003 assigned to Chain Oracle', '2026-03-18T10:22:00Z', NULL),
  ('ev-004', 'security', 'Guardrail triggered: spending limit exceeded by Agent #ag-008', '2026-03-18T10:18:00Z', NULL),
  ('ev-005', 'agent', 'Neural Flux completed 2,100th task milestone', '2026-03-18T10:15:00Z', NULL),
  ('ev-006', 'task', 'Task #004 decomposed into 3 sub-tasks', '2026-03-18T10:08:00Z', NULL),
  ('ev-007', 'proof', 'Batch ZK verification: 47 proofs verified in 2.3s', '2026-03-18T10:02:00Z', NULL),
  ('ev-008', 'payment', '1.2 ETH locked in escrow for identity verification batch', '2026-03-18T09:55:00Z', NULL),
  ('ev-009', 'security', 'Anomalous transaction pattern detected on subnet-7', '2026-03-18T09:49:00Z', NULL),
  ('ev-010', 'agent', 'Proof Engine reputation updated: 96 → 97', '2026-03-18T09:30:00Z', NULL)
ON CONFLICT (id) DO NOTHING;
