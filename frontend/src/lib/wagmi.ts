import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { base as appKitBase, baseSepolia as appKitBaseSepolia } from '@reown/appkit/networks';
import { http, createConfig } from 'wagmi';
import { coinbaseWallet, injected, metaMask } from 'wagmi/connectors';
import { base, baseSepolia } from 'wagmi/chains';
import { isTestnet } from '@/lib/chainConfig';
import { getConfiguredReownProjectId, getConfiguredSiteUrl } from '@/lib/runtimeConfig';

export { activeChain } from '@/lib/chainConfig';

const useWalletE2EConnectorMode = process.env.NEXT_PUBLIC_WALLET_E2E_FORCE_CONNECTORS === '1';
const disableWalletReconnect = process.env.NEXT_PUBLIC_WALLET_E2E_DISABLE_RECONNECT === '1';
const targetedInjectedConnectorOptions = { shimDisconnect: false } as const;
const genericInjectedConnectorOptions = { shimDisconnect: !useWalletE2EConnectorMode } as const;

const walletConnectors = [
  metaMask(),
  coinbaseWallet({ appName: 'EliosBase', preference: { options: 'all' } }),
  injected({ ...targetedInjectedConnectorOptions, target: 'phantom' }),
  injected({ ...targetedInjectedConnectorOptions, target: 'rabby' }),
  injected(genericInjectedConnectorOptions),
];

const siteUrl = getConfiguredSiteUrl() ?? 'https://eliosbase.net';
const activeAppKitNetwork = isTestnet ? appKitBaseSepolia : appKitBase;
const appKitNetworks: [typeof activeAppKitNetwork] = [activeAppKitNetwork];
const configuredReownProjectId = getConfiguredReownProjectId();

export const appKitMetadata = {
  name: 'EliosBase',
  description:
    'Base-native AI agent marketplace with wallet sign-in, ETH escrow, proof-backed completion, and operational telemetry.',
  url: siteUrl,
  icons: [`${siteUrl}/favicon.jpg`],
};

export const reownProjectId = useWalletE2EConnectorMode ? undefined : configuredReownProjectId;
export const isAppKitEnabled = Boolean(reownProjectId);

export const wagmiAdapter = reownProjectId
  ? new WagmiAdapter({
      connectors: walletConnectors,
      multiInjectedProviderDiscovery: false,
      projectId: reownProjectId,
      networks: appKitNetworks,
      ssr: true,
      transports: {
        [activeAppKitNetwork.id]: http(),
      },
    })
  : undefined;

export const appKitConfig = wagmiAdapter
  ? {
      adapters: [wagmiAdapter],
      enableReconnect: !disableWalletReconnect,
      projectId: reownProjectId!,
      metadata: appKitMetadata,
      networks: appKitNetworks,
      themeMode: 'dark' as const,
      features: {
        analytics: true,
        email: false,
        socials: [],
      },
    }
  : null;

export const config = wagmiAdapter?.wagmiConfig
  ?? (isTestnet
    ? createConfig({
        chains: [baseSepolia],
        connectors: walletConnectors,
        multiInjectedProviderDiscovery: false,
        ssr: true,
        transports: {
          [baseSepolia.id]: http(),
        },
      })
    : createConfig({
        chains: [base],
        connectors: walletConnectors,
        multiInjectedProviderDiscovery: false,
        ssr: true,
        transports: {
          [base.id]: http(),
        },
      }));
