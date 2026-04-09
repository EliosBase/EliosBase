import 'server-only';
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readEnv } from '@/lib/env';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

/**
 * POST /api/tasks/decompose
 *
 * Streams a Claude-generated task decomposition as Server-Sent Events.
 * Given a raw task description, Claude breaks it into subtasks and
 * recommends agent types for each, emitting tokens in real time so the
 * client can render the plan as it's being generated.
 */

const decomposeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
});

const DECOMPOSER_SYSTEM_PROMPT = `You are a task decomposition planner for EliosBase, a decentralized AI agent marketplace.

Given a user-submitted task, break it into 2-5 concrete subtasks and recommend the best agent type for each.

Available agent types:
- sentinel   — security monitoring, threats, vulnerabilities, attack paths
- analyst    — data analysis, trends, anomalies, insights
- executor   — code review, smart contracts, implementation correctness
- auditor    — compliance, regulatory, verification, controls
- optimizer  — performance, gas efficiency, bottlenecks

Return ONLY valid JSON matching this schema:
{
  "complexity": "low" | "medium" | "high",
  "estimatedDuration": "<human readable>",
  "subtasks": [
    {
      "order": <int>,
      "title": "<short>",
      "description": "<what needs to be done>",
      "recommendedAgent": "<one of the types above>",
      "rationale": "<why this agent type>"
    }
  ],
  "risks": ["<optional list of execution risks>"]
}

Do NOT include any prose before or after the JSON. Start directly with {`;

export async function POST(req: NextRequest) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rateLimitError = await enforceRateLimit(
    req,
    RATE_LIMITS.taskCreate,
    session.userId,
  );
  if (rateLimitError) return rateLimitError;

  const raw = await req.json();
  const parsed = decomposeSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const apiKey = readEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Anthropic API key not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { title, description } = parsed.data;
  const childLogger = logger.child({
    route: 'tasks/decompose',
    userId: session.userId,
  });

  const client = new Anthropic({ apiKey });

  // Build an SSE stream from Anthropic's streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send('status', { phase: 'planning' });

        const response = await client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: DECOMPOSER_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Task title: ${title}\n\nTask description: ${description}\n\nDecompose this task now.`,
            },
          ],
        });

        let buffer = '';
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const delta = chunk.delta.text;
            buffer += delta;
            send('token', { delta });
          }
        }

        // Try to parse the accumulated JSON and emit a structured result
        try {
          // Strip optional code fences
          const cleaned = buffer.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsedJson = JSON.parse(cleaned);
          send('complete', { plan: parsedJson });
        } catch (err) {
          childLogger.warn('Failed to parse decomposition JSON', {
            error: err instanceof Error ? err.message : String(err),
          });
          send('error', { message: 'Decomposer produced invalid JSON — try again' });
        }

        controller.close();
      } catch (err) {
        childLogger.error('Decomposer stream failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        send('error', {
          message: err instanceof Error ? err.message : 'Decomposer failed',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
