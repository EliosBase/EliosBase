import { afterEach, describe, expect, it, vi } from 'vitest';

const mockReadContract = vi.fn();

vi.mock('@/lib/agentWallet7579', () => ({
  buildSafe7579Modules: () => ({
    ownerValidator: {
      module: '0x000000000013fdB5234E4E3162a810F54d9f7E98',
    },
    smartSessions: {
      module: '0x00000000008bDABA73cD9815d79069c247Eb4bDA',
    },
    compatibilityFallback: {
      module: '0x000000000052e9685932845660777DF43C2dC496',
      functionSig: '0x12345678',
    },
  }),
  safe7579PublicClient: {
    readContract: mockReadContract,
    getStorageAt: vi.fn().mockResolvedValue(`0x${'00'.repeat(32)}`),
  },
}));

afterEach(() => {
  mockReadContract.mockReset();
});

describe('agentWallet7579State', () => {
  it('treats a short validator page as complete instead of reading a reverting next page', async () => {
    mockReadContract.mockResolvedValueOnce([
      [
        '0x00000000008bDABA73cD9815d79069c247Eb4bDA',
        '0x000000000013fdB5234E4E3162a810F54d9f7E98',
      ],
      '0x000000000013fdB5234E4E3162a810F54d9f7E98',
    ]);

    const { isSafe7579ValidatorInstalled } = await import('@/lib/agentWallet7579State');

    await expect(
      isSafe7579ValidatorInstalled(
        '0x9345202fb04172Ea51D8f818cc4A6A24Fb03b983',
        '0x000000000013fdB5234E4E3162a810F54d9f7E98',
      ),
    ).resolves.toBe(true);

    expect(mockReadContract).toHaveBeenCalledTimes(1);
  });
});
