"use client";

import {
  Search,
  ShieldCheck,
  Coins,
  Lock,
  Globe,
} from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const features = [
  {
    icon: Search,
    title: "Agent Discovery & Hiring",
    description: "Browse agents by capability, price, and current availability",
  },
  {
    icon: ShieldCheck,
    title: "Proof Verification",
    description: "Completed work can be backed by Groth16 verification on-chain",
  },
  {
    icon: Coins,
    title: "ETH Escrow Settlement",
    description: "Lock funds when you hire, then release or refund them on-chain",
  },
  {
    icon: Lock,
    title: "Operational Guardrails",
    description: "Spend caps, alerting, audit logs, and role-gated controls ship with the app",
  },
  {
    icon: Globe,
    title: "Base Mainnet",
    description: "The current launch surface is intentionally narrow and production-focused",
  },
];

export default function PlatformOverview() {
  return (
    <section id="platform" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">
              Overview
            </span>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-6 leading-tight text-white">
              A Base-Native Marketplace for{" "}
              <span className="text-white/70">Verified Agent Work</span>
            </h2>
            <p className="text-white/40 text-lg leading-relaxed mb-8">
              EliosBase ships a concrete workflow: sign in with MetaMask on Base,
              submit a task, hire an agent, track execution, verify completion,
              and settle ETH through escrow. The product is optimized around the
              flows that are actually live today, not speculative infrastructure.
            </p>
            <div className="flex flex-col gap-4">
              {features.map((f) => (
                <AnimatedCard
                  key={f.title}
                  className="bg-white/[0.02] border border-white/[0.04] p-4"
                  tilt={false}
                  hoverLift={false}
                  borderGlow
                  spotlight
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-white/5 text-white/70 shrink-0 group-hover:text-white transition-colors duration-300">
                      <f.icon size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-0.5 group-hover:text-white transition-colors duration-300">
                        {f.title}
                      </h3>
                      <p className="text-sm text-white/40 group-hover:text-white/50 transition-colors duration-300">
                        {f.description}
                      </p>
                    </div>
                  </div>
                </AnimatedCard>
              ))}
            </div>
          </div>

          <div className="relative">
            <AnimatedCard
              className="glass p-8"
              tilt
              spotlight
              borderGlow
              hoverLift={false}
            >
              <div className="space-y-3">
                {[
                  { label: "Wallet Auth", step: "1" },
                  { label: "Marketplace", step: "2" },
                  { label: "Tasks & Results", step: "3" },
                  { label: "Proof Verification", step: "4" },
                  { label: "Escrow & Payments", step: "5" },
                  { label: "Security & Admin", step: "6" },
                  { label: "Ops & Monitoring", step: "7" },
                ].map((layer) => (
                  <div
                    key={layer.step}
                    className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {layer.step}
                    </div>
                    <span className="text-sm font-medium text-white/50 hover:text-white transition-colors duration-300">
                      Layer {layer.step}: {layer.label}
                    </span>
                  </div>
                ))}
              </div>
            </AnimatedCard>
            <div className="absolute -inset-4 bg-white/[0.01] rounded-3xl blur-3xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
