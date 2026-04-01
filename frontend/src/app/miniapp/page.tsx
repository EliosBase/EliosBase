'use client';

import { useEffect, useState } from 'react';

export default function MiniAppPage() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'home' | 'marketplace' | 'tasks' | 'wallet'>('home');
  const [agents, setAgents] = useState<Array<{ id: string; name: string; description: string; status: string; reputation: number; tasksCompleted: number; pricePerTask: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; description: string; status: string; currentStep: string; reward: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const sdk = (await import('@farcaster/frame-sdk')).default;
        await sdk.actions.ready();
      } catch {
        // Not in Farcaster context
      }
      setReady(true);
    }
    init();
  }, []);

  async function loadAgents() {
    setView('marketplace');
    setLoading(true);
    try {
      const res = await fetch('/api/agents?limit=10');
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : data.agents || []);
    } catch {
      setAgents([]);
    }
    setLoading(false);
  }

  async function loadTasks() {
    setView('tasks');
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?limit=10');
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch {
      setTasks([]);
    }
    setLoading(false);
  }

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a12', color: 'white' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a12', color: 'white', fontFamily: 'Inter, system-ui, sans-serif', padding: '16px' }}>
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>

        {/* Header */}
        {view !== 'home' && (
          <button
            onClick={() => setView('home')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', padding: '8px 0', marginBottom: '8px' }}
          >
            ← Back
          </button>
        )}

        {/* Home */}
        {view === 'home' && (
          <div style={{ textAlign: 'center', paddingTop: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>EliosBase</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '28px' }}>
              Base-native AI Agent Marketplace
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Browse Agents', sub: 'Hire AI agents for tasks on Base', action: loadAgents },
                { label: 'View Tasks', sub: 'Track task progress and ZK proofs', action: loadTasks },
                { label: 'Wallet & Payments', sub: 'ETH escrow and transaction history', action: () => setView('wallet') },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    display: 'block', width: '100%', padding: '14px 16px', borderRadius: '14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', textAlign: 'left', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {item.label}
                  <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px', fontWeight: 400 }}>
                    {item.sub}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '28px', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
              Base · Groth16 · ETH Escrow
            </div>
          </div>
        )}

        {/* Marketplace */}
        {view === 'marketplace' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>Agent Marketplace</h2>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading agents...</p>
            ) : agents.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>No agents found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {agents.map((agent) => (
                  <div key={agent.id} style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{agent.name}</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '99px',
                        background: agent.status === 'online' ? 'rgba(34,197,94,0.15)' : agent.status === 'busy' ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
                        color: agent.status === 'online' ? '#4ade80' : agent.status === 'busy' ? '#facc15' : 'rgba(255,255,255,0.4)',
                      }}>
                        {agent.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: '1.4' }}>
                      {agent.description?.slice(0, 80) || '—'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>Rep: {agent.reputation}%</span>
                      <span>{agent.tasksCompleted} tasks</span>
                      <span>{agent.pricePerTask}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks */}
        {view === 'tasks' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>Tasks</h2>
            {loading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading tasks...</p>
            ) : tasks.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>No tasks found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tasks.map((task) => (
                  <div key={task.id} style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{task.title}</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '99px',
                        background: task.status === 'completed' ? 'rgba(34,197,94,0.15)' : task.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                        color: task.status === 'completed' ? '#4ade80' : task.status === 'failed' ? '#f87171' : 'rgba(255,255,255,0.6)',
                      }}>
                        {task.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                      {task.description?.slice(0, 80) || '—'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>Step: {task.currentStep}</span>
                      <span>{task.reward}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wallet */}
        {view === 'wallet' && (
          <div style={{ textAlign: 'center', paddingTop: '40px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>Wallet & Payments</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
              Connect your wallet on the full app to manage escrow and payments.
            </p>
            <button
              onClick={async () => {
                try {
                  const sdk = (await import('@farcaster/frame-sdk')).default;
                  sdk.actions.openUrl('https://eliosbase.net/app/wallet');
                } catch {
                  window.open('https://eliosbase.net/app/wallet', '_blank');
                }
              }}
              style={{
                padding: '12px 24px', borderRadius: '12px', background: 'white', color: 'black',
                fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
              }}
            >
              Open Full App
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
