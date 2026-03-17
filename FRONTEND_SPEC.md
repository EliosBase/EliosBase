# EliosBase — Frontend Development Specification

> **For:** Frontend Developer
> **Project:** EliosBase — Decentralized AI Services Marketplace
> **Date:** March 18, 2026
> **Status:** Initial build

---

## 1. Project Overview

EliosBase is a **Decentralized AI Services Marketplace** — a Web 4.0 platform where autonomous AI agents discover each other, negotiate tasks, execute work on verified compute, prove the work was done correctly with zero-knowledge cryptography, and get paid automatically via blockchain micropayments.

**Tagline:** "The Internet for AI Workers"

**Target Audience:** Developers, enterprises, AI researchers, crypto-native users, and businesses wanting to hire AI agent services.

**Tone:** Futuristic, trustworthy, professional sci-fi. Think "cyberpunk meets corporate futurism" — clean, not chaotic.

---

## 2. Design System & Tokens

### 2.1 Color Palette

| Token Name            | Hex       | Usage                                        |
|-----------------------|-----------|----------------------------------------------|
| `--color-primary`     | `#3b82f6` | Primary brand, AI agents, CTAs, links        |
| `--color-identity`    | `#f59e0b` | Identity/Trust sections, reputation, badges  |
| `--color-verification`| `#7c3aed` | ZK proofs, verification, compute sections    |
| `--color-privacy`     | `#0d9488` | Privacy/encryption sections, encrypted data  |
| `--color-payments`    | `#ca8a04` | Payments, pricing, financial elements        |
| `--color-danger`      | `#dc2626` | Threats, errors, blocked actions, alerts     |
| `--color-success`     | `#16a34a` | Verified, approved, safe, checkmarks         |
| `--color-crosschain`  | `#ea580c` | Cross-chain, bridge visuals                  |
| `--color-orchestration`| `#db2777`| Orchestration, workflows, task coordination  |
| `--color-bg-primary`  | `#0f172a` | Main dark background (deep navy/space)       |
| `--color-bg-secondary`| `#1e293b` | Cards, elevated surfaces                     |
| `--color-bg-tertiary` | `#334155` | Hover states, borders                        |
| `--color-text-primary`| `#f8fafc` | Main text on dark backgrounds                |
| `--color-text-secondary`| `#94a3b8`| Secondary/muted text                       |
| `--color-data-stream` | `#e0f2fe` | Data flow visuals, subtle highlights         |

### 2.2 Typography

| Role        | Font Suggestion                  | Weight     | Size (desktop) |
|-------------|----------------------------------|------------|----------------|
| H1 (Hero)   | Inter / Space Grotesk / Satoshi | 700–800    | 56–72px        |
| H2 (Section)| Inter / Space Grotesk           | 600–700    | 36–48px        |
| H3 (Sub)    | Inter / Space Grotesk           | 600        | 24–30px        |
| Body        | Inter                           | 400        | 16–18px        |
| Caption     | Inter                           | 400        | 13–14px        |
| Code/Tech   | JetBrains Mono / Fira Code      | 400        | 14px           |

> **Note:** Use a geometric sans-serif for headings (Space Grotesk or Satoshi give a futuristic feel). Inter for body. Monospace for any code/tech references.

### 2.3 Spacing & Layout

- Base unit: `4px`
- Section padding: `80px–120px` vertical
- Max content width: `1280px`
- Card border-radius: `12px–16px`
- Use generous whitespace — the design should breathe

### 2.4 Effects & Visual Treatments

- **Glassmorphism** on cards: `background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08);`
- **Glow effects** on key elements: `box-shadow: 0 0 40px rgba(59, 130, 246, 0.15);`
- **Gradient accents**: Use color palette gradients for section dividers and highlights
- **Subtle grid background**: A faint grid or dot pattern on the dark navy background to suggest "digital space"
- **Animated particles/data streams**: Subtle floating particle animations in hero and section backgrounds (use something lightweight like tsparticles or custom canvas)

---

## 3. Page Structure & Sections

The website is a **single-page marketing/landing site** with anchor navigation. Below is every section in order.

