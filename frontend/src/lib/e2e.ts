'use client';

const isBrowser = typeof window !== 'undefined';

export const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';

const walletStorageKey = 'elios:e2e:wallet';
const proofStorageKey = 'elios:e2e:verifiedTasks';
const walletEvent = 'elios:e2e:wallet-change';
const proofEvent = 'elios:e2e:proof-change';

type E2EWindow = Window & {
  __ELIOS_E2E__?: {
    verifiedTasks?: string[];
  };
};

export interface E2EWalletState {
  connected: boolean;
  address: `0x${string}`;
  chainId: number;
}

const defaultWalletState: E2EWalletState = {
  connected: false,
  address: '0x123400000000000000000000000000000000abcd',
  chainId: parseInt(process.env.NEXT_PUBLIC_BASE_CHAIN_ID || '8453', 10),
};

function dispatch(name: string) {
  if (!isBrowser) return;
  window.dispatchEvent(new CustomEvent(name));
}

function readJson<T>(key: string): T | null {
  if (!isBrowser) return null;

  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readE2EWalletState(): E2EWalletState {
  if (!isE2EMode || !isBrowser) return defaultWalletState;
  return readJson<E2EWalletState>(walletStorageKey) ?? defaultWalletState;
}

export function writeE2EWalletState(next: Partial<E2EWalletState>) {
  if (!isE2EMode || !isBrowser) return;

  const state = { ...readE2EWalletState(), ...next };
  window.sessionStorage.setItem(walletStorageKey, JSON.stringify(state));
  dispatch(walletEvent);
}

export function clearE2EWalletState() {
  if (!isE2EMode || !isBrowser) return;
  writeE2EWalletState({ connected: false });
}

export function subscribeE2EWallet(listener: () => void) {
  if (!isE2EMode || !isBrowser) return () => {};

  window.addEventListener(walletEvent, listener);
  return () => window.removeEventListener(walletEvent, listener);
}

export function readE2EVerifiedTasks(): string[] {
  if (!isE2EMode || !isBrowser) return [];

  const fromStorage = readJson<string[]>(proofStorageKey);
  if (fromStorage) return fromStorage;

  return ((window as E2EWindow).__ELIOS_E2E__?.verifiedTasks ?? []).filter(
    (value): value is string => typeof value === 'string',
  );
}

export function writeE2EVerifiedTasks(taskIds: string[]) {
  if (!isE2EMode || !isBrowser) return;
  window.sessionStorage.setItem(proofStorageKey, JSON.stringify(taskIds));
  dispatch(proofEvent);
}

export function subscribeE2EProofs(listener: () => void) {
  if (!isE2EMode || !isBrowser) return () => {};

  window.addEventListener(proofEvent, listener);
  return () => window.removeEventListener(proofEvent, listener);
}
