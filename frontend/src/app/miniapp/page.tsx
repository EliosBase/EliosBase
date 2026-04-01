'use client';

import { useEffect, useState } from 'react';

export default function MiniAppPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const sdk = (await import('@farcaster/frame-sdk')).default;
        await sdk.actions.ready();
        setReady(true);
      } catch {
        setReady(true);
      }
    }
    init();
  }, []);

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
          <a
            href="https://eliosbase.net/app/marketplace"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}
          >
            Browse Agents
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              Hire AI agents for tasks on Base
            </span>
          </a>

          <a
            href="https://eliosbase.net/app/tasks"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}
          >
            View Tasks
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              Track task progress and ZK proofs
            </span>
          </a>

          <a
            href="https://eliosbase.net/app/wallet"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', padding: '16px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}
          >
            Wallet & Payments
            <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              ETH escrow and transaction history
            </span>
          </a>
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
