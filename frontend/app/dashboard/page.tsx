"use client";

import { useEffect, useState, useRef } from "react";
import USBStatusPanel from "@/components/sensor/USBStatusPanel";
import SensorCard from "@/components/sensor/SensorCard";
import SpectralChart from "@/components/sensor/SpectralChart";
import IndexDisplay from "@/components/prediction/IndexDisplay";
import FreshnessGauge from "@/components/prediction/FreshnessGauge";
import CategoryCard from "@/components/prediction/CategoryCard";
import ConfidenceBar from "@/components/prediction/ConfidenceBar";
import { WS_BASE_URL } from "@/lib/constants";
import { SENSOR_BAND_COLORS } from "@/lib/constants";

interface SensorAccumulator {
  sum: number;
  min: number;
  max: number;
  count: number;
}

const initialAccumulator = () => ({
  sum: 0,
  min: Infinity,
  max: -Infinity,
  count: 0,
});

export default function LiveDashboard() {
  const [mounted, setMounted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [latestReading, setLatestReading] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [commodity, setCommodity] = useState<string>("tomato");

  useEffect(() => {
    setMounted(true);
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
  
  // Historical stats accumulators for Module 3 (Min, Max, Avg, Current)
  const [accumulators, setAccumulators] = useState<Record<string, SensorAccumulator>>({
    Blue: initialAccumulator(),
    Green: initialAccumulator(),
    Yellow: initialAccumulator(),
    Orange: initialAccumulator(),
    Red: initialAccumulator(),
    NIR: initialAccumulator(),
  });

  const wsRef = useRef<WebSocket | null>(null);

  // Set up resilient WebSocket connection when USB link state changes
  useEffect(() => {
    let reconnectTimer: any = null;
    let isCancelled = false;

    const connectWS = () => {
      if (!isConnected || isCancelled) return;

      const wsUrl = `${WS_BASE_URL}/live_sensor_data?commodity=${encodeURIComponent(commodity)}`;
      console.log("[Dashboard] Connecting WebSocket to", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Dashboard] WebSocket connected successfully.");
      };

      ws.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.status === "reading" && payload.data) {
            const raw = payload.data;
            console.log("[FRONTEND STATE UPDATE]", raw);
            setLatestReading(raw);

            // 1. Update stats accumulators dynamically
            setAccumulators((prev) => {
              const updated = { ...prev };
              Object.keys(updated).forEach((band) => {
                const val = getBandVal(raw, band);
                if (val !== undefined && typeof val === "number" && !isNaN(val) && val > 0) {
                  const acc = { ...updated[band] };
                  acc.sum += val;
                  acc.count += 1;
                  if (val < acc.min) acc.min = val;
                  if (val > acc.max) acc.max = val;
                  updated[band] = acc;
                }
              });
              return updated;
            });

            // 2. Set prediction state directly from WebSocket payload
            setPrediction(raw);
          }
        } catch (err) {
          console.error("[Dashboard] WebSocket message parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("[Dashboard] WebSocket connection closed.");
        if (isConnected && !isCancelled) {
          reconnectTimer = setTimeout(connectWS, 3000);
        }
      };

      ws.onerror = (e) => {
        console.error("[Dashboard] WebSocket error:", e);
      };
    };

    if (isConnected) {
      connectWS();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isConnected, commodity]);

  // Helper to extract band value with case-insensitivity
  const getBandVal = (obj: any, bandName: string): number => {
    if (!obj) return 0;
    const val = obj[bandName] ?? obj[bandName.toLowerCase()] ?? obj[bandName.toUpperCase()] ?? 0;
    return typeof val === "number" ? val : parseFloat(val) || 0;
  };

  // Formulate data structure for Recharts
  const chartData = [
    { name: "Blue", value: getBandVal(latestReading, "Blue"), color: SENSOR_BAND_COLORS.Blue },
    { name: "Green", value: getBandVal(latestReading, "Green"), color: SENSOR_BAND_COLORS.Green },
    { name: "Yellow", value: getBandVal(latestReading, "Yellow"), color: SENSOR_BAND_COLORS.Yellow },
    { name: "Orange", value: getBandVal(latestReading, "Orange"), color: SENSOR_BAND_COLORS.Orange },
    { name: "Red", value: getBandVal(latestReading, "Red"), color: SENSOR_BAND_COLORS.Red },
    { name: "NIR", value: getBandVal(latestReading, "NIR"), color: SENSOR_BAND_COLORS.NIR },
  ];

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-xs text-slate-500">Initializing Live Diagnostics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-3">
          <img src="/voyage_robotics_logo.png" alt="Voyage Robotics Logo" width={28} height={28} className="w-7 h-7 object-contain filter drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]" />
          <span>Live Hardware Diagnostics</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Monitor real-time spectral wave readings from AS7341 on auto-detected USB COM port, verify calculations, and display predictive diagnostics.
        </p>
      </div>

      {/* USB Connection Panel */}
      <USBStatusPanel onStatusChange={setIsConnected} />

      {/* Main Grid: Live Cards + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {/* Left Side: 6 Spectral Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(accumulators).map((band) => {
            const acc = accumulators[band];
            const current = getBandVal(latestReading, band);
            const average = acc.count > 0 ? acc.sum / acc.count : current;
            const minVal = acc.min === Infinity ? current : acc.min;
            const maxVal = acc.max === -Infinity ? current : acc.max;

            return (
              <SensorCard
                key={band}
                name={band}
                value={current}
                min={minVal}
                max={maxVal}
                avg={average}
                color={SENSOR_BAND_COLORS[band as keyof typeof SENSOR_BAND_COLORS]}
              />
            );
          })}
        </div>

        {/* Right Side: Chart Visualizer */}
        <div className="lg:col-span-1 flex flex-col">
          <SpectralChart data={chartData} />
        </div>
      </div>

      {/* Index Display (Module 4) */}
      <IndexDisplay
        ndvi={prediction?.NDVI ?? prediction?.ndvi ?? 0}
        gndvi={prediction?.GNDVI ?? prediction?.gndvi ?? 0}
        rvi={prediction?.RVI ?? prediction?.rvi ?? 0}
      />

      {/* Prediction Output Panel (Module 5) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 flex flex-col justify-between shadow-sm dark:shadow-md">
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-0.5 font-semibold">
              Module 05
            </span>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
              Regression Score
            </h3>
          </div>
          <FreshnessGauge score={prediction?.freshness_score ?? prediction?.freshnessScore ?? 0} />
        </div>

        <div className="flex flex-col justify-between gap-6">
          <CategoryCard
            category={prediction?.category || "Aging"}
            confidence={prediction?.confidence_pct ?? prediction?.confidence ?? 0}
          />
          
          {/* Metadata information card */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 text-[12px] font-mono text-slate-600 dark:text-slate-400 space-y-1.5 flex-1 flex flex-col justify-center shadow-sm">
            <div>TARGET TOMATO ID: <span className="text-slate-900 dark:text-white font-bold">{latestReading?.tomato_id || "None"}</span></div>
            <div>SURFACE POSITION: <span className="text-slate-900 dark:text-white font-bold">{latestReading?.position || "None"} / 10</span></div>
            <div>TELEM SOURCE: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{isConnected ? "USB_SERIAL_ACTIVE" : "INACTIVE"}</span></div>
            <div>VERSION IDENT: <span className="text-slate-900 dark:text-white font-bold">{prediction?.model_version || "unknown"}</span></div>
          </div>
        </div>

        <div>
          <ConfidenceBar
            fresh={prediction?.confidence_fresh ?? prediction?.fresh ?? 0}
            aging={prediction?.confidence_aging ?? prediction?.aging ?? 0}
            spoiling={prediction?.confidence_spoiling ?? prediction?.spoiling ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
