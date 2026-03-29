"use client";

import { Shield, Radar, Lock, Fingerprint } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const features = [
  { icon: Shield, title: "Role-Gated Security Center", description: "Security data and remediation actions are limited to operator and admin sessions.", tag: "Access Control" },
  { icon: Radar, title: "Alerts And Resolution", description: "Execution failures, signer balance issues, and other production problems surface as actionable alerts.", tag: "Monitoring" },
  { icon: Lock, title: "Guardrails", description: "Reward caps and agent task limits block unsafe activity before it settles into the system.", tag: "Controls" },
  { icon: Fingerprint, title: "Audit Trail", description: "Privileged actions are written to an audit log so operators can trace state changes after the fact.", tag: "Operations" },
];

export default function Security() {
  return (
    <section id="security" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Security</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">Operational Security Built Into The Product</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">The launch build ships guardrails, audit logging, alerting, and privileged remediation paths as visible product surfaces.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f) => (
            <AnimatedCard key={f.title} className="glass p-6" tilt spotlight borderGlow hoverLift>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-white/5 text-white/70 shrink-0 group-hover:bg-white/[0.08] group-hover:text-white transition-all duration-300">
                  <f.icon size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1 block">{f.tag}</span>
                  <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed group-hover:text-white/50 transition-colors duration-300">{f.description}</p>
                </div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </section>
  );
}
