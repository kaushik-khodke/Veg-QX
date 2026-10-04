"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PredictionRecord } from "@/lib/types";
import { FOOD_TYPES } from "@/lib/constants";
import { CommodityIcon } from "@/components/ui/CommodityIcon";
import { History, CheckSquare, ChevronLeft, ChevronRight, CheckCircle2, RefreshCw } from "lucide-react";

export default function HistoryPage() {
  const [history, setHistory] = useState<PredictionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [specimenFilter, setSpecimenFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Verification state modal
  const [selectedRecord, setSelectedRecord] = useState<PredictionRecord | null>(null);
  const [verifiedCategory, setVerifiedCategory] = useState<string>("Fresh");
  const [verifiedScore, setVerifiedScore] = useState<number | string>(80);
  const [verifiedNotes, setVerifiedNotes] = useState<string>("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const formatTimestamp = (ts: string) => {
    if (!ts) return "N/A";
    const clean = ts.includes("Z") || ts.includes("+") ? ts : ts.replace(" ", "T") + "Z";
    const d = new Date(clean);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await api.getHistory(
        limit,
        offset,
        categoryFilter || undefined,
        specimenFilter !== "all" ? specimenFilter : undefined
      );
      if (res.success) {
        setHistory(res.data);
        setTotal(res.total);
      }
    } catch (e: any) {
      console.warn("[History] Error loading records:", e?.message || e);
      setHistory([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [offset, categoryFilter, specimenFilter]);

  const handleOpenVerify = (record: PredictionRecord) => {
    setSelectedRecord(record);
    setVerifiedCategory(record.category);
    setVerifiedScore(record.freshness_score);
    setVerifiedNotes("");
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord?.id) return;
    setVerifyLoading(true);
    try {
      const scoreToSubmit = typeof verifiedScore === "number" ? verifiedScore : parseFloat(verifiedScore) || 0;
      const res = await api.verifyPrediction(
        selectedRecord.id,
        verifiedCategory,
        scoreToSubmit,
        verifiedNotes
      );
      if (res.success) {
        alert("✔ Diagnostic label verified & stored permanently in SQLite database!");
        setSelectedRecord(null);
        loadHistory();
      }
    } catch (err: any) {
      alert("Verification logging failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleBulkVerify = async () => {
    const validRecords = history.filter(
      (record): record is PredictionRecord & { id: number } => typeof record.id === "number"
    );
    if (validRecords.length === 0) {
      alert("No valid records with IDs found to verify.");
      return;
    }
    const confirm = window.confirm(
      `Are you sure you want to verify all ${validRecords.length} records currently shown on this page using their predicted category & freshness score as defaults?`
    );
    if (!confirm) return;

    setBulkLoading(true);
    try {
      const items = validRecords.map((record) => ({
        prediction_id: record.id,
        actual_category: record.category,
        actual_freshness_score: record.freshness_score,
        notes: "Bulk verified automatically",
      }));
      const res = await api.verifyPredictionsBulk(items);
      if (res.success) {
        alert(`✔ Bulk verification complete! Successfully verified ${res.success_count} records.`);
        loadHistory();
      } else {
        alert(`Bulk verification partially failed: ${res.message}\nErrors: ${res.errors?.join("\n")}`);
        loadHistory();
      }
    } catch (err: any) {
      alert("Bulk verification failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const handlePrevPage = () => {
    if (offset - limit >= 0) {
      setOffset(offset - limit);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono tracking-wide uppercase flex items-center gap-2">
            <History size={24} className="text-emerald-600 dark:text-accent-green" />
            Prediction Audit History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Browse and query historical database records, and verify labels to build the training set.
          </p>
        </div>
        <button
          onClick={loadHistory}
          className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Query Filters */}
      <div className="glass-panel rounded-xl p-4 border border-slate-200 dark:border-slate-800/40 flex flex-wrap gap-4 items-center shadow-sm">
        {/* Specimen Filter */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Filter Specimen:</span>
          <select
            value={specimenFilter}
            onChange={(e) => {
              setSpecimenFilter(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 shadow-xs font-mono"
          >
            <option value="all">🌐 All Specimens</option>
            {FOOD_TYPES.filter((f) => !f.disabled).map((f) => (
              <option key={f.value} value={f.value}>
                {f.icon} {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-semibold">Filter Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 shadow-xs font-mono"
          >
            <option value="">All Categories</option>
            <option value="Fresh">Fresh</option>
            <option value="Aging">Aging</option>
            <option value="Spoiling">Spoiling</option>
          </select>
        </div>

        {/* Bulk verification action */}
        {history.length > 0 && (
          <button
            onClick={handleBulkVerify}
            disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-[11px] font-mono font-bold transition-all disabled:opacity-50 shadow-xs"
          >
            <CheckSquare size={12} />
            <span>{bulkLoading ? "VERIFYING ALL..." : "VERIFY ALL ON PAGE"}</span>
          </button>
        )}

        <div className="ml-auto text-[12px] font-mono text-slate-500 font-medium">
          Showing {total === 0 ? 0 : offset + 1} - {Math.min(offset + limit, total)} of {total} records
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-hidden shadow-sm dark:shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[12px] text-slate-700 dark:text-slate-300 text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/40 text-slate-500 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                <th className="p-3">ID</th>
                <th className="p-3">TIMESTAMP</th>
                <th className="p-3">SPECIMEN</th>
                <th className="p-3">SPECIMEN_ID</th>
                <th className="p-3">POS</th>
                <th className="p-3">RVI</th>
                <th className="p-3">NDVI</th>
                <th className="p-3">SCORE</th>
                <th className="p-3">MODEL</th>
                <th className="p-3">CATEGORY</th>
                <th className="p-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60">
              {history.length > 0 ? (
                history.map((row) => {
                  const rawCommodity = (row.commodity || row.food_type || "tomato").toLowerCase();
                  const foodMeta = FOOD_TYPES.find((f) => f.value === rawCommodity);
                  const icon = foodMeta?.icon || "🌱";
                  const stickerImg = foodMeta?.sticker;
                  const specimenName = foodMeta?.label || rawCommodity.replace("_", " ").toUpperCase();
                  const displaySpecimenId = row.specimen_id || (row.tomato_id ? `ID #${row.tomato_id}` : "N/A");

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/20">
                      <td className="p-3 font-semibold text-slate-500 dark:text-slate-400">db_{row.id}</td>
                      <td className="p-3 text-slate-500">{formatTimestamp(row.timestamp)}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                          <CommodityIcon icon={icon} sticker={stickerImg} label={specimenName} size={14} />
                          <span className="capitalize">{specimenName}</span>
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-300">{displaySpecimenId}</td>
                      <td className="p-3">{row.position || "N/A"}</td>
                      <td className="p-3">{row.rvi.toFixed(2)}</td>
                      <td className="p-3">{row.ndvi.toFixed(4)}</td>
                      <td className="p-3 text-slate-900 dark:text-white font-bold">{row.freshness_score.toFixed(1)}</td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-mono font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-700 dark:text-emerald-400">
                          {row.model_version || `XGB_${rawCommodity}_v1.0`}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                            row.category === "Fresh" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20" :
                            row.category === "Aging" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20" :
                            "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                          }`}>
                            {row.category}
                          </span>
                          {row.category === "Fresh" && row.is_unripe && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                              Unripe
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenVerify(row)}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 rounded-md text-[11px] font-mono font-bold transition-all shadow-xs"
                        >
                          <CheckSquare size={10} />
                          <span>VERIFY</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No prediction records found for the selected specimen and category filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination buttons */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-mono text-[12px] text-slate-600 dark:text-slate-400">
          <button
            onClick={handlePrevPage}
            disabled={offset === 0}
            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white transition-colors font-semibold"
          >
            <ChevronLeft size={12} />
            <span>PREV</span>
          </button>
          <span className="font-bold">PAGE {total === 0 ? 0 : Math.floor(offset / limit) + 1}</span>
          <button
            onClick={handleNextPage}
            disabled={offset + limit >= total}
            className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white transition-colors font-semibold"
          >
            <span>NEXT</span>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Verification Modal Panel */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                Submit verified diagnostic label
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-mono font-semibold"
              >
                [ESC]
              </button>
            </div>

            <form onSubmit={handleVerifySubmit} className="space-y-4 text-xs font-mono">
              <div className="bg-slate-50 dark:bg-slate-950/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>SPECIMEN:</span>
                  <span className="text-slate-900 dark:text-white font-bold capitalize">
                    {selectedRecord.commodity || selectedRecord.food_type || "tomato"} ({selectedRecord.specimen_id || (selectedRecord.tomato_id ? `#${selectedRecord.tomato_id}` : "N/A")})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>MODEL VERSION:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedRecord.model_version}</span>
                </div>
                <div className="flex justify-between">
                  <span>PREDICTED SCORE:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{selectedRecord.freshness_score.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PREDICTED CLASS:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{selectedRecord.category}</span>
                </div>
                <div className="flex justify-between">
                  <span>INPUT TELEMETRY:</span>
                  <span className="text-slate-700 dark:text-slate-300">Blue:{selectedRecord.blue} / NIR:{selectedRecord.nir}</span>
                </div>
              </div>

              {/* Verified Category selection */}
              <div>
                <label className="block mb-1.5 uppercase tracking-widest text-slate-500 text-[9px] font-semibold">Verified Category</label>
                <div className="flex gap-2">
                  {["Fresh", "Aging", "Spoiling"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVerifiedCategory(cat)}
                      className={`flex-1 py-2 border rounded-lg font-bold text-center text-[10px] transition-all uppercase ${
                        verifiedCategory === cat
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-xs"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified Score */}
              <div>
                <label className="block mb-1.5 uppercase tracking-widest text-slate-500 text-[9px] font-semibold">Verified Freshness Score (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={verifiedScore}
                  onChange={(e) => setVerifiedScore(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-emerald-500 font-mono shadow-xs"
                />
              </div>

              {/* Verified Notes */}
              <div>
                <label className="block mb-1.5 uppercase tracking-widest text-slate-500 text-[9px] font-semibold">Verification Notes</label>
                <textarea
                  value={verifiedNotes}
                  onChange={(e) => setVerifiedNotes(e.target.value)}
                  placeholder="e.g. slight yellowing near stem, texture soft..."
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-emerald-500 font-mono placeholder:text-slate-400 shadow-xs"
                />
              </div>

              <button
                type="submit"
                disabled={verifyLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-xs transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] uppercase tracking-wider font-mono"
              >
                {verifyLoading ? "SAVING TELEMETRY..." : "LOG VERIFICATION RECORD"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
