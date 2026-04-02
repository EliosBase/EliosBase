import { getAddress } from 'viem';
import { getInjectedProvider, type MaybeProvider, type WalletId, type WalletWindow } from '@/lib/wallets';

type InjectedRequest = {
  method: string;
  params?: unknown[] | object;
};

export type InjectedEthereumProvider = MaybeProvider & {
  selectedAddress?: string;
  request?: (args: InjectedRequest) => Promise<unknown>;
};

const injectedWalletPriority: WalletId[] = [
  'phantom',
  'metaMask',
  'coinbaseWallet',
  'rabby',
  'browserWallet',
];

function sameAddress(left: string, right: string) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

async function matchesAddress(provider: InjectedEthereumProvider, address: string) {
  if (provider.selectedAddress) {
    return sameAddress(provider.selectedAddress, address);
  }

  const accounts = await provider.request?.({
    method: 'eth_accounts',
  }).catch(() => null);

  return Array.isArray(accounts)
    && typeof accounts[0] === 'string'
    && sameAddress(accounts[0], address);
}

export async function getConnectedInjectedProvider(source: WalletWindow, address: string) {
  for (const walletId of injectedWalletPriority) {
    const candidate = getInjectedProvider(source, walletId) as InjectedEthereumProvider | null;
    if (!candidate) {
      continue;
    }

    if (await matchesAddress(candidate, address)) {
      return candidate;
    }
  }

  return null;
}

export async function signWithInjectedProvider(
  provider: InjectedEthereumProvider,
  address: string,
  message: string,
) {
  await provider.request?.({
    method: 'eth_requestAccounts',
    params: [],
  }).catch(() => null);

  if (provider.isPhantom) {
    const signature = await provider.request?.({
      method: 'eth_sign',
      params: [address, message],
    });

    return typeof signature === 'string' ? signature : null;
  }

  const personalSignature = await provider.request?.({
    method: 'personal_sign',
    params: [message, address],
  }).catch(() => null);

  if (typeof personalSignature === 'string') {
    return personalSignature;
  }

  const legacySignature = await provider.request?.({
    method: 'eth_sign',
    params: [address, message],
  }).catch(() => null);

  return typeof legacySignature === 'string' ? legacySignature : null;
}
