"use client";

import { useEffect, useState, useRef } from "react";
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Pause, AlertCircle, Lightbulb,
  CheckCircle2, X, Sparkles, RotateCcw, Download, ChevronDown,
} from "lucide-react";

const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.07)";

interface Recommendation {
  id: string;
  campaign_id: string;
  campaign_name: string;
  action: string;
  reason: string;
  risk_score: number;
  change_percent: number | null;
  status: string;
  generated_at: string;
}

const ACTION_MAP: Record<string, {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  glowColor: string;
}> = {
  increase: {
    label: "Artır",
    icon: TrendingUp,
    iconColor: "#10B981",
    iconBg: "rgba(16,185,129,0.15)",
    borderColor: "#10B981",
    pillBg: "rgba(16,185,129,0.1)",
    pillText: "#34D399",
    pillBorder: "rgba(16,185,129,0.3)",
    glowColor: "rgba(16,185,129,0.12)",
  },
  decrease: {
    label: "Azalt",
    icon: TrendingDown,
    iconColor: "#F43F5E",
    iconBg: "rgba(244,63,94,0.15)",
    borderColor: "#F43F5E",
    pillBg: "rgba(244,63,94,0.1)",
    pillText: "#FB7185",
    pillBorder: "rgba(244,63,94,0.3)",
    glowColor: "rgba(244,63,94,0.1)",
  },
  hold: {
    label: "Bekle",
    icon: Pause,
    iconColor: "#94A3B8",
    iconBg: "rgba(148,163,184,0.1)",
    borderColor: "#475569",
    pillBg: "rgba(71,85,105,0.3)",
    pillText: "#94A3B8",
    pillBorder: "rgba(71,85,105,0.5)",
    glowColor: "rgba(71,85,105,0.1)",
  },
  review: {
    label: "İncele",
    icon: AlertCircle,
    iconColor: "#F59E0B",
    iconBg: "rgba(245,158,11,0.15)",
    borderColor: "#F59E0B",
    pillBg: "rgba(245,158,11,0.1)",
    pillText: "#FCD34D",
    pillBorder: "rgba(245,158,11,0.3)",
    glowColor: "rgba(245,158,11,0.1)",
  },
};

const FILTERS = [
  { key: "all",     label: "Tümü"       },
  { key: "pending", label: "Bekleyen"   },
  { key: "high",    label: "Yüksek Risk"},
  { key: "applied", label: "Uygulandı"  },
  { key: "ignored",   label: "Yoksayıldı" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function RiskBadge({ score }: { score: number }) {
  if (score >= 7)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
        Yüksek · {score}
      </span>
    );
  if (score >= 4)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        Orta · {score}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
      Düşük · {score}
    </span>
  );
}

