"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ModelVersion } from "@/lib/types";
import { FOOD_TYPES } from "@/lib/constants";
import { CommodityIcon } from "@/components/ui/CommodityIcon";
import { Layers, RefreshCw, CheckCircle2, Trash2, AlertTriangle, ShieldCheck } from "lucide-react";

export default function ModelVersioningPage() {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // 2-Step Confirmation Modal state for deletion
  const [deleteTargetVersion, setDeleteTargetVersion] = useState<string | null>(null);
  const [deleteTargetCommodity, setDeleteTargetCommodity] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2 | null>(null);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const commParam = selectedCommodity === "all" ? undefined : selectedCommodity;
      const res = await api.getModelVersions(commParam);
      if (res.success && res.data) {
        setVersions(res.data);
      }
    } catch (e) {
      console.error("Error loading model versions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [selectedCommodity]);

  const handleActivate = async (version: string, foodType: string) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await api.activateModelVersion(version, foodType);
      if (res.success) {
        setMessage({ text: `✔ Model version ${version} for '${foodType}' is now ACTIVE in production.`, isError: false });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("commodityChanged", { detail: foodType }));
          window.dispatchEvent(new CustomEvent("vegqx_model_updated", { detail: foodType }));
        }
        await loadVersions();
      } else {
        setMessage({ text: res.message || "Failed to activate model.", isError: true });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || err.message || "Activation error.", isError: true });
    } finally {
      setActionLoading(false);
    }
  };

  const isPermanentBaseline = (version: string, foodType: string) => {
    if (foodType === "tomato") {
      return version === "v1.0" || version === "v1.1";
    }
    return version === "v1.0" || version === `${foodType}_v1.0` || version.endsWith("_v1.0");
  };

  const handleStartDelete = (version: string, foodType: string) => {
    if (isPermanentBaseline(version, foodType)) return;
    setDeleteTargetVersion(version);
    setDeleteTargetCommodity(foodType);
    setDeleteConfirmStep(1);
  };

  const handleProceedToDeleteStep2 = () => {
    setDeleteConfirmStep(2);
  };

  const handleCancelDelete = () => {
    setDeleteTargetVersion(null);
    setDeleteTargetCommodity(null);
    setDeleteConfirmStep(null);
  };

  const handleFinalDeleteConfirm = async () => {
    if (!deleteTargetVersion) return;
    setActionLoading(true);
    setMessage(null);
    const target = deleteTargetVersion;
    const targetComm = deleteTargetCommodity || undefined;
    
    try {
      const res = await api.deleteModelVersion(target, targetComm);
      if (res.success) {
        setMessage({ text: `✔ Retrained model version ${target} for '${targetComm || "tomato"}' deleted successfully.`, isError: false });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("vegqx_model_updated", { detail: targetComm }));
        }
        handleCancelDelete();
        await loadVersions();
      } else {
        setMessage({ text: res.message || "Failed to delete model version.", isError: true });
        handleCancelDelete();
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || err.message || "Delete error.", isError: true });
      handleCancelDelete();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-3">
            <img src="/voyage_robotics_logo.png" alt="Voyage Robotics Logo" width={28} height={28} className="w-7 h-7 object-contain filter drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]" />
            <span>Core Pipeline Version Control</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Module 11: Switch active production model versions, trigger retraining on target versions, and manage compiled models.
          </p>
        </div>
        <button
          onClick={loadVersions}
          className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl font-mono text-xs border ${
          message.isError ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 font-medium" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium"
        }`}>
          {message.text}
        </div>
      )}

      {/* Commodity Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mr-2">Filter Commodity:</span>
        <button
          onClick={() => setSelectedCommodity("all")}
          className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
            selectedCommodity === "all"
              ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shadow-xs"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          All Commodities
        </button>
        {FOOD_TYPES.filter((f) => !f.disabled).map((f) => (
          <button
            key={f.value}
            onClick={() => setSelectedCommodity(f.value)}
            className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
              selectedCommodity === f.value
                ? "bg-emerald-600 text-white font-bold shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <CommodityIcon icon={f.icon} sticker={f.sticker} label={f.label} size={16} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          Main Content: Fleet View (All Commodities) vs Focused View (Single Specimen)
          ─────────────────────────────────────────────────────────────────────── */}
      {selectedCommodity === "all" ? (
        <div className="space-y-8">
          {/* Active Production Models Fleet (Matrix Grid) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-xs">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    Active Production Models Fleet
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 font-mono font-bold border border-emerald-300 dark:border-emerald-800">
                      {versions.filter(v => v.is_active === 1).length} Models Deployed
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Real-time deployed ML inference pipelines across all supported agricultural specimens.
                  </p>
                </div>
              </div>
            </div>

            {/* 3-Column Fleet Matrix Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {versions
                .filter((v) => v.is_active === 1)
                .sort((a, b) => {
                  const foodOrder = FOOD_TYPES.map((f) => f.value);
                  const idxA = foodOrder.indexOf(a.food_type);
                  const idxB = foodOrder.indexOf(b.food_type);
                  return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
                })
                .map((active) => {
                  const foodConfig = FOOD_TYPES.find((f) => f.value === active.food_type);
                  const isBaseline =
                    (active.food_type === "tomato" && (active.version === "v1.0" || active.version === "v1.1")) ||
                    (active.food_type !== "tomato" && active.version === "v1.0");

                  return (
                    <div
                      key={active.id}
                      className="glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col justify-between hover:border-emerald-500/40 transition-all duration-200 shadow-sm dark:shadow-md group"
                    >
                      <div>
                        {/* Specimen Header & Status */}
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2.5">
                            <CommodityIcon icon={foodConfig?.icon || "🌱"} sticker={foodConfig?.sticker} label={foodConfig?.label} size={28} />
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white font-mono uppercase tracking-wide">
                                {foodConfig?.label || active.food_type?.replace("_", " ")}
                              </h4>
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono uppercase">
                                {foodConfig?.family || "Agricultural Specimen"}
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[9px] font-mono font-bold flex items-center gap-1.5 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            ACTIVE
                          </span>
                        </div>

                        {/* Version Identifier */}
                        <div className="mt-3 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/60 font-mono">
                          <span className="text-[10px] text-slate-500 font-medium">Active Version:</span>
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono bg-emerald-100/60 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                            {isBaseline && (
                              <span title="Permanent Baseline">
                                <ShieldCheck size={11} className="text-amber-500" />
                              </span>
                            )}
                            <span>{active.version}</span>
                          </span>
                        </div>

                        {/* Metrics 2x2 Grid */}
                        <div className="grid grid-cols-2 gap-2 mt-3 font-mono">
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">ACCURACY</span>
                            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                              {(active.classification_accuracy * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">REGRESSOR R²</span>
                            <span className="text-sm font-extrabold text-sky-600 dark:text-sky-400">
                              {active.regression_r2.toFixed(4)}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">DATASET ROWS</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {active.training_samples.toLocaleString()}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">TRAINED DATE</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {active.trained_at ? active.trained_at.split(" ")[0] : "Baseline"}
                            </span>
                          </div>
                        </div>

                        {/* Compilation Notes */}
                        {active.notes && (
                          <div className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-900 font-mono text-[9px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            <span className="font-bold text-slate-700 dark:text-slate-300 mr-1">NOTES:</span>
                            {active.notes}
                          </div>
                        )}
                      </div>

                      {/* Card Action: Filter to this commodity */}
                      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                        <span className="text-[9px] font-mono text-slate-400">Production Ready</span>
                        <button
                          onClick={() => setSelectedCommodity(active.food_type)}
                          className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center gap-1"
                        >
                          Manage History →
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Full-width Compilation Changelog History */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
                  Global Compilation Changelog & Version Registry
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Complete historical registry of all baseline and retrained model artifacts across all commodities.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {versions.length} Total Versions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px] text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2 uppercase tracking-wider text-[9px]">
                    <th className="pb-2">VER</th>
                    <th className="pb-2">COMMODITY</th>
                    <th className="pb-2">TRAINED_DATE</th>
                    <th className="pb-2">SAMPLES</th>
                    <th className="pb-2">ACCURACY</th>
                    <th className="pb-2">R² SCORE</th>
                    <th className="pb-2">STATUS / ACTION</th>
                    <th className="pb-2 text-right">MANAGEMENT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900/40">
                  {versions.map((v) => {
                    const foodConfig = FOOD_TYPES.find((f) => f.value === v.food_type);
                    return (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                        <td className="py-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{v.version}</span>
                          {isPermanentBaseline(v.version, v.food_type) && (
                            <span title="Permanent System Baseline">
                              <ShieldCheck size={12} className="text-amber-500" />
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-slate-700 dark:text-slate-300 font-semibold">
                          <CommodityIcon icon={foodConfig?.icon || "🌱"} sticker={foodConfig?.sticker} label={foodConfig?.label} size={16} className="mr-1" />
                          <span className="capitalize">{foodConfig?.label || v.food_type?.replace("_", " ")}</span>
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">{v.trained_at ? v.trained_at.split(" ")[0] : "N/A"}</td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">
                          <span>{v.training_samples.toLocaleString()}</span>
                          {v.notes?.toLowerCase().includes("verified") && (
                            <span className="block text-[8px] text-emerald-600 dark:text-emerald-400 font-medium" title="Combined reference base + verified samples">
                              +verified
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-slate-800 dark:text-slate-300 font-semibold">{(v.classification_accuracy * 100).toFixed(2)}%</td>
                        <td className="py-3 text-slate-800 dark:text-slate-300 font-semibold">{v.regression_r2.toFixed(4)}</td>
                        
                        {/* Status & Activation Action */}
                        <td className="py-3">
                          {v.is_active === 1 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-bold text-[8px] uppercase inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> ACTIVE
                            </span>
                          ) : (
                            <button
                              onClick={() => handleActivate(v.version, v.food_type)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold text-[8px] uppercase rounded transition-all shadow-xs disabled:opacity-50"
                            >
                              ACTIVATE MODEL
                            </button>
                          )}
                        </td>

                        {/* Management / Deletion Column */}
                        <td className="py-3 text-right">
                          {isPermanentBaseline(v.version, v.food_type) ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 font-bold text-[8px] uppercase">
                              PERMANENT BASELINE
                            </span>
                          ) : v.is_active === 1 ? (
                            <span className="text-[8px] font-mono text-slate-400 dark:text-slate-600 uppercase font-semibold">
                              ACTIVE (PROTECTED)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStartDelete(v.version, v.food_type)}
                              disabled={actionLoading}
                              className="text-red-500 hover:text-red-400 transition-colors p-1"
                              title={`Delete model ${v.version} for ${v.food_type}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Focused 2-Column Grid for Single Specimen */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Active Version details panel on left */}
          <div className="lg:col-span-1 glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-850 space-y-6 shadow-sm dark:shadow-md">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-semibold">
                  Active Production Model
                </span>
                <span className="text-xs font-bold font-mono text-slate-900 dark:text-white capitalize">
                  <CommodityIcon icon={FOOD_TYPES.find((f) => f.value === selectedCommodity)?.icon || "🌱"} sticker={FOOD_TYPES.find((f) => f.value === selectedCommodity)?.sticker} label={FOOD_TYPES.find((f) => f.value === selectedCommodity)?.label} size={16} />{" "}
                  {FOOD_TYPES.find((f) => f.value === selectedCommodity)?.label || selectedCommodity}
                </span>
              </div>
              <Layers size={14} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
            </div>

            {versions
              .filter((v) => v.is_active === 1 && v.food_type === selectedCommodity)
              .map((active) => {
                const isBaseline = isPermanentBaseline(active.version, active.food_type);

                return (
                  <div key={active.id} className="space-y-4 font-mono text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 shadow-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-semibold text-xs">Version:</span>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        {isBaseline && (
                          <span title="Permanent System Baseline">
                            <ShieldCheck size={13} className="text-amber-500" />
                          </span>
                        )}
                        <span>{active.version}</span>
                      </span>
                    </div>

                    <div className="space-y-2 border-t border-slate-200 dark:border-slate-900 pt-3 text-slate-600 dark:text-slate-400">
                      <div className="flex justify-between"><span>Commodity:</span><span className="text-emerald-600 dark:text-emerald-400 font-bold capitalize">{active.food_type?.replace("_", " ")}</span></div>
                      <div className="flex justify-between"><span>Trained on:</span><span className="text-slate-900 dark:text-white font-bold">{active.trained_at ? active.trained_at.split(" ")[0] : "N/A"}</span></div>
                      <div className="flex justify-between items-center">
                        <span>Training samples:</span>
                        <div className="text-right">
                          <span className="text-slate-900 dark:text-white font-bold">{active.training_samples.toLocaleString()} rows</span>
                          {active.notes?.toLowerCase().includes("verified") && (
                            <span className="block text-[8px] text-emerald-600 dark:text-emerald-400 font-medium">
                              (Base reference + verified samples)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between"><span>Acc Accuracy:</span><span className="text-emerald-600 dark:text-emerald-400 font-bold">{(active.classification_accuracy * 100).toFixed(2)}%</span></div>
                      <div className="flex justify-between"><span>Reg R²:</span><span className="text-sky-600 dark:text-sky-400 font-bold">{active.regression_r2.toFixed(4)}</span></div>
                    </div>

                    {active.notes && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 rounded-lg text-[9px] text-slate-600 dark:text-slate-500 leading-normal">
                        <span className="block font-bold text-slate-700 dark:text-slate-400 mb-1">COMPILATION NOTES:</span>
                        {active.notes}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Versions Table list on right */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3">
              Compilation Changelog History
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px] text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2 uppercase tracking-wider text-[9px]">
                    <th className="pb-2">VER</th>
                    <th className="pb-2">COMMODITY</th>
                    <th className="pb-2">TRAINED_DATE</th>
                    <th className="pb-2">SAMPLES</th>
                    <th className="pb-2">ACCURACY</th>
                    <th className="pb-2">R² SCORE</th>
                    <th className="pb-2">STATUS / ACTION</th>
                    <th className="pb-2 text-right">MANAGEMENT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900/40">
                  {versions.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                      <td className="py-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{v.version}</span>
                        {isPermanentBaseline(v.version, v.food_type) && (
                          <span title="Permanent System Baseline">
                            <ShieldCheck size={12} className="text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-700 dark:text-slate-300 capitalize font-semibold">
                        {v.food_type?.replace("_", " ")}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{v.trained_at ? v.trained_at.split(" ")[0] : "N/A"}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">
                        <span>{v.training_samples.toLocaleString()}</span>
                        {v.notes?.toLowerCase().includes("verified") && (
                          <span className="block text-[8px] text-emerald-600 dark:text-emerald-400 font-medium" title="Combined reference base + verified samples">
                            +verified
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-800 dark:text-slate-300 font-semibold">{(v.classification_accuracy * 100).toFixed(2)}%</td>
                      <td className="py-3 text-slate-800 dark:text-slate-300 font-semibold">{v.regression_r2.toFixed(4)}</td>
                      
                      {/* Status & Activation Action */}
                      <td className="py-3">
                        {v.is_active === 1 ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-bold text-[8px] uppercase inline-flex items-center gap-1">
                            <CheckCircle2 size={10} /> ACTIVE
                          </span>
                        ) : (
                          <button
                            onClick={() => handleActivate(v.version, v.food_type)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold text-[8px] uppercase rounded transition-all shadow-xs disabled:opacity-50"
                          >
                            ACTIVATE MODEL
                          </button>
                        )}
                      </td>

                      {/* Management / Deletion Column */}
                      <td className="py-3 text-right">
                        {isPermanentBaseline(v.version, v.food_type) ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 font-bold text-[8px] uppercase">
                            PERMANENT BASELINE
                          </span>
                        ) : v.is_active === 1 ? (
                          <span className="text-[8px] font-mono text-slate-400 dark:text-slate-600 uppercase font-semibold">
                            ACTIVE (PROTECTED)
                          </span>
                        ) : (
                          <button
                            onClick={() => handleStartDelete(v.version, v.food_type)}
                            disabled={actionLoading}
                            className="text-red-500 hover:text-red-400 transition-colors p-1"
                            title={`Delete model ${v.version} for ${v.food_type}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          2-Step Confirmation Delete Modal
          ─────────────────────────────────────────────────────────────────────── */}
      {deleteConfirmStep !== null && deleteTargetVersion && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 max-w-md w-full font-mono space-y-6 shadow-2xl">
            
            {/* Step 1 Confirmation */}
            {deleteConfirmStep === 1 && (
              <>
                <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <AlertTriangle size={22} className="flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                      DELETE MODEL VERSION {deleteTargetVersion}
                    </h3>
                    <span className="text-[9px] text-slate-500">CONFIRMATION STEP 1 OF 2</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Are you sure you want to delete retrained model version <strong className="text-slate-900 dark:text-white">{deleteTargetVersion}</strong>? 
                  This will remove the version entry from SQLite database records.
                </p>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleCancelDelete}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-semibold"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleProceedToDeleteStep2}
                    className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-500/30 rounded-lg text-xs"
                  >
                    PROCEED TO STEP 2 (1/2)
                  </button>
                </div>
              </>
            )}

            {/* Step 2 Confirmation (Final Warning) */}
            {deleteConfirmStep === 2 && (
              <>
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <AlertTriangle size={22} className="flex-shrink-0 animate-pulse text-red-500" />
                  <div>
                    <h3 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase">
                      FINAL CONFIRMATION: PERMANENT DELETION
                    </h3>
                    <span className="text-[9px] text-red-500 font-bold">CONFIRMATION STEP 2 OF 2</span>
                  </div>
                </div>

                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl space-y-2">
                  <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-bold">
                    ⚠️ FINAL WARNING: Are you 100% certain you want to permanently delete model version {deleteTargetVersion}?
                  </p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">
                    This will permanently delete the compiled binary file (<code className="text-slate-800 dark:text-slate-300 font-bold">{deleteTargetCommodity === "tomato" ? `tomato_freshness_pipeline_${deleteTargetVersion}.pkl` : `${deleteTargetCommodity}_freshness_pipeline_${deleteTargetVersion}.pkl`}</code>) and associated training snapshots. This action CANNOT be undone.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleCancelDelete}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-semibold"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleFinalDeleteConfirm}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs shadow-[0_4px_14px_rgba(239,68,68,0.3)] disabled:opacity-50"
                  >
                    {actionLoading ? "DELETING..." : "PERMANENTLY DELETE MODEL (2/2)"}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
