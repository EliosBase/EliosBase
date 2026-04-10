import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  BadgeRow,
  ExternalLinkRow,
  GraphEventList,
  MetricGrid,
  PublicObjectLayout,
  SectionCard,
} from '@/components/web4/PublicObjectLayout';
import { AgentRankBadge } from '@/components/AgentRankBadge';
import { AgentRecentPayouts } from '@/components/AgentRecentPayouts';
import { EarningsSparkline } from '@/components/EarningsSparkline';
import { fetchAgentDailyEarnings } from '@/lib/agentEarnings';
import { getAgentRankSummary } from '@/lib/leaderboard';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbTransaction } from '@/lib/types/database';
import { getAgentPassport } from '@/lib/web4Graph';

// Revalidate the agent passport page every 60 seconds so leaderboard rank
// changes and new payouts propagate without a deploy. The Upstash cache
// layer behind `getLeaderboard` means the per-request DB cost is bounded
// regardless of how many distinct agent passports are being browsed.
export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const passport = await getAgentPassport(id);

  if (!passport) {
    return {
      title: 'Agent not found | EliosBase',
    };
  }

  return {
    title: `${passport.identity.name} | Elios Agent Passport`,
    description: passport.identity.description,
    alternates: {
      canonical: passport.pageUrl,
    },
    openGraph: {
      title: `${passport.identity.name} | Elios Agent Passport`,
      description: passport.identity.description,
      url: passport.pageUrl,
    },
  };
}

/**
 * Look up the chain id the release explorer should point at. We fall back
 * to Base mainnet (8453) when the env var is missing or malformed so the
 * links still resolve to a real host rather than an obvious misconfig.
 */
function getBaseChainId(): number {
  const raw = process.env.NEXT_PUBLIC_BASE_CHAIN_ID;
  if (!raw) return 8453;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 8453;
}

/**
 * Fetch the last N confirmed escrow_release rows for a single agent. Uses
 * a service-role client because transactions are not publicly readable via
 * RLS. Returns [] on error so the rest of the passport page still renders.
 */
async function fetchAgentRecentTransactions(agentId: string): Promise<DbTransaction[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', 'confirmed')
      .in('type', ['escrow_release', 'escrow_refund'])
      .order('timestamp', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []) as DbTransaction[];
  } catch {
    return [];
  }
}

