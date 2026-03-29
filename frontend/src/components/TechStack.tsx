"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

interface Tech {
  name: string;
  tag: string;
  oneLiner: string;
  whatItIs: string;
  role: string;
  analogy: string;
}

interface Layer {
  number: string;
  name: string;
  description: string;
  techs: Tech[];
}

const layers: Layer[] = [
  {
    number: "1",
    name: "Web App",
    description: "The public site, app shell, and dashboard UX",
    techs: [
      { name: "Next.js", tag: "Framework", oneLiner: "App router web product deployed on Vercel.", whatItIs: "The shipped EliosBase product is a Next.js application with a public landing page and an authenticated dashboard surface.", role: "Hosts the main routes, API endpoints, and production deployment target at eliosbase.net.", analogy: "Like the storefront and control room for the whole product." },
      { name: "React 19", tag: "UI", oneLiner: "Interactive dashboard and marketing UI.", whatItIs: "React powers the app shell, modal flows, realtime dashboard views, and wallet entry points.", role: "Keeps the launch surface responsive across the marketplace, tasks, wallet, and security views.", analogy: "Like the operating system for the browser experience." },
      { name: "TanStack Query", tag: "Data", oneLiner: "Client-side caching and refresh for live app data.", whatItIs: "Query-driven data fetching and invalidation keeps dashboard, tasks, wallet stats, and security data in sync.", role: "Refreshes the app when transactions settle, tasks advance, or alerts are resolved.", analogy: "Like a smart clipboard that always keeps the latest state close at hand." },
    ],
  },
  {
    number: "2", name: "Wallet Auth & Sessions", description: "How users connect, sign in, and keep a session",
    techs: [
      { name: "wagmi", tag: "Wallet", oneLiner: "Handles MetaMask connection on Base.", whatItIs: "wagmi provides the wallet connector and chain-aware client used by the app shell.", role: "Powers wallet connect, disconnect, address state, and contract interaction hooks.", analogy: "Like the cable between the browser app and the user wallet." },
      { name: "SIWE", tag: "Auth", oneLiner: "Wallet signature establishes the authenticated user session.", whatItIs: "Sign-In with Ethereum is used to turn a wallet signature into an app session tied to the connected address.", role: "Protects authenticated routes and role-based API access without separate passwords.", analogy: "Like checking into the app by signing your own guestbook entry." },
      { name: "iron-session", tag: "Session", oneLiner: "Encrypted cookie-based session storage.", whatItIs: "The app stores auth state in secure, signed cookies rather than pushing session logic into the browser only.", role: "Keeps reloads and protected API routes aligned with the verified wallet identity.", analogy: "Like a sealed ticket that the server can trust on the next request." },
    ],
  },
  {
    number: "3", name: "Marketplace & Tasks", description: "Task intake, assignment, execution state, and results",
    techs: [
      { name: "Supabase", tag: "Data", oneLiner: "Persistent store for agents, tasks, transactions, alerts, and audit logs.", whatItIs: "Supabase backs the product state across public and authenticated flows.", role: "Stores marketplace inventory, task lifecycle, transaction history, security alerts, and operator-facing logs.", analogy: "Like the system ledger that keeps every product action durable." },
      { name: "Next.js API Routes", tag: "Backend", oneLiner: "Server-side task, marketplace, wallet, and security endpoints.", whatItIs: "The backend surface lives alongside the web app and implements role checks, transaction verification, and task mutations.", role: "Turns UI actions into verified state changes without needing a separate backend repo.", analogy: "Like the operations desk behind the storefront." },
      { name: "Realtime Refresh", tag: "Ops", oneLiner: "Live updates for task, wallet, and agent views.", whatItIs: "The app refreshes critical surfaces when tasks advance, alerts resolve, or wallet state changes.", role: "Keeps operators and submitters from working against stale task or payment state.", analogy: "Like a departure board that updates as soon as the gate changes." },
    ],
  },
  {
    number: "4", name: "Escrow & Proof Verification", description: "How funds are locked, released, and verified",
    techs: [
      { name: "EliosEscrow", tag: "Contract", oneLiner: "Locks rewards and settles them on Base mainnet.", whatItIs: "The escrow contract is the source of truth for hire, release, and refund settlement.", role: "Prevents off-ledger payment completion by requiring live transaction verification.", analogy: "Like a cashier that only opens the drawer when the receipt matches." },
      { name: "EliosProofVerifier", tag: "Contract", oneLiner: "On-chain verifier for proof-backed completion.", whatItIs: "The verifier contract records proof submissions before the happy-path release flow can complete.", role: "Links proof generation to the settlement flow so completion is not just a UI status.", analogy: "Like the stamp that says the work cleared inspection." },
      { name: "Groth16", tag: "Proofs", oneLiner: "Proof format used by the shipped verification flow.", whatItIs: "The current product uses Groth16 verification artifacts rather than a generic future-proofed proof abstraction.", role: "Defines the proof surface the platform can actually verify today.", analogy: "Like the specific document format the verification desk is trained to read." },
    ],
  },
  {
    number: "5", name: "Security & Controls", description: "The protection and remediation surface that ships today",
    techs: [
      { name: "Safe Smart Accounts", tag: "Wallets", oneLiner: "Programmable agent wallets built on Safe.", whatItIs: "Every newly registered agent now gets a Safe smart account on Base instead of paying out straight to the operator EOA.", role: "Each agent wallet enforces daily spend limits, reviewer approval for larger amounts, timelocks on high-risk transfers, and automatic blocks on suspicious destinations before funds can move.", analogy: "Like giving every agent its own treasury account with a second key and hard rails around how money can leave." },
      { name: "Guardrails", tag: "Safety", oneLiner: "Reward caps and task rate controls.", whatItIs: "The product enforces hard limits around task spending and agent activity to contain obvious misuse.", role: "Blocks unsafe or out-of-policy actions before they settle into the system.", analogy: "Like rails on a bridge: simple, visible, and there to stop predictable mistakes." },
      { name: "Audit Log", tag: "Ops", oneLiner: "Every privileged action leaves a trail.", whatItIs: "Security and admin actions are written into product-visible audit logs.", role: "Lets operators prove who changed what when a task, alert, or guardrail changes state.", analogy: "Like a flight recorder for operator actions." },
      { name: "Alerts", tag: "Monitoring", oneLiner: "Actionable operational and security notifications.", whatItIs: "The app surfaces signer-balance issues, execution failures, and other operational problems as first-class alerts.", role: "Keeps the team from learning about production failures only after users do.", analogy: "Like a control-room panel that lights up before the outage becomes obvious outside." },
    ],
  },
  {
    number: "6", name: "Launch Ops", description: "How the production system is validated and kept healthy",
    techs: [
      { name: "Vercel Cron", tag: "Ops", oneLiner: "Scheduled advancement and signer health checks.", whatItIs: "Production cron endpoints advance stuck tasks and monitor signer balance on a schedule.", role: "Catches operational drift that users should not have to babysit manually.", analogy: "Like the night shift that keeps the system moving when nobody is watching." },
      { name: "GitHub Actions", tag: "CI", oneLiner: "Validation, security scanning, and smoke gates for main.", whatItIs: "The repo now enforces validation, identity scanning, dependency review, and CodeQL before changes land on the protected branch.", role: "Prevents obvious regressions and supply-chain mistakes from slipping into production.", analogy: "Like the gate inspectors before anything is allowed onto the runway." },
      { name: "Sentry", tag: "Observability", oneLiner: "Runtime error capture for production debugging.", whatItIs: "Sentry is wired into the production build so runtime problems can be traced with source maps.", role: "Makes production failures diagnosable without guessing from minified traces.", analogy: "Like turning on the lights in the incident room." },
    ],
  },
];

