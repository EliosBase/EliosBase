import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const originalEnv = { ...process.env };

async function loadX402() {
  vi.resetModules();
  return import('@/lib/x402');
}

describe('x402 network defaults', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to Base Sepolia for the public facilitator', async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_BASE_CHAIN_ID: '8453',
      NEXT_PUBLIC_CHAIN: 'mainnet',
    };
    delete process.env.X402_NETWORK;
    delete process.env.X402_FACILITATOR_URL;

    const { getConfiguredX402Network } = await loadX402();

    expect(getConfiguredX402Network()).toBe('eip155:84532');
  });

  it('honors an explicit x402 network override', async () => {
    process.env = {
      ...originalEnv,
      X402_NETWORK: 'eip155:8453',
      NEXT_PUBLIC_BASE_CHAIN_ID: '8453',
      NEXT_PUBLIC_CHAIN: 'mainnet',
    };

    const { getConfiguredX402Network } = await loadX402();

    expect(getConfiguredX402Network()).toBe('eip155:8453');
  });
});