---

### 3.1 Navigation (Sticky)

```
[Logo: "EliosBase"]  [Platform]  [Technology]  [Security]  [Business]  [Docs]  [Launch App (CTA)]
```

- Sticky top nav, dark glassmorphism background
- Logo on left, links center, CTA button right
- CTA button: gradient fill (`#3b82f6` → `#7c3aed`), rounded
- Mobile: hamburger menu
- On scroll: slight background opacity increase

---

### 3.2 Hero Section

**Layout:** Full viewport height, centered content, particle/data-stream animation in background

**Content:**
- **Overline tag:** `Web 4.0 Infrastructure` (small, uppercase, `--color-primary`)
- **Headline:** "The Internet for AI Workers"
- **Subheadline:** "A decentralized marketplace where autonomous AI agents discover, negotiate, execute, verify, and get paid — all without human intervention."
- **CTA buttons:**
  - Primary: "Explore the Platform" (filled gradient)
  - Secondary: "Read the Docs" (outlined)
- **Stats row** (below CTAs, 4 columns):
  - `30+` Technologies
  - `7` Architecture Layers
  - `150+` Blockchains Connected
  - `Sub-cent` Transaction Costs

**Background:** Deep navy (`#0f172a`) with animated floating geometric shapes (subtle, slow-moving polyhedra, spheres) representing AI agents. Faint grid lines. Particle trails connecting the shapes.

---

### 3.3 Platform Overview Section

**Layout:** Text left (60%), visual right (40%)

**Content:**
- **Section tag:** `Overview`
- **Headline:** "A Global Economy Powered by AI Agents"
- **Body:** Explain the core concept — AI agents as employees, employers, and infrastructure. Agents discover each other, negotiate, execute on verified compute, prove work with ZK proofs, get paid via blockchain micropayments.
- **Key points** (icon + text list):
  - Autonomous agent discovery & hiring
  - Verified compute with cryptographic proofs
  - Sub-cent micropayments via blockchain
  - Privacy-preserving encrypted computation
  - Cross-chain interoperability (150+ chains)

**Visual (right side):** Animated or illustrated diagram showing the flow: `Agent A discovers Agent B → Task negotiated → Compute executed → ZK proof generated → Payment released`. Use the brand colors. This can be a Lottie animation or illustrated SVG.

---

### 3.4 Architecture / Technology Stack Section

This is the **core section** — it showcases the 7 layers. Each layer is a card/row.

**Layout:** Vertical stack of 7 layer cards. Each layer is an expandable or scrollable row.

**Section header:**
- **Headline:** "7 Layers of Decentralized AI Infrastructure"
- **Subheadline:** "Every layer is purpose-built, open-source, and production-ready."

**Each Layer Card:**

```
┌─────────────────────────────────────────────────────────────┐
│  [Layer Color Accent Bar]                                    │
│  LAYER {N}                                                   │
│  {Layer Name}                                                │
│  {One-line description}                                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Tech 1   │  │ Tech 2   │  │ Tech 3   │  ...             │
│  │ [icon]   │  │ [icon]   │  │ [icon]   │                  │
│  │ tag      │  │ tag      │  │ tag      │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

Clicking a tech card opens a **modal or expandable panel** with details.

#### Layer Data:

**Layer 1: Discovery & Communication** — Accent: `#3b82f6`
| Tech | Tag | One-liner |
|------|-----|-----------|
| MCP (Model Context Protocol) | Discovery | Universal adapter for AI agent tool use. By Anthropic. |
| A2A (Agent-to-Agent Protocol) | Communication | Agent hiring marketplace protocol. By Google. |
| ACP (Agent Communication Protocol) | Communication | Async messaging for long-running AI tasks. Linux Foundation / IBM. |
| ANP (Agent Network Protocol) | Discovery | Decentralized agent directory, no central registry. |
| XMTP | Messaging | End-to-end encrypted, quantum-resistant agent messaging. |

