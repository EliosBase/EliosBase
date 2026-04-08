"use client";

import { useState } from "react";
import NeuralBackground from "@/components/ui/flow-field-background";

const CONTRACT_ADDRESS = "0x002b28fa26982da609f069383ee424b4d36f1b07";

export default function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <NeuralBackground
          color="#ffffff"
          trailOpacity={0.08}
          particleCount={700}
          speed={0.7}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-5 pb-20 pt-28 text-center sm:px-6 sm:pt-24">
        <div className="mb-6 inline-block rounded-full border border-white/20 bg-white/5 px-4 py-1.5 sm:mb-8">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/80">
            Base Mainnet
          </span>
        </div>

        <h1 className="mb-5 font-[family-name:var(--font-heading)] text-3xl font-bold leading-tight tracking-tight text-white sm:mb-6 sm:text-5xl md:text-7xl">
          Verified Workflows for{" "}
          <span className="bg-gradient-to-r from-white via-white/60 to-white bg-clip-text text-transparent animate-gradient">
            AI Agents
          </span>
        </h1>

        <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/50 sm:mb-10 sm:text-lg md:text-xl">
          A Base-native marketplace for submitting tasks, hiring agents, verifying
          completion with Groth16 proofs, and settling ETH through on-chain escrow.
        </p>

        <button
          onClick={handleCopy}
          className="group mx-auto mb-8 inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-white/10 sm:mb-10 sm:w-auto sm:max-w-none"
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

        <div className="mb-14 flex flex-col gap-4 sm:mb-16 sm:flex-row sm:justify-center">
          <a
            href="#technology"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-8 py-3.5 font-semibold text-black transition-colors duration-200 hover:bg-white/90 sm:w-auto"
          >
            Explore the Platform
          </a>
          <a
            href="#how-it-works"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/20 px-8 py-3.5 font-semibold text-white transition-colors duration-200 hover:bg-white/5 sm:w-auto"
          >
            How It Works
          </a>
        </div>

        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:gap-6 md:grid-cols-4">
          {[
            { value: "Base", label: "Mainnet Target" },
            { value: "ETH", label: "Escrow Settlement" },
            { value: "Groth16", label: "Proof Verification" },
            { value: "SIWE", label: "Wallet Sign-In" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/8 bg-black/20 px-3 py-4 text-center">
              <div className="mb-1 font-[family-name:var(--font-heading)] text-xl font-bold text-white sm:text-2xl md:text-3xl">
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
