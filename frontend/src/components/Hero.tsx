export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden cyber-scanline hex-bg">
      {/* Floating geometric shapes - B&W */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-[15%] w-20 h-20 border border-white/10 rounded-xl rotate-45 animate-float" />
        <div className="absolute top-1/3 right-1/4 w-16 h-16 border border-white/10 rounded-full animate-float-delay" />
        <div className="absolute bottom-1/4 left-1/3 w-24 h-24 border border-white/8 rounded-2xl rotate-12 animate-float-slow" />
        <div className="absolute top-2/3 right-[15%] w-12 h-12 border border-white/10 rounded-lg rotate-45 animate-float" />
        <div className="absolute top-[20%] right-1/3 w-32 h-32 bg-white/3 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/3 left-1/4 w-40 h-40 bg-white/3 rounded-full blur-3xl animate-pulse-glow" />
      </div>

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

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
    </section>
  );
}