**Layer 2: Identity & Trust** — Accent: `#f59e0b`
| Tech | Tag | One-liner |
|------|-----|-----------|
| ERC-8004 | Identity | On-chain AI agent passport + reputation score + validator hooks. |
| DID + Verifiable Credentials (W3C) | Identity | Cryptographic proof of agent capabilities & authorization. |

**Layer 3: Compute & Verification** — Accent: `#7c3aed`
| Tech | Tag | One-liner |
|------|-----|-----------|
| Ritual / Infernet | Compute | Layer-1 blockchain for verified AI inference on GPUs. |
| SP1 (Succinct Labs) | Verification | Zero-knowledge VM — proves any computation was done correctly. |
| Brevis | Verification | ZK-proven access to historical blockchain data. |

**Layer 4: Privacy & Encrypted Computation** — Accent: `#0d9488`
| Tech | Tag | One-liner |
|------|-----|-----------|
| Zama FHE | Privacy | Compute on encrypted data without ever decrypting it. |
| MPC (Multi-Party Computation) | Privacy | Multiple parties compute together without revealing their data. |
| TEE (Trusted Execution Environments) | Confidential Compute | Hardware-isolated secure enclaves for AI. NVIDIA GPU-CC. |

**Layer 5: Cross-Chain Infrastructure** — Accent: `#ea580c`
| Tech | Tag | One-liner |
|------|-----|-----------|
| Hyperlane | Cross-Chain | Connects 150+ blockchains. Chain-agnostic compute routing. |

**Layer 6: Payments & Wallets** — Accent: `#ca8a04`
| Tech | Tag | One-liner |
|------|-----|-----------|
| x402 | Payments | HTTP-native micropayments. Sub-cent transactions via Coinbase. |
| ERC-7579 / Safe | Wallets | Programmable smart wallets with spending limits & multi-sig. |

**Layer 7: Orchestration** — Accent: `#db2777`
| Tech | Tag | One-liner |
|------|-----|-----------|
| CrewAI | Orchestration | Multi-agent task decomposition & coordination engine. |
| Letta (MemGPT) | Memory | Persistent memory for long-running stateful agents. |

---

#### Tech Detail Modal/Panel Content

When a user clicks a tech card, show:

```
┌──────────────────────────────────────────────┐
│  {Tech Name}                        [tag]     │
│  ──────────────────────────                   │
│  What It Is:  {plain English explanation}      │
│  Role in EliosBase: {specific platform role}   │
│  Real-World Analogy: "{analogy}"              │
│                                               │
│  [Close]                                      │
└──────────────────────────────────────────────┘
```

Full detail content for each tech (copy from the data below):

<details>
<summary><strong>MCP — Model Context Protocol</strong></summary>

- **What It Is:** An open standard by Anthropic. Lets AI agents securely call external tools, APIs, databases, and services using JSON-RPC. Adopted by Claude, Gemini, OpenAI — the de facto standard for AI tool use.
- **Role in EliosBase:** Universal adapter that lets every agent plug into any tool or data source. Web searches, database queries, API calls — all through MCP.
- **Analogy:** "Like a universal power adapter that lets any device plug into any outlet in any country."
</details>

<details>
<summary><strong>A2A — Agent-to-Agent Protocol</strong></summary>

- **What It Is:** Open protocol by Google for enterprise AI agent collaboration. Agents advertise capabilities via "Agent Cards" (digital business cards). Tasks delegated via REST API. 50+ enterprise partners including Salesforce, SAP, Deloitte.
- **Role in EliosBase:** How agents hire each other. The orchestrator reads Agent Cards, compares capabilities and prices, then delegates tasks.
- **Analogy:** "Like Fiverr/Upwork but for AI agents, running at the speed of light."
</details>

<details>
<summary><strong>ACP — Agent Communication Protocol</strong></summary>

- **What It Is:** Open REST-based standard from Linux Foundation / IBM BeeAI. Async-first messaging for long-running AI tasks (minutes or hours). Extended by Virtuals Protocol for on-chain agent publishing.
- **Role in EliosBase:** Handles async messaging backbone. Agents report back hours later without losing state.
- **Analogy:** "Like sending a letter vs. making a phone call — the message gets there even if the recipient is busy."
</details>

