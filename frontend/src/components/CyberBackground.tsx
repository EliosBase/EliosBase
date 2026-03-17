"use client";

import { useEffect, useRef } from "react";

export default function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx = maybeCtx;

    let animationId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let mouse = { x: -1000, y: -1000 };
    let time = 0;

    canvas.width = width;
    canvas.height = height;

    // ─── NODES (network topology) ───
    interface Node {
      x: number;
      y: number;
      ox: number;
      oy: number;
      vx: number;
      vy: number;
      radius: number;
      phase: number;
      speed: number;
      type: "normal" | "hub" | "sentinel";
    }

    const nodeCount = Math.min(Math.floor((width * height) / 18000), 120);
    const nodes: Node[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const isHub = Math.random() < 0.08;
      const isSentinel = !isHub && Math.random() < 0.05;
      nodes.push({
        x,
        y,
        ox: x,
        oy: y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: isHub ? 2.5 : isSentinel ? 2 : Math.random() * 1.2 + 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.005,
        type: isHub ? "hub" : isSentinel ? "sentinel" : "normal",
      });
    }

    // ─── DATA PACKETS ───
    interface Packet {
      fromIdx: number;
      toIdx: number;
      progress: number;
      speed: number;
      size: number;
    }

    const packets: Packet[] = [];

    function spawnPacket() {
      if (packets.length > 15) return;
      const from = Math.floor(Math.random() * nodes.length);
      let to = Math.floor(Math.random() * nodes.length);
      if (to === from) to = (to + 1) % nodes.length;
      const dx = nodes[to].x - nodes[from].x;
      const dy = nodes[to].y - nodes[from].y;
      if (Math.sqrt(dx * dx + dy * dy) > 250) return;
      packets.push({
        fromIdx: from,
        toIdx: to,
        progress: 0,
        speed: Math.random() * 0.012 + 0.004,
        size: Math.random() * 1.5 + 1,
      });
    }

    // ─── RADAR SWEEPS ───
    interface Radar {
      x: number;
      y: number;
      angle: number;
      rotSpeed: number;
      radius: number;
      opacity: number;
    }

    const radars: Radar[] = [];
    for (let i = 0; i < 3; i++) {
      radars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() * 0.005 + 0.003) * (Math.random() > 0.5 ? 1 : -1),
        radius: Math.random() * 120 + 80,
        opacity: Math.random() * 0.03 + 0.02,
      });
    }

    // ─── PULSE RINGS (threat detections) ───
    interface Pulse {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      opacity: number;
    }

    const pulses: Pulse[] = [];

    function spawnPulse() {
      if (pulses.length > 5) return;
      const node = nodes[Math.floor(Math.random() * nodes.length)];
      pulses.push({
        x: node.x,
        y: node.y,
        radius: 0,
        maxRadius: Math.random() * 80 + 40,
        opacity: 0.15,
      });
    }

    // ─── HEX GRID ───
    const hexSize = 40;
    const hexCols = Math.ceil(width / (hexSize * 1.75)) + 2;
    const hexRows = Math.ceil(height / (hexSize * 1.5)) + 2;

    function drawHex(cx: number, cy: number, size: number, opacity: number) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + size * Math.cos(angle);
        const hy = cy + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ─── FLOATING CODE FRAGMENTS ───
    interface CodeFragment {
      x: number;
      y: number;
      text: string;
      opacity: number;
      vy: number;
      life: number;
      maxLife: number;
    }

    const codeFragments: CodeFragment[] = [];
    const codeStrings = [
      "0x7f3a..e2b1",
      "VERIFY_ZK",
      "AUTH_OK",
      "ENCRYPT",
      "SHA-256",
      "ECDSA",
      "PROOF_VALID",
      "NODE_SYNC",
      "BLOCK#4721",
      "TLS_1.3",
      "AES-256",
      "SCAN...",
      "MONITOR",
      "SECURE",
      "LATTICE",
      "DILITHIUM",
      "KEY_EXCHANGE",
      "FIREWALL",
      "QUARANTINE",
      "TRUST_SCORE",
    ];

    function spawnCodeFragment() {
      if (codeFragments.length > 12) return;
      codeFragments.push({
        x: Math.random() * width,
        y: height + 20,
        text: codeStrings[Math.floor(Math.random() * codeStrings.length)],
        opacity: Math.random() * 0.06 + 0.02,
        vy: -(Math.random() * 0.3 + 0.15),
        life: 0,
        maxLife: Math.random() * 600 + 400,
      });
    }

    // ─── CIRCUIT TRACES ───
    interface CircuitTrace {
      points: { x: number; y: number }[];
      progress: number;
      speed: number;
      opacity: number;
    }

    const circuits: CircuitTrace[] = [];

    function spawnCircuit() {
      if (circuits.length > 4) return;
      const startX = Math.random() * width;
      const startY = Math.random() * height;
      const points = [{ x: startX, y: startY }];
      let cx = startX;
      let cy = startY;
      const segCount = Math.floor(Math.random() * 6) + 3;

      for (let s = 0; s < segCount; s++) {
        const horizontal = Math.random() > 0.5;
        const len = Math.random() * 100 + 30;
        const dir = Math.random() > 0.5 ? 1 : -1;
        if (horizontal) cx += len * dir;
        else cy += len * dir;
        points.push({ x: cx, y: cy });
      }

      circuits.push({
        points,
        progress: 0,
        speed: Math.random() * 0.005 + 0.003,
        opacity: Math.random() * 0.06 + 0.03,
      });
    }

    // ─── MAIN DRAW ───
    function draw() {
      time++;
      ctx.clearRect(0, 0, width, height);

      // 1) Hex grid (very subtle, pulsing)
      for (let row = 0; row < hexRows; row++) {
        for (let col = 0; col < hexCols; col++) {
          const cx = col * hexSize * 1.75;
          const cy = row * hexSize * 1.5 + (col % 2 === 0 ? 0 : hexSize * 0.75);
          const dist = Math.sqrt(
            (cx - width / 2) ** 2 + (cy - height / 2) ** 2
          );
          const wave = Math.sin(dist * 0.005 - time * 0.01) * 0.5 + 0.5;
          const opacity = 0.012 + wave * 0.012;
          drawHex(cx, cy, hexSize * 0.5, opacity);
        }
      }

      // 2) Circuit traces
      for (let i = circuits.length - 1; i >= 0; i--) {
        const c = circuits[i];
        c.progress += c.speed;
        if (c.progress > 1.3) {
          circuits.splice(i, 1);
          continue;
        }

        const totalSegments = c.points.length - 1;
        const drawUpTo = c.progress * totalSegments;

        ctx.beginPath();
        ctx.moveTo(c.points[0].x, c.points[0].y);

        for (let s = 0; s < totalSegments; s++) {
          if (s >= drawUpTo) break;
          const frac = Math.min(1, drawUpTo - s);
          const nx =
            c.points[s].x + (c.points[s + 1].x - c.points[s].x) * frac;
          const ny =
            c.points[s].y + (c.points[s + 1].y - c.points[s].y) * frac;
          ctx.lineTo(nx, ny);
        }

        const fadeOut = c.progress > 1 ? 1 - (c.progress - 1) / 0.3 : 1;
        ctx.strokeStyle = `rgba(255,255,255,${c.opacity * fadeOut})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Bright head
        if (c.progress <= 1) {
          const headSeg = Math.min(
            Math.floor(drawUpTo),
            totalSegments - 1
          );
          const headFrac = drawUpTo - headSeg;
          const hx =
            c.points[headSeg].x +
            (c.points[headSeg + 1].x - c.points[headSeg].x) * headFrac;
          const hy =
            c.points[headSeg].y +
            (c.points[headSeg + 1].y - c.points[headSeg].y) * headFrac;
          ctx.beginPath();
          ctx.arc(hx, hy, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.3 * fadeOut})`;
          ctx.fill();
        }
      }

      // 3) Radar sweeps
      for (const radar of radars) {
        radar.angle += radar.rotSpeed;

        // Sweep line
        const endX = radar.x + Math.cos(radar.angle) * radar.radius;
        const endY = radar.y + Math.sin(radar.angle) * radar.radius;

        ctx.beginPath();
        ctx.moveTo(radar.x, radar.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = `rgba(255,255,255,${radar.opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Sweep fade trail (arc)
        for (let t = 1; t <= 20; t++) {
          const trailAngle = radar.angle - radar.rotSpeed * t * 8;
          const tx = radar.x + Math.cos(trailAngle) * radar.radius;
          const ty = radar.y + Math.sin(trailAngle) * radar.radius;
          ctx.beginPath();
          ctx.moveTo(radar.x, radar.y);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = `rgba(255,255,255,${radar.opacity * (1 - t / 20) * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Radar ring
        ctx.beginPath();
        ctx.arc(radar.x, radar.y, radar.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${radar.opacity * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Inner rings
        ctx.beginPath();
        ctx.arc(radar.x, radar.y, radar.radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${radar.opacity * 0.3})`;
        ctx.stroke();
      }

      // 4) Node connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist =
            nodes[i].type === "hub" || nodes[j].type === "hub" ? 200 : 130;

          if (dist < maxDist) {
            const opacity = (1 - dist / maxDist) * 0.07;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // 5) Update & draw nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.phase += node.speed;

        // Bounce
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        // Mouse repel
        const mdx = node.x - mouse.x;
        const mdy = node.y - mouse.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < 120) {
          const force = (120 - mDist) / 120;
          node.vx += (mdx / mDist) * force * 0.3;
          node.vy += (mdy / mDist) * force * 0.3;
        }

        // Damping
        node.vx *= 0.998;
        node.vy *= 0.998;

        const pulseAlpha = 0.15 + Math.sin(node.phase) * 0.1;

        if (node.type === "hub") {
          // Hub: brighter with outer ring
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${pulseAlpha + 0.15})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${pulseAlpha * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else if (node.type === "sentinel") {
          // Sentinel: diamond shape
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = `rgba(255,255,255,${pulseAlpha + 0.05})`;
          ctx.fillRect(
            -node.radius,
            -node.radius,
            node.radius * 2,
            node.radius * 2
          );
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${pulseAlpha})`;
          ctx.fill();
        }
      }

      // 6) Data packets with trails
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.progress += p.speed;
        if (p.progress >= 1) {
          packets.splice(i, 1);
          continue;
        }

        const from = nodes[p.fromIdx];
        const to = nodes[p.toIdx];
        const x = from.x + (to.x - from.x) * p.progress;
        const y = from.y + (to.y - from.y) * p.progress;

        // Glow
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 8);
        grad.addColorStop(0, "rgba(255,255,255,0.3)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - 8, y - 8, 16, 16);

        // Core
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();

        // Trail
        for (let t = 1; t <= 5; t++) {
          const tp = Math.max(0, p.progress - t * 0.02);
          const tx = from.x + (to.x - from.x) * tp;
          const ty = from.y + (to.y - from.y) * tp;
          ctx.beginPath();
          ctx.arc(tx, ty, p.size * (1 - t / 6), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.2 * (1 - t / 6)})`;
          ctx.fill();
        }
      }

      // 7) Pulse rings
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.radius += 0.8;
        p.opacity = 0.15 * (1 - p.radius / p.maxRadius);

        if (p.radius >= p.maxRadius) {
          pulses.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 8) Floating code fragments
      ctx.font = "11px 'JetBrains Mono', monospace";
      for (let i = codeFragments.length - 1; i >= 0; i--) {
        const f = codeFragments[i];
        f.y += f.vy;
        f.life++;

        const fadeIn = Math.min(1, f.life / 60);
        const fadeOut = f.life > f.maxLife - 60 ? (f.maxLife - f.life) / 60 : 1;
        const alpha = f.opacity * fadeIn * fadeOut;

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(f.text, f.x, f.y);

        if (f.life >= f.maxLife) {
          codeFragments.splice(i, 1);
        }
      }

      // 9) Scan line
      const scanY = (time * 0.5) % (height + 40) - 20;
      const scanGrad = ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15);
      scanGrad.addColorStop(0, "rgba(255,255,255,0)");
      scanGrad.addColorStop(0.5, "rgba(255,255,255,0.02)");
      scanGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 15, width, 30);

      // Spawn things
      if (time % 3 === 0) spawnPacket();
      if (time % 80 === 0) spawnPulse();
      if (time % 50 === 0) spawnCodeFragment();
      if (time % 200 === 0) spawnCircuit();

      animationId = requestAnimationFrame(draw);
    }

    draw();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const handleMouse = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouse, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}
