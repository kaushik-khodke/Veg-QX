"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  CheckSquare,
  ArrowRight,
  BookOpen,
  Database,
  AlertCircle,
  Download,
  RefreshCw,
  Cpu,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { FOOD_TYPES } from "@/lib/constants";
import { CommodityIcon } from "@/components/ui/CommodityIcon";

interface VerificationStats {
  total_audited_samples: number;
  fresh_count: number;
  aging_count: number;
  spoiling_count: number;
  commodity_distribution?: Record<string, number>;
  retraining_readiness: boolean;
  remaining_samples_required: number;
}

export default function VerificationCenter() {
  const [stats, setStats] = useState<VerificationStats>({
    total_audited_samples: 0,
    fresh_count: 0,
    aging_count: 0,
    spoiling_count: 0,
    commodity_distribution: {},
    retraining_readiness: false,
    remaining_samples_required: 10,
  });

  const [verifiedRecords, setVerifiedRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [specimenFilter, setSpecimenFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.getVerificationStats(specimenFilter !== "all" ? specimenFilter : undefined),
        api.getVerificationHistory(
          specimenFilter !== "all" ? specimenFilter : undefined,
          categoryFilter !== "all" ? categoryFilter : undefined
        ),
      ]);

      if (statsRes.success) {
        setStats({
          ...statsRes.data,
          commodity_distribution: statsRes.data.commodity_distribution || {},
        });
      }
      if (historyRes.success) {
        setVerifiedRecords(historyRes.data);
      }
    } catch (e: any) {
      console.warn("[Verify] Error loading verification stats:", e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [specimenFilter, categoryFilter]);

  const formatTimestamp = (ts: string) => {
    if (!ts) return "N/A";
    const clean = ts.includes("Z") || ts.includes("+") ? ts : ts.replace(" ", "T") + "Z";
    const d = new Date(clean);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Helper to resolve specimen display metadata
  const getSpecimenMeta = (commodityVal?: string) => {
    const comm = (commodityVal || "tomato").toLowerCase().trim();
    const found = FOOD_TYPES.find((f) => f.value.toLowerCase() === comm);
    if (found) return found;

    if (comm.includes("brinjal")) {
      return { value: comm, label: "Green Brinjal", icon: "🟢", sticker: "/sticker_green_brinjal.png", family: "Solanaceae" };
    }
    if (comm.includes("gourd")) {
      return { value: comm, label: "Bitter Gourd", icon: "🥒", family: "Cucurbitaceae" };
    }
    if (comm.includes("carrot")) {
      return { value: comm, label: "Carrot", icon: "🥕", family: "Apiaceae" };
    }
    if (comm.includes("beetroot")) {
      return { value: comm, label: "Beetroot", icon: "🟣", sticker: "/sticker_beetroot.png", family: "Amaranthaceae" };
    }

    return {
      value: comm,
      label: comm.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: "🥬",
      family: "General",
    };
  };

  // Canonical active model name for a record
  const getModelName = (row: any) => {
    if (row.model_version && row.model_version.trim() !== "") {
      return row.model_version;
    }
    const comm = row.commodity || row.food_type || "tomato";
    return `XGB_${comm}_v1.0`;
  };

  const currentSpecimenMeta = useMemo(() => {
    if (specimenFilter === "all") return null;
    return getSpecimenMeta(specimenFilter);
  }, [specimenFilter]);

  const activeFoodTypes = useMemo(() => {
    return FOOD_TYPES.filter((f) => !f.disabled);
  }, []);

  return (
    <div className="space-y-8">
      {/* Title & Top Actions */}
      <div className="border-b border-slate-200 dark:border-slate-850 pb-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-2">
            <CheckSquare size={22} className="text-emerald-600 dark:text-accent-green shrink-0" />
            <span className="truncate">Verification Center & Dataset Partitioning</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Review and export human-verified ground truth data partitioned by specimen and ML model version for accurate retraining.
          </p>
        </div>

        {/* Dynamic CSV Downloads — Sleek, compact toolbar that stays perfectly aligned with or without sidebar */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap pt-1 xl:pt-0">
          {specimenFilter !== "all" && currentSpecimenMeta && (
            <a
              href={api.getDownloadVerifiedCsvUrl(specimenFilter)}
              download
              title={`Download verified records specifically for ${currentSpecimenMeta.label}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:scale-[1.02] whitespace-nowrap shrink-0"
            >
              <Download size={14} className="shrink-0" />
              <span>{currentSpecimenMeta.label.toUpperCase()} CSV</span>
            </a>
          )}

          <a
            href={api.getDownloadVerifiedCsvUrl()}
            download
            title="Download full multi-specimen verified dataset in a single combined CSV"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap shrink-0 ${
              specimenFilter === "all"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:scale-[1.02]"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-800 shadow-xs"
            }`}
          >
            <FileSpreadsheet size={14} className="shrink-0" />
            <span>{specimenFilter === "all" ? "DOWNLOAD ALL (CSV)" : "ALL (CSV)"}</span>
          </a>

          <button
            onClick={loadData}
            title="Refresh verified dataset"
            className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs shrink-0"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Specimen Partition Quick-Selector & Summary Pills */}
      <div className="glass-panel rounded-2xl p-4 border border-slate-200 dark:border-slate-800/40 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            <Layers size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Partitioned Specimen Datasets:</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Click any specimen to filter records and download target training dataset
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {/* All specimens pill */}
          <button
            onClick={() => setSpecimenFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 border transition-all ${
              specimenFilter === "all"
                ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs"
                : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400"
            }`}
          >
            <span>🌐</span>
            <span>All Specimens</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded-full font-semibold">
              {stats.total_audited_samples}
            </span>
          </button>

          {/* Individual commodity pills */}
          {activeFoodTypes.map((food) => {
            const count = stats.commodity_distribution?.[food.value] || 0;
            const isSelected = specimenFilter === food.value;
            return (
              <button
                key={food.value}
                onClick={() => setSpecimenFilter(food.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 border transition-all ${
                  isSelected
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/30"
                    : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400"
                }`}
              >
                <CommodityIcon icon={food.icon} sticker={food.sticker} label={food.label} size={16} />
                <span>{food.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    count > 0
                      ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">
            {specimenFilter === "all" ? "TOTAL AUDITED SAMPLES" : `${currentSpecimenMeta?.label.toUpperCase()} AUDITED SAMPLES`}
          </span>
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{stats.total_audited_samples}</span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1">
            {specimenFilter === "all" ? "Across all model architectures" : `For XGB_${specimenFilter}_v1.x`}
          </span>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">🟢 VERIFIED FRESH</span>
          <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.fresh_count}</span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1">Ground truth positive</span>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">🟡 VERIFIED AGING</span>
          <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{stats.aging_count}</span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1">Transitional threshold</span>
        </div>
        <div className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800/40 font-mono shadow-sm">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 block mb-1 font-semibold">🔴 VERIFIED SPOILING</span>
          <span className="text-3xl font-extrabold text-red-600 dark:text-red-400">{stats.spoiling_count}</span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1">Ground truth rejected</span>
        </div>
      </div>

      {/* Query Filters Bar */}
      <div className="glass-panel rounded-xl p-4 border border-slate-200 dark:border-slate-800/40 flex flex-wrap gap-4 items-center justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Specimen Dropdown */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1">
              <Filter size={13} className="text-emerald-600 dark:text-emerald-400" />
              Specimen:
            </span>
            <select
              value={specimenFilter}
              onChange={(e) => setSpecimenFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 shadow-xs font-mono cursor-pointer"
            >
              <option value="all">🌐 All Specimens (Combined)</option>
              {activeFoodTypes.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.icon} {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 shadow-xs font-mono cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Fresh">🟢 Fresh Only</option>
              <option value="Aging">🟡 Aging Only</option>
              <option value="Spoiling">🔴 Spoiling Only</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-medium">
            Showing <strong className="text-slate-900 dark:text-white">{verifiedRecords.length}</strong> active verified records
          </span>
        </div>
      </div>

      {/* Active Verified Records Audit Table */}
      <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-hidden space-y-3 p-4 shadow-sm dark:shadow-md">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Database size={14} className="text-emerald-600 dark:text-emerald-400" />
            Verified Training Records Audit Queue (SQLite)
          </h3>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Retraining Partition Ready</span>
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto overflow-x-auto pr-1">
          <table className="w-full font-mono text-[11px] text-slate-700 dark:text-slate-300 text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950/90 backdrop-blur-md">
              <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[9px]">
                <th className="p-2.5">V_ID</th>
                <th className="p-2.5">SPECIMEN</th>
                <th className="p-2.5">SPECIMEN_ID</th>
                <th className="p-2.5">POS</th>
                <th className="p-2.5">BLUE / NIR</th>
                <th className="p-2.5">NDVI</th>
                <th className="p-2.5">MODEL ENGINE</th>
                <th className="p-2.5">PRED CLASS</th>
                <th className="p-2.5">VERIFIED CLASS</th>
                <th className="p-2.5">VERIFIED SCORE</th>
                <th className="p-2.5">VERIFIED AT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60 text-[10px]">
              {verifiedRecords.length > 0 ? (
                verifiedRecords.map((row) => {
                  const meta = getSpecimenMeta(row.commodity || row.food_type);
                  const modelVer = getModelName(row);
                  const specId = row.specimen_id || `${(row.commodity || row.food_type || "tom").slice(0, 3).toUpperCase()}-${row.tomato_id || 1001}`;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/20 transition-colors">
                      <td className="p-2.5 font-bold text-slate-500 dark:text-slate-400">v_{row.id}</td>

                      {/* Specimen icon & name */}
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          <CommodityIcon icon={meta.icon} sticker={meta.sticker} label={meta.label} size={14} />
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      {/* Specimen ID */}
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                        {specId}
                      </td>

                      <td className="p-2.5">{row.position || 1}</td>

                      <td className="p-2.5 text-slate-600 dark:text-slate-400">
                        {row.blue != null ? Number(row.blue).toFixed(1) : "N/A"} / {row.nir != null ? Number(row.nir).toFixed(1) : "N/A"}
                      </td>

                      <td className="p-2.5 text-slate-600 dark:text-slate-400">
                        {row.ndvi != null ? Number(row.ndvi).toFixed(4) : "N/A"}
                      </td>

                      {/* Model Engine Pill */}
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                          <Cpu size={10} className="text-blue-500" />
                          <span>{modelVer}</span>
                        </span>
                      </td>

                      <td className="p-2.5 text-slate-500">{row.predicted_category || "N/A"}</td>

                      {/* Verified Class Badge */}
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            row.actual_category === "Fresh"
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                              : row.actual_category === "Aging"
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                              : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                          }`}
                        >
                          {row.actual_category}
                        </span>
                      </td>

                      <td className="p-2.5 text-slate-900 dark:text-white font-bold">
                        {(row.actual_freshness_score ?? row.freshness_score != null)
                          ? Number(row.actual_freshness_score ?? row.freshness_score).toFixed(1)
                          : "85.0"}
                      </td>

                      <td className="p-2.5 text-slate-500 whitespace-nowrap">{formatTimestamp(row.verified_at)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    <Database size={24} className="mx-auto mb-2 text-slate-400 opacity-60" />
                    <p className="font-semibold">No active verified records found for this filter.</p>
                    <p className="text-[10px] mt-1 text-slate-400">
                      Verify predictions in Audit History to populate specimen training datasets.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Model Retraining Export Hub */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
              Model Retraining Export Hub
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Direct drag-and-drop CSV export for XGBoost model retraining pipelines
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Card: All Specimens */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-base">🌐</span>
                <span className="text-[9px] font-mono uppercase font-bold text-slate-500">All Models</span>
              </div>
              <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-1">Multi-Specimen Bundle</h4>
              <p className="text-[10px] font-mono text-slate-500 mt-1">
                {stats.total_audited_samples} verified samples total
              </p>
            </div>
            <a
              href={api.getDownloadVerifiedCsvUrl()}
              download
              className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] font-mono font-bold transition-all"
            >
              <Download size={13} />
              <span>Export All (CSV)</span>
            </a>
          </div>

          {/* Cards for active specimens */}
          {activeFoodTypes.map((food) => {
            const count = stats.commodity_distribution?.[food.value] || 0;
            return (
              <div
                key={food.value}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <CommodityIcon icon={food.icon} sticker={food.sticker} label={food.label} size={20} />
                    <span className="text-[9px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
                      XGB_{food.value}_v1.x
                    </span>
                  </div>
                  <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-1">{food.label} Dataset</h4>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    {count} labeled records available
                  </p>
                </div>
                <a
                  href={api.getDownloadVerifiedCsvUrl(food.value)}
                  download
                  className="flex items-center justify-center gap-1.5 w-full py-2 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 rounded-lg text-[11px] font-mono font-bold transition-all"
                >
                  <Download size={13} />
                  <span>Export {food.label} CSV</span>
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guidelines & Retraining Link */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* Guidelines Card */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-600 dark:text-emerald-400" />
            Human Labeled Protocols (Module 09)
          </h3>
          <div className="space-y-3 font-mono text-[10px] text-slate-600 dark:text-slate-400">
            <div className="flex gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">01 /</span>
              <p>Verify specimens only after physical/sensory inspection. Match predictions against actual firmness and visual characteristics.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">02 /</span>
              <p>Store verified labels directly in SQLite via the Audit History page with proper Specimen ID and Model tags.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">03 /</span>
              <p>Ensure class distribution is balanced across Fresh, Aging, and Spoiling before triggering specimen retraining runs.</p>
            </div>
          </div>
        </div>

        {/* Retraining checklist call to action */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 flex flex-col justify-between shadow-sm dark:shadow-md">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <Database size={16} className="text-emerald-600 dark:text-emerald-400" />
              Retraining Readiness Check
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-900">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
              <span>
                Minimum 10 verified samples required. Current status:{" "}
                <strong
                  className={
                    stats.retraining_readiness
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-amber-600 dark:text-amber-400 font-bold"
                  }
                >
                  {stats.retraining_readiness ? "READY FOR RETRAINING" : `INSUFFICIENT DATA (${stats.remaining_samples_required} needed)`}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <Link
              href="/history"
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-slate-400 text-slate-700 dark:text-slate-300 font-semibold py-2.5 rounded-lg text-xs font-mono shadow-xs"
            >
              <span>AUDIT HISTORY</span>
            </Link>
            <Link
              href="/retrain"
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs font-mono shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:scale-[1.02] transition-all"
            >
              <span>GO TO RETRAINING</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
