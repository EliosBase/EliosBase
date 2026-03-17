// ─── TypeScript Interfaces ─────────────────────────────────────────

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
  reputation: number; // 0-100
  tasksCompleted: number;
  pricePerTask: string;
  status: 'online' | 'busy' | 'offline';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
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
}

export interface ActivityEvent {
  id: string;
  type: 'task' | 'agent' | 'payment' | 'security' | 'proof';
  message: string;
  timestamp: string;
}

export interface Transaction {
  id: string;
  type: 'escrow_lock' | 'escrow_release' | 'payment' | 'reward' | 'stake';
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

// ─── Mock Data ─────────────────────────────────────────────────────

export const TASK_STEPS: TaskStep[] = [
  'Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'
];

export const dashboardStats: StatItem[] = [
  { label: 'Active Agents', value: '2,847', trend: '+12.3%', trendUp: true },
  { label: 'Tasks in Progress', value: '1,204', trend: '+8.7%', trendUp: true },
  { label: 'Total Value Locked', value: '$14.2M', trend: '+23.1%', trendUp: true },
  { label: 'ZK Proofs Today', value: '8,491', trend: '+5.4%', trendUp: true },
];

export const agents: Agent[] = [
  { id: 'ag-001', name: 'Cipher Sentinel', description: 'Advanced threat detection and network security monitoring agent with real-time anomaly analysis.', capabilities: ['Threat Detection', 'Network Security', 'Anomaly Detection'], reputation: 98, tasksCompleted: 4521, pricePerTask: '0.05 ETH', status: 'online', type: 'sentinel' },
  { id: 'ag-002', name: 'Data Weaver', description: 'High-throughput data aggregation and transformation agent for cross-chain analytics.', capabilities: ['Data Aggregation', 'Cross-Chain', 'Analytics'], reputation: 95, tasksCompleted: 3872, pricePerTask: '0.03 ETH', status: 'online', type: 'analyst' },
  { id: 'ag-003', name: 'Logic Forge', description: 'Smart contract auditing and formal verification agent with ZK proof generation.', capabilities: ['Smart Contracts', 'Formal Verification', 'ZK Proofs'], reputation: 97, tasksCompleted: 2914, pricePerTask: '0.08 ETH', status: 'busy', type: 'auditor' },
  { id: 'ag-004', name: 'Neural Flux', description: 'Distributed ML inference engine for privacy-preserving model execution.', capabilities: ['ML Inference', 'Privacy', 'Distributed Compute'], reputation: 92, tasksCompleted: 2105, pricePerTask: '0.06 ETH', status: 'online', type: 'executor' },
  { id: 'ag-005', name: 'Chain Oracle', description: 'Multi-chain oracle service with verifiable randomness and price feed aggregation.', capabilities: ['Oracles', 'Price Feeds', 'VRF'], reputation: 94, tasksCompleted: 5230, pricePerTask: '0.02 ETH', status: 'online', type: 'analyst' },
  { id: 'ag-006', name: 'Vault Keeper', description: 'Automated portfolio management and DeFi yield optimization agent.', capabilities: ['DeFi', 'Yield Optimization', 'Portfolio'], reputation: 89, tasksCompleted: 1847, pricePerTask: '0.04 ETH', status: 'online', type: 'optimizer' },
  { id: 'ag-007', name: 'Ghost Protocol', description: 'Zero-knowledge identity verification and privacy-preserving authentication.', capabilities: ['ZK Identity', 'Authentication', 'Privacy'], reputation: 96, tasksCompleted: 3201, pricePerTask: '0.07 ETH', status: 'busy', type: 'sentinel' },
  { id: 'ag-008', name: 'Synth Mind', description: 'Natural language processing agent for governance proposal analysis and summarization.', capabilities: ['NLP', 'Governance', 'Summarization'], reputation: 88, tasksCompleted: 1523, pricePerTask: '0.03 ETH', status: 'offline', type: 'analyst' },
  { id: 'ag-009', name: 'Hex Compiler', description: 'Cross-chain bytecode optimization and gas efficiency analysis agent.', capabilities: ['Gas Optimization', 'Bytecode', 'Cross-Chain'], reputation: 91, tasksCompleted: 2067, pricePerTask: '0.05 ETH', status: 'online', type: 'optimizer' },
  { id: 'ag-010', name: 'Aegis Shield', description: 'Real-time MEV protection and transaction privacy shield for DeFi operations.', capabilities: ['MEV Protection', 'Transaction Privacy', 'DeFi'], reputation: 93, tasksCompleted: 2890, pricePerTask: '0.04 ETH', status: 'online', type: 'sentinel' },
  { id: 'ag-011', name: 'Quantum Relay', description: 'High-frequency cross-chain message passing with cryptographic verification.', capabilities: ['Cross-Chain', 'Messaging', 'Cryptography'], reputation: 90, tasksCompleted: 1956, pricePerTask: '0.03 ETH', status: 'online', type: 'executor' },
  { id: 'ag-012', name: 'Proof Engine', description: 'Recursive ZK-SNARK proof generation and batch verification optimizer.', capabilities: ['ZK-SNARKs', 'Batch Verification', 'Proof Generation'], reputation: 97, tasksCompleted: 4102, pricePerTask: '0.09 ETH', status: 'busy', type: 'auditor' },
];

export const tasks: Task[] = [
  { id: 'task-001', title: 'Cross-chain bridge audit', description: 'Comprehensive security audit of the ETH-Polygon bridge contract', status: 'active', currentStep: 'Executing', assignedAgent: 'Logic Forge', reward: '0.8 ETH', submittedAt: '2026-03-18T09:15:00Z' },
  { id: 'task-002', title: 'MEV protection analysis', description: 'Analyze and implement MEV protection for swap router', status: 'active', currentStep: 'ZK Verifying', assignedAgent: 'Aegis Shield', reward: '0.5 ETH', submittedAt: '2026-03-18T08:30:00Z' },
  { id: 'task-003', title: 'Oracle price feed verification', description: 'Verify price feed accuracy across 12 DEX sources', status: 'active', currentStep: 'Assigned', assignedAgent: 'Chain Oracle', reward: '0.2 ETH', submittedAt: '2026-03-18T10:00:00Z' },
  { id: 'task-004', title: 'Governance proposal summarization', description: 'NLP analysis of 47 pending DAO governance proposals', status: 'active', currentStep: 'Decomposed', assignedAgent: 'Synth Mind', reward: '0.15 ETH', submittedAt: '2026-03-18T10:22:00Z' },
  { id: 'task-005', title: 'Gas optimization batch', description: 'Optimize gas usage for 8 high-traffic smart contracts', status: 'completed', currentStep: 'Complete', assignedAgent: 'Hex Compiler', reward: '0.6 ETH', submittedAt: '2026-03-17T14:00:00Z', completedAt: '2026-03-17T18:45:00Z', zkProofId: 'zk-0x8f3a...' },
  { id: 'task-006', title: 'DeFi yield analysis', description: 'Compare yield strategies across Aave, Compound, and Morpho', status: 'completed', currentStep: 'Complete', assignedAgent: 'Vault Keeper', reward: '0.3 ETH', submittedAt: '2026-03-17T11:20:00Z', completedAt: '2026-03-17T15:10:00Z', zkProofId: 'zk-0x2b7c...' },
  { id: 'task-007', title: 'Identity verification batch', description: 'Process 200 ZK identity verifications for DAO onboarding', status: 'completed', currentStep: 'Complete', assignedAgent: 'Ghost Protocol', reward: '1.2 ETH', submittedAt: '2026-03-16T09:00:00Z', completedAt: '2026-03-16T22:30:00Z', zkProofId: 'zk-0x9d1e...' },
  { id: 'task-008', title: 'Network anomaly scan', description: 'Full network scan for anomalous transaction patterns', status: 'active', currentStep: 'Executing', assignedAgent: 'Cipher Sentinel', reward: '0.4 ETH', submittedAt: '2026-03-18T07:00:00Z' },
];

export const activityFeed: ActivityEvent[] = [
  { id: 'ev-001', type: 'proof', message: 'ZK proof verified for task #005 — Gas optimization batch', timestamp: '2 min ago' },
  { id: 'ev-002', type: 'payment', message: '0.6 ETH released from escrow to Hex Compiler', timestamp: '3 min ago' },
  { id: 'ev-003', type: 'task', message: 'Task #003 assigned to Chain Oracle', timestamp: '8 min ago' },
  { id: 'ev-004', type: 'security', message: 'Guardrail triggered: spending limit exceeded by Agent #ag-008', timestamp: '12 min ago' },
  { id: 'ev-005', type: 'agent', message: 'Neural Flux completed 2,100th task milestone', timestamp: '15 min ago' },
  { id: 'ev-006', type: 'task', message: 'Task #004 decomposed into 3 sub-tasks', timestamp: '22 min ago' },
  { id: 'ev-007', type: 'proof', message: 'Batch ZK verification: 47 proofs verified in 2.3s', timestamp: '28 min ago' },
  { id: 'ev-008', type: 'payment', message: '1.2 ETH locked in escrow for identity verification batch', timestamp: '35 min ago' },
  { id: 'ev-009', type: 'security', message: 'Anomalous transaction pattern detected on subnet-7', timestamp: '41 min ago' },
  { id: 'ev-010', type: 'agent', message: 'Proof Engine reputation updated: 96 → 97', timestamp: '1 hr ago' },
];

export const transactions: Transaction[] = [
  { id: 'tx-001', type: 'escrow_release', from: 'Escrow Vault', to: 'Hex Compiler', amount: '0.6', token: 'ETH', status: 'confirmed', timestamp: '2026-03-18T10:25:00Z', txHash: '0x8f3a...b2d1' },
  { id: 'tx-002', type: 'escrow_lock', from: 'You', to: 'Escrow Vault', amount: '0.8', token: 'ETH', status: 'confirmed', timestamp: '2026-03-18T09:15:00Z', txHash: '0x2c7d...e4a9' },
  { id: 'tx-003', type: 'payment', from: 'You', to: 'Logic Forge', amount: '0.08', token: 'ETH', status: 'pending', timestamp: '2026-03-18T09:16:00Z', txHash: '0x5e1b...f7c3' },
  { id: 'tx-004', type: 'reward', from: 'Protocol', to: 'You', amount: '42.5', token: 'ELIO', status: 'confirmed', timestamp: '2026-03-18T08:00:00Z', txHash: '0x9a4f...d2e8' },
  { id: 'tx-005', type: 'escrow_release', from: 'Escrow Vault', to: 'Vault Keeper', amount: '0.3', token: 'ETH', status: 'confirmed', timestamp: '2026-03-17T15:10:00Z', txHash: '0x3b8c...a1f5' },
  { id: 'tx-006', type: 'stake', from: 'You', to: 'Staking Pool', amount: '500', token: 'ELIO', status: 'confirmed', timestamp: '2026-03-17T12:00:00Z', txHash: '0x7d2e...c9b4' },
  { id: 'tx-007', type: 'escrow_lock', from: 'You', to: 'Escrow Vault', amount: '1.2', token: 'ETH', status: 'confirmed', timestamp: '2026-03-16T09:00:00Z', txHash: '0x1f6a...e3d7' },
  { id: 'tx-008', type: 'escrow_release', from: 'Escrow Vault', to: 'Ghost Protocol', amount: '1.2', token: 'ETH', status: 'confirmed', timestamp: '2026-03-16T22:30:00Z', txHash: '0x4c9d...b8a2' },
  { id: 'tx-009', type: 'reward', from: 'Protocol', to: 'You', amount: '85.0', token: 'ELIO', status: 'confirmed', timestamp: '2026-03-16T22:31:00Z', txHash: '0x6e3f...d1c7' },
  { id: 'tx-010', type: 'payment', from: 'You', to: 'Cipher Sentinel', amount: '0.05', token: 'ETH', status: 'confirmed', timestamp: '2026-03-16T08:00:00Z', txHash: '0xa2b1...f4e9' },
];

export const securityAlerts: SecurityAlert[] = [
  { id: 'sa-001', severity: 'critical', title: 'Unauthorized escalation attempt', description: 'Agent ag-008 attempted to access restricted memory segment outside task scope.', source: 'Zero-Trust Monitor', timestamp: '12 min ago', resolved: false },
  { id: 'sa-002', severity: 'high', title: 'Anomalous transaction pattern', description: 'Unusual high-frequency micro-transactions detected on subnet-7, possible extraction attempt.', source: 'Transaction Analyzer', timestamp: '41 min ago', resolved: false },
  { id: 'sa-003', severity: 'medium', title: 'Spending limit exceeded', description: 'Agent Synth Mind exceeded per-task spending guardrail by 0.02 ETH.', source: 'Guardrail System', timestamp: '1 hr ago', resolved: true },
  { id: 'sa-004', severity: 'low', title: 'Deprecated API call detected', description: 'Agent Data Weaver using deprecated v1 oracle endpoint — migration recommended.', source: 'API Monitor', timestamp: '2 hr ago', resolved: false },
  { id: 'sa-005', severity: 'high', title: 'Proof verification timeout', description: 'ZK proof verification for batch #4481 exceeded 30s timeout threshold.', source: 'Proof Verifier', timestamp: '3 hr ago', resolved: true },
  { id: 'sa-006', severity: 'medium', title: 'Cross-chain replay risk', description: 'Message relay on ETH-Arbitrum bridge missing nonce validation.', source: 'Bridge Monitor', timestamp: '4 hr ago', resolved: true },
];

export const guardrails: Guardrail[] = [
  { id: 'gr-001', name: 'Spending Limits', description: 'Per-task and per-agent spending caps enforced via smart contract', status: 'active', triggeredCount: 14 },
  { id: 'gr-002', name: 'Memory Isolation', description: 'Agents sandboxed to task-scoped memory — no cross-task reads', status: 'active', triggeredCount: 3 },
  { id: 'gr-003', name: 'Output Validation', description: 'All agent outputs verified against task schema before release', status: 'active', triggeredCount: 27 },
  { id: 'gr-004', name: 'Rate Limiting', description: 'Max 50 API calls/min per agent, burst protection enabled', status: 'active', triggeredCount: 8 },
  { id: 'gr-005', name: 'Privilege Escalation Block', description: 'Agents cannot request permissions beyond task scope', status: 'triggered', triggeredCount: 2 },
  { id: 'gr-006', name: 'Data Exfiltration Guard', description: 'Outbound data checked against sensitivity classifier', status: 'active', triggeredCount: 1 },
];

export const auditLog: AuditLogEntry[] = [
  { timestamp: '10:27:14', action: 'TASK_ASSIGN', actor: 'orchestrator-v3', target: 'task-003 → Chain Oracle', result: 'ALLOW' },
  { timestamp: '10:22:08', action: 'MEMORY_ACCESS', actor: 'ag-008 (Synth Mind)', target: 'segment:0x4f2a (out-of-scope)', result: 'DENY' },
  { timestamp: '10:15:33', action: 'ESCROW_LOCK', actor: 'user:0x7a3b...', target: 'vault:0x9c1d — 0.8 ETH', result: 'ALLOW' },
  { timestamp: '10:12:01', action: 'PROOF_SUBMIT', actor: 'Hex Compiler', target: 'batch:4482 — 12 proofs', result: 'ALLOW' },
  { timestamp: '10:08:47', action: 'SPENDING_LIMIT', actor: 'Synth Mind', target: 'exceeded by 0.02 ETH', result: 'FLAG' },
  { timestamp: '09:58:22', action: 'API_CALL', actor: 'Data Weaver', target: 'oracle/v1/prices (deprecated)', result: 'FLAG' },
  { timestamp: '09:45:11', action: 'AGENT_REGISTER', actor: 'admin:0x1f8e...', target: 'Quantum Relay (ag-011)', result: 'ALLOW' },
  { timestamp: '09:30:00', action: 'PROOF_VERIFY', actor: 'verifier-node-7', target: 'batch:4481 — TIMEOUT', result: 'FLAG' },
  { timestamp: '09:15:44', action: 'TASK_CREATE', actor: 'user:0x7a3b...', target: 'task-001 — Cross-chain bridge audit', result: 'ALLOW' },
  { timestamp: '08:50:19', action: 'REWARD_DIST', actor: 'protocol', target: 'user:0x7a3b... — 42.5 ELIO', result: 'ALLOW' },
  { timestamp: '08:30:02', action: 'TASK_CREATE', actor: 'user:0x7a3b...', target: 'task-002 — MEV protection analysis', result: 'ALLOW' },
  { timestamp: '07:00:00', action: 'NETWORK_SCAN', actor: 'Cipher Sentinel', target: 'full-scan — 14 subnets', result: 'ALLOW' },
];

// ─── Sparkline Data ────────────────────────────────────────────────

export const sparklineData = {
  agents: [22, 25, 24, 28, 27, 30, 29, 32, 31, 34, 33, 36],
  tasks: [80, 95, 88, 102, 97, 110, 105, 118, 112, 120, 115, 120],
  tvl: [10, 10.5, 11, 11.2, 11.8, 12.1, 12.5, 13, 13.2, 13.8, 14, 14.2],
  proofs: [500, 520, 480, 550, 600, 580, 620, 650, 700, 750, 800, 849],
};
