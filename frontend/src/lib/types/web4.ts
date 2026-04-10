import type { AgentWalletStandard, AgentWalletStatus } from './agentWallet';

export type GraphEntityType = 'agent' | 'task' | 'proof' | 'payment' | 'security';
export type AgentKind = 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
export type AgentStatus = 'online' | 'busy' | 'offline' | 'suspended';
export type TaskStatus = 'active' | 'completed' | 'failed';
export type TaskStep = 'Submitted' | 'Decomposed' | 'Assigned' | 'Executing' | 'ZK Verifying' | 'Complete' | 'Hold';
export type ActivityKind = 'task' | 'agent' | 'payment' | 'security' | 'proof';

export interface AgentPricingSummary {
  amount: string;
  currency: 'USDC';
  network: string;
  priceUsd: string;
}

export interface AgentPaymentMethod {
  kind: 'x402';
  scheme: 'exact';
  network: string;
  currency: 'USDC';
  facilitatorUrl: string;
  resource: string;
  payTo?: string;
}

export interface AgentPayableCapability {
  id: 'execute-task';
  method: 'POST';
  path: string;
  description: string;
  priceUsd: string;
  inputSchema: {
    contentType: 'application/json';
    required: string[];
    properties: Record<string, {
      type: string;
      description: string;
    }>;
  };
}

export interface GraphActivityEvent {
  id: string;
  type: ActivityKind;
  message: string;
  timestamp: string;
  source: 'activity' | 'audit' | 'transaction' | 'security';
  occurredAt: string;
  eventType: string;
  entityType?: GraphEntityType;
  entityId?: string;
  entityUrl?: string;
  proofId?: string;
  txHash?: string;
}

export interface WalletPolicySummary {
  standard: AgentWalletStandard;
  threshold: string;
  ownerCount: number;
  dailySpendLimitEth: string;
  autoApproveThresholdEth: string;
  reviewThresholdEth: string;
  timelockThresholdEth: string;
  timelockSeconds: number;
  blockedDestinationCount: number;
  allowlistedContractCount: number;
}

export interface SessionKeyStatus {
  status: 'active' | 'expired' | 'absent';
  address?: string;
  validUntil?: string;
  rotatedAt?: string;
}

export interface ReputationBreakdown {
  completionRate: number;
  proofVerificationRate: number;
  disputeFreeRate: number;
  payoutSuccessRate: number;
  walletSafetyScore: number;
  score: number;
}

export interface AgentPassport {
  identity: {
    id: string;
    name: string;
    description: string;
    type: AgentKind;
    status: AgentStatus;
    capabilities: string[];
  };
  performance: {
    tasksCompleted: number;
    completionRate: number;
    proofVerificationRate: number;
    disputeRate: number;
    payoutSuccessRate: number;
  };
  trust: {
    reputationScore: number;
    reputationBreakdown: ReputationBreakdown;
    badges: string[];
  };
  wallet: {
    walletAddress?: string;
    walletStandard?: AgentWalletStandard;
    walletStatus?: AgentWalletStatus;
    walletPolicySummary: WalletPolicySummary | null;
    sessionKeyStatus: SessionKeyStatus;
  };
  pricingSummary: AgentPricingSummary;
  payableCapabilities: AgentPayableCapability[];
  paymentMethods: AgentPaymentMethod[];
  pageUrl: string;
  frameUrl: string;
  capabilitiesUrl: string;
  executeUrl: string;
  warpcastShareUrl: string;
  activity: GraphActivityEvent[];
}

export interface TaskPaymentReceipt {
  method: 'x402' | 'escrow' | 'none';
  amount?: string;
  currency?: string;
  network?: string;
  payer?: string;
  status: 'none' | 'required' | 'accepted' | 'settled' | 'failed';
  txHash?: string;
  paymentReference?: string;
}

export interface TaskReceipt {
  identity: {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    currentStep: TaskStep;
  };
  economics: {
    reward: string;
    submitterId?: string;
    assignedAgent: {
      id?: string;
      name: string;
      type?: AgentKind;
      status?: AgentStatus;
    } | null;
  };
  escrow: {
    lockTxHash?: string;
    releaseTxHash?: string;
    refundTxHash?: string;
    escrowStatus: 'awaiting-lock' | 'locked' | 'released' | 'refunded';
  };
  proof: {
    zkProofId?: string;
    zkVerifyTxHash?: string;
    proofStatus: 'verified' | 'verifying' | 'pending' | 'failed';
  };
  resolution: {
    completedAt?: string;
    hasOpenDispute: boolean;
    executionFailureMessage?: string;
  };
  payment: TaskPaymentReceipt;
  pageUrl: string;
  frameUrl: string;
  warpcastShareUrl: string;
  timeline: GraphActivityEvent[];
}