function GenerateBtn({ generating, onClick }: { generating: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={generating}
      className="relative overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all shrink-0"
      style={{
        background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
        boxShadow: generating ? "none" : "0 0 22px rgba(37,99,235,0.4)",
      }}
    >
      {!generating && (
        <motion.span
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{ x: ["-100%", "250%"] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "linear" }}
        />
      )}
      {generating ? (
        <>
          <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Üretiliyor…
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Yeni Üret
        </>
      )}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const [recs,       setRecs]       = useState<Recommendation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter,     setFilter]     = useState("all");
  const [updating,   setUpdating]   = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await api.get("/api/recommendations/");
      setRecs(res.data);
    } catch (err) {
      console.error("Öneri verisi alınamadı:", err);
      setRecs([]);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      await api.post("/api/recommendations/generate");
      await load();
      toast.success("Yeni öneriler üretildi");
    } catch {
      toast.error("Öneri üretilemedi");
    } finally {
      setGenerating(false);
    }
  }

  async function applyAction(id: string, status: "applied" | "ignored" | "pending") {
    try {
      const res = await api.patch(`/api/recommendations/${id}/status`, { status });
      const newStatus = (res.data?.status ?? status) as string;
      setRecs((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus } : r));
      const msg = newStatus === "applied" ? "Uygulandı ✓" : newStatus === "ignored" ? "Yoksayıldı" : "Beklemeye alındı";
      toast.success(msg);
    } catch {
      toast.error("İşlem başarısız");
    }
  }

  function exportData(fileFormat: 'csv' | 'xlsx') {
    const ACTION_TR: Record<string, string> = {
      increase: "Artır",
      decrease: "Azalt",
      hold:     "Sabit Tut",
      review:   "İncele",
    };
    const STATUS_TR: Record<string, string> = {
      pending: "Bekleyen",
      applied: "Uygulandı",
      ignored: "Yoksayıldı",
    };
    const rows = recs.map((r) => ({
      "Kampanya Adı":    r.campaign_name,
      "Öneri":           ACTION_TR[r.action] ?? r.action,
      "Değişim Yüzdesi": r.change_percent != null ? r.change_percent : "",
      "Risk Skoru":      r.risk_score,
      "Açıklama":        r.reason,
      "Durum":           STATUS_TR[r.status] ?? r.status,
      "Tarih":           new Date(r.generated_at).toLocaleDateString("tr-TR"),
    }));
    const today = new Date().toISOString().slice(0, 10);
    if (fileFormat === 'csv') {
      const headers = ["Kampanya Adı", "Öneri", "Değişim Yüzdesi", "Risk Skoru", "Açıklama", "Durum", "Tarih"];
      const csv = [headers, ...rows.map((r) => headers.map((h) => r[h as keyof typeof r]))]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oneriler_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Öneriler');
      XLSX.writeFile(wb, `oneriler_${today}.xlsx`);
    }
    setShowExportMenu(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!showExportMenu) return;
    function handle(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showExportMenu]);

  const filtered = recs.filter((r) => {
    if (filter === "all")     return true;
    if (filter === "high")    return r.risk_score >= 7;
    if (filter === "pending") return r.status === "pending";
    return r.status === filter;
  });

  const pendingCount  = recs.filter((r) => r.status === "pending").length;
  const appliedCount  = recs.filter((r) => r.status === "applied").length;
  const highRiskCount = recs.filter((r) => r.risk_score >= 7).length;
  const total         = recs.length;

  const KPI_CARDS = [
    {
      label: "Toplam Öneri",
      value: total,
      sub: "üretildi",
      icon: Lightbulb,
      iconColor: "#64748B",
      iconGlow: "rgba(100,116,139,0.18)",
      borderColor: "#334155",
      numCls: "text-slate-200",
      pulse: false,
      barPct: 100,
      barColor: "#334155",
    },
    {
      label: "Bekleyen",
      value: pendingCount,
      sub: "işlem bekliyor",
      icon: Sparkles,
      iconColor: "#F59E0B",
      iconGlow: "rgba(245,158,11,0.2)",
      borderColor: "#F59E0B",
      numCls: "text-amber-400",
      pulse: true,
      barPct: total > 0 ? Math.round((pendingCount / total) * 100) : 0,
      barColor: "#F59E0B",
    },
    {
      label: "Yüksek Risk",
      value: highRiskCount,
      sub: "öncelikli",
      icon: AlertCircle,
      iconColor: "#F43F5E",
      iconGlow: "rgba(244,63,94,0.2)",
      borderColor: "#F43F5E",
      numCls: "text-rose-400",
      pulse: false,
      barPct: total > 0 ? Math.round((highRiskCount / total) * 100) : 0,
      barColor: "#F43F5E",
    },
    {
      label: "Uygulandı",
      value: appliedCount,
      sub: "tamamlandı",
      icon: CheckCircle2,
      iconColor: "#10B981",
      iconGlow: "rgba(16,185,129,0.2)",
      borderColor: "#10B981",
      numCls: "text-emerald-400",
      pulse: false,
      barPct: total > 0 ? Math.round((appliedCount / total) * 100) : 0,
      barColor: "#10B981",
    },
  ];

  return (
    <div className="page-enter">
      <Topbar title="Öneriler" subtitle="AI destekli kampanya önerileri" />

      <div className="p-6 space-y-6">

        {/* ── KPI Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPI_CARDS.map(({ label, value, sub, icon: Ic, iconColor, iconGlow, borderColor, numCls, pulse, barPct, barColor }) => (
            <div
              key={label}
              className="rounded-xl p-4 relative overflow-hidden"
              style={{
                background: BG2,
                border: BORDER,
                borderLeft: `4px solid ${borderColor}`,
              }}
            >
              {/* Icon */}
              <div
                className="absolute right-3 top-3 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: iconGlow,
                  boxShadow: `0 0 14px ${iconGlow}`,
                }}
              >
                <Ic className="h-5 w-5" style={{ color: iconColor }} />
              </div>

              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-2">{label}</p>

              <div className="flex items-center gap-2 mb-1">
                <p className={cn("text-3xl font-bold tracking-tight", numCls)}>{value}</p>
                {pulse && value > 0 && (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-600 mb-3">{sub}</p>

              {/* Progress bar */}
              <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                  style={{ background: barColor }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters + Generate ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-150",
                  filter === key
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "text-slate-400 hover:text-slate-200 border-slate-700/60 hover:border-slate-600"
                )}
                style={{
                  background: filter === key ? undefined : BG3,
                  boxShadow: filter === key ? "0 0 14px rgba(37,99,235,0.35)" : "none",
                }}
              >
                {label}
                {key === "pending" && pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={recs.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: BG3, border: BORDER, color: "#94a3b8" }}
              >
                <Download className="h-4 w-4" />
                Dışa Aktar
                <ChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-xl"
                  style={{ background: BG2, border: BORDER, minWidth: '150px' }}
                >
                  <button
                    onClick={() => exportData('csv')}
                    className="w-full text-left text-xs px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    CSV (.csv)
                  </button>
                  <button
                    onClick={() => exportData('xlsx')}
                    className="w-full text-left text-xs px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors border-t"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                  >
                    Excel (.xlsx)
                  </button>
                </div>
              )}
            </div>
            <GenerateBtn generating={generating} onClick={generate} />
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* ── Empty state ── */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-24 flex flex-col items-center justify-center rounded-2xl text-center"
            style={{ background: BG2, border: BORDER }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: "rgba(37,99,235,0.1)",
                border: "1px solid rgba(37,99,235,0.2)",
                boxShadow: "0 0 32px rgba(37,99,235,0.1)",
              }}
            >
              <Lightbulb className="h-10 w-10 text-blue-400" />
            </div>
            <p className="text-slate-200 font-semibold text-lg mb-2">
              {filter === "all" ? "Henüz öneri bulunmuyor" : "Bu filtrede öneri yok"}
            </p>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-8">
              {filter === "all"
                ? "AI motoru kampanya verilerinizi analiz ederek akıllı öneriler üretir. Başlamak için aşağıdaki butona tıklayın."
                : "Farklı bir filtre seçin veya yeni öneriler üretin."}
            </p>
            {filter === "all" && (
              <GenerateBtn generating={generating} onClick={generate} />
            )}
          </motion.div>
        ) : (
          /* ── Recommendation cards ── */
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((r, idx) => {
                const act    = ACTION_MAP[r.action] ?? ACTION_MAP.review;
                const Icon   = act.icon;
                const isDone = r.status === "applied" || r.status === "ignored";

                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: isDone ? 0.5 : 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    whileHover={!isDone ? { y: -2 } : {}}
                    transition={{ delay: idx * 0.04, duration: 0.22 }}
                    className="rounded-xl flex flex-col overflow-hidden"
                    style={{
                      minHeight: 200,
                      background: BG2,
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderLeft: `4px solid ${act.borderColor}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isDone) {
                        e.currentTarget.style.boxShadow =
                          `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${act.borderColor}44`;
                        e.currentTarget.style.borderColor = act.borderColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    }}
                  >
                    {/* Body */}
                    <div className="p-5 flex-1 space-y-4">

                      {/* Top: icon + name + risk badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background: act.iconBg,
                              border: `1px solid ${act.borderColor}44`,
                            }}
                          >
                            <Icon className="h-5 w-5" style={{ color: act.iconColor }} />
                          </div>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-base font-bold text-slate-100 leading-tight truncate">
                              {r.campaign_name}
                            </p>
                          </div>
                        </div>
                        <RiskBadge score={r.risk_score} />
                      </div>

                      {/* Action pill + change pct + done badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full border"
                          style={{
                            background:   act.pillBg,
                            color:        act.pillText,
                            borderColor:  act.pillBorder,
                          }}
                        >
                          {act.label}
                        </span>
                        {r.change_percent != null && (
                          <span
                            className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md"
                            style={{
                              color:      r.change_percent > 0 ? "#34D399" : "#FB7185",
                              background: r.change_percent > 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)",
                            }}
                          >
                            {r.change_percent > 0 ? "+" : ""}{r.change_percent}%
                          </span>
                        )}
                        {isDone && (
                          <span className={cn(
                            "text-xs font-medium px-2.5 py-0.5 rounded-full border",
                            r.status === "applied"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-slate-700/50 text-slate-500 border-slate-600/40"
                          )}>
                            {r.status === "applied" ? "✓ Uygulandı" : "Yoksayıldı"}
                          </span>
                        )}
                      </div>

                      {/* Reason */}
                      <p className="text-sm text-slate-400 leading-[1.7]">{r.reason}</p>
                    </div>

                    {/* Footer */}
                    <div
                      className="px-5 py-3.5 flex items-center justify-between"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <span className="text-[11px] text-slate-600">{relativeTime(r.generated_at)}</span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => applyAction(r.id, "applied")}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={r.status === "applied"
                            ? { background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", boxShadow: "0 0 12px rgba(37,99,235,0.4)" }
                            : { background: BG3, color: "#475569", border: "1px solid rgba(71,85,105,0.4)" }
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Uygulandı
                        </button>
                        <button
                          onClick={() => applyAction(r.id, "ignored")}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={r.status === "ignored"
                            ? { background: "rgba(244,63,94,0.12)", color: "#fb7185", border: "1px solid rgba(244,63,94,0.3)", boxShadow: "0 0 10px rgba(244,63,94,0.15)" }
                            : { background: BG3, color: "#475569", border: "1px solid rgba(71,85,105,0.4)" }
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                          Yoksay
                        </button>
                        <button
                          onClick={() => applyAction(r.id, "pending")}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ background: BG3, color: "#475569", border: "1px solid rgba(71,85,105,0.4)" }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Beklemede
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

      </div>
    </div>
  );
}
