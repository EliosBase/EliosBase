"use client";

import { useEffect, useRef, useState } from "react";
import AnimatedCard from "./AnimatedCard";

const stats = [
  { value: "30+", label: "Technologies Integrated" },
  { value: "150+", label: "Blockchains Connected" },
  { value: "$0.0001", label: "Transaction Cost" },
  { value: "124M+", label: "ZK Proofs Generated" },
  { value: "$100B+", label: "Assets Secured (Safe)" },
  { value: "50+", label: "Enterprise Partners" },
];

export default function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-24 px-6 z-10" ref={ref}>
      <div className="max-w-7xl mx-auto">
        <AnimatedCard className="glass p-8 md:p-12" tilt={false} spotlight borderGlow hoverLift={false}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-xs text-white/40 uppercase tracking-wider leading-tight">{stat.label}</div>
              </div>
            ))}
          </div>
        </AnimatedCard>
      </div>
    </section>
  );
}
