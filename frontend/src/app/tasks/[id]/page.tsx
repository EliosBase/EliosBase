import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ExternalLinkRow,
  GraphEventList,
  MetricGrid,
  PublicObjectLayout,
  SectionCard,
} from '@/components/web4/PublicObjectLayout';
import { getTaskReceipt } from '@/lib/web4Graph';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const receipt = await getTaskReceipt(id);

  if (!receipt) {
    return {
      title: 'Task not found | EliosBase',
    };
  }

  return {
    title: `${receipt.identity.title} | Elios Task Receipt`,
    description: receipt.identity.description,
    alternates: {
      canonical: receipt.pageUrl,
    },
    openGraph: {
      title: `${receipt.identity.title} | Elios Task Receipt`,
      description: receipt.identity.description,
      url: receipt.pageUrl,
    },
  };
}

export default async function TaskReceiptPage({ params }: Props) {
  const { id } = await params;
  const receipt = await getTaskReceipt(id);

  if (!receipt) {
    notFound();
  }

  return (
    <PublicObjectLayout
      label={`Task Receipt · ${receipt.identity.currentStep}`}
      title={receipt.identity.title}
      subtitle={receipt.identity.description}
    >
      <SectionCard title="Protocol Links">
        <ExternalLinkRow
          links={[
            { href: receipt.pageUrl, label: 'Canonical Page' },
            { href: receipt.frameUrl, label: 'Frame URL' },
            { href: receipt.warpcastShareUrl, label: 'Warpcast Share' },
          ]}
        />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[1.25fr,0.95fr]">
        <SectionCard title="Execution State">
          <MetricGrid
            items={[
              { label: 'Reward', value: receipt.economics.reward },
              { label: 'Escrow', value: receipt.escrow.escrowStatus },
              { label: 'Proof', value: receipt.proof.proofStatus },
              { label: 'Dispute', value: receipt.resolution.hasOpenDispute ? 'Open' : 'Clear' },
            ]}
          />
        </SectionCard>

        <SectionCard title="Assigned Agent">
          {receipt.economics.assignedAgent ? (
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-white/75">
              <p className="text-lg font-semibold text-white">{receipt.economics.assignedAgent.name}</p>
              <p className="mt-2 text-white/55">
                {receipt.economics.assignedAgent.type ?? 'agent'} · {receipt.economics.assignedAgent.status ?? 'status unavailable'}
              </p>
              {receipt.economics.assignedAgent.id ? (
                <a
                  href={`/agents/${receipt.economics.assignedAgent.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200 transition-colors hover:text-cyan-100"
                >
                  Open agent passport
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-white/45">No agent has been assigned yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Onchain Receipt">
        <MetricGrid
          items={[
            { label: 'Lock Tx', value: receipt.escrow.lockTxHash ? 'Recorded' : 'Pending', subvalue: receipt.escrow.lockTxHash },
            { label: 'Release Tx', value: receipt.escrow.releaseTxHash ? 'Recorded' : 'Pending', subvalue: receipt.escrow.releaseTxHash },
            { label: 'Refund Tx', value: receipt.escrow.refundTxHash ? 'Recorded' : 'Pending', subvalue: receipt.escrow.refundTxHash },
            { label: 'Proof ID', value: receipt.proof.zkProofId ?? 'Pending', subvalue: receipt.proof.zkVerifyTxHash },
          ]}
        />
      </SectionCard>

      <SectionCard title="Timeline">
        <GraphEventList events={receipt.timeline} />
      </SectionCard>
    </PublicObjectLayout>
  );
}
