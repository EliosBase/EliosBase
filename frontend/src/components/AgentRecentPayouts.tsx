import { ExternalLink } from 'lucide-react';
import { normalizeTransactionType } from '@/lib/transactions';
import type { DbTransaction } from '@/lib/types/database';

/**
 * AgentRecentPayouts — renders the last N confirmed `escrow_release`
 * transactions for an agent. Self-directed releases (escrow vault back to
 * submitter) are filtered via `normalizeTransactionType` so refunds never
 * appear on an agent's payout ledger.
 *
 * Pure presentational: accepts an array of `DbTransaction` rows and the
 * chain id used to pick the correct basescan subdomain. Server-rendered.
 */

type Props = {
  rows: DbTransaction[];
  chainId: number;
  /** Truncate to the first N filtered rows. Defaults to 10. */
  limit?: number;
};

function explorerBase(chainId: number): string {
  // Base mainnet = 8453, Base sepolia = 84532.
  if (chainId === 84532) return 'https://sepolia.basescan.org';
  return 'https://basescan.org';
}

function formatEth(value: number): string {
  if (value === 0) return '0';
  if (value < 0.0001) return '<0.0001';
  if (value < 1) return value.toFixed(4);
  if (value < 10) return value.toFixed(3);
  return value.toFixed(2);
}

function parseAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortenHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function AgentRecentPayouts({ rows, chainId, limit = 10 }: Props) {
  const payouts = rows
    .filter((row) => row.status === 'confirmed')
    .filter((row) =>
      normalizeTransactionType({
        type: row.type as 'escrow_release' | 'escrow_refund',
        from: row.from,
        to: row.to,
      }) === 'escrow_release',
    )
    .slice(0, limit);

  if (payouts.length === 0) {
    return (
      <p className="text-sm text-white/45">
        No confirmed payouts yet. This agent hasn&apos;t been paid for any tasks on-chain.
      </p>
    );
  }

  const base = explorerBase(chainId);

  return (
    <ul className="divide-y divide-white/5">
      {payouts.map((row) => {
        const amount = parseAmount(row.amount);
        const txUrl = row.tx_hash ? `${base}/tx/${row.tx_hash}` : null;
        return (
          <li key={row.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-white/35">
                <span>Payout</span>
                <span className="text-white/15">·</span>
                <span>{relativeTime(row.timestamp)}</span>
              </div>
              <div className="mt-1 font-[family-name:var(--font-mono)] text-sm text-white/70">
                {txUrl ? (
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    {shortenHash(row.tx_hash)}
                    <ExternalLink size={12} className="text-white/40" />
                  </a>
                ) : (
                  shortenHash(row.tx_hash)
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-[family-name:var(--font-mono)] text-base text-white">
                +{formatEth(amount)}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-white/35">
                {row.token ?? 'ETH'}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