function TechModal({ tech, onClose }: { tech: Tech; onClose: () => void }) {
  const titleId = useMemo(
    () => `tech-modal-${tech.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    [tech.name],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-w-lg w-full animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatedCard className="glass p-8" tilt={false} spotlight borderGlow hoverLift={false}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors duration-200 cursor-pointer z-30"
            aria-label={`Close ${tech.name} details`}
            autoFocus
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3 mb-6">
            <h3 id={titleId} className="font-[family-name:var(--font-heading)] text-xl font-bold text-white">{tech.name}</h3>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/60">{tech.tag}</span>
          </div>
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-semibold text-white/80 mb-1.5">What It Is</h4>
              <p className="text-sm text-white/40 leading-relaxed">{tech.whatItIs}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white/80 mb-1.5">Role in EliosBase</h4>
              <p className="text-sm text-white/40 leading-relaxed">{tech.role}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm italic text-white/60">&quot;{tech.analogy}&quot;</p>
            </div>
          </div>
        </AnimatedCard>
      </div>
    </div>
  );
}

export default function TechStack() {
  const [selected, setSelected] = useState<Tech | null>(null);

  return (
    <section id="technology" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Architecture</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">What The Launch Build Actually Runs</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">This is the shipped stack behind the live Base mainnet product, not a future-state architecture deck.</p>
        </div>

        <div className="space-y-6">
          {layers.map((layer) => (
            <AnimatedCard
              key={layer.number}
              className="glass p-6 md:p-8 border-l-4 border-white/20"
              tilt={false}
              spotlight
              borderGlow
              hoverLift={false}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="font-[family-name:var(--font-heading)] text-xs font-bold tracking-widest uppercase text-white/50">
                  Layer {layer.number}
                </span>
              </div>
              <h3 className="font-[family-name:var(--font-heading)] text-lg md:text-xl font-bold mb-1 text-white">{layer.name}</h3>
              <p className="text-sm text-white/40 mb-6">{layer.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {layer.techs.map((tech) => (
                  <AnimatedCard
                    key={tech.name}
                    className="bg-white/[0.02] border border-white/[0.05] p-4"
                    onClick={() => setSelected(tech)}
                    interactiveProps={{
                      role: "button",
                      tabIndex: 0,
                      "aria-haspopup": "dialog",
                      "aria-label": `Open ${tech.name} details`,
                      onKeyDown: (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(tech);
                        }
                      },
                    }}
                    tilt
                    spotlight
                    borderGlow
                    hoverLift
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm text-white group-hover:text-white transition-colors duration-200">{tech.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50">{tech.tag}</span>
                    <p className="text-xs text-white/30 mt-2 line-clamp-2 group-hover:text-white/40 transition-colors duration-300">{tech.oneLiner}</p>
                  </AnimatedCard>
                ))}
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>

      {selected && <TechModal tech={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
