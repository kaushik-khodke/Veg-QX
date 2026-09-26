"use client";

import { useEffect, useState } from "react";
import { Cpu, Layers, Target, TrendingUp, ShieldCheck, Activity, Leaf, Compass } from "lucide-react";
import { api } from "@/lib/api";
import { COMMODITY_HOLOGRAM_IMAGES, FOOD_TYPES } from "@/lib/constants";

const spectralNodes = [
  { name: "BLUE", wavelength: "470 nm", color: "#2563EB", halo: "rgba(37, 99, 235, 0.4)" },
  { name: "GREEN", wavelength: "525 nm", color: "#059669", halo: "rgba(5, 150, 105, 0.4)" },
  { name: "YELLOW", wavelength: "590 nm", color: "#D97706", halo: "rgba(217, 119, 6, 0.4)" },
  { name: "ORANGE", wavelength: "610 nm", color: "#EA580C", halo: "rgba(234, 88, 12, 0.4)" },
  { name: "RED", wavelength: "660 nm", color: "#DC2626", halo: "rgba(220, 38, 38, 0.4)" },
  { name: "NIR", wavelength: "850 nm", color: "#7C3AED", halo: "rgba(124, 58, 237, 0.4)" },
];

export default function TomatoScene() {
  const [commodity, setCommodity] = useState<string>("tomato");
  const [activeModelInfo, setActiveModelInfo] = useState({
    version: "tomato_v1.1",
    accuracy: 81.23,
    r2: 0.9947,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vegqx_commodity");
      if (saved) setCommodity(saved);

      const onCommChange = (e: any) => {
        if (e.detail) setCommodity(e.detail);
      };
      window.addEventListener("commodityChanged", onCommChange);
      return () => window.removeEventListener("commodityChanged", onCommChange);
    }
  }, []);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await api.getmodelInfo(commodity);
        if (res.success && res.data) {
          setActiveModelInfo({
            version: res.data.model_version || `${commodity}_v1.0`,
            accuracy: res.data.classification_accuracy
              ? Number((res.data.classification_accuracy * 100).toFixed(2))
              : (commodity === "tomato" ? 81.23 : 92.5),
            r2: res.data.regression_r2 !== undefined && res.data.regression_r2 !== null
              ? Number(res.data.regression_r2)
              : 0.95,
          });
        }
      } catch (e) {
        // Fallback default state
        if (commodity === "tomato") {
          setActiveModelInfo({ version: "tomato_v1.1", accuracy: 81.23, r2: 0.9947 });
        } else {
          setActiveModelInfo({ version: `${commodity}_v1.0`, accuracy: 92.53, r2: 0.9380 });
        }
      }
    };
    fetchInfo();
  }, [commodity]);

  const currentFood = FOOD_TYPES.find((f) => f.value === commodity);
  const displayName = currentFood ? currentFood.label : commodity.replace("_", " ").toUpperCase();
  const hologramImgSrc = COMMODITY_HOLOGRAM_IMAGES[commodity] || "/hologram_tomato.png";

  return (
    <div className="w-full relative rounded-2xl overflow-hidden bg-white dark:bg-[#070B12] border border-slate-200 dark:border-[rgba(0,255,180,0.15)] p-6 min-h-[580px] flex flex-col justify-between shadow-sm dark:shadow-[0_0_30px_rgba(0,255,136,0.05)] font-mono text-slate-700 dark:text-slate-300 select-none transition-colors duration-200">
      {/* Dynamic Keyframes Animation Styles */}
      <style>{`
        @keyframes tomato-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(1deg); }
        }
        @keyframes ring-rotate-1 {
          0% { transform: rotateX(72deg) rotateZ(0deg); }
          100% { transform: rotateX(72deg) rotateZ(360deg); }
        }
        @keyframes ring-rotate-2 {
          0% { transform: rotateX(68deg) rotateY(25deg) rotateZ(360deg); }
          100% { transform: rotateX(68deg) rotateY(25deg) rotateZ(0deg); }
        }
        @keyframes ring-rotate-3 {
          0% { transform: rotateX(78deg) rotateY(-20deg) rotateZ(0deg); }
          100% { transform: rotateX(78deg) rotateY(-20deg) rotateZ(360deg); }
        }
        @keyframes ring-rotate-4 {
          0% { transform: rotateX(64deg) rotateY(45deg) rotateZ(0deg); }
          100% { transform: rotateX(64deg) rotateY(45deg) rotateZ(-360deg); }
        }
        @keyframes ring-rotate-5 {
          0% { transform: rotateX(80deg) rotateY(-35deg) rotateZ(0deg); }
          100% { transform: rotateX(80deg) rotateY(-35deg) rotateZ(360deg); }
        }
        @keyframes scan-line-sweep {
          0% { top: 0%; opacity: 0; }
          20% { opacity: 0.8; }
          80% { opacity: 0.8; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes particle-drift {
          0% { transform: translateY(15px) scale(0.5); opacity: 0; }
          50% { opacity: 0.9; }
          100% { transform: translateY(-45px) scale(1.1); opacity: 0; }
        }
        @keyframes node-halo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>

      {/* Header Bar */}
      <div className="flex items-center justify-between z-20 border-b border-slate-200 dark:border-[rgba(0,255,180,0.12)] pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981] animate-pulse" />
          <h2 className="text-xs font-bold text-emerald-700 dark:text-[#00FF88] uppercase tracking-[0.18em]">
            TARGET ACQUISITION: {displayName}
          </h2>
        </div>
        <span className="text-[9px] text-sky-700 dark:text-[#00E5FF] tracking-[0.15em] font-semibold">
          AI INFERENCE CORE // 6-BAND MULTISPECTRAL MATRIX
        </span>
      </div>

      {/* Technical Overlay Grid Backdrop */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.035] pointer-events-none z-0"
        style={{
          backgroundImage: `linear-gradient(to right, #059669 1px, transparent 1px),
                            linear-gradient(to bottom, #059669 1px, transparent 1px)`,
          backgroundSize: "28px 28px"
        }}
      />
      {/* Soft Radial Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.06)_0%,transparent_70%)] pointer-events-none z-0" />

      {/* Main Center Stage */}
      <div className="relative flex-1 flex items-center justify-center my-4 z-10">

        {/* ─── LEFT SIDE CARDS ─────────────────────────────────────────────────── */}

        {/* 1. MODEL CARD */}
        <div className="absolute top-2 left-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 dark:hover:border-[rgba(0,255,180,0.4)] transition-all">
          <div className="flex items-center gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <Cpu size={14} />
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">MODEL</span>
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">XGBoost</div>
          <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block mt-0.5">Regression + Classification</span>
        </div>

        {/* 2. VERSION CARD */}
        <div className="absolute top-36 left-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 dark:hover:border-[rgba(0,255,180,0.4)] transition-all">
          <div className="flex items-center gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <Layers size={14} />
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">VERSION</span>
          </div>
          <div 
            className={`font-bold text-emerald-600 dark:text-[#00FF88] truncate ${
              activeModelInfo.version.length > 15
                ? "text-[12px] sm:text-[13px] tracking-tight py-0.5"
                : activeModelInfo.version.length > 12
                ? "text-sm sm:text-base tracking-tight"
                : "text-lg tracking-wide"
            }`}
            title={activeModelInfo.version}
          >
            {activeModelInfo.version}
          </div>
          <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block mt-0.5">Current Active Model</span>
        </div>

        {/* 3. FRESHNESS SCORE CARD (BOTTOM LEFT) */}
        <div className="absolute bottom-2 left-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 transition-all">
          <div className="flex items-center gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <Leaf size={14} />
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">FRESHNESS SCORE</span>
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">
            98.42 <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/100</span>
          </div>
          {/* Green Progress Bar */}
          <div className="w-full bg-slate-200/80 dark:bg-[#070B12] h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200 dark:border-[rgba(0,255,180,0.12)]">
            <div className="bg-emerald-500 dark:bg-[#00FF88] h-full rounded-full w-[98.42%] shadow-[0_0_8px_#10B981]" />
          </div>
        </div>

        {/* ─── RIGHT SIDE CARDS ────────────────────────────────────────────────── */}

        {/* 4. ACCURACY CARD */}
        <div className="absolute top-2 right-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 transition-all text-right">
          <div className="flex items-center justify-end gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">ACCURACY</span>
            <Target size={14} />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-[#00FF88] tracking-wide">{activeModelInfo.accuracy}%</div>
          <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block mt-0.5">Classification Accuracy</span>
        </div>

        {/* 5. R² SCORE CARD */}
        <div className="absolute top-36 right-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 transition-all text-right">
          <div className="flex items-center justify-end gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">R² SCORE</span>
            <TrendingUp size={14} />
          </div>
          <div className="text-lg font-bold text-sky-600 dark:text-[#00E5FF] tracking-wide">{activeModelInfo.r2.toFixed(4)}</div>
          <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block mt-0.5">Regression R²</span>
        </div>

        {/* 6. CATEGORY CARD (BOTTOM RIGHT) */}
        <div className="absolute bottom-2 right-2 z-20 bg-slate-50/90 dark:bg-[rgba(15,20,30,0.65)] border border-slate-200/90 dark:border-[rgba(0,255,180,0.15)] rounded-xl p-3.5 w-48 backdrop-blur-md shadow-xs dark:shadow-lg hover:border-emerald-400 transition-all text-right">
          <div className="flex items-center justify-end gap-1.5 mb-1 text-emerald-600 dark:text-[#00FF88]">
            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">CATEGORY</span>
            <Compass size={14} />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-[#22FF88] tracking-wide">FRESH</div>
          <span className="text-[8.5px] text-slate-500 dark:text-slate-400 block mt-0.5">Premium Quality</span>
        </div>

        {/* ─── CENTERSTAGE: 3D PHOTOREALISTIC HOLOGRAPHIC SPECIMEN & PLATFORM ────────── */}
        <div className="relative w-[340px] h-[340px] flex items-center justify-center pointer-events-none">

          {/* Volumetric Light Cone */}
          <div 
            className="absolute bottom-10 w-[210px] h-[190px] z-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(to top, rgba(16, 185, 129, 0.22) 0%, rgba(2, 132, 199, 0.04) 65%, transparent 100%)",
              clipPath: "polygon(22% 100%, 78% 100%, 100% 0%, 0% 0%)",
            }}
          />

          {/* Holographic Concentric Pedestal Platform */}
          <div className="absolute bottom-12 w-[185px] h-[42px] rounded-full z-0 flex items-center justify-center">
            <div className="w-[185px] h-[42px] rounded-full border-2 border-emerald-400/40 dark:border-[rgba(0,255,180,0.4)] bg-emerald-50/70 dark:bg-[#0D1320]/90 shadow-[0_0_20px_rgba(16,185,129,0.25)] dark:shadow-[0_0_25px_rgba(0,255,180,0.35)]" />
            <div className="absolute w-[130px] h-[28px] rounded-full border border-emerald-500 dark:border-[#00FF88] bg-emerald-500/15 dark:bg-[rgba(0,255,180,0.18)] shadow-[0_0_15px_#10B981]" />
            <div className="absolute w-[65px] h-[14px] rounded-full bg-emerald-500 dark:bg-[#00FF88] shadow-[0_0_12px_#10B981] animate-pulse" />
          </div>

          {/* 5 Rotating Holographic Transparent Cyan Rings Around Specimen */}
          <div className="absolute w-[270px] h-[270px] border border-dashed border-sky-400/40 dark:border-[rgba(0,229,255,0.35)] rounded-full animate-[ring-rotate-1_11s_linear_infinite]" />
          <div className="absolute w-[250px] h-[250px] border border-dotted border-emerald-400/35 dark:border-[rgba(0,255,180,0.3)] rounded-full animate-[ring-rotate-2_15s_linear_infinite]" />
          <div className="absolute w-[230px] h-[230px] border border-sky-400/30 dark:border-[rgba(0,229,255,0.22)] rounded-full animate-[ring-rotate-3_19s_linear_infinite]" />
          <div className="absolute w-[210px] h-[210px] border border-dashed border-emerald-400/30 dark:border-[rgba(0,255,180,0.25)] rounded-full animate-[ring-rotate-4_13s_linear_infinite]" />
          <div className="absolute w-[190px] h-[190px] border border-sky-400/35 dark:border-[rgba(0,229,255,0.28)] rounded-full animate-[ring-rotate-5_22s_linear_infinite]" />

          {/* Particle Field Drifting Upward */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#00FF88] shadow-[0_0_6px_#10B981]"
              style={{
                left: `${25 + (i * 9)}%`,
                bottom: `${18 + (i * 5)}%`,
                animation: `particle-drift ${2.8 + (i * 0.7)}s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}

          {/* Photorealistic Specimen Floating ~30px Above Platform */}
          <div className="relative z-10 flex items-center justify-center animate-[tomato-float_5.5s_ease-in-out_infinite] mb-8">
            <img
              key={hologramImgSrc}
              src={hologramImgSrc}
              alt={`${displayName} Hologram`}
              className="w-48 h-48 object-contain filter drop-shadow-[0_20px_35px_rgba(16,185,129,0.35)] transition-all duration-500"
            />

            {/* Faint Scanner Line Sweep */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-full">
              <div className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500 dark:via-[#00FF88] to-transparent shadow-[0_0_10px_#10B981] absolute animate-[scan-line-sweep_3.8s_easeInOut_infinite]" />
            </div>
          </div>
        </div>

        {/* ─── BOTTOM CENTER: STATUS & CONFIDENCE CARDS ───────────────────────── */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
          {/* STATUS CARD */}
          <div className="bg-slate-50/95 dark:bg-[rgba(15,20,30,0.7)] border border-emerald-500/30 dark:border-[rgba(0,255,180,0.25)] rounded-xl px-4 py-1.5 text-center backdrop-blur-md shadow-xs min-w-[130px]">
            <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-[#00FF88] mb-0.5">
              <ShieldCheck size={12} />
              <span className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">STATUS</span>
            </div>
            <div className="text-xs font-bold text-emerald-700 dark:text-[#00FF88] tracking-wider">READY</div>
            <span className="text-[7.5px] text-slate-500 dark:text-slate-400 block">System Operational</span>
          </div>

          {/* CONFIDENCE CARD */}
          <div className="bg-slate-50/95 dark:bg-[rgba(15,20,30,0.7)] border border-sky-500/30 dark:border-[rgba(0,255,180,0.15)] rounded-xl px-4 py-1 text-center backdrop-blur-md shadow-xs min-w-[130px]">
            <div className="flex items-center justify-center gap-1 text-sky-600 dark:text-[#00E5FF] mb-0.5">
              <Activity size={11} />
              <span className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">CONFIDENCE</span>
            </div>
            <div className="text-[11px] font-bold text-sky-700 dark:text-[#00E5FF] tracking-wider">98.7%</div>
            <span className="text-[7px] text-slate-500 dark:text-slate-400 block">Overall Confidence</span>
          </div>
        </div>

      </div>

      {/* ─── SPECTRAL SENSOR INDICATORS (6 GLOWING NODES ON THIN NEON ARC) ───────── */}
      <div className="z-20 pt-2 border-t border-slate-200 dark:border-[rgba(0,255,180,0.12)]">
        <div className="flex items-center justify-between px-3">
          {spectralNodes.map((node) => (
            <div key={node.name} className="flex flex-col items-center gap-1 group cursor-pointer">
              {/* Glowing Circle Node */}
              <div 
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 animate-[node-halo-pulse_3s_ease-in-out_infinite]"
                style={{
                  borderColor: node.color,
                  backgroundColor: `${node.color}22`,
                  boxShadow: `0 0 10px ${node.halo}`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: node.color }} />
              </div>

              {/* Node Label & Wavelength */}
              <div className="text-center">
                <span className="text-[9px] font-bold block tracking-wider" style={{ color: node.color }}>
                  {node.name}
                </span>
                <span className="text-[8px] text-slate-500 dark:text-slate-400 block font-mono">
                  {node.wavelength}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