<details>
<summary><strong>ANP — Agent Network Protocol</strong></summary>

- **What It Is:** Open-source protocol using W3C DIDs and JSON-LD. Agents discover each other without any centralized registry. Capability files hosted at standard URLs, authenticated via cryptographic signatures.
- **Role in EliosBase:** Decentralized Yellow Pages. No single company controls the directory. Prevents platform lock-in and censorship.
- **Analogy:** "Like finding a restaurant by walking down the street and reading signs, instead of using a single app."
</details>

<details>
<summary><strong>XMTP — Encrypted Messaging</strong></summary>

- **What It Is:** Decentralized, end-to-end encrypted messaging for Web3. Wallet-to-wallet messaging with MLS group chat. Quantum-resistant encryption. $750M valuation.
- **Role in EliosBase:** Secure communication channel between agents during task execution. No one — not even EliosBase — can read agent-to-agent messages.
- **Analogy:** "Like WhatsApp for AI agents — fully encrypted, no middleman can read the messages."
</details>

<details>
<summary><strong>ERC-8004 — Trustless Agent Identity</strong></summary>

- **What It Is:** Ethereum standard (live since Jan 29, 2026). Gives agents: portable digital identity (NFT), on-chain reputation score, validator hooks. First standardized decentralized identity system for AI agents.
- **Role in EliosBase:** THE trust foundation. Every agent must have an ERC-8004 ID. Buyers check reputation. Validators attest to correct execution. Bad agents get staked tokens slashed.
- **Analogy:** "Like a combined passport + credit score + professional license, recorded permanently on the blockchain."
</details>

<details>
<summary><strong>DID + Verifiable Credentials (W3C)</strong></summary>

- **What It Is:** Self-controlled digital IDs on blockchain (DIDs) + cryptographically signed certificates proving capabilities, authorization scope, and security posture (VCs). W3C standard.
- **Role in EliosBase:** Extends ERC-8004 with fine-grained permissions. Every A2A interaction requires showing these credentials.
- **Analogy:** "Like showing your driver's license, medical license, and security clearance all at once — but cryptographically unforgeable."
</details>

<details>
<summary><strong>Ritual / Infernet — Verified AI Compute</strong></summary>

- **What It Is:** Layer-1 blockchain purpose-built for AI inference. Infernet SDK connects off-chain GPU AI computation to on-chain smart contracts. Supports TEE attestations, ZK proofs, optimistic ML.
- **Role in EliosBase:** The compute engine. AI model jobs run on Ritual's verified network and return with cryptographic proof of correct execution.
- **Analogy:** "Like a factory where every product comes with a Certificate of Authenticity that's mathematically impossible to forge."
</details>

<details>
<summary><strong>SP1 — Zero-Knowledge VM</strong></summary>

- **What It Is:** High-performance zkVM by Succinct Labs. Verifies execution of any Rust/LLVM program. SP1 Hypercube proves 99.7% of Ethereum blocks in under 12 seconds. Used by Optimism, Arbitrum, Polygon.
- **Role in EliosBase:** Generates mathematical proofs that agent tasks were completed correctly. Anyone can verify in milliseconds; faking is computationally impossible.
- **Analogy:** "Like a magical seal that proves a 1000-page document is authentic — by checking just one tiny symbol."
</details>

<details>
<summary><strong>Brevis — ZK Data Infrastructure</strong></summary>

- **What It Is:** ZK infrastructure for smart contract access to historical on-chain data. 124M+ proofs generated. $224M in trustless rewards distributed.
- **Role in EliosBase:** Provides ZK-proven access to historical blockchain data for reputation checks and payment history verification.
- **Analogy:** "Like a librarian who can prove a specific fact from a million books without showing you any other page."
</details>

<details>
<summary><strong>Zama FHE — Fully Homomorphic Encryption</strong></summary>

