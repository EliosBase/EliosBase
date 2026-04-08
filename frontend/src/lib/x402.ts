import 'server-only';

import type { NextRequest } from 'next/server';
import {
  HTTPFacilitatorClient,
  type HTTPAdapter,
  type HTTPProcessResult,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
  type ProcessSettleResultResponse,
  type RouteConfig,
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { readEnv, readIntEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/server';
import {
  buildAbsoluteUrl,
  getAgentCapabilitiesPath,
  getAgentExecutePath,
  getAgentFramePath,
  getAgentPath,
} from '@/lib/web4Links';
import { getConfiguredFramesBaseUrl, getConfiguredSiteUrl } from '@/lib/runtimeConfig';
import type {
  AgentPayableCapability,
  AgentPaymentMethod,
  AgentPricingSummary,
} from '@/lib/types';

const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';
const DEFAULT_MAINNET_NETWORK = 'eip155:8453' as const;
const DEFAULT_TESTNET_NETWORK = 'eip155:84532' as const;
const DEFAULT_PRICE_USD = '$0.05';
const DEFAULT_TIMEOUT_SECONDS = 180;
const EXECUTE_ROUTE_PATTERN = 'POST /api/agents/:id/execute';

type X402Network = `${string}:${string}`;

type AgentExecutionPricingRow = {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'busy' | 'offline';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  capabilities: string[];
  x402_price_usd: string | null;
  wallet_address: string | null;
  users?: { wallet_address?: string | null } | null;
};

export type AgentExecutionPaymentConfig = {
  agentId: string;
  agentName: string;
  description: string;
  status: 'online' | 'busy' | 'offline';
  type: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  capabilities: string[];
  payTo: string;
  priceUsd: string;
  pricingSummary: AgentPricingSummary;
  paymentMethods: AgentPaymentMethod[];
  payableCapabilities: AgentPayableCapability[];
  pageUrl: string;
  frameUrl: string;
  capabilitiesUrl: string;
  executeUrl: string;
};

let httpServerPromise: Promise<x402HTTPResourceServer> | null = null;

function normalizeUsdPrice(value: string | null | undefined) {
  const normalized = readEnv(value) ?? DEFAULT_PRICE_USD;
  const numeric = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_PRICE_USD;
  }

  return `$${numeric.toFixed(2)}`;
}

export function getConfiguredX402FacilitatorUrl() {
  return readEnv(process.env.X402_FACILITATOR_URL) ?? DEFAULT_FACILITATOR_URL;
}

function getDefaultX402Network(): X402Network {
  const facilitatorUrl = readEnv(process.env.X402_FACILITATOR_URL);
  if (!facilitatorUrl || facilitatorUrl === DEFAULT_FACILITATOR_URL) {
    return DEFAULT_TESTNET_NETWORK;
  }

  const explicitChainId = readEnv(process.env.NEXT_PUBLIC_BASE_CHAIN_ID);
  if (explicitChainId === '8453') {
    return DEFAULT_MAINNET_NETWORK;
  }

  if (explicitChainId === '84532') {
    return DEFAULT_TESTNET_NETWORK;
  }

  const explicitChain = readEnv(process.env.NEXT_PUBLIC_CHAIN);
  if (explicitChain === 'mainnet' || explicitChain === 'base') {
    return DEFAULT_MAINNET_NETWORK;
  }

  return DEFAULT_TESTNET_NETWORK;
}

export function getConfiguredX402Network() {
  return (readEnv(process.env.X402_NETWORK) ?? getDefaultX402Network()) as X402Network;
}

export function getConfiguredX402TimeoutSeconds() {
  return readIntEnv(process.env.X402_MAX_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);
}

export function getConfiguredX402DefaultPriceUsd() {
  return normalizeUsdPrice(process.env.X402_DEFAULT_PRICE_USD);
}

export function getX402NetworkLabel(network = getConfiguredX402Network()) {
  switch (network) {
    case 'eip155:8453':
      return 'Base';
    case 'eip155:84532':
      return 'Base Sepolia';
    default:
      return network;
  }
}

export function priceUsdToUsdcAmount(priceUsd: string) {
  return normalizeUsdPrice(priceUsd).replace(/^\$/, '');
}

function getExecuteInputSchema(): AgentPayableCapability['inputSchema'] {
  return {
    contentType: 'application/json',
    required: ['title', 'description'],
    properties: {
      title: {
        type: 'string',
        description: 'Short task title for the paid execution request.',
      },
      description: {
        type: 'string',
        description: 'Detailed task instructions for the selected agent.',
      },
    },
  };
}

type AgentExecutionSurfaceParams = {
  agentId: string;
  agentName: string;
  description: string;
  priceUsd?: string | null;
  payTo?: string | null;
  siteUrl?: string;
  framesBaseUrl?: string;
};

function extractAgentId(path: string) {
  const match = path.match(/\/api\/agents\/([^/]+)\/execute\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, column: string) {
  const message = error?.message ?? '';
  return (
    (error?.code === 'PGRST204' && message.includes(`'${column}' column`))
    || (error?.code === '42703' && message.includes(column))
  );
}

async function selectAgentExecutionPricingRow(agentId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, description, status, type, capabilities, x402_price_usd, wallet_address, users:owner_id(wallet_address)')
    .eq('id', agentId)
    .single();

  if (!error && data) {
    return data as AgentExecutionPricingRow;
  }

  if (!isMissingColumnError(error, 'x402_price_usd')) {
    return null;
  }

  const legacy = await supabase
    .from('agents')
    .select('id, name, description, status, type, capabilities, wallet_address, users:owner_id(wallet_address)')
    .eq('id', agentId)
    .single();

  if (legacy.error || !legacy.data) {
    return null;
  }

  return {
    ...(legacy.data as Omit<AgentExecutionPricingRow, 'x402_price_usd'>),
    x402_price_usd: null,
  };
}

function resolvePayTo(row: AgentExecutionPricingRow) {
  return row.wallet_address
    ?? row.users?.wallet_address
    ?? readEnv(process.env.X402_SELLER_ADDRESS)
    ?? null;
}

export async function getAgentExecutionPaymentConfig(agentId: string): Promise<AgentExecutionPaymentConfig | null> {
  const row = await selectAgentExecutionPricingRow(agentId);
  if (!row) {
    return null;
  }

  const payTo = resolvePayTo(row);
  if (!payTo) {
    return null;
  }

  const surface = buildAgentExecutionSurface({
    agentId,
    agentName: row.name,
    description: row.description,
    priceUsd: row.x402_price_usd ?? getConfiguredX402DefaultPriceUsd(),
    payTo,
  });

  return {
    agentId: row.id,
    agentName: row.name,
    description: row.description,
    status: row.status,
    type: row.type,
    capabilities: row.capabilities,
    payTo,
    priceUsd: surface.pricingSummary.priceUsd,
    pricingSummary: surface.pricingSummary,
    paymentMethods: surface.paymentMethods,
    payableCapabilities: surface.payableCapabilities,
    pageUrl: surface.pageUrl,
    frameUrl: surface.frameUrl,
    capabilitiesUrl: surface.capabilitiesUrl,
    executeUrl: surface.executeUrl,
  };
}

export function buildAgentExecutionSurface(params: AgentExecutionSurfaceParams) {
  const siteUrl = params.siteUrl ?? getConfiguredSiteUrl() ?? 'https://eliosbase.net';
  const framesBaseUrl = params.framesBaseUrl ?? getConfiguredFramesBaseUrl() ?? siteUrl;
  const network = getConfiguredX402Network();
  const priceUsd = normalizeUsdPrice(params.priceUsd ?? getConfiguredX402DefaultPriceUsd());
  const pageUrl = buildAbsoluteUrl(getAgentPath(params.agentId), siteUrl);
  const frameUrl = buildAbsoluteUrl(getAgentFramePath(params.agentId), framesBaseUrl);
  const capabilitiesUrl = buildAbsoluteUrl(getAgentCapabilitiesPath(params.agentId), siteUrl);
  const executeUrl = buildAbsoluteUrl(getAgentExecutePath(params.agentId), siteUrl);
  const pricingSummary: AgentPricingSummary = {
    amount: priceUsdToUsdcAmount(priceUsd),
    currency: 'USDC',
    network,
    priceUsd,
  };
  const paymentMethods: AgentPaymentMethod[] = [
    {
      kind: 'x402',
      scheme: 'exact',
      network,
      currency: 'USDC',
      facilitatorUrl: getConfiguredX402FacilitatorUrl(),
      resource: executeUrl,
      payTo: params.payTo ?? undefined,
    },
  ];
  const payableCapabilities: AgentPayableCapability[] = [
    {
      id: 'execute-task',
      method: 'POST',
      path: getAgentExecutePath(params.agentId),
      description: `Run a paid ${params.agentName} execution request and persist the result as an Elios task receipt.`,
      priceUsd,
      inputSchema: getExecuteInputSchema(),
    },
  ];

  return {
    pricingSummary,
    paymentMethods,
    payableCapabilities,
    pageUrl,
    frameUrl,
    capabilitiesUrl,
    executeUrl,
  };
}

export async function getAgentCapabilitiesManifest(agentId: string) {
  const config = await getAgentExecutionPaymentConfig(agentId);
  if (!config) {
    return null;
  }

  return {
    agentId: config.agentId,
    agentName: config.agentName,
    description: config.description,
    pricingSummary: config.pricingSummary,
    paymentMethods: config.paymentMethods,
    payableCapabilities: config.payableCapabilities,
    links: {
      pageUrl: config.pageUrl,
      frameUrl: config.frameUrl,
      capabilitiesUrl: config.capabilitiesUrl,
      executeUrl: config.executeUrl,
    },
  };
}

class NextRequestAdapter implements HTTPAdapter {
  private readonly bodyPromise: Promise<unknown>;

  constructor(private readonly req: NextRequest) {
    this.bodyPromise = this.req.clone().json().catch(() => undefined);
  }

  getHeader(name: string) {
    return this.req.headers.get(name) ?? undefined;
  }

  getMethod() {
    return this.req.method;
  }

  getPath() {
    return this.req.nextUrl.pathname;
  }

  getUrl() {
    return this.req.url;
  }

  getAcceptHeader() {
    return this.req.headers.get('accept') ?? '';
  }

  getUserAgent() {
    return this.req.headers.get('user-agent') ?? '';
  }

  getQueryParams() {
    return Object.fromEntries(this.req.nextUrl.searchParams.entries());
  }

  getQueryParam(name: string) {
    const values = this.req.nextUrl.searchParams.getAll(name);
    if (values.length === 0) {
      return undefined;
    }

    return values.length === 1 ? values[0] : values;
  }

  async getBody() {
    return this.bodyPromise;
  }
}

async function resolveDynamicRouteConfig(path: string): Promise<RouteConfig> {
  const agentId = extractAgentId(path);
  if (!agentId) {
    throw new Error(`Unsupported x402 route path: ${path}`);
  }

  const config = await getAgentExecutionPaymentConfig(agentId);
  if (!config) {
    throw new Error(`Agent ${agentId} is not x402-configured`);
  }

  return {
    accepts: {
      scheme: 'exact',
      payTo: config.payTo,
      price: config.priceUsd,
      network: getConfiguredX402Network(),
      maxTimeoutSeconds: getConfiguredX402TimeoutSeconds(),
    },
    description: `Paid Elios execution for ${config.agentName}`,
    mimeType: 'application/json',
    unpaidResponseBody: async () => ({
      contentType: 'application/json',
      body: {
        error: 'Payment required',
        code: 'payment_required',
        agentId: config.agentId,
        pricingSummary: config.pricingSummary,
        paymentMethods: config.paymentMethods,
        payableCapabilities: config.payableCapabilities,
        links: {
          pageUrl: config.pageUrl,
          capabilitiesUrl: config.capabilitiesUrl,
          executeUrl: config.executeUrl,
        },
      },
    }),
  };
}

async function buildHttpServer() {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: getConfiguredX402FacilitatorUrl(),
  });
  const server = new x402ResourceServer(facilitatorClient)
    .register(getConfiguredX402Network(), new ExactEvmScheme());
  const httpServer = new x402HTTPResourceServer(server, {
    [EXECUTE_ROUTE_PATTERN]: {
      accepts: {
        scheme: 'exact',
        payTo: async (context) => {
          const config = await getAgentExecutionPaymentConfig(extractAgentId(context.path) ?? '');
          if (!config) {
            throw new Error(`Agent ${context.path} is not x402-configured`);
          }

          return config.payTo;
        },
        price: async (context) => {
          const config = await getAgentExecutionPaymentConfig(extractAgentId(context.path) ?? '');
          if (!config) {
            throw new Error(`Agent ${context.path} is not x402-configured`);
          }

          return config.priceUsd;
        },
        network: getConfiguredX402Network(),
        maxTimeoutSeconds: getConfiguredX402TimeoutSeconds(),
      },
      description: 'Machine-payable Elios agent execution over x402.',
      mimeType: 'application/json',
      unpaidResponseBody: async (context) => {
        const routeConfig = await resolveDynamicRouteConfig(context.path);
        const body = await routeConfig.unpaidResponseBody?.(context);
        return body ?? { contentType: 'application/json', body: {} };
      },
    },
  });
  await httpServer.initialize();
  return httpServer;
}

export async function getX402HttpServer() {
  if (!httpServerPromise) {
    httpServerPromise = buildHttpServer();
  }

  return httpServerPromise;
}

export function createX402RequestContext(req: NextRequest): HTTPRequestContext {
  return {
    adapter: new NextRequestAdapter(req),
    path: req.nextUrl.pathname,
    method: req.method,
    paymentHeader: req.headers.get('payment-signature') ?? req.headers.get('x-payment') ?? undefined,
  };
}

export function x402ResponseToInit(response: HTTPResponseInstructions): ResponseInit {
  return {
    status: response.status,
    headers: response.headers,
  };
}

export function isVerifiedX402Request(result: HTTPProcessResult): result is Extract<HTTPProcessResult, { type: 'payment-verified' }> {
  return result.type === 'payment-verified';
}

export function appendSettlementHeaders(headers: Headers, result: ProcessSettleResultResponse | HTTPResponseInstructions) {
  Object.entries(result.headers).forEach(([name, value]) => {
    headers.set(name, value);
  });
}
