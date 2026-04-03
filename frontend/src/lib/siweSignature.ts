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
const walletHarnessEnabled = process.env.NODE_ENV !== 'production';

function sameAddress(left: string, right: string) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function isSiweMessage(message: string) {
  return message.includes(' wants you to sign in with your Ethereum account:')
    && message.includes('\nURI: ')
    && message.includes('\nVersion: ')
    && message.includes('\nChain ID: ')
    && message.includes('\nNonce: ');
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
  const setDebug = (value: string) => {
    if (walletHarnessEnabled && typeof window !== 'undefined') {
      (window as typeof window & { __ELIOS_SIWE_SIGN_METHOD__?: string }).__ELIOS_SIWE_SIGN_METHOD__ = value;
    }
  };

  const setDebugError = (value: unknown) => {
    if (walletHarnessEnabled && typeof window !== 'undefined') {
      const text =
        value instanceof Error
          ? value.message
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);
      (window as typeof window & { __ELIOS_SIWE_SIGN_ERROR__?: string | null }).__ELIOS_SIWE_SIGN_ERROR__ = text;
    }
  };

  const pushDebugError = (label: string, value: unknown) => {
    if (!walletHarnessEnabled || typeof window === 'undefined') {
      return;
    }

    const text =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
    const browserWindow = window as typeof window & { __ELIOS_SIWE_SIGN_ERRORS__?: string[] };
    browserWindow.__ELIOS_SIWE_SIGN_ERRORS__ = [
      ...(browserWindow.__ELIOS_SIWE_SIGN_ERRORS__ ?? []),
      `${label}: ${text}`,
    ];
  };

  await provider.request?.({
    method: 'eth_requestAccounts',
    params: [],
  }).catch(() => null);

  if (provider.isPhantom) {
    if (isSiweMessage(message)) {
      setDebug('phantom:signMessage');
      const phantomSignature = await provider.request?.({
        method: 'signMessage',
        params: {
          message: new TextEncoder().encode(message),
          display: 'utf8',
        },
      }).catch((error) => {
        pushDebugError('phantom:signMessage', error);
        setDebugError(error);
        return null;
      });

      if (typeof phantomSignature === 'string') {
        return phantomSignature;
      }
    }

    const encodedMessage = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
    for (const params of [
      [encodedMessage, address],
      [encodedMessage, address, 'Sign-In With Ethereum'],
    ]) {
      setDebug(`phantom:personal_sign:${params.length}`);
      const personalSignature = await provider.request?.({
        method: 'personal_sign',
        params,
      }).catch((error) => {
        pushDebugError(`phantom:personal_sign:${params.length}`, error);
        setDebugError(error);
        return null;
      });

      if (typeof personalSignature === 'string') {
        return personalSignature;
      }
    }

    setDebug('phantom:eth_sign');
    const signature = await provider.request?.({
      method: 'eth_sign',
      params: [address, message],
    }).catch((error) => {
      pushDebugError('phantom:eth_sign', error);
      setDebugError(error);
      return null;
    });

    return typeof signature === 'string' ? signature : null;
  }

  setDebug('personal_sign');
  const personalSignature = await provider.request?.({
    method: 'personal_sign',
    params: [message, address],
  }).catch((error) => {
    pushDebugError('personal_sign', error);
    setDebugError(error);
    return null;
  });

  if (typeof personalSignature === 'string') {
    return personalSignature;
  }

  setDebug('eth_sign');
  const legacySignature = await provider.request?.({
    method: 'eth_sign',
    params: [address, message],
  }).catch((error) => {
    pushDebugError('eth_sign', error);
    setDebugError(error);
    return null;
  });

  return typeof legacySignature === 'string' ? legacySignature : null;
}
