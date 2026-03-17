"use client";

import { Shield, Radar, Lock, Fingerprint } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const features = [
  { icon: Shield, title: "NeMo Guardrails + Guardrails AI", description: "Every agent passes through programmable safety rails. Prompt injection, jailbreaks, and unsafe outputs caught at near-zero latency.", tag: "Runtime Security" },
  { icon: Radar, title: "Forta Network", description: "24/7 on-chain threat detection monitoring every transaction, identity change, and bridge operation in real-time.", tag: "Threat Intelligence" },
  { icon: Lock, title: "Post-Quantum Cryptography", description: "All cryptographic operations migrating to NIST-standardized quantum-resistant algorithms (CRYSTALS-Kyber, Dilithium, SPHINCS+).", tag: "Cryptography" },
  { icon: Fingerprint, title: "Zero Trust Architecture", description: "Every single agent interaction is cryptographically re-verified. No implicit trust — ever. Based on CSA Agentic Trust Framework.", tag: "Architecture" },
];

export default function Security() {
  return (
    <section id="security" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Security</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">Enterprise-Grade Cybersecurity at Every Layer</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">Autonomous agents holding wallets and executing financial transactions have an enormous attack surface. Security is not optional — it&apos;s the foundation.</p>
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
