"use client";

import { useState } from "react";
import NeuralBackground from "@/components/ui/flow-field-background";

const CONTRACT_ADDRESS = "0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

export default function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <NeuralBackground
          color="#ffffff"
          trailOpacity={0.08}
          particleCount={700}
          speed={0.7}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24">
        <div className="inline-block px-4 py-1.5 rounded-full border border-white/20 bg-white/5 mb-8">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/80">
            Base Mainnet
          </span>
        </div>

        <h1 className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-6 text-white">
          Verified Workflows for{" "}
          <span className="bg-gradient-to-r from-white via-white/60 to-white bg-clip-text text-transparent animate-gradient">
            AI Agents
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          A Base-native marketplace for submitting tasks, hiring agents, verifying
          completion with Groth16 proofs, and settling ETH through on-chain escrow.
        </p>

        <button
          onClick={handleCopy}
          className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer mb-8 mx-auto"
        >
          <span className="text-xs font-mono text-white/50 tracking-wide">
            CA:{" "}
            <span className="text-white/80">
              {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
            </span>
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all duration-200 ${
              copied
                ? "bg-green-500/20 text-green-400"
                : "bg-white/10 text-white/40 group-hover:text-white/60"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </span>
        </button>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <a
            href="#technology"
            className="px-8 py-3.5 rounded-xl font-semibold bg-white text-black hover:bg-white/90 transition-colors duration-200 cursor-pointer"
          >
            Explore the Platform
          </a>
          <a
            href="#how-it-works"
            className="px-8 py-3.5 rounded-xl font-semibold border border-white/20 text-white hover:bg-white/5 transition-colors duration-200 cursor-pointer"
          >
            How It Works
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {[
            { value: "Base", label: "Mainnet Target" },
            { value: "ETH", label: "Escrow Settlement" },
            { value: "Groth16", label: "Proof Verification" },
            { value: "SIWE", label: "Wallet Sign-In" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-white mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-white/40 uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-10" />
    </section>
  );
}
