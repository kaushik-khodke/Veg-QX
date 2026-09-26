"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { FOOD_TYPES } from "@/lib/constants";
import { CommodityIcon } from "@/components/ui/CommodityIcon";
import { RotateCcw, AlertTriangle, Play, ChevronRight, CheckCircle2, Download, RefreshCw } from "lucide-react";

export default function RetrainingPage() {
  const [step, setStep] = useState(1);
  const [commodity, setCommodity] = useState<string>("tomato");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);


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

  const handleCommoditySelect = (newComm: string) => {
    setCommodity(newComm);
    if (typeof window !== "undefined") {
      localStorage.setItem("vegqx_commodity", newComm);
      window.dispatchEvent(new CustomEvent("commodityChanged", { detail: newComm }));
    }
  };

  // Dynamic dataset preview state
  const [preview, setPreview] = useState<{
    reference_samples: number;
    verified_samples: number;
    merged_samples: number;
    fresh_count: number;
    aging_count: number;
    spoiling_count: number;
    retraining_readiness: boolean;
    remaining_required: number;
  }>({
    reference_samples: 100000,
    verified_samples: 0,
    merged_samples: 100000,
    fresh_count: 0,
    aging_count: 0,
    spoiling_count: 0,
    retraining_readiness: false,
    remaining_required: 10,
  });

  // Real-time progress polling state
  const [progress, setProgress] = useState<{
    is_running: boolean;
    step_name: string;
    percentage: number;
    error: string | null;
  }>({
    is_running: false,
    step_name: "Idle",
    percentage: 0,
    error: null,
  });

  const loadPreview = async (targetComm = commodity) => {
    try {
      const res = await api.getRetrainingPreview(targetComm);
      if (res.success) {
        setPreview(res.data);
      }
    } catch (e) {
      console.error("Error fetching retraining preview:", e);
    }
  };

  useEffect(() => {
    loadPreview(commodity);
  }, [commodity]);

  // Poll progress state while training is running
  useEffect(() => {
    let interval: any = null;
    if (loading) {
      interval = setInterval(async () => {
        try {
          const progRes = await api.getRetrainingProgress();
          if (progRes.success) {
            setProgress(progRes.data);
          }
        } catch (e) {
          console.error(e);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  const handleRetrain = async () => {
    setLoading(true);
    setError(null);
    setProgress({ is_running: true, step_name: "Initializing Pipeline...", percentage: 5, error: null });

    try {
      const res = await api.retrainModel(notes, commodity);
      if (res.success) {
        setResult(res);
        setStep(3); // Go to evaluation results
        loadPreview(commodity); // Refresh preview to reflect dataset reset
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("commodityChanged", { detail: commodity }));
          window.dispatchEvent(new CustomEvent("vegqx_model_updated", { detail: commodity }));
        }
      } else {
        setError(res.error || "Retraining failed checks.");
        setStep(1);
        loadPreview(commodity);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Retraining runtime error.");
      setStep(1);
      loadPreview(commodity);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-2">
            <RotateCcw size={24} className="text-emerald-600 dark:text-accent-green animate-spin" style={{ animationDuration: "10s" }} />
            Human-in-the-Loop Retraining Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Module 10: Retrain your XGBoost models using accumulated human-verified diagnostics under strictly enforced safety gates.
          </p>
        </div>
        <a
          href={api.getDownloadVerifiedCsvUrl(commodity)}
          download
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-mono font-bold transition-all shadow-xs"
        >
          <Download size={14} />
          <span>DOWNLOAD VERIFIED DATASET</span>
        </a>
      </div>

      {/* Commodity Selector Bar */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-widest">Retraining Commodity:</span>
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
              <CommodityIcon icon={f.icon} sticker={f.sticker} label={f.label} size={16} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Retraining Stepper Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 font-mono text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800/60 pb-6">
        <div className={`flex items-center gap-2 ${step === 1 ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step === 1 ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold" : "border-slate-300 dark:border-slate-800"}`}>1</span>
          <span>DATA READINESS & PREVIEW</span>
        </div>
        <ChevronRight size={14} className="hidden lg:block self-center text-slate-400" />

        <div className={`flex items-center gap-2 ${step === 2 ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step === 2 ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold" : "border-slate-300 dark:border-slate-800"}`}>2</span>
          <span>TRIGGER RUN & PROGRESS</span>
        </div>
        <ChevronRight size={14} className="hidden lg:block self-center text-slate-400" />

        <div className={`flex items-center gap-2 ${step === 3 ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${step === 3 ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold" : "border-slate-300 dark:border-slate-800"}`}>3</span>
          <span>EVALUATION AUDIT</span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl font-mono font-medium">
          ❌ RETRAINING ERROR: {error}
        </div>
      )}

      {/* Stepper Content Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Step panels on left */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Data Check & Preview */}
          {step === 1 && (
            <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-6 shadow-sm dark:shadow-md">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
                  Step 1: Dataset Verification & Retraining Preview
                </h3>
                <button
                  onClick={() => loadPreview()}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono leading-relaxed">
                Retraining combines the 100k reference dataset with newly logged human-verified data points stored in SQLite. Only active human-verified positions are utilized to guarantee zero label contamination.
              </p>

              {/* Dynamic Pre-retraining Breakdown Card */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-900 font-mono text-[11px] space-y-2 text-slate-600 dark:text-slate-400">
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-900/60 pb-1.5">
                  <span>REFERENCE DATASET SAMPLES:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{preview.reference_samples.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-900/60 pb-1.5">
                  <span>VERIFIED DATASET SAMPLES (SQLITE):</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{preview.verified_samples}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-900/60 pb-1.5 text-[10px] pl-4 text-slate-500">
                  <span>↳ FRESH: {preview.fresh_count} | AGING: {preview.aging_count} | SPOILING: {preview.spoiling_count}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-900/60 pb-1.5">
                  <span>COMBINED RETRAINING DATASET TOTAL:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{preview.merged_samples.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>MINIMUM REQUIRED ACCUMULATION:</span>
                  <span className={preview.retraining_readiness ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>
                    {preview.retraining_readiness ? "READY (≥ 10 SAMPLES)" : `INSUFFICIENT DATA (${preview.remaining_required} NEEDED)`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!preview.retraining_readiness}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-6 rounded-lg text-xs font-mono shadow-[0_4px_14px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>PROCEED TO RETRAIN</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Step 2: Trigger Retrain & Real-Time Progress */}
          {step === 2 && (
            <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-6 shadow-sm dark:shadow-md">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3">
                Step 2: Initialize Retraining Pipeline
              </h3>

              {loading ? (
                /* Real-Time Progress Bar Component */
                <div className="space-y-4 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 animate-pulse flex items-center gap-2 font-semibold">
                      <RotateCcw size={14} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                      {progress.step_name || "Training in progress..."}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{progress.percentage}%</span>
                  </div>
                  
                  {/* Progress track */}
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 p-0.5">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-slate-500 text-center">
                    Please keep this page open. Retraining model under atomic locks and evaluating performance limits...
                  </p>
                </div>
              ) : (
                /* Inputs Form */
                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <label className="block mb-1.5 uppercase tracking-widest text-slate-500 text-[9px] font-semibold">Retraining Run Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Retraining pipeline v1.2 with real-world greenhouse tomato sensor logs."
                      rows={4}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-emerald-500 placeholder:text-slate-400 shadow-xs"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-mono font-semibold"
                    >
                      BACK
                    </button>
                    <button
                      onClick={handleRetrain}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs font-mono shadow-[0_4px_14px_rgba(16,185,129,0.3)] disabled:opacity-50"
                    >
                      <Play size={12} />
                      <span>START CONTINUOUS LEARNING RUN</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Comprehensive Evaluation Results */}
          {step === 3 && result && (
            <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-6 shadow-sm dark:shadow-md">
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={18} />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider">
                  Retraining Successful. Active Model Bumped to {result.new_version}!
                </h3>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono leading-relaxed">
                The retrained pipeline model passed all safety performance checks (R² ≥ 0.85). Model parameters were compiled, verified, deployed to production endpoints, and verified training samples were archived.
              </p>

              {/* Side-by-Side Model comparison & Full Audit Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 font-mono">
                {/* Previous model */}
                <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-900 space-y-3">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 block border-b border-slate-200 dark:border-slate-900 pb-1 font-semibold">
                    PREVIOUS MODEL ({result.base_version})
                  </span>
                  <div className="space-y-1 text-xs">
                    <div>CLASSIFICATION ACCURACY: <span className="text-slate-900 dark:text-white font-bold">{(result.metrics.old_accuracy * 100).toFixed(2)}%</span></div>
                    <div>REGRESSION R² SCORE: <span className="text-slate-900 dark:text-white font-bold">{result.metrics.old_r2.toFixed(4)}</span></div>
                  </div>
                </div>

                {/* New model */}
                <div className="bg-emerald-50/70 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/30 space-y-3">
                  <span className="text-[9px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 block border-b border-emerald-200 dark:border-emerald-900/40 pb-1 font-bold">
                    DEPLOYED MODEL ({result.new_version})
                  </span>
                  <div className="space-y-1 text-xs">
                    {result.selected_classifier && (
                      <div>ALGORITHM: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{result.selected_classifier} (Highest Acc)</span></div>
                    )}
                    <div>ACCURACY: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{(result.metrics.new_accuracy * 100).toFixed(2)}%</span></div>
                    <div>REGRESSION R²: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{result.metrics.new_r2.toFixed(4)}</span></div>
                    {result.metrics.f1 && <div>F1 SCORE: <span className="text-slate-700 dark:text-slate-300 font-semibold">{(result.metrics.f1 * 100).toFixed(2)}%</span></div>}
                    {result.metrics.precision && <div>PRECISION: <span className="text-slate-700 dark:text-slate-300 font-semibold">{(result.metrics.precision * 100).toFixed(2)}%</span></div>}
                    {result.metrics.recall && <div>RECALL: <span className="text-slate-700 dark:text-slate-300 font-semibold">{(result.metrics.recall * 100).toFixed(2)}%</span></div>}
                    {result.metrics.mae && <div>MAE: <span className="text-slate-600 dark:text-slate-400 font-semibold">{result.metrics.mae.toFixed(4)}</span></div>}
                    {result.metrics.rmse && <div>RMSE: <span className="text-slate-600 dark:text-slate-400 font-semibold">{result.metrics.rmse.toFixed(4)}</span></div>}
                  </div>
                </div>
              </div>

              {result.snapshot_path && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-900 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-500 truncate">
                  IMMUTABLE DATASET SNAPSHOT: <span className="text-slate-900 dark:text-slate-300 font-semibold">{result.snapshot_path}</span>
                </div>
              )}

              <button
                onClick={() => {
                  setStep(1);
                  setNotes("");
                  setResult(null);
                }}
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-300 font-semibold py-2.5 rounded-lg text-xs font-mono shadow-xs"
              >
                CLOSE AND AUDIT COMPLETE
              </button>
            </div>
          )}
        </div>

        {/* Retraining Gate Guidelines card on right */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Safety gates rules
          </h3>
          <div className="space-y-3 font-mono text-[9px] text-slate-600 dark:text-slate-400 leading-normal">
            <div>
              <span className="text-amber-600 dark:text-amber-400 font-bold block">01 / OVERFITTING FLOOR</span>
              <p>Model R² score must satisfy: R² ≥ 0.85. Anything less is rejected automatically.</p>
            </div>
            <div>
              <span className="text-amber-600 dark:text-amber-400 font-bold block">02 / REGRESSION SLIPGATE</span>
              <p>Performance degradation from the baseline cannot exceed 3% (R² &lt; current R² - 0.03).</p>
            </div>
            <div>
              <span className="text-amber-600 dark:text-amber-400 font-bold block">03 / NO AUTO RETRAIN</span>
              <p>ML models are never automatically updated on predictions. Triggering runs requires human interaction.</p>
            </div>
            <div>
              <span className="text-amber-600 dark:text-amber-400 font-bold block">04 / AUTOMATIC ROLLBACK</span>
              <p>If candidate model fails performance limits, previous active model remains deployed and verified queue is preserved.</p>
            </div>
            <div>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold block">05 / HIGHEST ACCURACY CANDIDATE</span>
              <p>Algorithm candidates are benchmarked during retraining, and the model with the highest classification accuracy is selected and deployed.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
