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
import { getAgentPassport } from '@/lib/web4Graph';

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

export default async function AgentPassportPage({ params }: Props) {
  const { id } = await params;
  const passport = await getAgentPassport(id);

  if (!passport) {
    notFound();
  }

  return (
    <PublicObjectLayout
      label={`Agent Passport · ${passport.identity.type}`}
      title={passport.identity.name}
      subtitle={passport.identity.description}
    >
      <SectionCard title="Protocol Links">
        <ExternalLinkRow
          links={[
            { href: passport.pageUrl, label: 'Canonical Page' },
            { href: passport.frameUrl, label: 'Frame URL' },
            { href: passport.warpcastShareUrl, label: 'Warpcast Share' },
          ]}
        />
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

      <SectionCard title="Recent Graph Activity">
        <GraphEventList events={passport.activity} />
      </SectionCard>
    </PublicObjectLayout>
  );
}
