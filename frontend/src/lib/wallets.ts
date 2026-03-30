export const knownWallets = [
  { id: 'metaMask', name: 'MetaMask', downloadUrl: 'https://metamask.io/download/' },
  { id: 'coinbaseWallet', name: 'Coinbase Wallet', downloadUrl: 'https://www.coinbase.com/wallet/downloads' },
  { id: 'rabby', name: 'Rabby', downloadUrl: 'https://rabby.io/' },
  { id: 'phantom', name: 'Phantom', downloadUrl: 'https://phantom.com/download' },
] as const;

export type KnownWalletId = (typeof knownWallets)[number]['id'];
export type WalletId = KnownWalletId | 'injected' | 'browserWallet';

export type MaybeProvider = {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  providers?: MaybeProvider[];
  request?: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

export type WalletWindow = {
  coinbaseWalletExtension?: MaybeProvider;
  ethereum?: MaybeProvider;
  phantom?: {
    ethereum?: MaybeProvider;
  };
};

const metaMaskImpersonatorFlags = [
  'isApexWallet',
  'isAvalanche',
  'isBitKeep',
  'isBlockWallet',
  'isKuCoinWallet',
  'isMathWallet',
  'isOkxWallet',
  'isOKExWallet',
  'isOneInchIOSWallet',
  'isOneInchAndroidWallet',
  'isOpera',
  'isPhantom',
  'isPortal',
  'isRabby',
  'isTokenPocket',
  'isTokenary',
  'isUniswapWallet',
  'isZerion',
] as const;

function isProvider(value: unknown): value is MaybeProvider {
  return typeof value === 'object' && value !== null;
}

function collectProviders(source: WalletWindow) {
  const providers: MaybeProvider[] = [];

  const push = (provider: unknown) => {
    if (!isProvider(provider) || providers.includes(provider)) return;
    providers.push(provider);
  };

  source.ethereum?.providers?.forEach(push);
  push(source.ethereum);
  push(source.coinbaseWalletExtension);
  push(source.phantom?.ethereum);

  return providers;
}

function isMetaMaskProvider(provider: MaybeProvider) {
  if (!provider.isMetaMask) return false;

  for (const flag of metaMaskImpersonatorFlags) {
    if ((provider as Record<string, unknown>)[flag]) return false;
  }

  return true;
}

export function getInjectedProvider(source: WalletWindow, walletId: WalletId): MaybeProvider | null {
  const providers = collectProviders(source);

  switch (walletId) {
    case 'metaMask':
      return providers.find(isMetaMaskProvider) ?? null;
    case 'coinbaseWallet':
      return source.coinbaseWalletExtension
        ?? providers.find((provider) => !!provider.isCoinbaseWallet)
        ?? null;
    case 'phantom':
      return source.phantom?.ethereum
        ?? providers.find((provider) => !!provider.isPhantom)
        ?? null;
    case 'rabby':
      return providers.find((provider) => !!provider.isRabby) ?? null;
    case 'browserWallet':
    case 'injected':
      return source.ethereum ?? providers[0] ?? null;
    default:
      return null;
  }
}

export function detectInstalledWallets(source: WalletWindow): WalletId[] {
  const providers = collectProviders(source);
  const installed = new Set<WalletId>();

  if (providers.some(isMetaMaskProvider)) installed.add('metaMask');
  if (source.coinbaseWalletExtension || providers.some((provider) => !!provider.isCoinbaseWallet)) {
    installed.add('coinbaseWallet');
  }
  if (source.phantom?.ethereum || providers.some((provider) => !!provider.isPhantom)) {
    installed.add('phantom');
  }
  if (providers.some((provider) => !!provider.isRabby)) installed.add('rabby');
  if (installed.size === 0 && providers.length > 0) installed.add('injected');

  return Array.from(installed);
}

export function getWalletName(id: string, fallback: string) {
  if (id === 'injected') return 'Browser Wallet';
  return knownWallets.find((wallet) => wallet.id === id)?.name ?? fallback;
}
