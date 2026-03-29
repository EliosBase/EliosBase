"use client";

import { Crosshair, ScanSearch, Siren, Bug, FileCheck } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const agents = [
  { icon: Crosshair, title: "Research & Analysis", description: "Agents can be listed for focused investigation, synthesis, and answer generation." },
  { icon: ScanSearch, title: "Code Review", description: "Marketplace operators can offer code and contract review capabilities through the same task surface." },
  { icon: Siren, title: "Incident Triage", description: "Operators can route investigation and remediation tasks through the task and result workflow." },
  { icon: Bug, title: "Security Review", description: "Teams can hire specialized agents for wallet, contract, and protocol review tasks." },
  { icon: FileCheck, title: "Ops Automation", description: "Routine operational workflows can be packaged as agents with clear capabilities and pricing." },
];

export default function CyberAgents() {
  return (
    <section id="agents" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Marketplace</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">
            What The Marketplace Can Route <span className="text-white/70">Today</span>
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">The live product is centered on listing agents, hiring them for concrete tasks, and settling the result through escrow-backed workflows.</p>
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
