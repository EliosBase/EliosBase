import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Verify that chain configuration is fully environment-driven.
 * Switching NEXT_PUBLIC_CHAIN between 'testnet' and 'mainnet' (or undefined)
 * must resolve all chain-dependent values correctly with zero code changes.
 */

describe('chain configuration parity', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  async function loadChainConfig() {
    return import('@/lib/chainConfig');
  }

  it('resolves to Base mainnet when NEXT_PUBLIC_CHAIN is unset', async () => {
    delete process.env.NEXT_PUBLIC_CHAIN;
    const { activeChain, activeChainId, isTestnet, chainName } = await loadChainConfig();
    expect(isTestnet).toBe(false);
    expect(activeChainId).toBe(8453);
    expect(activeChain.id).toBe(8453);
    expect(chainName).toBe('Base');
  });

  it('resolves to Base Sepolia when NEXT_PUBLIC_CHAIN is testnet', async () => {
    process.env.NEXT_PUBLIC_CHAIN = 'testnet';
    const { activeChain, activeChainId, isTestnet, chainName } = await loadChainConfig();
    expect(isTestnet).toBe(true);
    expect(activeChainId).toBe(84532);
    expect(activeChain.id).toBe(84532);
    expect(chainName).toBe('Base Sepolia');
  });

  it('resolves to Base mainnet when NEXT_PUBLIC_CHAIN is mainnet', async () => {
    process.env.NEXT_PUBLIC_CHAIN = 'mainnet';
    const { activeChain, activeChainId, isTestnet, chainName } = await loadChainConfig();
    expect(isTestnet).toBe(false);
    expect(activeChainId).toBe(8453);
    expect(activeChain.id).toBe(8453);
    expect(chainName).toBe('Base');
  });

  it('USDC address changes with chain', async () => {
    delete process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS;

    process.env.NEXT_PUBLIC_CHAIN = 'testnet';
    const testnetContracts = await import('@/lib/contracts');
    expect(testnetContracts.USDC_TOKEN_ADDRESS).toBe(
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    );

    vi.resetModules();
    delete process.env.NEXT_PUBLIC_CHAIN;
    const mainnetContracts = await import('@/lib/contracts');
    expect(mainnetContracts.USDC_TOKEN_ADDRESS).toBe(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
  });

  it('allows explicit USDC address override via env', async () => {
    process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS = '0x1234000000000000000000000000000000000000';
    const { USDC_TOKEN_ADDRESS } = await import('@/lib/contracts');
    expect(USDC_TOKEN_ADDRESS).toBe('0x1234000000000000000000000000000000000000');
  });
});
