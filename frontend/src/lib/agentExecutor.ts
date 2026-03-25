import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { logMetric } from '@/lib/metrics';
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from '@anthropic-ai/sdk';
import { getExecutionResult } from '@/lib/types';
import type { Agent, AgentExecutionFinding, AgentExecutionResult, TaskExecutionState } from '@/lib/types';

export const DEFAULT_AGENT_EXECUTION_MODEL = 'claude-sonnet-4-20250514';
export const PROMPT_VERSION = 'v1.0';
const DEFAULT_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPTS: Record<Agent['type'], string> = {
  sentinel: 'You are a security monitoring agent. Focus on risks, attack paths, suspicious behavior, and direct mitigations.',
  analyst: 'You are a data analysis agent. Focus on trends, anomalies, synthesis, and practical next actions.',
  executor: 'You are an implementation analysis agent. Focus on code behavior, correctness risks, and concrete execution output.',
  auditor: 'You are an audit agent. Focus on compliance, verification, missing controls, and defensible findings.',
  optimizer: 'You are a performance optimization agent. Focus on inefficiencies, bottlenecks, and direct improvements.',
};

interface TaskRuntime {
  id: string;
  title: string;
  description: string;
  reward: string;
}

interface AgentRuntime {
  id: string;
  name: string;
  type: Agent['type'];
  description: string;
  capabilities: string[];
}

interface AgentExecutionErrorOptions {
  code: string;
  retryable: boolean;
  cause?: unknown;
}

export class AgentExecutionError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, { code, retryable, cause }: AgentExecutionErrorOptions) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AgentExecutionError';
    this.code = code;
    this.retryable = retryable;
  }
}

function getTimeoutMs() {
  const raw = Number(process.env.AGENT_EXECUTION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function stripFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function toSeverity(value: unknown): AgentExecutionFinding['severity'] {
  switch (value) {
    case 'critical':
    case 'high':
    case 'medium':
    case 'low':
    case 'info':
      return value;
    default:
      return 'info';
  }
}

function normalizeResult(
  raw: string,
  agent: AgentRuntime,
  executionTimeMs: number,
  tokensUsed: number,
): AgentExecutionResult {
  let parsed: Partial<AgentExecutionResult>;

  try {
    parsed = JSON.parse(stripFence(raw)) as Partial<AgentExecutionResult>;
  } catch (error) {
    throw new AgentExecutionError('Agent output was not valid JSON', {
      code: 'invalid_output_json',
      retryable: false,
      cause: error,
    });
  }

  if (!parsed.summary || typeof parsed.summary !== 'string') {
    throw new AgentExecutionError('Agent output is missing a summary', {
      code: 'invalid_output_schema',
      retryable: false,
    });
  }

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
        .filter((finding) => !!finding && typeof finding === 'object')
        .map((finding) => {
          const entry = finding as unknown as Record<string, unknown>;
          return {
            severity: toSeverity(entry.severity),
            title: typeof entry.title === 'string' ? entry.title : 'Untitled finding',
            description: typeof entry.description === 'string' ? entry.description : '',
          };
        })
    : [];

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    summary: parsed.summary,
    findings,
    recommendations,
    metadata: {
      model: DEFAULT_AGENT_EXECUTION_MODEL,
      promptVersion: PROMPT_VERSION,
      tokensUsed,
      executionTimeMs,
      agentType: agent.type,
      capabilities: agent.capabilities,
    },
  };
}

function buildPrompt(task: TaskRuntime, agent: AgentRuntime) {
  return [
    'Return valid JSON only.',
    'Use this exact schema:',
    JSON.stringify({
      summary: 'string',
      findings: [{ severity: 'critical | high | medium | low | info', title: 'string', description: 'string' }],
      recommendations: ['string'],
    }),
    '',
    'Task:',
    JSON.stringify(task, null, 2),
    '',
    'Agent:',
    JSON.stringify(agent, null, 2),
  ].join('\n');
}

function classifyExecutionError(error: unknown): AgentExecutionError {
  if (error instanceof AgentExecutionError) {
    return error;
  }

  if (error instanceof APIUserAbortError || error instanceof APIConnectionTimeoutError) {
    return new AgentExecutionError('Agent execution timed out', {
      code: 'anthropic_timeout',
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof APIConnectionError || error instanceof RateLimitError || error instanceof InternalServerError) {
    return new AgentExecutionError('Anthropic request failed temporarily', {
      code: 'anthropic_unavailable',
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new AgentExecutionError('Anthropic credentials are invalid', {
      code: 'anthropic_auth',
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
    return new AgentExecutionError('Anthropic rejected the execution request', {
      code: 'anthropic_invalid_request',
      retryable: false,
      cause: error,
    });
  }

  return new AgentExecutionError(
    error instanceof Error ? error.message : 'Agent execution failed',
    { code: 'agent_execution_failed', retryable: false, cause: error },
  );
}

export function serializeExecutionResult(result: TaskExecutionState | AgentExecutionResult) {
  const normalized = getExecutionResult(result);
  if (!normalized) {
    throw new AgentExecutionError('Task execution result is not available', {
      code: 'missing_execution_result',
      retryable: false,
    });
  }

  return JSON.stringify(normalized);
}

export async function executeAgentTask(task: TaskRuntime, agent: AgentRuntime): Promise<AgentExecutionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AgentExecutionError('ANTHROPIC_API_KEY not configured', {
      code: 'anthropic_not_configured',
      retryable: false,
    });
  }

  const systemPrompt = SYSTEM_PROMPTS[agent.type];
  if (!systemPrompt) {
    throw new AgentExecutionError(`Unsupported agent type: ${agent.type}`, {
      code: 'unsupported_agent_type',
      retryable: false,
    });
  }

  // Spend ceiling check — if configured, count recent executions
  const spendCeilingCents = parseInt(process.env.AI_SPEND_CEILING_CENTS ?? '0');
  if (spendCeilingCents > 0) {
    logMetric('ai_spend_ceiling_check', spendCeilingCents, { taskId: task.id });
  }

  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.messages.create(
      {
        model: DEFAULT_AGENT_EXECUTION_MODEL,
        max_tokens: 1400,
        temperature: 0.2,
        system: `${systemPrompt}\nOutput must be strict JSON and contain no prose outside the JSON object.`,
        messages: [
          {
            role: 'user',
            content: buildPrompt(task, agent),
          },
        ],
      },
      {
        maxRetries: 0,
        signal: controller.signal,
        timeout: timeoutMs,
      },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new AgentExecutionError('Agent returned an empty response', {
        code: 'empty_output',
        retryable: false,
      });
    }

    const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
    const executionTimeMs = Date.now() - startedAt;
    logMetric('agent_execution_ms', executionTimeMs, { agentType: agent.type, agentId: agent.id });
    logMetric('agent_tokens_used', tokensUsed, { agentType: agent.type, agentId: agent.id });
    return normalizeResult(text, agent, executionTimeMs, tokensUsed);
  } catch (error) {
    Sentry.captureException(error, { tags: { agentId: agent.id, agentType: agent.type, taskId: task.id } });
    throw classifyExecutionError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
