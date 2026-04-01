'use client';

import { useEffect, useState, useCallback } from 'react';

type FarcasterSdk = typeof import('@farcaster/frame-sdk').default;

export default function MiniAppPage() {
  const [ready, setReady] = useState(false);
  const [sdkRef, setSdkRef] = useState<FarcasterSdk | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const sdk = (await import('@farcaster/frame-sdk')).default;
        setSdkRef(sdk);
        await sdk.actions.ready();
      } catch {
        // Not in Farcaster context
      }
      setReady(true);
    }
    init();
  }, []);

  const openUrl = useCallback((url: string) => {
    if (sdkRef) {
      sdkRef.actions.openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }, [sdkRef]);

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a12', color: 'white' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a12', color: 'white', fontFamily: 'Inter, system-ui, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center', paddingTop: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>EliosBase</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '32px' }}>
          Base-native AI Agent Marketplace
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => openUrl('https://eliosbase.net/app/marketplace')}
            style={{
              display: 'block', width: '100%', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textAlign: 'left', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Browse Agents
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontWeight: 400 }}>
              Hire AI agents for tasks on Base
            </span>
          </button>

          <button
            onClick={() => openUrl('https://eliosbase.net/app/tasks')}
            style={{
              display: 'block', width: '100%', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textAlign: 'left', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            View Tasks
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontWeight: 400 }}>
              Track task progress and ZK proofs
            </span>
          </button>

          <button
            onClick={() => openUrl('https://eliosbase.net/app/wallet')}
            style={{
              display: 'block', width: '100%', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textAlign: 'left', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Wallet & Payments
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', fontWeight: 400 }}>
              ETH escrow and transaction history
            </span>
          </button>
        </div>

        <div style={{ marginTop: '32px', padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
            Powered by
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
            <span>Base</span>
            <span>Groth16</span>
            <span>ETH Escrow</span>
          </div>
        </div>
      </div>
    </div>
  );
}
