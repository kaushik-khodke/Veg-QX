"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";

const spectralBands = [
  { name: "BLUE", wavelength: "450nm", color: "#3B82F6", lightColor: "#2563EB", freq: 0.009, amp: 32, phase: 0.0, speed: 0.12, depth: 0.75, offsetRatio: -0.08 },
  { name: "GREEN", wavelength: "530nm", color: "#10B981", lightColor: "#059669", freq: 0.011, amp: 28, phase: 1.05, speed: 0.10, depth: 1.10, offsetRatio: -0.03 },
  { name: "YELLOW", wavelength: "590nm", color: "#EAB308", lightColor: "#B45309", freq: 0.008, amp: 24, phase: 2.10, speed: 0.08, depth: 0.85, offsetRatio: 0.03 },
  { name: "ORANGE", wavelength: "630nm", color: "#F97316", lightColor: "#C2410C", freq: 0.012, amp: 30, phase: 3.14, speed: 0.14, depth: 1.25, offsetRatio: 0.08 },
  { name: "RED", wavelength: "670nm", color: "#EF4444", lightColor: "#DC2626", freq: 0.009, amp: 26, phase: 4.18, speed: 0.09, depth: 0.95, offsetRatio: 0.10 },
  { name: "NIR", wavelength: "850nm", color: "#B56EFF", lightColor: "#7C3AED", freq: 0.011, amp: 34, phase: 5.23, speed: 0.15, depth: 1.35, offsetRatio: -0.05 },
];

export default function SpectralWaves() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Viewport observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.01 }
    );

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // 60 FPS 3D Orbital Flow Animation Loop
  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.08; // Active visible fluid motion
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // ─── 1. Background Grid & Axis Lines ─────────────────────────────────
      ctx.strokeStyle = isDark ? "rgba(0, 255, 180, 0.08)" : "rgba(15, 23, 42, 0.07)";
      ctx.lineWidth = 1;

      const gridSpacingX = width / 14;
      for (let x = 0; x <= width; x += gridSpacingX) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const gridSpacingY = height / 6;
      for (let y = 0; y <= height; y += gridSpacingY) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.setLineDash([]); // Reset line dash

      // Baseline center axis
      ctx.strokeStyle = isDark ? "rgba(0, 229, 255, 0.25)" : "rgba(16, 185, 129, 0.25)";
      ctx.beginPath();
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
      ctx.stroke();

      // ─── 2. Sort Bands dynamically for 3D Z-Depth Occlusion ───────────────
      const sortedBands = [...spectralBands].map((band) => {
        const orbitalZ = Math.sin(time * band.speed + band.phase);
        const dynamicDepth = band.depth + orbitalZ * 0.3; // Z-axis parallax rotation
        return { ...band, dynamicDepth, orbitalZ };
      }).sort((a, b) => a.dynamicDepth - b.dynamicDepth);

      // ─── 3. Render Broad, Smooth 3D Orbital Spline Wave Curves ─────────
      sortedBands.forEach((band) => {
        ctx.save();

        // Parallax depth calculations
        const depthScale = Math.max(0.5, Math.min(1.4, band.dynamicDepth));
        const alpha = isDark ? 0.55 + (depthScale - 0.5) * 0.4 : 0.75 + (depthScale - 0.5) * 0.25;
        const lineWidth = (isDark ? 1.8 : 2.2) * depthScale;
        const shadowBlur = isDark ? Math.round(7 * depthScale) : Math.round(3 * depthScale);
        const activeColor = isDark ? band.color : band.lightColor;

        ctx.strokeStyle = activeColor;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = shadowBlur;

        ctx.beginPath();

        // Dynamic 3D Y-center motion & vertical baseline spread
        const centerY = height * (0.5 + band.offsetRatio * 0.25 * Math.cos(time * 0.012 + band.phase));
        const dynamicAmp = band.amp * (0.82 + depthScale * 0.22);

        let prevX = 0;
        let prevY = centerY + Math.sin(time * band.speed + band.phase) * dynamicAmp;

        ctx.moveTo(prevX, prevY);

        const step = 4;
        for (let x = step; x <= width; x += step) {
          // Broad wavelength formula with long spatial period + subtle secondary harmonic
          const wavePhase = x * band.freq + time * band.speed + band.phase;
          const harmonic = Math.cos(x * 0.003 - time * 0.015 + band.phase * 0.5) * (8 * depthScale);
          const y = centerY + Math.sin(wavePhase) * dynamicAmp + harmonic;

          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;

          ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);

          prevX = x;
          prevY = y;
        }

        ctx.lineTo(width, prevY);
        ctx.stroke();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible, isDark]);

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-[#070B12] border border-slate-200 dark:border-[rgba(0,255,180,0.15)] rounded-2xl p-5 shadow-sm dark:shadow-[0_0_30px_rgba(0,255,136,0.05)] relative overflow-hidden flex flex-col justify-between select-none font-mono min-h-[265px] transition-colors duration-200"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[rgba(0,255,180,0.12)] pb-3 mb-2 z-10">
        <div>
          <h3 className="text-xs font-bold text-emerald-700 dark:text-[#00FF88] uppercase tracking-[0.15em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-[#00E5FF] animate-pulse" />
            SPECTRAL REFLECTANCE TELEMETRY: SPECTRALWAVES
          </h3>
        </div>
        <span className="text-[9px] text-sky-700 dark:text-[#00E5FF] tracking-[0.12em] uppercase font-semibold">
          3D ORBITAL FLOW ANALYZER // 60 FPS LIVE
        </span>
      </div>

      {/* Canvas Oscilloscope Display */}
      <div className="relative w-full h-[150px] rounded-xl overflow-hidden bg-slate-50/90 dark:bg-[#050810] border border-slate-200 dark:border-[rgba(0,255,180,0.12)] shadow-inner flex items-center justify-center transition-colors duration-200">
        <canvas
          ref={canvasRef}
          width={800}
          height={150}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Bottom Wavelength Labels Legend Row */}
      <div className="grid grid-cols-6 gap-2 pt-3 border-t border-slate-200 dark:border-[rgba(0,255,180,0.12)] text-center z-10">
        {spectralBands.map((band) => (
          <div key={band.name} className="flex flex-col items-center">
            <span 
              className="text-[10px] font-bold tracking-widest font-mono transition-colors" 
              style={{ color: isDark ? band.color : band.lightColor }}
            >
              {band.name}
            </span>
            <span className="text-[9px] text-slate-500 dark:text-slate-400 tracking-wider block font-mono mt-0.5">
              {band.wavelength}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
