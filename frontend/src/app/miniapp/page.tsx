'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// Minimal types
interface Agent {
  id: string; name: string; description: string; status: string;
  reputation: number; tasksCompleted: number; pricePerTask: string;
  capabilities?: string[]; type?: string;
}
interface Task {
  id: string; title: string; description: string; status: string;
  currentStep: string; reward: string; assignedAgent?: string;
  zkProofId?: string; submittedAt?: string;
}

type View = 'home' | 'marketplace' | 'tasks' | 'wallet' | 'agent-detail' | 'task-detail' | 'hire';

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || '0x3a78b6ec90cc79483f16258864a728ae35ce8a32';
const TASK_STEPS = ['Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'];

function toBytes32(value: string): `0x${string}` {
  const hex = Array.from(new TextEncoder().encode(value))
    .map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0').slice(0, 64);
  return `0x${hex}` as `0x${string}`;
}

function parseEthValue(priceStr: string): bigint {
  const num = priceStr.replace(/[^0-9.]/g, '') || '0';
  const [whole = '0', frac = ''] = num.split('.');
  const padded = frac.padEnd(18, '0').slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(padded);
}

export default function MiniAppPage() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('home');
  const [prevView, setPrevView] = useState<View>('home');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'mining' | 'done' | 'error'>('idle');
  const [txError, setTxError] = useState('');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const sdkRef = useRef<typeof import('@farcaster/frame-sdk').default | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const sdk = (await import('@farcaster/frame-sdk')).default;
        sdkRef.current = sdk;
        await sdk.actions.ready();
        // Get wallet address
        const provider = sdk.wallet.ethProvider;
        const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
        if (accounts[0]) setWalletAddress(accounts[0]);
      } catch {
        // Not in Farcaster context
      }
      setReady(true);
    }
    init();
  }, []);

  function navigate(to: View) {
    setPrevView(view);
    setView(to);
  }

  function goBack() {
    if (view === 'agent-detail' || view === 'hire') setView('marketplace');
    else if (view === 'task-detail') setView('tasks');
    else setView('home');
  }

  async function loadAgents() {
    navigate('marketplace');
    setLoading(true);
    try {
      const res = await fetch('/api/agents?limit=20');
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : data.agents || []);
    } catch { setAgents([]); }
    setLoading(false);
  }

  async function loadTasks() {
    navigate('tasks');
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?limit=20');
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch { setTasks([]); }
    setLoading(false);
  }

  function selectAgent(agent: Agent) {
    setSelectedAgent(agent);
    navigate('agent-detail');
  }

  function selectTask(task: Task) {
    setSelectedTask(task);
    navigate('task-detail');
  }

  // Lock escrow funds using Farcaster wallet
  const lockEscrow = useCallback(async (taskId: string, agentId: string, amount: string) => {
    if (!sdkRef.current) { setTxError('Farcaster SDK not available'); return; }
    setTxStatus('signing');
    setTxError('');
    try {
      const provider = sdkRef.current.wallet.ethProvider;

      // Encode lockFunds(bytes32,bytes32) calldata
      const selector = '0x7e2a4de4'; // keccak256("lockFunds(bytes32,bytes32)") first 4 bytes
      const taskIdHex = toBytes32(taskId).slice(2);
      const agentIdHex = toBytes32(agentId).slice(2);
      const data = `${selector}${taskIdHex}${agentIdHex}`;

      const value = '0x' + parseEthValue(amount).toString(16);

      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const from = accounts[0];

      setTxStatus('signing');
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: ESCROW_ADDRESS,
          data,
          value,
        }],
      });

      setTxStatus('mining');

      // Poll for receipt
      let confirmed = false;
      for (let i = 0; i < 60; i++) {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });
        if (receipt) {
          confirmed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (confirmed) {
        // Register hire with backend
        await fetch(`/api/agents/${agentId}/hire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, taskId }),
        });
        setTxStatus('done');
      } else {
        setTxError('Transaction not confirmed after 2 minutes');
        setTxStatus('error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      if (msg.includes('rejected') || msg.includes('denied')) {
        setTxError('Transaction cancelled');
      } else {
        setTxError(msg);
      }
      setTxStatus('error');
    }
  }, []);

  if (!ready) {
    return (
      <div style={styles.center}>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading EliosBase...</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.container}>

        {/* Back button */}
        {view !== 'home' && (
          <button onClick={goBack} style={styles.backBtn}>← Back</button>
        )}

        {/* ── Home ── */}
        {view === 'home' && (
          <div style={{ textAlign: 'center', paddingTop: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>EliosBase</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>
              Base-native AI Agent Marketplace
            </p>
            {walletAddress && (
              <div style={{ ...styles.card, marginBottom: '16px', textAlign: 'left' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Connected Wallet</span>
                <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px', fontFamily: 'monospace' }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <NavButton label="Browse Agents" sub="Hire AI agents for tasks on Base" onClick={loadAgents} />
              <NavButton label="View Tasks" sub="Track task progress and ZK proofs" onClick={loadTasks} />
              <NavButton label="Wallet & Payments" sub="ETH escrow and transaction history" onClick={() => navigate('wallet')} />
            </div>
            <div style={{ marginTop: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
              Base · Groth16 · ETH Escrow
            </div>
          </div>
        )}

        {/* ── Marketplace ── */}
        {view === 'marketplace' && (
          <div>
            <h2 style={styles.heading}>Agent Marketplace</h2>
            {loading ? <Loading /> : agents.length === 0 ? <Empty text="No agents found." /> : (
              <div style={styles.list}>
                {agents.map((agent) => (
                  <button key={agent.id} onClick={() => selectAgent(agent)} style={{ ...styles.card, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{agent.name}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <p style={styles.dimText}>{agent.description?.slice(0, 80) || '—'}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>Rep: {agent.reputation}%</span>
                      <span>{agent.tasksCompleted} tasks</span>
                      <span>{agent.pricePerTask}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Agent Detail ── */}
        {view === 'agent-detail' && selectedAgent && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                🤖
              </div>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>{selectedAgent.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <StatusBadge status={selectedAgent.status} />
                  {selectedAgent.type && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{selectedAgent.type}</span>}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '16px' }}>
              {selectedAgent.description}
            </p>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <StatBox label="Reputation" value={`${selectedAgent.reputation}%`} />
              <StatBox label="Tasks Done" value={String(selectedAgent.tasksCompleted)} />
              <StatBox label="Price" value={selectedAgent.pricePerTask} />
            </div>

            {/* Capabilities */}
            {selectedAgent.capabilities && selectedAgent.capabilities.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Capabilities</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {selectedAgent.capabilities.map((cap) => (
                    <span key={cap} style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hire button */}
            {selectedAgent.status === 'online' && (
              <button
                onClick={() => navigate('hire')}
                style={{ ...styles.primaryBtn, width: '100%', marginTop: '8px' }}
              >
                Hire Agent — {selectedAgent.pricePerTask}
              </button>
            )}
            {selectedAgent.status === 'busy' && (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'rgba(234,179,8,0.8)' }}>
                This agent is currently busy
              </div>
            )}
            {selectedAgent.status === 'offline' && (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
                This agent is offline
              </div>
            )}
          </div>
        )}

        {/* ── Hire Flow ── */}
        {view === 'hire' && selectedAgent && (
          <div>
            <h2 style={styles.heading}>Hire {selectedAgent.name}</h2>

            {txStatus === 'idle' && (
              <>
                <div style={styles.card}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Escrow Payment</span>
                  <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px' }}>{selectedAgent.pricePerTask}</div>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                    Funds locked in escrow until task completion
                  </p>
                </div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px', textAlign: 'center' }}>
                  You need an active task to hire this agent. Create a task first on the full app.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const sdk = (await import('@farcaster/frame-sdk')).default;
                      sdk.actions.openUrl('https://eliosbase.net/app/tasks');
                    } catch {
                      window.open('https://eliosbase.net/app/tasks', '_blank');
                    }
                  }}
                  style={{ ...styles.primaryBtn, width: '100%', marginTop: '12px' }}
                >
                  Create Task on EliosBase
                </button>
              </>
            )}

            {txStatus === 'signing' && (
              <div style={{ ...styles.card, textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>✍️</div>
                <p style={{ fontSize: '14px', fontWeight: 600 }}>Sign Transaction</p>
                <p style={styles.dimText}>Confirm in your wallet...</p>
              </div>
            )}

            {txStatus === 'mining' && (
              <div style={{ ...styles.card, textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>⛏️</div>
                <p style={{ fontSize: '14px', fontWeight: 600 }}>Transaction Mining</p>
                <p style={styles.dimText}>Waiting for confirmation on Base...</p>
              </div>
            )}

            {txStatus === 'done' && (
              <div style={{ ...styles.card, textAlign: 'center', borderColor: 'rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>✅</div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#4ade80' }}>Agent Hired!</p>
                <p style={styles.dimText}>Escrow locked. The agent will begin working on your task.</p>
                <button onClick={() => { setTxStatus('idle'); navigate('marketplace'); }} style={{ ...styles.secondaryBtn, marginTop: '12px' }}>
                  Back to Marketplace
                </button>
              </div>
            )}

            {txStatus === 'error' && (
              <div style={{ ...styles.card, textAlign: 'center', borderColor: 'rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px' }}>❌</div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#f87171' }}>Transaction Failed</p>
                <p style={{ ...styles.dimText, color: 'rgba(248,113,113,0.7)' }}>{txError}</p>
                <button onClick={() => setTxStatus('idle')} style={{ ...styles.secondaryBtn, marginTop: '12px' }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Task Detail ── */}
        {view === 'task-detail' && selectedTask && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{selectedTask.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <StatusBadge status={selectedTask.status} />
              {selectedTask.assignedAgent && (
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>🤖 {selectedTask.assignedAgent}</span>
              )}
            </div>

            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '16px' }}>
              {selectedTask.description}
            </p>

            {/* Progress */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Progress</span>
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {TASK_STEPS.map((step, i) => {
                  const currentIdx = TASK_STEPS.indexOf(selectedTask.currentStep);
                  const done = i <= currentIdx;
                  return (
                    <div key={step} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{
                        height: '4px', borderRadius: '2px', marginBottom: '4px',
                        background: done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.08)',
                      }} />
                      <span style={{ fontSize: '8px', color: done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <StatBox label="Reward" value={selectedTask.reward} />
              <StatBox label="ZK Proof" value={selectedTask.zkProofId ? 'Verified' : selectedTask.currentStep === 'ZK Verifying' ? 'Verifying...' : 'Pending'} />
            </div>

            {selectedTask.submittedAt && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>
                Submitted: {new Date(selectedTask.submittedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* ── Tasks List ── */}
        {view === 'tasks' && (
          <div>
            <h2 style={styles.heading}>Tasks</h2>
            {loading ? <Loading /> : tasks.length === 0 ? <Empty text="No tasks found." /> : (
              <div style={styles.list}>
                {tasks.map((task) => (
                  <button key={task.id} onClick={() => selectTask(task)} style={{ ...styles.card, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{task.title}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    <p style={styles.dimText}>{task.description?.slice(0, 80) || '—'}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <span>Step: {task.currentStep}</span>
                      <span>{task.reward}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Wallet ── */}
        {view === 'wallet' && (
          <div>
            <h2 style={styles.heading}>Wallet & Payments</h2>
            {walletAddress ? (
              <div style={styles.card}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Connected</span>
                <span style={{ display: 'block', fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '6px', fontFamily: 'monospace' }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </span>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>No wallet connected</p>
            )}
            <button
              onClick={async () => {
                try {
                  const sdk = (await import('@farcaster/frame-sdk')).default;
                  sdk.actions.openUrl('https://eliosbase.net/app/wallet');
                } catch { window.open('https://eliosbase.net/app/wallet', '_blank'); }
              }}
              style={{ ...styles.secondaryBtn, width: '100%', marginTop: '12px' }}
            >
              Open Full Wallet App
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ──

function NavButton({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'block', width: '100%', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', textAlign: 'left', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
      {label}
      <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px', fontWeight: 400 }}>{sub}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    online: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
    busy: { bg: 'rgba(234,179,8,0.15)', fg: '#facc15' },
    offline: { bg: 'rgba(255,255,255,0.05)', fg: 'rgba(255,255,255,0.4)' },
    completed: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
    failed: { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
    active: { bg: 'rgba(255,255,255,0.05)', fg: 'rgba(255,255,255,0.6)' },
  };
  const c = colors[status] || colors.active;
  return (
    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>{value}</div>
    </div>
  );
}

function Loading() {
  return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading...</p>;
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{text}</p>;
}

// ── Styles ──

const styles = {
  root: { minHeight: '100vh', background: '#0a0a12', color: 'white', fontFamily: 'Inter, system-ui, sans-serif', padding: '16px' } as const,
  container: { maxWidth: '400px', margin: '0 auto' } as const,
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a12', color: 'white' } as const,
  heading: { fontSize: '18px', fontWeight: 700, marginBottom: '12px' } as const,
  backBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '13px', cursor: 'pointer', padding: '8px 0', marginBottom: '8px' } as const,
  card: { padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' } as const,
  list: { display: 'flex', flexDirection: 'column' as const, gap: '8px' } as const,
  dimText: { fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: '1.4' } as const,
  primaryBtn: { padding: '14px 24px', borderRadius: '14px', background: 'white', color: 'black', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' } as const,
  secondaryBtn: { padding: '12px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '13px', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' } as const,
} as const;
