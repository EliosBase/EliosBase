export type AgentWalletStatus = 'predicted' | 'active' | 'migrating' | 'ready' | 'failed';

export type AgentWalletStandard = 'safe' | 'safe7579';

export type AgentWalletMigrationState = 'legacy' | 'pending' | 'migrated' | 'failed';

export type AgentWalletTransferStatus = 'blocked' | 'queued' | 'approved' | 'executed' | 'failed';

export type AgentWalletExecutionMode = 'session' | 'owner' | 'reviewed';

export interface AgentWalletModules {
  adapter?: string;
  ownerValidator?: string;
  smartSessionsValidator?: string;
  compatibilityFallback?: string;
  hook?: string;
  guard?: string;
  policyManager?: string;
  sessionSalt?: string;
}

export interface AgentWalletSessionState {
  address?: string;
  validUntil?: string;
  rotatedAt?: string;
}

export interface AgentWalletPolicy {
  standard: AgentWalletStandard;
  owner: string;
  policySigner?: string;
  owners: string[];
  threshold: number;
  dailySpendLimitEth: string;
  autoApproveThresholdEth: string;
  reviewThresholdEth: string;
  timelockThresholdEth: string;
  timelockSeconds: number;
  blockedDestinations: string[];
  allowlistedContracts?: string[];
}

export interface AgentWalletTransfer {
  id: string;
  agentId: string;
  agentName?: string;
  safeAddress: string;
  destination: string;
  amountEth: string;
  note: string;
  status: AgentWalletTransferStatus;
  policyReason?: string;
  approvalsRequired: number;
  approvalsReceived: number;
  unlockAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  executedAt?: string;
  executedBy?: string;
  txHash?: string;
  executionMode?: AgentWalletExecutionMode;
  intentHash?: string;
  userOpHash?: string;
  policyTxHash?: string;
  errorMessage?: string;
  createdAt: string;
}
