"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  className?: string;
  color?: string;
  trailOpacity?: number;
  particleCount?: number;
  speed?: number;
}

interface PointerState {
  x: number;
  y: number;
}

interface FlowFieldState {
  mouse: PointerState;
  size: {
    width: number;
    height: number;
  };
  speed: number;
}

class Particle {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;
  life = 0;

  constructor(private readonly field: FlowFieldState) {
    this.reset();
  }

  update() {
    const angle =
      (Math.cos(this.x * 0.005) + Math.sin(this.y * 0.005)) * Math.PI;

    this.vx += Math.cos(angle) * 0.2 * this.field.speed;
    this.vy += Math.sin(angle) * 0.2 * this.field.speed;

    const dx = this.field.mouse.x - this.x;
    const dy = this.field.mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const interactionRadius = 150;

    if (distance < interactionRadius) {
      const force = (interactionRadius - distance) / interactionRadius;
      this.vx -= dx * force * 0.05;
      this.vy -= dy * force * 0.05;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;

    this.age++;
    if (this.age > this.life) {
      this.reset();
    }

    if (this.x < 0) this.x = this.field.size.width;
    if (this.x > this.field.size.width) this.x = 0;
    if (this.y < 0) this.y = this.field.size.height;
    if (this.y > this.field.size.height) this.y = 0;
  }

  reset() {
    this.x = Math.random() * this.field.size.width;
    this.y = Math.random() * this.field.size.height;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.life = Math.random() * 200 + 100;
  }

  draw(context: CanvasRenderingContext2D, color: string) {
    context.fillStyle = color;
    const alpha = 1 - Math.abs(this.age / this.life - 0.5) * 2;
    context.globalAlpha = alpha;
    context.fillRect(this.x, this.y, 1.5, 1.5);
  }
}

export default function NeuralBackground({
  className,
  color = "#ffffff",
  trailOpacity = 0.1,
  particleCount = 600,
  speed = 1,
}: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    const size = {
      width: container.clientWidth,
      height: container.clientHeight,
    };
    const mouse = { x: -1000, y: -1000 };
    const field = { mouse, size, speed };
    let particles: Particle[] = [];
    let animationFrameId: number;

    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(field));
      }
    };

    const animate = () => {
      ctx.fillStyle = `rgba(0, 0, 0, ${trailOpacity})`;
      ctx.fillRect(0, 0, size.width, size.height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw(ctx, color);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      size.width = container.clientWidth;
      size.height = container.clientHeight;
      init();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    init();
    animate();

    window.addEventListener("resize", handleResize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color, trailOpacity, particleCount, speed]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full bg-black overflow-hidden", className)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
