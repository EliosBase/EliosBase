"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  borderGlow?: boolean;
  tilt?: boolean;
  spotlight?: boolean;
  hoverLift?: boolean;
  onClick?: () => void;
}

export default function AnimatedCard({
  children,
  className = "",
  glowColor = "rgba(255,255,255,0.15)",
  borderGlow = true,
  tilt = true,
  spotlight = true,
  hoverLift = true,
  onClick,
}: AnimatedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const [borderStyle, setBorderStyle] = useState<React.CSSProperties>({});
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = tilt ? ((y - centerY) / centerY) * -6 : 0;
    const rotateY = tilt ? ((x - centerX) / centerX) * 6 : 0;

    setStyle({
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) ${hoverLift ? "translateY(-4px) scale(1.02)" : ""}`,
      transition: "transform 0.1s ease-out",
    });

    if (spotlight) {
      setSpotlightStyle({
        background: `radial-gradient(300px circle at ${x}px ${y}px, ${glowColor}, transparent 60%)`,
        opacity: 1,
      });
    }

    if (borderGlow) {
      setBorderStyle({
        background: `radial-gradient(200px circle at ${x}px ${y}px, rgba(255,255,255,0.3), transparent 60%)`,
        opacity: 1,
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setStyle({
      transform: "perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)",
      transition: "transform 0.4s ease-out",
    });
    setSpotlightStyle({ opacity: 0 });
    setBorderStyle({ opacity: 0 });
  };

  return (
    <div
      className={`group relative ${onClick ? "cursor-pointer" : ""}`}
      style={{ perspective: "800px" }}
    >
      {/* Animated gradient border */}
      {borderGlow && (
        <div
          className="absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
          style={borderStyle}
        />
      )}

      <div
        ref={ref}
        className={`relative overflow-hidden rounded-2xl ${className}`}
        style={style}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      >
        {/* Spotlight overlay */}
        {spotlight && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-10"
            style={spotlightStyle}
          />
        )}

        {/* Shimmer effect on hover */}
        <div
          className={`absolute inset-0 pointer-events-none z-10 transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"}`}
          style={{
            background:
              "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)",
            backgroundSize: "200% 100%",
            animation: isHovered ? "shimmer 2s ease-in-out infinite" : "none",
          }}
        />

        {/* Content */}
        <div className="relative z-20">{children}</div>
      </div>
    </div>
  );
}
