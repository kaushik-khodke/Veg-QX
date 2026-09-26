"use client";

import { useEffect, useState, useRef } from "react";
import TomatoScene from "@/components/landing/TomatoScene";
import SpectralWaves from "@/components/landing/SpectralWaves";
import Link from "next/link";
import { ArrowRight, Terminal as TerminalIcon, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  const [scanProgress, setScanProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync scanProgress with the 6s scanner loop
  useEffect(() => {
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev + 4) % 104);
    }, 240); // 240ms * 25 steps = 6000ms loop
    return () => clearInterval(interval);
  }, []);

  // Scientific logs typing streaming effect
  useEffect(() => {
    const allLogs = [
      "Initializing core AS7341 spectral sensor array...",
      "Executing dynamic sensor array calibration...",
      "Capturing multispectral bands [Blue, Green, Yellow, Orange, Red, NIR]...",
      "Extracting index parameters: NDVI, GNDVI, and RVI...",
      "Running precision XGBoost classification algorithm...",
      "Regression score resolved: QUALITY_SCORE = 96.8%",
      "Classification resolved: VALUE = FRESH",
      "Model inference confidence coefficient: 99.21%",
      "Overall processing latency: 112 ms",
      "Streaming packet sequence to local SQLite DB... OK",
      "Piping live telemetry matrices through WebSockets..."
    ];

    let currentLogIndex = 0;
    
    const logInterval = setInterval(() => {
      const timestamp = new Date().toISOString().substring(11, 19);
      const text = allLogs[currentLogIndex];
      const isNotResult = !text.includes("Score") && !text.includes("Classification") && !text.includes("Confidence") && !text.includes("latency");
      const statusText = isNotResult ? " ... OK" : "";
      
      setLogs((prev) => [...prev.slice(-15), `[${timestamp}] ${text}${statusText}`]);
      
      currentLogIndex = (currentLogIndex + 1) % allLogs.length;
    }, 1100);

    return () => clearInterval(logInterval);
  }, []);

  // auto scroll to bottom of logs
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const numBlocks = Math.floor(scanProgress / 10);
  const loadingBar = "█".repeat(numBlocks) + "░".repeat(10 - numBlocks);

  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-350 font-mono select-none">
      {/* Main Mission Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Left Column (Span 2) */}
        <div className="lg:col-span-2 space-y-4">
          <TomatoScene />
          <SpectralWaves />
        </div>

        {/* Right Column (Span 1) */}
        <div className="flex flex-col gap-4">
          {/* Launch Telemetry Console Button */}
          <div className="flex justify-end">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl text-xs transition-all duration-300 shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] hover:scale-[1.02] select-none"
            >
              <span>Launch Telemetry Console</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Spacecraft Mission Status Card */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] rounded-2xl p-4 font-mono text-[10px] text-slate-600 dark:text-slate-400 flex flex-col justify-between h-[185px] shadow-sm dark:shadow-lg transition-colors duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-2 mb-1">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                Spacecraft Mission Status
              </span>
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-900/60 pb-1">
                <span>SYSTEM_READY</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">██████████ 100%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">SENSOR ARRAY</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">[ ONLINE ]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">INFERENCE ENGINE</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">[ ACTIVE ]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MODEL CONFIDENCE</span>
                <span className="text-sky-600 dark:text-sky-400 font-bold">[ 99.21% ]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DATABASE</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">[ CONNECTED ]</span>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-2 flex justify-between items-center">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                SCAN PROGRESS
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {loadingBar} {Math.min(scanProgress, 100)}%
              </span>
            </div>
          </div>

          {/* Mission Console Terminal Card */}
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070B12] rounded-2xl p-4 flex flex-col justify-between h-[360px] shadow-sm dark:shadow-lg transition-colors duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-2 mb-2 font-mono">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                Mission Console Terminal
              </span>
              <TerminalIcon size={14} className="text-sky-600 dark:text-sky-400 animate-pulse" />
            </div>

            {/* Logs Inset Window */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto font-mono text-[9.5px] bg-slate-50/90 dark:bg-[#050810]/70 border border-slate-200/90 dark:border-slate-800/80 rounded-xl p-2.5 space-y-1.5 scrollbar-thin shadow-inner"
            >
              {logs.length === 0 ? (
                <div className="text-slate-400 dark:text-slate-600 animate-pulse">[ AWAITING SENSOR TELEMETRY STREAM... ]</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="leading-relaxed">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold">{log.substring(0, 10)}</span>
                    <span className={log.includes("Classification") || log.includes("Score") || log.includes("FRESH") ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-800 dark:text-slate-200"}>
                      {log.substring(10)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-2 mt-2 font-mono text-[8px] text-slate-400 dark:text-slate-600 flex justify-between font-semibold">
              <span>SYS_T_STAMP: LIVE</span>
              <span>BUFFER_CAP: 15_LINES</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
