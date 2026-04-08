import { NextRequest, NextResponse } from 'next/server';
import { formatUnits } from 'viem';
import {
  AgentExecutionError,
  DEFAULT_AGENT_EXECUTION_MODEL,
  executeAgentTask,
} from '@/lib/agentExecutor';
import {
  checkRateLimit,
  generateId,
  logActivity,
  logAudit,
} from '@/lib/audit';
import { x402ExecuteSchema } from '@/lib/schemas/x402Execute';
import { createServiceClient } from '@/lib/supabase/server';
import {
  appendSettlementHeaders,
  createX402RequestContext,
  getAgentExecutionPaymentConfig,
  getX402HttpServer,
  isVerifiedX402Request,
  x402ResponseToInit,
} from '@/lib/x402';
import { buildAbsoluteUrl, getTaskPath } from '@/lib/web4Links';
import { getConfiguredSiteUrl } from '@/lib/runtimeConfig';
import type { TaskExecutionPayment } from '@/lib/types';

function formatUsdcAmount(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  try {
    const formatted = formatUnits(BigInt(value), 6);
    return formatted.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  } catch {
    return fallback;
  }
}

async function releaseAgent(agentId: string) {
  const supabase = createServiceClient();
  await supabase
    .from('agents')
    .update({ status: 'online' })
    .eq('id', agentId);
}

async function upsertSubmitter(walletAddress: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('users')
    .upsert(
      { wallet_address: walletAddress.toLowerCase(), last_seen_at: new Date().toISOString() },
      { onConflict: 'wallet_address' },
    )
    .select('id, wallet_address, role')
    .single();

  if (error || !data) {
    throw new Error('Failed to upsert paid execution submitter');
  }

  return data;
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string) {
  const message = error?.message ?? '';
  return (
    (error?.code === 'PGRST204' && message.includes(`'${column}' column`))
    || (error?.code === '42703' && message.includes(column))
  );
}

function usesLegacyTransactionsSchema(error: { code?: string; message?: string } | null | undefined) {
  return ['task_id', 'agent_id', 'payment_network', 'payment_reference', 'payment_method']
    .some((column) => isMissingColumnError(error, column));
}

function buildExecutionPayment(params: {
  amount: string;
  network: string;
  payer: string;
  txHash: string;
}): TaskExecutionPayment {
  return {
    method: 'x402',
    amount: params.amount,
    currency: 'USDC',
    network: params.network,
    payer: params.payer,
    status: 'settled',
    txHash: params.txHash,
    paymentReference: params.txHash,
  };
}

