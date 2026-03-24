export type AgentExecutionSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AgentExecutionFinding {
  severity: AgentExecutionSeverity;
  title: string;
  description: string;
}

export interface AgentExecutionMetadata {
  model: string;
  tokensUsed: number;
  executionTimeMs: number;
  agentType: string;
  capabilities: string[];
}

export interface AgentExecutionResult {
  summary: string;
  findings: AgentExecutionFinding[];
  recommendations: string[];
  metadata: AgentExecutionMetadata;
}

export interface RunningTaskExecution {
  status: 'running';
  startedAt: string;
  model: string;
  agentType: string;
  capabilities: string[];
}

export interface FailedTaskExecution {
  status: 'failed';
  failure: {
    code: string;
    message: string;
    retryable: boolean;
    failedAt: string;
    model: string;
    agentType: string;
  };
}

export interface SucceededTaskExecution {
  status: 'succeeded';
  completedAt: string;
  result: AgentExecutionResult;
}

export type TaskExecutionState =
  | AgentExecutionResult
  | RunningTaskExecution
  | FailedTaskExecution
  | SucceededTaskExecution;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAgentExecutionResult(value: unknown): value is AgentExecutionResult {
  return isRecord(value)
    && typeof value.summary === 'string'
    && Array.isArray(value.findings)
    && Array.isArray(value.recommendations)
    && isRecord(value.metadata)
    && typeof value.metadata.model === 'string';
}

export function getExecutionResult(value: unknown): AgentExecutionResult | null {
  if (isAgentExecutionResult(value)) {
    return value;
  }

  if (isRecord(value) && value.status === 'succeeded' && isAgentExecutionResult(value.result)) {
    return value.result;
  }

  return null;
}

export function getExecutionFailure(value: unknown): FailedTaskExecution['failure'] | null {
  if (
    isRecord(value)
    && value.status === 'failed'
    && isRecord(value.failure)
    && typeof value.failure.message === 'string'
    && typeof value.failure.code === 'string'
    && typeof value.failure.retryable === 'boolean'
  ) {
    return value.failure as FailedTaskExecution['failure'];
  }

  return null;
}