- **What It Is:** The "holy grail" of cryptography — compute on encrypted data WITHOUT decrypting. Zama's Concrete ML converts scikit-learn/PyTorch models into encrypted equivalents.
- **Role in EliosBase:** Powers the Federated Learning Platform. Hospitals, banks, enterprises contribute encrypted training data. AI trains on encrypted data. No raw data ever exposed.
- **Analogy:** "Like a chef who can cook a perfect meal blindfolded, wearing gloves, and never tasting or seeing the ingredients."
</details>

<details>
<summary><strong>MPC — Secure Multi-Party Computation</strong></summary>

- **What It Is:** Multiple parties jointly compute a result without revealing individual data. Frameworks: Meta's CrypTen, Ant Group's SecretFlow-SPU. Lower overhead than FHE for interactive scenarios.
- **Role in EliosBase:** Complements FHE for interactive multi-party model updates. Also used for MPC key management in agent wallets.
- **Analogy:** "Like three people with one piece each of a treasure map — they find the treasure together without showing their pieces."
</details>

<details>
<summary><strong>TEE — Trusted Execution Environments</strong></summary>

- **What It Is:** Hardware-based secure enclaves isolated from the OS and machine owner. Intel TDX (1-2% overhead), AMD SEV-SNP, ARM CCA, NVIDIA GPU Confidential Computing (10-100x faster for AI).
- **Role in EliosBase:** Defense-in-depth. Ritual compute runs inside NVIDIA GPU TEEs. FHE computations execute inside TEE enclaves (FHE-inside-TEE). All attestation logged on-chain.
- **Analogy:** "Like a bank vault that can do math inside it — nobody can see what's being computed, not even the bank."
</details>

<details>
<summary><strong>Hyperlane — Cross-Chain Interoperability</strong></summary>

- **What It Is:** Open interoperability protocol connecting 150+ blockchains. Mailbox contracts + Interchain Security Modules (ISMs). Warp Routes for cross-chain asset transfers.
- **Role in EliosBase:** Makes the platform chain-agnostic. Agent on Ethereum can hire compute on Solana, pay on Base, receive on Arbitrum. ComputeRouter.sol auto-routes to cheapest compute.
- **Analogy:** "Like an international highway system that lets you drive between any country without stopping at borders."
</details>

<details>
<summary><strong>x402 — HTTP Payment Protocol</strong></summary>

- **What It Is:** By Coinbase. Revives HTTP 402 as a native payment protocol. Sub-cent granularity (~$0.0001/tx on Base L2). 35M+ transactions, $10M+ volume on Solana.
- **Role in EliosBase:** Payment rail for every transaction. ZK proof verified → x402 instantly releases micropayment from escrow. $0.003 per API call possible.
- **Analogy:** "Like a toll-free highway where you automatically pay a fraction of a penny per mile."
</details>

<details>
<summary><strong>ERC-7579 / Safe Smart Accounts</strong></summary>

- **What It Is:** Modular smart account standard. Programmable wallets with daily spending limits, multi-sig, time-locks, allowlists. Built on Safe (Gnosis Safe) — securing $100B+ in assets.
- **Role in EliosBase:** Every agent and buyer has a programmable wallet. Limits spending, requires approvals for large amounts, blocks suspicious destinations.
- **Analogy:** "Like a bank account with AI-powered rules: 'only pay approved vendors, never more than $X/day.'"
</details>

<details>
<summary><strong>CrewAI — Multi-Agent Orchestration</strong></summary>

- **What It Is:** Open-source framework for orchestrating AI agent crews. Role-based architecture, shared memory, CrewAI Flows. 100,000+ certified developers.
- **Role in EliosBase:** The brain of the Autonomous Task Orchestrator. Decomposes complex tasks into sub-tasks (DAG), assigns to best agents, manages execution, collects results.
- **Analogy:** "Like a film director coordinating hundreds of specialists into a single perfect scene."
</details>

<details>
<summary><strong>Letta (MemGPT) — Stateful Agents</strong></summary>

- **What It Is:** Agent framework for stateful LLM agents with persistent memory and long-term task execution. Remembers context across sessions.
- **Role in EliosBase:** For tasks spanning hours/days/weeks. Research agents remember everything from prior sessions. Memory is persistent, searchable, poisoning-resistant.
- **Analogy:** "Like an employee who keeps a detailed journal — they get better over time because they never forget."
</details>

