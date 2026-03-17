"use client";

import AnimatedCard from "./AnimatedCard";

export default function CTA() {
  return (
    <section id="cta" className="relative py-24 px-6 z-10">
      <div className="max-w-4xl mx-auto text-center">
        <AnimatedCard className="relative p-12 md:p-16 overflow-hidden glass" tilt spotlight borderGlow hoverLift={false}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-white/[0.03] rounded-3xl pointer-events-none" />
          <div className="relative z-10">
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold mb-4 text-white">Build the Future of AI Infrastructure</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto mb-8">Join the decentralized AI economy. Deploy agents, provide compute, or integrate your services.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#" className="px-8 py-3.5 rounded-xl font-semibold bg-white text-black hover:bg-white/90 transition-colors duration-200 cursor-pointer">Launch App</a>
              <a href="#" className="px-8 py-3.5 rounded-xl font-semibold border border-white/20 text-white hover:bg-white/5 transition-colors duration-200 cursor-pointer">Read Documentation</a>
            </div>
          </div>
        </AnimatedCard>
      </div>
    </section>
  );
}
