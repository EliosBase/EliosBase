import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import type { Agent, AgentExecutionFinding, AgentExecutionResult } from '@/lib/types';

export const DEFAULT_AGENT_EXECUTION_MODEL = 'claude-sonnet-4-20250514';
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
  const parsed = JSON.parse(stripFence(raw)) as Partial<AgentExecutionResult>;

  if (!parsed.summary || typeof parsed.summary !== 'string') {
    throw new Error('Agent output is missing a summary');
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

export function serializeExecutionResult(result: AgentExecutionResult) {
  return JSON.stringify(result);
}

export async function executeAgentTask(task: TaskRuntime, agent: AgentRuntime): Promise<AgentExecutionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = SYSTEM_PROMPTS[agent.type];
  if (!systemPrompt) {
    throw new Error(`Unsupported agent type: ${agent.type}`);
  }

  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();

  const response = await Promise.race([
    client.messages.create({
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
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Agent execution timed out after ${getTimeoutMs()}ms`)), getTimeoutMs());
    }),
  ]);

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

  return normalizeResult(text, agent, Date.now() - startedAt, tokensUsed);
}