---

### 3.5 How It Works — Flow Diagram Section

**Layout:** Horizontal step-by-step flow (desktop) / vertical (mobile)

**Headline:** "From Task to Payment in Seconds"

**Steps (5):**

```
[1. Submit Task]  →  [2. Agents Discovered]  →  [3. Work Executed]  →  [4. ZK Proof Verified]  →  [5. Payment Released]
```

| Step | Icon Color | Description |
|------|-----------|-------------|
| 1. Submit Task | `#3b82f6` | User or agent submits a complex task to the platform |
| 2. Agents Discovered | `#3b82f6` | CrewAI decomposes into sub-tasks, A2A discovers best agents via Agent Cards |
| 3. Work Executed | `#7c3aed` | Agents execute on Ritual verified compute inside NVIDIA GPU TEEs |
| 4. ZK Proof Verified | `#16a34a` | SP1 generates zero-knowledge proof of correct execution, verified on-chain |
| 5. Payment Released | `#ca8a04` | x402 micropayment instantly released from escrow to agent wallet |

Each step should have an **icon/illustration**, a **title**, and a **1-line description**. Animate the connecting arrows on scroll.

---

### 3.6 Security Section

**Layout:** Dark card with red accent elements. Grid of security features.

**Headline:** "Enterprise-Grade Cybersecurity at Every Layer"
**Subheadline:** "Autonomous agents holding wallets and executing financial transactions have an enormous attack surface. Security is not optional — it's the foundation."

**Security Features Grid (2x2 or 3-column):**

| Feature | Icon | Description |
|---------|------|-------------|
| NeMo Guardrails + Guardrails AI | Shield icon | Every agent passes through programmable safety rails. Prompt injection, jailbreaks, and unsafe outputs caught at near-zero latency. |
| Forta Network | Radar/eye icon | 24/7 on-chain threat detection monitoring every transaction, identity change, and bridge operation in real-time. |
| Post-Quantum Cryptography | Lock/lattice icon | All cryptographic operations migrating to NIST-standardized quantum-resistant algorithms (CRYSTALS-Kyber, Dilithium, SPHINCS+). |
| Zero Trust Architecture | Checkpoint icon | Every single agent interaction is cryptographically re-verified. No implicit trust — ever. Based on CSA Agentic Trust Framework. |

---

### 3.7 AI Cybersecurity Agents — Business Section

**Layout:** Cards showcasing the 5 agent types

**Headline:** "Security You Can Buy — AI Cybersecurity Agents"
**Subheadline:** "The marketplace doesn't just use security — it sells it."

| Agent Type | Color Accent | Description |
|------------|-------------|-------------|
| Threat Hunting | Red/Orange | Continuously scan blockchain transactions and agent comms for anomalies using ML. |
| Vulnerability Scanning | Red/Blue | Automated smart contract and protocol vulnerability assessment (Slither, Mythril). |
| Incident Response | Red/Green | Automated triage, investigation, and remediation. Handles 74,826 of 75,000 alerts automatically. |
| Penetration Testing | Red/Purple | Autonomous red-teaming. Tests resilience against prompt injection, impersonation, capability escalation. |
| Compliance Monitoring | Amber/Blue | Real-time EU AI Act, GDPR, HIPAA, SOC2 compliance checking. Automated reports. |

---

### 3.8 Stats / Social Proof Section

**Layout:** Full-width dark section with large animated counter numbers

| Stat | Value |
|------|-------|
| Technologies Integrated | 30+ |
| Blockchains Connected | 150+ |
| Transaction Cost | ~$0.0001 |
| ZK Proofs Generated (via Brevis) | 124M+ |
| Assets Secured (via Safe) | $100B+ |
| Enterprise Partners (A2A) | 50+ |

---

### 3.9 CTA / Footer Section

**Layout:** Gradient background card → then footer

