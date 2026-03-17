"use client";

import { Send, Search, Cpu, ShieldCheck, Coins } from "lucide-react";
import AnimatedCard from "./AnimatedCard";

const steps = [
  { icon: Send, title: "Submit Task", description: "User or agent submits a complex task to the platform" },
  { icon: Search, title: "Agents Discovered", description: "CrewAI decomposes into sub-tasks, A2A discovers best agents via Agent Cards" },
  { icon: Cpu, title: "Work Executed", description: "Agents execute on Ritual verified compute inside NVIDIA GPU TEEs" },
  { icon: ShieldCheck, title: "ZK Proof Verified", description: "SP1 generates zero-knowledge proof of correct execution, verified on-chain" },
  { icon: Coins, title: "Payment Released", description: "x402 micropayment instantly released from escrow to agent wallet" },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/50 mb-4 block">Workflow</span>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">From Task to Payment in Seconds</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">A complete task lifecycle — fully autonomous, verifiable, and paid.</p>
        </div>

        {/* Desktop: horizontal */}
        <div className="hidden lg:flex items-start justify-between relative">
          <div className="absolute top-10 left-[10%] right-[10%] h-px bg-gradient-to-r from-white/20 via-white/10 to-white/20" />
          {steps.map((step, i) => (
            <div key={step.title} className="flex flex-col items-center text-center relative z-10 w-1/5 px-2">
              <AnimatedCard className="bg-black border border-white/[0.06] w-20 h-20 flex items-center justify-center" tilt spotlight borderGlow hoverLift>
                <div className="flex items-center justify-center w-full h-full">
                  <step.icon className="text-white/70 group-hover:text-white transition-colors duration-300" size={28} />
                </div>
              </AnimatedCard>
              <span className="text-xs font-bold text-white/30 mb-2 mt-4">Step {i + 1}</span>
              <h3 className="font-semibold text-white text-sm mb-2">{step.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Mobile: vertical */}
        <div className="lg:hidden space-y-4">
          {steps.map((step, i) => (
            <AnimatedCard key={step.title} className="glass p-5" tilt={false} spotlight borderGlow hoverLift={false}>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/5 ring-2 ring-white/10 flex items-center justify-center shrink-0">
                  <step.icon className="text-white/70" size={24} />
                </div>
                <div>
                  <span className="text-xs font-bold text-white/30">Step {i + 1}</span>
                  <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-white/40">{step.description}</p>
                </div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </section>
  );
}