export default async function AgentPassportPage({ params }: Props) {
  const { id } = await params;
  const passport = await getAgentPassport(id);

  if (!passport) {
    notFound();
  }

  // Fetch earnings-related data in parallel. Each branch is independently
  // fault-tolerant — the passport page must never crash because the
  // leaderboard cache or the transactions query hiccuped.
  const serviceSupabase = createServiceClient();
  const [dailyEarnings, rankSummary, recentTransactions] = await Promise.all([
    fetchAgentDailyEarnings(serviceSupabase, id, { days: 30 }).catch(() => []),
    getAgentRankSummary(id).catch(() => ({ '7d': null, '30d': null, all: null })),
    fetchAgentRecentTransactions(id),
  ]);

  const protocolLinks = [
    { href: passport.pageUrl, label: 'Canonical Page' },
    { href: passport.frameUrl, label: 'Frame URL' },
    { href: passport.warpcastShareUrl, label: 'Warpcast Share' },
    { href: passport.capabilitiesUrl, label: 'Capabilities JSON' },
    { href: passport.executeUrl, label: 'Paid Execute' },
  ].filter((link): link is { href: string; label: string } => Boolean(link));

  return (
    <PublicObjectLayout
      label={`Agent Passport · ${passport.identity.type}`}
      title={passport.identity.name}
      subtitle={passport.identity.description}
    >
      <SectionCard title="Protocol Links">
        <ExternalLinkRow links={protocolLinks} />
      </SectionCard>

      <SectionCard title="Earnings">
        <div className="mb-5">
          <AgentRankBadge summary={rankSummary} />
        </div>
        <EarningsSparkline buckets={dailyEarnings} />
      </SectionCard>

      <SectionCard title="Recent Payouts">
        <AgentRecentPayouts rows={recentTransactions} chainId={getBaseChainId()} />
      </SectionCard>

      <SectionCard title="Trust Surface">
        <MetricGrid
          items={[
            { label: 'Reputation', value: `${passport.trust.reputationScore}%` },
            { label: 'Completion Rate', value: `${passport.performance.completionRate}%` },
            { label: 'Proof Rate', value: `${passport.performance.proofVerificationRate}%` },
            { label: 'Payout Success', value: `${passport.performance.payoutSuccessRate}%` },
          ]}
        />
        <div className="mt-5">
          <BadgeRow badges={passport.trust.badges} />
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[1.3fr,0.9fr]">
        <SectionCard title="Performance Breakdown">
          <MetricGrid
            items={[
              { label: 'Tasks Completed', value: passport.performance.tasksCompleted },
              { label: 'Dispute Rate', value: `${passport.performance.disputeRate}%` },
              { label: 'Wallet Safety', value: `${passport.trust.reputationBreakdown.walletSafetyScore}%` },
              { label: 'Dispute-Free Rate', value: `${passport.trust.reputationBreakdown.disputeFreeRate}%` },
            ]}
          />
        </SectionCard>

        <SectionCard title="Wallet Trust">
          <div className="space-y-3 text-sm text-white/70">
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Wallet</p>
              <p className="mt-2 break-all text-sm text-white/80">{passport.wallet.walletAddress ?? 'No managed wallet'}</p>
              <p className="mt-2 text-white/55">
                {passport.wallet.walletStandard ?? 'n/a'} · {passport.wallet.walletStatus ?? 'n/a'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Session Key</p>
              <p className="mt-2 text-white/80">{passport.wallet.sessionKeyStatus.status}</p>
              {passport.wallet.sessionKeyStatus.validUntil ? (
                <p className="mt-1 text-xs text-white/50">Valid until {passport.wallet.sessionKeyStatus.validUntil}</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Policy Summary</p>
              {passport.wallet.walletPolicySummary ? (
                <div className="mt-2 space-y-1 text-sm text-white/75">
                  <p>{passport.wallet.walletPolicySummary.threshold} multisig</p>
                  <p>Daily limit: {passport.wallet.walletPolicySummary.dailySpendLimitEth} ETH</p>
                  <p>Review over: {passport.wallet.walletPolicySummary.reviewThresholdEth} ETH</p>
                  <p>Timelock over: {passport.wallet.walletPolicySummary.timelockThresholdEth} ETH</p>
                </div>
              ) : (
                <p className="mt-2 text-white/50">No public wallet policy is configured.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr,1.1fr]">
        <SectionCard title="Paid Execution">
          <MetricGrid
            items={[
              { label: 'Price', value: `${passport.pricingSummary.amount} ${passport.pricingSummary.currency}` },
              { label: 'Network', value: passport.pricingSummary.network },
              { label: 'Capabilities', value: passport.payableCapabilities.length },
            ]}
          />
          <div className="mt-5 space-y-3 text-sm text-white/70">
            {passport.payableCapabilities.map((capability) => (
              <div key={capability.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{capability.method} {capability.path}</p>
                <p className="mt-2 text-white/85">{capability.description}</p>
                <p className="mt-2 text-white/55">Price: {capability.priceUsd}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Payment Method">
          <div className="space-y-3 text-sm text-white/70">
            {passport.paymentMethods.map((method) => (
              <div key={`${method.kind}-${method.network}`} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{method.kind} · {method.scheme}</p>
                <p className="mt-2 text-white/85">{method.currency} on {method.network}</p>
                <p className="mt-2 break-all text-white/55">{method.payTo ?? 'Seller address configured at runtime'}</p>
                <a
                  href={method.resource}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200 transition-colors hover:text-cyan-100"
                >
                  Open paid execution route
                </a>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent Graph Activity">
        <GraphEventList events={passport.activity} />
      </SectionCard>
    </PublicObjectLayout>
  );
}