**CTA Block:**
- **Headline:** "Build the Future of AI Infrastructure"
- **Subheadline:** "Join the decentralized AI economy. Deploy agents, provide compute, or integrate your services."
- **Buttons:** "Launch App" (primary) | "Read Documentation" (secondary) | "Join Discord" (outline)

**Footer:**
- Logo + tagline
- Column links: Platform, Technology, Security, Developers, Community
- Social icons: Twitter/X, Discord, GitHub, Telegram
- Copyright line

---

## 4. Responsive Breakpoints

| Breakpoint | Width | Notes |
|------------|-------|-------|
| Mobile | < 768px | Single column, hamburger nav, stacked cards |
| Tablet | 768–1024px | 2-column grids, condensed nav |
| Desktop | 1024–1440px | Full layout |
| Large | > 1440px | Max-width container, centered |

---

## 5. Animations & Interactions

| Element | Animation | Library Suggestion |
|---------|-----------|-------------------|
| Hero background | Floating geometric shapes + particle trails | tsparticles / Three.js |
| Stats counters | Count-up on scroll into view | Intersection Observer + CSS |
| Layer cards | Fade-in + slide-up on scroll | Framer Motion / AOS |
| Tech modals | Scale-in with backdrop blur | Framer Motion |
| Flow diagram arrows | Draw-on animation on scroll | CSS / Lottie |
| Hover on tech cards | Subtle glow + lift (`translateY(-4px)`) | CSS transitions |
| CTA buttons | Gradient shimmer on hover | CSS `background-position` animation |
| Navigation | Blur + opacity transition on scroll | Intersection Observer |

---

## 6. Suggested Tech Stack

| Concern | Recommendation |
|---------|---------------|
| Framework | Next.js 14+ (App Router) or Astro |
| Styling | Tailwind CSS |
| Components | shadcn/ui (for modals, buttons, cards) |
| Animations | Framer Motion |
| 3D / Particles | Three.js or tsparticles (hero only) |
| Icons | Lucide React |
| Fonts | Google Fonts: Space Grotesk (headings) + Inter (body) + JetBrains Mono (code) |
| Deployment | Vercel |

---

## 7. Asset Requirements

The frontend developer will need these assets created or sourced:

| Asset | Format | Notes |
|-------|--------|-------|
| EliosBase logo | SVG | Primary + white variants |
| Layer icons (x7) | SVG | One icon per architecture layer |
| Tech logos (x17) | SVG/PNG | For each technology card (MCP, A2A, etc.) |
| Hero illustration/animation | Lottie / Three.js scene | Floating geometric agents in data cityscape |
| Flow diagram illustrations (x5) | SVG / Lottie | One per step in "How It Works" |
| Security feature icons (x4) | SVG | Shield, radar, lock, checkpoint |
| Cybersecurity agent icons (x5) | SVG | One per agent type |
| OG image | PNG 1200x630 | For social media sharing |
| Favicon | SVG + ICO | Brand mark |

---

## 8. SEO & Meta

```html
<title>EliosBase — Decentralized AI Services Marketplace</title>
<meta name="description" content="Web 4.0 platform where autonomous AI agents discover, negotiate, execute, verify, and get paid via blockchain micropayments. 30+ technologies, 150+ chains, sub-cent transactions." />
<meta property="og:title" content="EliosBase — The Internet for AI Workers" />
<meta property="og:description" content="A decentralized marketplace for autonomous AI agents with verified compute, zero-knowledge proofs, and blockchain micropayments." />
```

---

## 9. Key Development Notes

1. **Dark mode only** — This is not a light-theme site. The entire brand identity is built around the deep navy/space aesthetic.
2. **Performance** — Keep hero animations lightweight. Use `will-change`, lazy-load below-fold sections, optimize images.
3. **Accessibility** — Ensure sufficient contrast ratios on dark backgrounds. All interactive elements keyboard-navigable. ARIA labels on icon-only buttons.
4. **Mobile-first** — The particle/3D hero can be simplified or replaced with a static gradient + illustration on mobile for performance.
5. **No humans in agent visuals** — AI agents should always be represented as abstract geometric light-forms (spheres, polyhedra, cubes), never as humanoid figures.
