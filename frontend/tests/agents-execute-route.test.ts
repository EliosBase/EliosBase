import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createX402RequestContext: vi.fn(),
  createServiceClient: vi.fn(),
  executeAgentTask: vi.fn(),
  generateId: vi.fn(),
  getAgentExecutionPaymentConfig: vi.fn(),
  getConfiguredSiteUrl: vi.fn(),
  getX402HttpServer: vi.fn(),
  isVerifiedX402Request: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  x402ResponseToInit: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  generateId: mocks.generateId,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/agentExecutor', () => ({
  AgentExecutionError: class AgentExecutionError extends Error {
    code: string;
    retryable: boolean;

    constructor(message: string, options: { code: string; retryable: boolean }) {
      super(message);
      this.code = options.code;
      this.retryable = options.retryable;
    }
  },
  DEFAULT_AGENT_EXECUTION_MODEL: 'test-model',
  executeAgentTask: mocks.executeAgentTask,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/x402', () => ({
  appendSettlementHeaders: (headers: Headers, settlement: { headers: Record<string, string> }) => {
    Object.entries(settlement.headers).forEach(([name, value]) => headers.set(name, value));
  },
  createX402RequestContext: mocks.createX402RequestContext,
  getAgentExecutionPaymentConfig: mocks.getAgentExecutionPaymentConfig,
  getX402HttpServer: mocks.getX402HttpServer,
  isVerifiedX402Request: mocks.isVerifiedX402Request,
  x402ResponseToInit: mocks.x402ResponseToInit,
}));

vi.mock('@/lib/runtimeConfig', () => ({
  getConfiguredSiteUrl: mocks.getConfiguredSiteUrl,
}));

const { POST } = await import('@/app/api/agents/[id]/execute/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/agents/ag-1/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeEqBuilder(terminal: () => Promise<unknown>) {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(terminal);
  return builder;
}

function makeSupabaseClient() {
  const state = {
    agentUpdates: [] as Array<Record<string, unknown>>,
    taskUpdates: [] as Array<Record<string, unknown>>,
    taskInserts: [] as Array<Record<string, unknown>>,
    transactionInserts: [] as Array<Record<string, unknown>>,
  };

  const client = {
    state,
    from: vi.fn((table: string) => {
      if (table === 'agents') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            state.agentUpdates.push(payload);
            return makeEqBuilder(async () => ({ data: { id: 'ag-1' }, error: null }));
          }),
        };
      }

      if (table === 'users') {
        return {
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'user-1',
                  wallet_address: '0xpaiduser',
                  role: 'submitter',
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'tasks') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.taskInserts.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: payload.id,
                    title: payload.title,
                    current_step: payload.current_step,
                    status: payload.status,
                  },
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            state.taskUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === 'transactions') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            state.transactionInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return client;
}

