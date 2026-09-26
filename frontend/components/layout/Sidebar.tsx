"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cpu,
  History,
  TrendingUp,
  RotateCcw,
  CheckSquare,
  Award,
  Satellite,
  Activity,
  ChevronLeft,
} from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { FOOD_TYPES } from "@/lib/constants";

const navItems = [
  { href: "/", label: "Control Center", icon: Satellite },
  { href: "/dashboard", label: "Live Dashboard", icon: Activity },
  { href: "/predict", label: "Prediction Engine", icon: Cpu },
  { href: "/history", label: "History Data", icon: History },
  { href: "/verify", label: "Verification Center", icon: CheckSquare },
  { href: "/retrain", label: "Retraining Center", icon: RotateCcw },
  { href: "/models", label: "Versioning Center", icon: Award },
  { href: "/analytics", label: "Analytics Panel", icon: TrendingUp },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [activeFood, setActiveFood] = useState("tomato");
  const [activeModel, setActiveModel] = useState<string>("XGB_tomato_v1.1");
  const [usbPort, setUsbPort] = useState<string>("COM20");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vegqx_commodity");
      if (saved) setActiveFood(saved);

      const onCommChange = (e: any) => {
        if (e.detail) {
          setActiveFood(e.detail);
        }
      };
      window.addEventListener("commodityChanged", onCommChange);
      return () => window.removeEventListener("commodityChanged", onCommChange);
    }
  }, []);

  const handleFoodChange = (newFood: string) => {
    setActiveFood(newFood);
    if (typeof window !== "undefined") {
      localStorage.setItem("vegqx_commodity", newFood);
      window.dispatchEvent(new CustomEvent("commodityChanged", { detail: newFood }));
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchActiveVersion = async () => {
      try {
        const health = await api.getHealth(activeFood);
        if (!isMounted) return;
        if (health.active_model) {
          setActiveModel(health.active_model);
        } else if (health.model_version) {
          const mv = health.model_version;
          if (mv.startsWith("XGB_") || mv.startsWith("LGBM_") || mv.startsWith("HGB_")) {
            setActiveModel(mv);
          } else if (mv.includes(activeFood)) {
            setActiveModel(`XGB_${mv}`);
          } else {
            setActiveModel(`XGB_${activeFood}_${mv}`);
          }
        } else {
          setActiveModel(`XGB_${activeFood}_v1.0`);
        }
        if (health.usb_port) {
          setUsbPort(health.usb_port);
        }
      } catch (e) {
        if (isMounted) {
          setActiveModel(`XGB_${activeFood}_v1.0`);
        }
      }
    };
    fetchActiveVersion();
    const interval = setInterval(fetchActiveVersion, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeFood]);

  return (
    <aside className="w-64 bg-white dark:bg-slate-950/80 border-r border-slate-200 dark:border-slate-850 backdrop-blur-xl flex flex-col h-full text-slate-700 dark:text-slate-300 shadow-sm transition-colors duration-200">
      {/* Brand Header — Aligned to exactly h-16 (64px) for 100% linear symmetry with TopBar */}
      <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between box-border shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/voyage_robotics_logo.png"
            alt="Voyage Robotics Logo"
            width={32}
            height={32}
            className="w-8 h-8 object-contain filter drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="flex flex-col justify-start">
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tracking-widest font-sans uppercase leading-none">
              VEG QX
            </span>
            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono tracking-wider mt-1 uppercase font-semibold">
              Voyage Robotics
            </span>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            suppressHydrationWarning
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
            title="Collapse Navigation"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Food Type Selector */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-850/60">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono block mb-2 font-semibold">
          Active Commodity Matrix
        </label>
        <select
          value={activeFood}
          onChange={(e) => handleFoodChange(e.target.value)}
          suppressHydrationWarning
          className="w-full bg-slate-50 dark:bg-[#0B1020] border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 font-mono shadow-xs cursor-pointer"
        >
          {FOOD_TYPES.map((food) => (
            <option key={food.value} value={food.value} disabled={food.disabled}>
              {food.icon} {food.label} {food.disabled ? "(Coming Soon)" : "(Active)"}
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto font-sans">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 group border ${
                isActive
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-xs font-bold"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Icon
                size={15}
                className={`transition-colors duration-200 ${
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Scientific Specs Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-850 text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-1.5 bg-slate-50/50 dark:bg-slate-950/40">
        <div className="grid grid-cols-[90px_1fr] items-center">
          <span className="text-slate-400 dark:text-slate-500 font-medium">SYS:</span>
          <span className="text-slate-700 dark:text-slate-300 font-semibold text-right truncate">AS7341 / ESP32</span>
        </div>
        <div className="grid grid-cols-[90px_1fr] items-center">
          <span className="text-slate-400 dark:text-slate-500 font-medium">PORT:</span>
          <span className="text-slate-700 dark:text-slate-300 font-semibold text-right truncate">{usbPort} (115200)</span>
        </div>
        <div className="grid grid-cols-[90px_1fr] items-center">
          <span className="text-slate-400 dark:text-slate-500 font-medium">MODEL_ACTIVE:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-right truncate" title={activeModel}>
            {activeModel}
          </span>
        </div>
      </div>
    </aside>
  );
}
