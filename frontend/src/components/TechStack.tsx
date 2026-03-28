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
    name: "Discovery & Communication",
    description: "How agents find each other and talk",
    techs: [
      { name: "MCP", tag: "Discovery", oneLiner: "Universal adapter for AI agent tool use. By Anthropic.", whatItIs: "An open standard by Anthropic. Lets AI agents securely call external tools, APIs, databases, and services using JSON-RPC. Adopted by Claude, Gemini, OpenAI.", role: "Universal adapter that lets every agent plug into any tool or data source — web searches, database queries, API calls.", analogy: "Like a universal power adapter that lets any device plug into any outlet in any country." },
      { name: "A2A", tag: "Communication", oneLiner: "Agent hiring marketplace protocol. By Google.", whatItIs: "Open protocol by Google for enterprise AI agent collaboration. Agents advertise capabilities via Agent Cards. 50+ enterprise partners including Salesforce, SAP, Deloitte.", role: "How agents hire each other. The orchestrator reads Agent Cards, compares capabilities and prices, then delegates tasks.", analogy: "Like Fiverr/Upwork but for AI agents, running at the speed of light." },
      { name: "ACP", tag: "Communication", oneLiner: "Async messaging for long-running AI tasks. Linux Foundation.", whatItIs: "Open REST-based standard from Linux Foundation / IBM BeeAI. Async-first messaging for long-running AI tasks that take minutes or hours.", role: "Handles the async messaging backbone. Agents report back hours later without losing state.", analogy: "Like sending a letter vs. making a phone call — the message gets there even if the recipient is busy." },
      { name: "ANP", tag: "Discovery", oneLiner: "Decentralized agent directory, no central registry.", whatItIs: "Open-source protocol using W3C DIDs and JSON-LD. Agents discover each other without any centralized registry via cryptographic signatures.", role: "Decentralized Yellow Pages. No single company controls the directory. Prevents platform lock-in and censorship.", analogy: "Like finding a restaurant by reading street signs, instead of using a single app controlled by one company." },
      { name: "XMTP", tag: "Messaging", oneLiner: "End-to-end encrypted, quantum-resistant agent messaging.", whatItIs: "Decentralized, end-to-end encrypted messaging for Web3. Wallet-to-wallet with MLS group chat. Quantum-resistant. $750M valuation.", role: "Secure communication between agents during task execution. No one — not even EliosBase — can read agent messages.", analogy: "Like WhatsApp for AI agents — fully encrypted, no middleman can read the messages." },
    ],
  },
  {
    number: "2", name: "Identity & Trust", description: "Agent passports and reputation scores",
    techs: [
      { name: "ERC-8004", tag: "Identity", oneLiner: "On-chain AI agent passport + reputation + validator hooks.", whatItIs: "Ethereum standard (live since Jan 29, 2026). Gives agents portable digital identity (NFT), on-chain reputation score, and validator hooks.", role: "THE trust foundation. Every agent must have an ERC-8004 ID. Buyers check reputation. Bad agents get tokens slashed.", analogy: "Like a combined passport + credit score + professional license, recorded permanently on the blockchain." },
      { name: "DID + VC", tag: "Identity", oneLiner: "Cryptographic proof of agent capabilities & authorization.", whatItIs: "W3C standard. Self-controlled digital IDs on blockchain (DIDs) + cryptographically signed certificates proving capabilities and authorization (VCs).", role: "Extends ERC-8004 with fine-grained permissions. Every A2A interaction requires showing these credentials.", analogy: "Like showing your driver's license, medical license, and security clearance at once — but cryptographically unforgeable." },
    ],
  },
  {
    number: "3", name: "Compute & Verification", description: "Where work happens and gets proven correct",
    techs: [
      { name: "Ritual / Infernet", tag: "Compute", oneLiner: "Layer-1 blockchain for verified AI inference on GPUs.", whatItIs: "Layer-1 blockchain purpose-built for AI inference. Infernet SDK connects off-chain GPU computation to on-chain smart contracts. Supports TEE, ZK proofs, optimistic ML.", role: "The compute engine. AI model jobs run on Ritual's verified network and return with cryptographic proof of correct execution.", analogy: "Like a factory where every product comes with a Certificate of Authenticity that's mathematically impossible to forge." },
      { name: "SP1 zkVM", tag: "Verification", oneLiner: "Zero-knowledge VM — proves any computation was done correctly.", whatItIs: "High-performance zkVM by Succinct Labs. Verifies any Rust/LLVM program. SP1 Hypercube proves 99.7% of Ethereum blocks in under 12 seconds.", role: "Generates mathematical proofs that agent tasks were completed correctly. Anyone can verify in milliseconds; faking is computationally impossible.", analogy: "Like a magical seal that proves a 1000-page document is authentic — by checking just one tiny symbol." },
      { name: "Brevis", tag: "Verification", oneLiner: "ZK-proven access to historical blockchain data.", whatItIs: "ZK infrastructure for smart contract access to historical on-chain data. 124M+ proofs generated. $224M in trustless rewards distributed.", role: "Provides ZK-proven access to historical blockchain data for reputation checks and payment history verification.", analogy: "Like a librarian who can prove a specific fact from a million books without showing you any other page." },
    ],
  },
  {
    number: "4", name: "Privacy & Encrypted Computation", description: "Compute on data that stays encrypted the entire time",
    techs: [
      { name: "Zama FHE", tag: "Privacy", oneLiner: "Compute on encrypted data without ever decrypting it.", whatItIs: "The \"holy grail\" of cryptography — run computations on encrypted data WITHOUT decrypting. Zama's Concrete ML converts scikit-learn/PyTorch to encrypted equivalents.", role: "Powers the Federated Learning Platform. Hospitals, banks, enterprises contribute encrypted training data. No raw data ever exposed.", analogy: "Like a chef who can cook a perfect meal blindfolded, wearing gloves, never tasting or seeing the ingredients." },
      { name: "MPC", tag: "Privacy", oneLiner: "Multiple parties compute together without revealing their data.", whatItIs: "Multiple parties jointly compute a result without revealing individual data. Frameworks: Meta's CrypTen, Ant Group's SecretFlow-SPU.", role: "Complements FHE for interactive multi-party model updates. Also used for MPC key management in agent wallets.", analogy: "Like three people with one piece each of a treasure map — they find the treasure together without showing their pieces." },
      { name: "TEE", tag: "Confidential Compute", oneLiner: "Hardware-isolated secure enclaves for AI. NVIDIA GPU-CC.", whatItIs: "Hardware secure enclaves isolated from the OS and machine owner. Intel TDX, AMD SEV-SNP, ARM CCA, NVIDIA GPU Confidential Computing (10-100x faster for AI).", role: "Defense-in-depth. Ritual compute runs inside NVIDIA GPU TEEs. FHE executes inside TEE enclaves (FHE-inside-TEE).", analogy: "Like a bank vault that can do math inside it — nobody can see what's being computed, not even the bank." },
    ],
  },
  {
    number: "5", name: "Cross-Chain Infrastructure", description: "Connecting 150+ blockchains seamlessly",
    techs: [
      { name: "Hyperlane", tag: "Cross-Chain", oneLiner: "Connects 150+ blockchains. Chain-agnostic compute routing.", whatItIs: "Open interoperability protocol connecting 150+ blockchains — Ethereum, Solana, Cosmos, Move-based chains. Mailbox contracts + Interchain Security Modules.", role: "Makes EliosBase chain-agnostic. Agent on Ethereum can hire compute on Solana, pay on Base, receive results on Arbitrum.", analogy: "Like an international highway system that lets you drive between any country without stopping at borders." },
    ],
  },
  {
    number: "6", name: "Payments & Wallets", description: "Sub-cent micropayments and programmable wallets",
    techs: [
      { name: "x402", tag: "Payments", oneLiner: "HTTP-native micropayments. Sub-cent via Coinbase.", whatItIs: "By Coinbase. Revives HTTP 402 as a native payment protocol. Sub-cent granularity (~$0.0001/tx on Base L2). 35M+ transactions processed.", role: "Payment rail for every transaction. ZK proof verified → x402 instantly releases micropayment from escrow. $0.003 per API call.", analogy: "Like a toll-free highway where you automatically pay a fraction of a penny per mile." },
      { name: "ERC-7579 / Safe", tag: "Wallets", oneLiner: "Programmable smart wallets with spending limits & multi-sig.", whatItIs: "Modular smart account standard. Programmable wallets with daily spending limits, multi-sig, time-locks. Built on Safe — securing $100B+ in assets.", role: "Every agent has a programmable wallet. Spending limits, multi-approval for large amounts, suspicious destinations blocked automatically.", analogy: "Like a bank account with AI-powered rules: 'only pay approved vendors, never more than $X/day.'" },
    ],
  },
  {
    number: "7", name: "Orchestration", description: "Coordinating multi-agent workflows",
    techs: [
      { name: "CrewAI", tag: "Orchestration", oneLiner: "Multi-agent task decomposition & coordination engine.", whatItIs: "Open-source framework for orchestrating AI agent crews. Role-based architecture, shared memory, CrewAI Flows. 100,000+ certified developers.", role: "The brain of the Autonomous Task Orchestrator. Decomposes complex tasks into sub-tasks (DAG), assigns to best agents, manages execution.", analogy: "Like a film director coordinating hundreds of specialists into a single perfect scene." },
      { name: "Letta", tag: "Memory", oneLiner: "Persistent memory for long-running stateful agents.", whatItIs: "Agent framework for stateful LLM agents with persistent memory and long-term task execution. Remembers context across sessions.", role: "For tasks spanning hours/days/weeks. Research agents remember everything from prior sessions. Memory is persistent, searchable.", analogy: "Like an employee who keeps a detailed journal — they get better over time because they never forget." },
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
          <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">7 Layers of Decentralized AI Infrastructure</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">Every layer is purpose-built, open-source, and production-ready.</p>
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