describe('POST /api/agents/[id]/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.createX402RequestContext.mockImplementation((req: NextRequest) => ({ request: req, path: '/api/agents/ag-1/execute', method: 'POST' }));
    mocks.getConfiguredSiteUrl.mockReturnValue('https://preview.eliosbase.net');
    mocks.getAgentExecutionPaymentConfig.mockResolvedValue({
      agentId: 'ag-1',
      agentName: 'Preview Analyst',
      description: 'Paid agent',
      status: 'online',
      type: 'analyst',
      capabilities: ['summarize'],
      payTo: '0xseller',
      priceUsd: '$0.05',
      pricingSummary: {
        amount: '0.05',
        currency: 'USDC',
        network: 'eip155:84532',
        priceUsd: '$0.05',
      },
      paymentMethods: [
        {
          kind: 'x402',
          scheme: 'exact',
          network: 'eip155:84532',
          currency: 'USDC',
          facilitatorUrl: 'https://x402.org/facilitator',
          resource: 'https://preview.eliosbase.net/api/agents/ag-1/execute',
          payTo: '0xseller',
        },
      ],
      payableCapabilities: [
        {
          id: 'execute-task',
          method: 'POST',
          path: '/api/agents/ag-1/execute',
          description: 'Execute a paid task',
          priceUsd: '$0.05',
          inputSchema: {
            contentType: 'application/json',
            required: ['title', 'description'],
            properties: {
              title: { type: 'string', description: 'title' },
              description: { type: 'string', description: 'description' },
            },
          },
        },
      ],
      pageUrl: 'https://preview.eliosbase.net/agents/ag-1',
      frameUrl: 'https://preview.eliosbase.net/api/frames/agent/ag-1',
      capabilitiesUrl: 'https://preview.eliosbase.net/api/agents/ag-1/capabilities',
      executeUrl: 'https://preview.eliosbase.net/api/agents/ag-1/execute',
    });
    mocks.x402ResponseToInit.mockImplementation((response: { status: number; headers: Record<string, string> }) => ({
      status: response.status,
      headers: response.headers,
    }));
  });

  it('returns a 402 challenge for unpaid requests', async () => {
    mocks.isVerifiedX402Request.mockReturnValue(false);
    mocks.getX402HttpServer.mockResolvedValue({
      processHTTPRequest: vi.fn(async () => ({
        type: 'payment-error',
        response: {
          status: 402,
          headers: { 'x-payment-required': '1' },
          body: { error: 'Payment required', code: 'payment_required' },
        },
      })),
      processSettlement: vi.fn(),
      server: { verifyPayment: vi.fn() },
    });

    const response = await POST(makeRequest({
      title: 'Paid execution',
      description: 'Summarize the repo state',
    }), {
      params: Promise.resolve({ id: 'ag-1' }),
    });

    expect(response.status).toBe(402);
    expect(response.headers.get('x-payment-required')).toBe('1');
    await expect(response.json()).resolves.toEqual({
      error: 'Payment required',
      code: 'payment_required',
    });
  });

  it('keeps the original request body readable for the x402 adapter', async () => {
    mocks.isVerifiedX402Request.mockReturnValue(false);
    mocks.getX402HttpServer.mockResolvedValue({
      processHTTPRequest: vi.fn(async (context: { request: NextRequest }) => {
        const body = await context.request.clone().json();
        expect(body).toEqual({
          title: 'Paid execution',
          description: 'Summarize the repo state',
        });

        return {
          type: 'payment-error',
          response: {
            status: 402,
            headers: {},
            body: { error: 'Payment required', code: 'payment_required' },
          },
        };
      }),
      processSettlement: vi.fn(),
      server: { verifyPayment: vi.fn() },
    });

    const response = await POST(makeRequest({
      title: 'Paid execution',
      description: 'Summarize the repo state',
    }), {
      params: Promise.resolve({ id: 'ag-1' }),
    });

    expect(response.status).toBe(402);
  });

  it('creates a paid task and returns canonical receipt links when payment settles', async () => {
    const supabase = makeSupabaseClient();
    mocks.createServiceClient.mockReturnValue(supabase);
    mocks.generateId
      .mockReturnValueOnce('task-x402')
      .mockReturnValueOnce('tx-payment');
    mocks.isVerifiedX402Request.mockReturnValue(true);
    mocks.executeAgentTask.mockResolvedValue({
      summary: 'done',
      findings: [],
      recommendations: [],
      metadata: {
        model: 'test-model',
        promptVersion: 'v1',
        tokensUsed: 10,
        executionTimeMs: 12,
        agentType: 'analyst',
        capabilities: ['summarize'],
      },
    });
    mocks.getX402HttpServer.mockResolvedValue({
      processHTTPRequest: vi.fn(async () => ({
        type: 'payment-verified',
        paymentPayload: { payload: 'signed' },
        paymentRequirements: { price: '$0.05' },
        declaredExtensions: {},
      })),
      processSettlement: vi.fn(async () => ({
        success: true,
        amount: '50000',
        network: 'eip155:84532',
        transaction: '0xsettled',
        headers: { 'x-settlement-status': 'settled' },
      })),
      server: {
        verifyPayment: vi.fn(async () => ({
          isValid: true,
          payer: '0xPaidUser',
        })),
      },
    });

    const response = await POST(makeRequest({
      title: 'Paid execution',
      description: 'Summarize the repo state',
    }), {
      params: Promise.resolve({ id: 'ag-1' }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('x-settlement-status')).toBe('settled');
    await expect(response.json()).resolves.toEqual({
      success: true,
      taskId: 'task-x402',
      taskUrl: 'https://preview.eliosbase.net/tasks/task-x402',
      receiptUrl: 'https://preview.eliosbase.net/api/tasks/task-x402/receipt',
      currentStep: 'ZK Verifying',
      executionStatus: 'completed',
      paymentReference: '0xsettled',
      txHash: '0xsettled',
      network: 'eip155:84532',
    });

    expect(supabase.state.taskInserts).toHaveLength(1);
    expect(supabase.state.transactionInserts[0]).toEqual(expect.objectContaining({
      task_id: 'task-x402',
      agent_id: 'ag-1',
      payment_method: 'x402',
      payment_network: 'eip155:84532',
      tx_hash: '0xsettled',
    }));
    expect(supabase.state.agentUpdates.map((row) => row.status)).toEqual(['busy', 'online']);
    expect(supabase.state.taskUpdates).toHaveLength(1);
  });
});
