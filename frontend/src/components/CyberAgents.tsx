"use client";

import { Crosshair, ScanSearch, Siren, Bug, FileCheck } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const agents = [
  { icon: Crosshair, title: "Threat Hunting", description: "Continuously scan blockchain transactions and agent comms for anomalies using ML." },
  { icon: ScanSearch, title: "Vulnerability Scanning", description: "Automated smart contract and protocol vulnerability assessment (Slither, Mythril)." },
  { icon: Siren, title: "Incident Response", description: "Automated triage, investigation, and remediation. Handles 74,826 of 75,000 alerts automatically." },
  { icon: Bug, title: "Penetration Testing", description: "Autonomous red-teaming. Tests resilience against prompt injection, impersonation, capability escalation." },
  { icon: FileCheck, title: "Compliance Monitoring", description: "Real-time EU AI Act, GDPR, HIPAA, SOC2 compliance checking. Automated reports." },
];

export default function CyberAgents() {
  return (
    <section id="agents" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Business Model</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">
            Security You Can Buy — <span className="text-white/70">AI Cybersecurity Agents</span>
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">The marketplace doesn&apos;t just use security — it sells it. Specialized cybersecurity AI agents are first-class marketplace participants.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {agents.map((a) => (
            <AnimatedCard key={a.title} className="glass p-6" tilt spotlight borderGlow hoverLift>
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-white/[0.08] group-hover:scale-110 transition-all duration-300">
                <a.icon className="text-white/70 group-hover:text-white transition-colors duration-300" size={24} />
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm">{a.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed group-hover:text-white/50 transition-colors duration-300">{a.description}</p>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </section>
  );
}
