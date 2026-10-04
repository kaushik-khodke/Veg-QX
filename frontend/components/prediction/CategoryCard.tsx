"use client";

import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

interface CategoryCardProps {
  category: "Fresh" | "Aging" | "Spoiling";
  confidence: number;
  is_unripe?: boolean;
  ripeness_stage?: string;
}

export default function CategoryCard({ category, confidence, is_unripe, ripeness_stage }: CategoryCardProps) {
  const getThemeStyles = () => {
    switch (category) {
      case "Fresh":
        return {
          border: "border-emerald-300 dark:border-emerald-500/30",
          bg: "bg-emerald-50/80 dark:bg-emerald-500/10",
          text: "text-emerald-700 dark:text-emerald-400",
          iconColor: "text-emerald-600 dark:text-emerald-400",
          iconBg: "bg-emerald-100 dark:bg-slate-950/40",
          shadow: "shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.2)]",
        };
      case "Aging":
        return {
          border: "border-amber-300 dark:border-amber-500/30",
          bg: "bg-amber-50/80 dark:bg-amber-500/10",
          text: "text-amber-700 dark:text-amber-400",
          iconColor: "text-amber-600 dark:text-amber-400",
          iconBg: "bg-amber-100 dark:bg-slate-950/40",
          shadow: "shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.2)]",
        };
      case "Spoiling":
        return {
          border: "border-red-300 dark:border-red-500/30",
          bg: "bg-red-50/80 dark:bg-red-500/10",
          text: "text-red-700 dark:text-red-400",
          iconColor: "text-red-600 dark:text-red-400",
          iconBg: "bg-red-100 dark:bg-slate-950/40",
          shadow: "shadow-sm dark:shadow-[0_0_15px_rgba(239,68,68,0.2)]",
        };
      default:
        return {
          border: "border-slate-300 dark:border-slate-700",
          bg: "bg-slate-50 dark:bg-slate-800/20",
          text: "text-slate-800 dark:text-slate-200",
          iconColor: "text-slate-600 dark:text-slate-400",
          iconBg: "bg-slate-100 dark:bg-slate-900",
          shadow: "shadow-sm",
        };
    }
  };

  const styles = getThemeStyles();

  const getIcon = () => {
    switch (category) {
      case "Fresh":
        return <CheckCircle2 size={26} className={styles.iconColor} />;
      case "Aging":
        return <AlertTriangle size={26} className={styles.iconColor} />;
      case "Spoiling":
        return <ShieldAlert size={26} className={styles.iconColor} />;
    }
  };

  return (
    <div
      className={`glass-panel border rounded-2xl p-6 flex items-center justify-between transition-all duration-300 ${styles.border} ${styles.bg} ${styles.shadow}`}
    >
      <div className="space-y-1">
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest block font-semibold">
          Classification Target Output
        </span>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h4 className={`text-2xl font-black uppercase tracking-wider ${styles.text}`}>
            {confidence > 0 ? category : "STANDBY"}
          </h4>
          {confidence > 0 && category === "Fresh" && is_unripe && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-extrabold uppercase bg-amber-500/15 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 dark:border-amber-400/30 shadow-xs animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping" />
              Unripe
            </span>
          )}
        </div>

        <div className="text-[12px] font-mono text-slate-600 dark:text-slate-400">
          {confidence > 0 ? (
            <>
              Confidence Probability:{" "}
              <span className="text-slate-900 dark:text-white font-bold">{confidence.toFixed(1)}%</span>
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-semibold animate-pulse">Waiting for sensor trigger...</span>
          )}
        </div>
      </div>

      <div className={`p-3.5 rounded-xl border border-slate-200/50 dark:border-white/5 ${styles.iconBg}`}>
        {getIcon()}
      </div>
    </div>
  );
}
