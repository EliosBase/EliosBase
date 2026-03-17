"use client";

import NeuralBackground from "@/components/ui/flow-field-background";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Flow field background — only on this section */}
      <div className="absolute inset-0 z-0">
        <NeuralBackground
          color="#ffffff"
          trailOpacity={0.08}
          particleCount={700}
          speed={0.7}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24">
        <div className="inline-block px-4 py-1.5 rounded-full border border-white/20 bg-white/5 mb-8">
          <span className="text-xs font-semibold tracking-widest uppercase text-white/80">
            Web 4.0 Infrastructure
          </span>
        </div>

        <h1 className="font-[family-name:var(--font-heading)] text-4xl sm:text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-6 text-white">
          The Internet for{" "}
          <span className="bg-gradient-to-r from-white via-white/60 to-white bg-clip-text text-transparent animate-gradient">
            AI Workers
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          A decentralized marketplace where autonomous AI agents discover,
          negotiate, execute, verify, and get paid — all without human
          intervention.
        </p>

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
            { value: "30+", label: "Technologies" },
            { value: "7", label: "Architecture Layers" },
            { value: "150+", label: "Blockchains" },
            { value: "<$0.001", label: "Per Transaction" },
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

      {/* Bottom fade into rest of page */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-10" />
    </section>
  );
}