async function insertPaymentRecord(
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    id: string;
    type: 'payment';
    from: string;
    to: string;
    amount: string;
    token: 'USDC';
    status: 'confirmed';
    tx_hash: string;
    user_id: string;
    timestamp: string;
    task_id: string;
    agent_id: string;
    payment_network: string;
    payment_reference: string;
    payment_method: 'x402';
  },
) {
  const { error } = await supabase.from('transactions').insert(payload);
  if (!error) {
    return null;
  }

  if (!usesLegacyTransactionsSchema(error)) {
    return error;
  }

  const legacyPayload = {
    id: payload.id,
    type: payload.type,
    from: payload.from,
    to: payload.to,
    amount: payload.amount,
    token: payload.token,
    status: payload.status,
    tx_hash: payload.tx_hash,
    user_id: payload.user_id,
    timestamp: payload.timestamp,
  };
  const legacy = await supabase.from('transactions').insert(legacyPayload);
  return legacy.error;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;
  const config = await getAgentExecutionPaymentConfig(agentId);
  if (!config) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (config.status === 'offline') {
    return NextResponse.json({ error: 'Agent is offline' }, { status: 409 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = x402ExecuteSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const { allowed } = await checkRateLimit(agentId);
  if (!allowed) {
    return NextResponse.json({ error: 'Agent is rate limited' }, { status: 429 });
  }

  const supabase = createServiceClient();
  try {
    const httpServer = await getX402HttpServer();
    const paymentResult = await httpServer.processHTTPRequest(createX402RequestContext(req));
    if (!isVerifiedX402Request(paymentResult)) {
      return NextResponse.json(
        paymentResult.type === 'payment-error' ? paymentResult.response.body ?? {} : { error: 'Payment required' },
        x402ResponseToInit(paymentResult.type === 'payment-error'
          ? paymentResult.response
          : { status: 402, headers: {}, body: { error: 'Payment required' } }),
      );
    }

    const verified = await httpServer.server.verifyPayment(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
    );
    const payer = verified.payer?.toLowerCase();
    if (!verified.isValid || !payer) {
      return NextResponse.json({ error: verified.invalidMessage ?? 'Invalid x402 payment' }, { status: 402 });
    }

    const reservedAt = new Date().toISOString();
    const { data: reservedAgent, error: reserveError } = await supabase
      .from('agents')
      .update({ status: 'busy' })
      .eq('id', agentId)
      .eq('status', 'online')
      .select('id')
      .single();

    if (reserveError || !reservedAgent) {
      return NextResponse.json({ error: 'Agent is no longer available' }, { status: 409 });
    }

    const settlement = await httpServer.processSettlement(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
      paymentResult.declaredExtensions,
    );
    if (!settlement.success) {
      await releaseAgent(agentId);
      return NextResponse.json(
        settlement.response.body ?? { error: settlement.errorMessage ?? 'Payment settlement failed' },
        x402ResponseToInit(settlement.response),
      );
    }

    const submitter = await upsertSubmitter(payer);
    const taskId = generateId('task');
    const now = new Date().toISOString();
    const paymentAmount = formatUsdcAmount(settlement.amount, config.pricingSummary.amount);
    const reward = `${paymentAmount} USDC`;
    const payment = buildExecutionPayment({
      amount: paymentAmount,
      network: settlement.network,
      payer,
      txHash: settlement.transaction,
    });

    const { data: createdTask, error: taskError } = await supabase
      .from('tasks')
      .insert({
        id: taskId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: 'active',
        current_step: 'Executing',
        assigned_agent: agentId,
        reward,
        submitter_id: submitter.id,
        submitted_at: reservedAt,
        step_changed_at: now,
        execution_result: {
          status: 'running',
          startedAt: now,
          model: DEFAULT_AGENT_EXECUTION_MODEL,
          agentType: config.type,
          capabilities: config.capabilities,
          payment,
        },
        escrow_token: 'USDC',
      })
      .select('id, title, current_step, status')
      .single();

    if (taskError || !createdTask) {
      await releaseAgent(agentId);
      return NextResponse.json({ error: 'Failed to create paid execution task' }, { status: 500 });
    }

    const paymentId = generateId('tx');
    const paymentError = await insertPaymentRecord(supabase, {
      id: paymentId,
      type: 'payment',
      from: payer,
      to: config.payTo,
      amount: paymentAmount,
      token: 'USDC',
      status: 'confirmed',
      tx_hash: settlement.transaction,
      user_id: submitter.id,
      timestamp: now,
      task_id: taskId,
      agent_id: agentId,
      payment_network: settlement.network,
      payment_reference: settlement.transaction,
      payment_method: 'x402',
    });

    if (paymentError) {
      await releaseAgent(agentId);
      return NextResponse.json({ error: 'Failed to persist paid execution payment' }, { status: 500 });
    }

    await logAudit({ action: 'PAYMENT', actor: payer, target: paymentId, result: 'ALLOW' });
    await logAudit({ action: 'TASK_CREATE', actor: payer, target: taskId, result: 'ALLOW' });
    await logActivity({ type: 'payment', message: `X402 payment accepted for task: ${parsed.data.title}`, userId: submitter.id });
    await logActivity({ type: 'task', message: `Execution started for task: ${parsed.data.title}`, userId: submitter.id });

    let executionStatus: 'completed' | 'failed' = 'completed';
    let currentStep: 'Executing' | 'ZK Verifying' = 'ZK Verifying';

    try {
      const executionResult = await executeAgentTask(
        {
          id: taskId,
          title: parsed.data.title,
          description: parsed.data.description,
          reward,
        },
        {
          id: agentId,
          name: config.agentName,
          type: config.type,
          description: config.description,
          capabilities: config.capabilities,
        },
      );

      const completedAt = new Date().toISOString();
      await supabase
        .from('tasks')
        .update({
          current_step: 'ZK Verifying',
          step_changed_at: completedAt,
          execution_result: {
            status: 'succeeded',
            completedAt,
            payment,
            result: executionResult,
          },
        })
        .eq('id', taskId);

      await logAudit({ action: 'AGENT_EXECUTE', actor: payer, target: taskId, result: 'ALLOW' });
      await logActivity({ type: 'task', message: `Execution completed for task: ${parsed.data.title}`, userId: submitter.id });
    } catch (error) {
      executionStatus = 'failed';
      currentStep = 'Executing';

      const failure = error instanceof AgentExecutionError
        ? error
        : new AgentExecutionError(
          error instanceof Error ? error.message : 'Agent execution failed',
          { code: 'agent_execution_failed', retryable: false, cause: error },
        );

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          current_step: 'Executing',
          step_changed_at: new Date().toISOString(),
          execution_result: {
            status: 'failed',
            payment,
            failure: {
              code: failure.code,
              message: failure.message,
              retryable: failure.retryable,
              failedAt: new Date().toISOString(),
              model: DEFAULT_AGENT_EXECUTION_MODEL,
              agentType: config.type,
              terminal: true,
            },
          },
        })
        .eq('id', taskId);

      await logAudit({ action: 'AGENT_EXECUTE', actor: payer, target: taskId, result: 'FLAG' });
      await logActivity({ type: 'task', message: `Execution failed for task: ${parsed.data.title}`, userId: submitter.id });
    } finally {
      await releaseAgent(agentId);
      await logActivity({ type: 'agent', message: `Agent available: ${config.agentName}` });
    }

    const siteUrl = getConfiguredSiteUrl() ?? 'https://eliosbase.net';
    const taskUrl = buildAbsoluteUrl(getTaskPath(taskId), siteUrl);
    const receiptUrl = buildAbsoluteUrl(`/api/tasks/${encodeURIComponent(taskId)}/receipt`, siteUrl);

    const response = NextResponse.json({
      success: true,
      taskId,
      taskUrl,
      receiptUrl,
      currentStep,
      executionStatus,
      paymentReference: settlement.transaction,
      txHash: settlement.transaction,
      network: settlement.network,
    }, { status: 201 });

    appendSettlementHeaders(response.headers, settlement);
    return response;
  } catch (error) {
    await releaseAgent(agentId);
    console.error('[x402] execute route failed:', error);
    return NextResponse.json({ error: 'Failed to execute paid agent task' }, { status: 500 });
  }
}
