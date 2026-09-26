"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AnalyticsSummary } from "@/lib/types";
import { FOOD_TYPES } from "@/lib/constants";
import Link from "next/link";
import {
  TrendingUp,
  BarChart3,
  Calendar,
  PieChart as PieIcon,
  RefreshCw,
  Cpu,
  Sparkles,
  ShieldCheck,
  ArrowUpRight,
  Layers,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { useTheme } from "@/components/theme/ThemeProvider";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [commodity, setCommodity] = useState<string>("tomato");
  const [loading, setLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vegqx_commodity");
      if (saved) setCommodity(saved);
      const onCommChange = (e: any) => {
        if (e.detail) {
          setCommodity(e.detail);
          loadAnalytics(e.detail);
        }
      };
      const onModelUpdate = (e: any) => {
        const target = e.detail || commodity;
        loadAnalytics(target);
      };

      window.addEventListener("commodityChanged", onCommChange);
      window.addEventListener("vegqx_model_updated", onModelUpdate);
      window.addEventListener("modelUpdated", onModelUpdate);
      return () => {
        window.removeEventListener("commodityChanged", onCommChange);
        window.removeEventListener("vegqx_model_updated", onModelUpdate);
        window.removeEventListener("modelUpdated", onModelUpdate);
      };
    }
  }, [commodity]);

  const handleCommoditySelect = (newComm: string) => {
    setCommodity(newComm);
    if (typeof window !== "undefined") {
      localStorage.setItem("vegqx_commodity", newComm);
      window.dispatchEvent(new CustomEvent("commodityChanged", { detail: newComm }));
    }
  };

  const loadAnalytics = async (targetComm = commodity) => {
    setLoading(true);
    try {
      const res = await api.getAnalytics(targetComm);
      if (res.success) {
        setData(res);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(commodity);
  }, [commodity]);

  const COLORS = ["#10b981", "#f59e0b", "#ef4444"];

  const tooltipStyle = {
    backgroundColor: isDark ? "#0f172a" : "#ffffff",
    borderColor: isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0",
    borderRadius: "10px",
    color: isDark ? "#e2e8f0" : "#0f172a",
    boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.08)",
  };

  const displayComm = commodity.replace("_", " ").toUpperCase();

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-2">
            <TrendingUp size={24} className="text-emerald-600 dark:text-accent-green" />
            Performance & Insights Dashboard
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Module 12: Real-time telemetry analytics, active improved model metrics, and feature gain rankings for {displayComm}.
          </p>
        </div>
        <button
          onClick={() => loadAnalytics(commodity)}
          className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Commodity Selector Bar */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-widest">Active Specimen Analytics:</span>
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-300 dark:border-emerald-800 uppercase">
            {commodity.replace("_", " ")}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_TYPES.filter((f) => !f.disabled).map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleCommoditySelect(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
                commodity === f.value
                  ? "bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/25"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/50"
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {data ? (
        <>
          {/* Active Specimen Improved Model Showcase Banner */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-emerald-500/10 via-sky-500/5 to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Info */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 shadow-xs">
                    <Cpu size={13} className="text-emerald-500" />
                    <span>{data.model_performance.canonical_name || data.model_performance.model_version || `${displayComm}_v1.0`}</span>
                  </span>

                  {data.model_performance.is_improved ? (
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shadow-xs animate-pulse">
                      <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400" />
                      <span>IMPROVED MODEL DEPLOYED</span>
                      {data.model_performance.delta_accuracy !== undefined && data.model_performance.delta_accuracy > 0 && (
                        <span className="ml-1 bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[9px]">
                          +{data.model_performance.delta_accuracy.toFixed(2)}% GAIN
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700 flex items-center gap-1">
                      <ShieldCheck size={12} className="text-sky-600 dark:text-sky-400" />
                      <span>PRODUCTION BASELINE</span>
                    </span>
                  )}

                  <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                    Engine: {data.model_performance.classifier_algorithm || "XGBoost"} + {data.model_performance.regressor_algorithm || "Regressor"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="text-slate-400">Target Specimen:</span>{" "}
                    <span className="text-slate-900 dark:text-white font-bold uppercase">{displayComm}</span>
                  </div>
                  {data.model_performance.training_samples ? (
                    <div>
                      <span className="text-slate-400">Dataset Samples:</span>{" "}
                      <span className="text-slate-900 dark:text-white font-semibold">{data.model_performance.training_samples.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {data.model_performance.trained_at ? (
                    <div>
                      <span className="text-slate-400">Last Deployed:</span>{" "}
                      <span className="text-slate-900 dark:text-white font-semibold">{data.model_performance.trained_at}</span>
                    </div>
                  ) : null}
                  {data.model_performance.baseline_accuracy ? (
                    <div>
                      <span className="text-slate-400">Baseline Acc:</span>{" "}
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">{(data.model_performance.baseline_accuracy * 100).toFixed(2)}%</span>
                    </div>
                  ) : null}
                </div>

                {data.model_performance.notes ? (
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 italic line-clamp-1">
                    Provenance: "{data.model_performance.notes}"
                  </p>
                ) : null}
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                <Link
                  href="/retrain"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/20"
                >
                  <span>Retrain {displayComm}</span>
                  <ArrowUpRight size={13} />
                </Link>
                <Link
                  href="/models"
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all"
                >
                  <Layers size={13} />
                  <span>Versions ({data.model_performance.available_versions_count || 1})</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Diagnostic Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Total Analyzed */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">TOTAL ANALYSED</span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.summary.total_predictions.toLocaleString()}
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1">{displayComm} rows logged</span>
            </div>

            {/* Average Freshness */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">AVG FRESHNESS SCORE</span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {data.summary.average_freshness_score.toFixed(1)} / 100
              </span>
              <span className="text-[9px] text-emerald-600 dark:text-accent-green font-bold block mt-1">● STRUCTURAL HEALTH OK</span>
            </div>

            {/* Classification Accuracy */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">CLASSIFIER ACCURACY</span>
                {data.model_performance.is_improved && (
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                    IMPROVED
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {(data.model_performance.classification_accuracy * 100).toFixed(2)}%
                </span>
                {data.model_performance.delta_accuracy !== undefined && data.model_performance.delta_accuracy > 0 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    ↑ +{data.model_performance.delta_accuracy.toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1 truncate">
                {data.model_performance.canonical_name || `${data.model_performance.classifier_algorithm || "ML"} Validation`}
              </span>
            </div>

            {/* Regression R² */}
            <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">REGRESSOR R² SCORE</span>
              <span className="text-3xl font-extrabold text-sky-600 dark:text-cyan-400">
                {data.model_performance.regression_r2.toFixed(4)}
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1 truncate">
                Variance fit ({data.model_performance.regressor_algorithm || "Regressor"})
              </span>
            </div>
          </div>

          {/* Charts Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Time Series Trend (Left, 2 columns) */}
            <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 h-[320px] flex flex-col justify-between shadow-sm dark:shadow-md">
              <div className="flex items-center gap-2 font-mono">
                <Calendar size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  {displayComm} Historical Freshness Trend (Last 50)
                </span>
              </div>
              <div className="flex-1 w-full mt-4 font-mono text-[9px]">
                {data.trend && data.trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isDark ? "#00d2ff" : "#0284c7"} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={isDark ? "#00d2ff" : "#0284c7"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.06)"} />
                      <XAxis
                        dataKey="timestamp"
                        stroke={isDark ? "#475569" : "#94A3B8"}
                        tickFormatter={(t) => new Date(t).toLocaleTimeString()}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: isDark ? "#94a3b8" : "#64748b" }}
                      />
                      <YAxis stroke={isDark ? "#475569" : "#94A3B8"} tickLine={false} axisLine={false} tick={{ fill: isDark ? "#94a3b8" : "#64748b" }} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelClassName="font-mono font-bold"
                      />
                      <Area
                        type="monotone"
                        dataKey="freshness_score"
                        name="Freshness Score"
                        stroke={isDark ? "#00d2ff" : "#0284c7"}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#trendGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 font-mono text-xs">
                    <p>No historical trend telemetry logged for {displayComm} yet.</p>
                    <p className="text-[10px] mt-1 text-slate-400">Perform scans in Diagnostics to populate time series.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Category distribution (Right, 1 column) */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 h-[320px] flex flex-col justify-between shadow-sm dark:shadow-md">
              <div className="flex items-center gap-2 font-mono">
                <PieIcon size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  Category Distribution
                </span>
              </div>
              <div className="flex-1 w-full mt-4 flex items-center justify-center font-mono text-[9px]">
                {data.summary.total_predictions > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={data.category_distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {data.category_distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-slate-400 dark:text-slate-500 font-mono text-xs">
                    <p>No telemetry recorded</p>
                    <p className="text-[10px] mt-1">0 classifications</p>
                  </div>
                )}
              </div>
              {/* Legend */}
              <div className="flex items-center justify-around font-mono text-[9px] text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-900/60 font-semibold">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Fresh ({data.summary.fresh_count})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Aging ({data.summary.aging_count})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Spoiling ({data.summary.spoiling_count})
                </span>
              </div>
            </div>
          </div>

          {/* Feature Importance Rankings */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 h-[320px] flex flex-col justify-between shadow-sm dark:shadow-md">
            <div className="flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  {data.model_performance.canonical_name ? `${data.model_performance.canonical_name} Feature Gain & Importance` : `${displayComm} Feature Gain & Relative Importance`}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                {data.model_performance.classifier_algorithm || "Spectral Weights"}
              </span>
            </div>
            <div className="flex-1 w-full mt-4 font-mono text-[9px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.feature_importance} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.06)"} />
                  <XAxis dataKey="feature" stroke={isDark ? "#475569" : "#94A3B8"} tickLine={false} axisLine={false} tick={{ fill: isDark ? "#94a3b8" : "#64748b" }} />
                  <YAxis stroke={isDark ? "#475569" : "#94A3B8"} tickLine={false} axisLine={false} tick={{ fill: isDark ? "#94a3b8" : "#64748b" }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="importance" name="Relative Gain" radius={[4, 4, 0, 0]}>
                    {data.feature_importance.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.feature === "RVI" || entry.feature === "NDVI" ? (isDark ? "#39ff14" : "#10b981") : (isDark ? "#475569" : "#94a3b8")}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div className="h-96 flex items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl text-slate-500 font-mono text-xs bg-slate-50/50 dark:bg-transparent">
          Loading diagnostic analytics data...
        </div>
      )}
    </div>
  );
}
