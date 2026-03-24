export type AgentExecutionSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AgentExecutionFinding {
  severity: AgentExecutionSeverity;
  title: string;
  description: string;
}

export interface AgentExecutionResult {
  summary: string;
  findings: AgentExecutionFinding[];
  recommendations: string[];
  metadata: {
    model: string;
    tokensUsed: number;
    executionTimeMs: number;
    agentType: string;
    capabilities: string[];
  };
}
