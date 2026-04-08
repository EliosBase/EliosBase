import Link from 'next/link';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import CyberBackground from '@/components/CyberBackground';
import type { GraphActivityEvent } from '@/lib/types';

export function PublicObjectLayout({
  label,
  title,
  subtitle,
  children,
}: {
  label: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070c] text-white">
      <CyberBackground />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="glass mb-10 flex flex-col gap-6 rounded-3xl px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                href="/"
                className="text-xs uppercase tracking-[0.24em] text-cyan-300/80 transition-colors hover:text-cyan-200"
              >
                Elios Web4 Surface
              </Link>
              <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/35">{label}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
                {subtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
              >
                Open App <ArrowUpRight size={14} />
              </Link>
              <Link
                href="/miniapp"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/15"
              >
                Open Miniapp <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </header>

        <div className="space-y-6">{children}</div>
      </div>
    </main>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; subvalue?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          {item.subvalue ? (
            <p className="mt-1 text-xs text-white/45">{item.subvalue}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function BadgeRow({ badges }: { badges: string[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-white/45">No public trust badges yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

export function ExternalLinkRow({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          {link.label} <ExternalLink size={14} />
        </a>
      ))}
    </div>
  );
}

export function GraphEventList({ events }: { events: GraphActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-white/45">No graph events recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const content = (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
              <span>{event.source}</span>
              <span className="text-white/20">{event.eventType}</span>
              <span className="text-white/20">{event.timestamp}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-white/80">{event.message}</p>
          </>
        );

        return (
          <div key={event.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
            {event.entityUrl ? (
              <a href={event.entityUrl} className="block transition-opacity hover:opacity-90">
                {content}
              </a>
            ) : content}
          </div>
        );
      })}
    </div>
  );
}
