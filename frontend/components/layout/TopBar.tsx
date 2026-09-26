"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { USBStatus } from "@/lib/types";
import { RefreshCw, Radio, Clock, Menu } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

interface TopBarProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

function MissionClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toISOString().replace("T", " ").substring(0, 19) + " UTC");
    };
    updateTime();
    const tInterval = setInterval(updateTime, 1000);
    return () => clearInterval(tInterval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-850 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-500 dark:text-slate-400 shadow-xs select-none">
      <Clock size={13} className="text-sky-600 dark:text-sky-400" />
      <span className="text-slate-700 dark:text-slate-300 font-semibold">{time || "CALIBRATING TIME..."}</span>
    </div>
  );
}

export default function TopBar({ isSidebarOpen = true, onToggleSidebar }: TopBarProps) {
  const [status, setStatus] = useState<USBStatus>({
    status: "degraded",
    database_connected: false,
    model_loaded: false,
    model_version: null,
    usb_connected: false,
    usb_port: null,
    sensor_ready: false,
  });
  const [loading, setLoading] = useState(false);
  const [commodity, setCommodity] = useState("tomato");

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

  const fetchStatus = async (isFirst = false) => {
    if (isFirst) setLoading(true);
    try {
      const health = await api.getHealth(commodity);
      setStatus(health);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vegqx_health_update", { detail: health }));
      }
    } catch (e) {
      setStatus({
        status: "degraded",
        database_connected: false,
        model_loaded: false,
        model_version: null,
        usb_connected: false,
        usb_port: null,
        sensor_ready: false,
      });
    } finally {
      if (isFirst) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => fetchStatus(false), 8000);
    return () => clearInterval(interval);
  }, [commodity]);

  return (
    <header className="h-16 bg-white/90 dark:bg-[#050814]/80 border-b border-slate-200 dark:border-slate-850 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 text-slate-700 dark:text-slate-300 font-mono shadow-sm transition-colors duration-200 box-border">
      {/* Left Section: Navigation Toggle + Mission Clock + Target Commodity Badge */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {!isSidebarOpen && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            suppressHydrationWarning
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-emerald-600 dark:text-emerald-400 hover:text-slate-900 dark:hover:text-white transition-all flex items-center justify-center border border-slate-200 dark:border-slate-850 shadow-xs"
            title="Open Navigation Panel"
          >
            <Menu size={16} />
          </button>
        )}
        <MissionClock />

        <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-slate-850 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wider text-slate-600 dark:text-slate-400 shadow-xs">
          <span className="text-slate-400 dark:text-slate-500 font-semibold">TARGET:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">{commodity.replace("_", " ")}</span>
          <span className="hidden 2xl:inline text-slate-300 dark:text-slate-700">|</span>
          <span className="hidden 2xl:inline text-slate-400 dark:text-slate-500 font-semibold">SAMPLE:</span>
          <span className="hidden 2xl:inline text-sky-600 dark:text-cyan-400 font-bold">
            SCAN-{commodity.toUpperCase().slice(0, 3)}-1.0
          </span>
        </div>
      </div>

      {/* Right Section: Telemetry Badges Grid + Theme Switcher (Guaranteed Visible) */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] shrink-0">
        {/* Connection Latency (visible only on ultra-wide screens) */}
        <div className="hidden 2xl:flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 shadow-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium">LATENCY:</span>
          <span className="text-sky-600 dark:text-sky-400 font-bold">
            {status.database_connected ? "112 ms" : "---"}
          </span>
        </div>

        {/* Database Connected */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 shadow-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status.database_connected ? "bg-emerald-500 shadow-[0_0_6px_#10B981] animate-pulse" : "bg-red-500 animate-pulse"
            }`}
          />
          <span className="text-slate-400 dark:text-slate-500 font-medium">DB:</span>
          <span className={status.database_connected ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-red-500 font-bold"}>
            {status.database_connected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>

        {/* Model Loaded */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 shadow-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status.model_loaded ? "bg-emerald-500 shadow-[0_0_6px_#10B981]" : "bg-red-500"
            }`}
          />
          <span className="text-slate-400 dark:text-slate-500 font-medium">MODEL:</span>
          <span 
            className={`font-bold max-w-[190px] truncate ${status.model_loaded ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            title={status.active_model || status.model_version || "ONLINE"}
          >
            {status.model_loaded ? (status.active_model || status.model_version || "ONLINE") : "UNLOADED"}
          </span>
        </div>

        {/* USB Connected */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 shadow-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status.usb_connected
                ? "bg-emerald-500 shadow-[0_0_6px_#10B981] animate-pulse"
                : status.esp32_detected
                ? "bg-amber-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-slate-400 dark:text-slate-500 font-medium">USB:</span>
          <span
            className={
              status.usb_connected
                ? "text-emerald-600 dark:text-emerald-400 font-bold"
                : status.esp32_detected
                ? "text-amber-600 dark:text-amber-400 font-bold"
                : "text-red-500 font-bold"
            }
          >
            {status.usb_port || (status.usb_connected ? "CONNECTED" : "INACTIVE")}
          </span>
        </div>

        {/* Actions (Refresh + ThemeToggle) — Pinned and Always Visible */}
        <div className="flex items-center gap-1.5 shrink-0 pl-1.5 border-l border-slate-200 dark:border-slate-850">
          <button
            onClick={() => fetchStatus()}
            disabled={loading}
            suppressHydrationWarning
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-850 shadow-xs transition-colors flex items-center justify-center"
            title="Refresh System Status"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
