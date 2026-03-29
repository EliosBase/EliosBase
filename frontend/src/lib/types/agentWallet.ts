export type AgentWalletStatus = 'predicted' | 'active';

export type AgentWalletTransferStatus = 'blocked' | 'queued' | 'approved' | 'executed';

export interface AgentWalletPolicy {
  standard: 'safe';
  owner: string;
  policySigner?: string;
  owners: string[];
  threshold: number;
  dailySpendLimitEth: string;
  coSignThresholdEth: string;
  timelockThresholdEth: string;
  timelockSeconds: number;
  blockedDestinations: string[];
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
  createdAt: string;
}
