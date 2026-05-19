"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  FlaskConical, Calendar, TrendingUp, TrendingDown,
  DollarSign, Target, BarChart3, AlertTriangle,
  CheckCircle, Sparkles, ChevronRight, RefreshCw,
  Zap, Shield, Clock, Megaphone,
} from "lucide-react";

interface Campaign { id: string; campaign_name: string; daily_budget: number | null; }
interface Event { date: string; end_date: string; event_type: string; name: string; category: string; emoji: string; }
interface SimForecast { predicted_cost: number; predicted_conversions: number; predicted_revenue: number; predicted_roas: number; predicted_cpa: number; }
interface SimResult {
  campaign_id: string; campaign_name: string;
  scenario: { current_daily_budget: number; new_daily_budget: number; budget_change_pct: number; horizon_days: number; event_type: string | null; event_name: string | null };
  current_forecast: SimForecast;
  simulated_forecast: SimForecast;
  delta: { cost_change_pct: number; conversions_change_pct: number; revenue_change_pct: number; roas_change_pct: number };
  similar_periods: { period_start: string; event_name: string; metrics: { total_cost: number; total_conversions: number; avg_roas: number; avg_cpa: number } }[];
  risk_assessment: { level: string; factors: string[]; recommendation: string };
  confidence_score: number;
}


// ── Helpers ───────────────────────────────────────────────────────────────
const TOOLTIP_STYLE = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#f8fafc" };

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: d });
}

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-md border",
      up ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{fmt(pct)}%
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string; icon: React.ElementType }> = {
    low:    { cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", icon: Shield },
    medium: { cls: "bg-amber-500/10 border-amber-500/30 text-amber-400",      icon: AlertTriangle },
    high:   { cls: "bg-rose-500/10 border-rose-500/30 text-rose-400",         icon: Zap },
  };
  const labels: Record<string, string> = { low: "Düşük Risk", medium: "Orta Risk", high: "Yüksek Risk" };
  const { cls, icon: Icon } = map[level] || map.medium;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border", cls)}>
      <Icon className="h-3 w-3" />{labels[level] || level}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: string }) {
  const map: Record<string, string> = {
    holiday:  "bg-purple-500/10 border-purple-500/20 text-purple-400",
    shopping: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    seasonal: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  };
  const labels: Record<string, string> = { holiday: "Tatil", shopping: "Alışveriş", seasonal: "Sezonsal" };
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-md border font-medium", map[cat] || "bg-slate-700 border-slate-600 text-slate-400")}>{labels[cat] ?? cat}</span>;
}

const CAT_STYLE: Record<string, { accent: string; banner: string }> = {
  holiday:  { accent: "#8b5cf6", banner: "linear-gradient(135deg,rgba(139,92,246,0.5),rgba(109,40,217,0.25))"  },
  shopping: { accent: "#2563eb", banner: "linear-gradient(135deg,rgba(37,99,235,0.5),rgba(29,78,216,0.25))"    },
  seasonal: { accent: "#f59e0b", banner: "linear-gradient(135deg,rgba(245,158,11,0.5),rgba(217,119,6,0.25))"   },
};

const EVENT_TYPES = [
  { value: "black_friday",    label: "Black Friday"     },
  { value: "yilbasi",         label: "Yılbaşı Haftası"  },
  { value: "sevgililer_gunu", label: "Sevgililer Günü"  },
  { value: "anneler_gunu",    label: "Anneler Günü"     },
  { value: "babalar_gunu",    label: "Babalar Günü"     },
  { value: "ramazan_bayrami", label: "Ramazan Bayramı"  },
  { value: "kurban_bayrami",  label: "Kurban Bayramı"   },
  { value: "okul_acilisi",    label: "Okul Açılışı"     },
  { value: "yaz_indirimi",    label: "Yaz İndirimi"     },
];

const HORIZON_META: Record<number, { short: string; desc: string }> = {
  7:  { short: "7G",  desc: "Kısa vade"  },
  14: { short: "14G", desc: "Orta vade"  },
  30: { short: "30G", desc: "Uzun vade"  },
};

const METRIC_TOOLTIPS: Record<string, string> = {
  "Harcama":  "Toplam kampanya harcaması",
  "Dönüşüm":  "Tahmini dönüşüm sayısı",
  "Gelir":    "Tahmini toplam gelir",
  "ROAS":     "Gelir / Harcama oranı",
};

const glassCard = "bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 rounded-2xl";
const inputCls  = "w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)] transition-all placeholder:text-slate-600";

// ── Metric box with tooltip ────────────────────────────────────────────────
function MetricBox({ label, value, delta, color, icon: Icon }: {
  label: string; value: string; delta: number | null; color: string; icon: React.ElementType;
}) {
  return (
    <div className="relative bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 group cursor-default hover:border-slate-600/50 transition-colors">
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 border border-slate-600/60 rounded-lg text-[10px] text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
        {METRIC_TOOLTIPS[label] ?? label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <Icon className={cn("h-3.5 w-3.5", color)} />
      </div>
      <p className={cn("text-xl font-bold tracking-tight", color)}>{value}</p>
      {delta != null && <div className="mt-2"><DeltaBadge pct={delta} /></div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function SimulationsPage() {
  const [campaigns,   setCampaigns] = useState<Campaign[]>([]);
  const [upcomingEvs, setUpcoming]  = useState<Event[]>([]);
  const [evLoading,   setEvLoading] = useState(true);

  const [selCampaign, setSelCampaign] = useState("");
  const [newBudget,   setNewBudget]   = useState("");
  const [horizonDays, setHorizonDays] = useState(7);
  const [eventType,   setEventType]   = useState("");

  const [simResult,  setSimResult]  = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError,   setSimError]   = useState<string | null>(null);

  useEffect(() => {
    api.get("/campaigns")
      .then(r => setCampaigns(r.data ?? []))
      .catch(() => setCampaigns([]));

    api.get("/api/simulations/events/upcoming?days=30")
      .then(r => setUpcoming(r.data ?? []))
      .catch(() => setUpcoming([]))
      .finally(() => setEvLoading(false));
  }, []);

  useEffect(() => {
    const c = campaigns.find(x => x.id === selCampaign);
    if (c) setNewBudget(String(c.daily_budget ? Math.round(c.daily_budget * 1.2) : ""));
  }, [selCampaign, campaigns]);

  async function runSimulation() {
    if (!selCampaign || !newBudget) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await api.post("/api/simulations/budget", {
        campaign_id:      selCampaign,
        new_daily_budget: parseFloat(newBudget),
        horizon_days:     horizonDays,
        event_type:       eventType || null,
      });
      if (res.data.error) { setSimError(res.data.error); setSimResult(null); }
      else                { setSimResult(res.data); }
    } catch {
      setSimError("Simülasyon çalıştırılamadı.");
    } finally {
      setSimLoading(false);
    }
  }

  const chartData = simResult
    ? Array.from({ length: simResult.scenario.horizon_days }, (_, i) => ({
        day:     `G${i + 1}`,
        mevcut:  parseFloat((simResult.current_forecast.predicted_cost      / simResult.scenario.horizon_days).toFixed(2)),
        simule:  parseFloat((simResult.simulated_forecast.predicted_cost    / simResult.scenario.horizon_days).toFixed(2)),
        rev_cur: parseFloat((simResult.current_forecast.predicted_revenue   / simResult.scenario.horizon_days).toFixed(2)),
        rev_sim: parseFloat((simResult.simulated_forecast.predicted_revenue / simResult.scenario.horizon_days).toFixed(2)),
      }))
    : [];

  const selectedCampaign = campaigns.find(x => x.id === selCampaign);
  const budgetDelta = selectedCampaign?.daily_budget && newBudget && parseFloat(newBudget) > 0
    ? ((parseFloat(newBudget) - selectedCampaign.daily_budget) / selectedCampaign.daily_budget) * 100
    : null;
  const canRun = !simLoading && !!selCampaign && !!newBudget;

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%);  }
        }
      `}</style>

      <div className="page-enter" style={{ background: "linear-gradient(135deg,rgba(88,28,135,0.06) 0%,rgba(23,37,84,0.09) 100%)" }}>
        <Topbar
          title="Simülasyon"
          subtitle="Farklı bütçe senaryolarını ve özel günlerin etkisini simüle edin"
        />

        <div className="p-6 space-y-6">

          {/* ── Yaklaşan Olaylar ───────────────────────────────────────────── */}
          <div className={glassCard}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60">
              <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="text-sm font-semibold">
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Yaklaşan Olaylar
                </span>
              </p>
              <span className="text-xs text-slate-600 bg-slate-800/60 border border-slate-700/40 px-2 py-0.5 rounded-md">30 gün</span>
              <span className="ml-auto text-xs text-slate-600">Tıklayarak seç →</span>
            </div>
            <div className="p-5">
              {evLoading ? (
                <div className="flex gap-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 w-48 rounded-xl flex-shrink-0" />)}
                </div>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {upcomingEvs.map((ev, i) => {
                    const daysLeft   = Math.ceil((new Date(ev.date).getTime() - Date.now()) / 86400000);
                    const isSelected = eventType === ev.event_type;
                    const catStyle   = CAT_STYLE[ev.category] ?? CAT_STYLE.seasonal;
                    const progressPct = Math.min(100, Math.max(0, ((30 - daysLeft) / 30) * 100));

                    return (
                      <motion.button
                        key={i}
                        onClick={() => setEventType(isSelected ? "" : ev.event_type)}
                        whileHover={{ scale: 1.03, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                          "flex flex-col text-left rounded-xl border overflow-hidden transition-all duration-200 min-w-[190px]",
                          isSelected
                            ? "border-blue-500/60"
                            : "border-slate-700/40 hover:border-slate-600/60"
                        )}
                        style={{
                          background: isSelected ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.6)",
                          boxShadow: isSelected ? "0 0 20px rgba(37,99,235,0.35)" : "none",
                        }}
                      >
                        {/* Category gradient banner */}
                        <div className="h-10 w-full flex items-center px-3"
                             style={{ background: catStyle.banner }}>
                          <CategoryBadge cat={ev.category} />
                        </div>

                        {/* Card body */}
                        <div className="p-4 flex-1 flex flex-col gap-3">
                          {/* Emoji */}
                          <span className="text-4xl">{ev.emoji}</span>

                          {/* Name */}
                          <p className={cn("text-sm font-semibold leading-tight", isSelected ? "text-blue-300" : "text-slate-200")}>
                            {ev.name}
                          </p>

                          {/* Days left — prominent */}
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black leading-none" style={{ color: isSelected ? "#60a5fa" : catStyle.accent }}>
                              {daysLeft <= 0 ? "0" : daysLeft}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              {daysLeft <= 0 ? "bugün" : "gün kaldı"}
                            </span>
                          </div>

                          {/* Countdown progress bar */}
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${progressPct}%`, background: isSelected ? "#3b82f6" : catStyle.accent }}
                            />
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Simülasyon Parametreleri ────────────────────────────────────── */}
          <div className={cn(glassCard, "p-6")}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="p-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <p className="text-sm font-semibold">
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  Simülasyon Parametreleri
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {/* Kampanya */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 tracking-wide uppercase mb-2">
                  <Megaphone className="h-3.5 w-3.5 text-slate-500" />
                  Kampanya
                </label>
                <select value={selCampaign} onChange={e => setSelCampaign(e.target.value)} className={inputCls}>
                  <option value="">Kampanya seçin…</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
                </select>
              </div>

              {/* Bütçe */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 tracking-wide uppercase mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Yeni Günlük Bütçe ($)
                </label>
                <input
                  type="number"
                  value={newBudget}
                  onChange={e => setNewBudget(e.target.value)}
                  placeholder="Örn: 500"
                  className={inputCls}
                />
                {/* Budget change info */}
                {selectedCampaign?.daily_budget && budgetDelta !== null && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs px-3 py-2 rounded-lg"
                       style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="text-slate-500">Mevcut:</span>
                    <span className="text-slate-300 font-semibold">${fmt(selectedCampaign.daily_budget, 0)}/gün</span>
                    <span className="text-slate-700">→</span>
                    <span className="text-slate-300 font-semibold">Yeni: ${fmt(parseFloat(newBudget) || 0, 0)}/gün</span>
                    <DeltaBadge pct={budgetDelta} />
                  </div>
                )}
              </div>

              {/* Süre */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 tracking-wide uppercase mb-2">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Tahmin Süresi
                </label>
                <div className="flex gap-2">
                  {[7, 14, 30].map(d => {
                    const meta   = HORIZON_META[d];
                    const active = horizonDays === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setHorizonDays(d)}
                        className={cn(
                          "flex-1 flex flex-col items-center py-2.5 rounded-xl text-xs font-semibold transition-all duration-200",
                          active
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                            : "bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <span className="text-sm font-black">{meta.short}</span>
                        <span className={cn("text-[9px] mt-0.5 font-normal", active ? "text-blue-200" : "text-slate-600")}>
                          {meta.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Olay */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 tracking-wide uppercase mb-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Olay Türü
                </label>
                <select value={eventType} onChange={e => setEventType(e.target.value)} className={inputCls}>
                  <option value="">Opsiyonel</option>
                  {EVENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
            </div>

            {/* Run button — full width, shimmer */}
            <div className="mt-6 pt-5 border-t border-slate-800/60">
              <p className="text-xs text-slate-600 mb-3 text-center">
                {selCampaign && newBudget
                  ? `${horizonDays} günlük simülasyon hazır · ${HORIZON_META[horizonDays]?.desc}`
                  : "Kampanya ve bütçe seçin"}
              </p>
              <button
                onClick={runSimulation}
                disabled={!canRun}
                className="relative w-full overflow-hidden flex items-center justify-center gap-2 px-6 py-3.5 text-white text-sm font-semibold rounded-xl shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-xl hover:shadow-purple-500/20"
                style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)" }}
              >
                {/* Shimmer overlay */}
                {canRun && (
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                    style={{ animation: "shimmer 2.2s infinite" }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <RefreshCw className={cn("h-4 w-4", simLoading && "animate-spin")} />
                  {simLoading ? "Hesaplanıyor…" : "Simülasyonu Çalıştır"}
                </span>
              </button>
            </div>
          </div>

          {/* ── Sonuçlar ────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {simError && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {simError}
              </motion.div>
            )}

            {simResult && !simLoading && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="space-y-5"
              >
                {/* Senaryo banner */}
                <div className="flex items-center gap-3 flex-wrap px-5 py-4 rounded-2xl"
                     style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                    <p className="text-sm font-semibold text-slate-200">{simResult.campaign_name}</p>
                  </div>
                  <span className="text-slate-700">·</span>
                  <DeltaBadge pct={simResult.scenario.budget_change_pct} />
                  <span className="text-xs text-slate-500">
                    ${fmt(simResult.scenario.current_daily_budget, 0)} → ${fmt(simResult.scenario.new_daily_budget, 0)}/gün
                  </span>
                  {simResult.scenario.event_name && (
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                      🎯 {simResult.scenario.event_name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-xs text-slate-400">Güven</span>
                      <span className="text-sm font-bold text-purple-300">%{Math.round(simResult.confidence_score * 100)}</span>
                    </div>
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs text-slate-500">{simResult.scenario.horizon_days} günlük projeksiyon</span>
                  </div>
                </div>

                {/* Karşılaştırma kartları — Current | VS | Simulated */}
                <div className="flex flex-col xl:flex-row items-stretch gap-4">
                  {/* Mevcut Tahmin */}
                  <div className={cn(glassCard, "flex-1 p-5 relative overflow-hidden")}>
                    <div className="flex items-center gap-2 mb-5">
                      <p className="text-sm font-semibold text-slate-400">Mevcut Tahmin</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Harcama",  value: `$${fmt(simResult.current_forecast.predicted_cost)}`,      delta: null, color: "text-blue-400",    icon: DollarSign },
                        { label: "Dönüşüm",  value: fmt(simResult.current_forecast.predicted_conversions, 1),  delta: null, color: "text-emerald-400", icon: Target },
                        { label: "Gelir",    value: `$${fmt(simResult.current_forecast.predicted_revenue)}`,    delta: null, color: "text-purple-400",  icon: TrendingUp },
                        { label: "ROAS",     value: `${fmt(simResult.current_forecast.predicted_roas)}x`,       delta: null, color: "text-amber-400",   icon: BarChart3 },
                      ].map(props => <MetricBox key={props.label} {...props} />)}
                    </div>
                  </div>

                  {/* VS indicator */}
                  <div className="flex xl:flex-col items-center justify-center gap-3 py-2 xl:py-0 xl:px-2">
                    <div className="flex-1 h-px xl:h-full xl:w-px bg-gradient-to-r xl:bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
                    <motion.div
                      className="flex items-center xl:flex-col gap-2 px-4 py-3 rounded-xl"
                      style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}
                      animate={{ scale: [1, 1.06, 1] }}
                      transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                    >
                      <ChevronRight className="h-5 w-5 text-purple-400 hidden xl:block" />
                      <TrendingUp className="h-4 w-4 text-purple-400 xl:hidden" />
                      <span className="text-xs font-black text-purple-400">VS</span>
                    </motion.div>
                    <div className="flex-1 h-px xl:h-full xl:w-px bg-gradient-to-r xl:bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
                  </div>

                  {/* Simüle Edilmiş */}
                  <div className={cn(glassCard, "flex-1 p-5 relative overflow-hidden border-purple-500/30")}>
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 pointer-events-none" />
                    {/* PROJECTED watermark */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                      <span className="text-6xl font-black tracking-[0.25em] text-white/[0.04] rotate-[-18deg] uppercase">
                        PROJECTED
                      </span>
                    </div>
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-5">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                        <p className="text-sm font-semibold text-purple-300">Simüle Edilmiş</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Harcama",  value: `$${fmt(simResult.simulated_forecast.predicted_cost)}`,      delta: simResult.delta.cost_change_pct,        color: "text-blue-400",    icon: DollarSign },
                          { label: "Dönüşüm",  value: fmt(simResult.simulated_forecast.predicted_conversions, 1),  delta: simResult.delta.conversions_change_pct,  color: "text-emerald-400", icon: Target },
                          { label: "Gelir",    value: `$${fmt(simResult.simulated_forecast.predicted_revenue)}`,    delta: simResult.delta.revenue_change_pct,      color: "text-purple-400",  icon: TrendingUp },
                          { label: "ROAS",     value: `${fmt(simResult.simulated_forecast.predicted_roas)}x`,       delta: simResult.delta.roas_change_pct,         color: "text-amber-400",   icon: BarChart3 },
                        ].map(props => <MetricBox key={props.label} {...props} />)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk */}
                <div className={cn(glassCard, "p-5")}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-400" />
                      <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                        Risk Değerlendirmesi
                      </span>
                    </p>
                    <RiskBadge level={simResult.risk_assessment.level} />
                  </div>
                  <ul className="space-y-2 mb-4">
                    {simResult.risk_assessment.factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-400">
                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-slate-600 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                    <CheckCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300 leading-relaxed">{simResult.risk_assessment.recommendation}</p>
                  </div>
                </div>

                {/* Grafik */}
                <div className={cn(glassCard, "p-5")}>
                  <p className="text-sm font-semibold mb-5">
                    <span className="bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                      Günlük Projeksiyon Karşılaştırması
                    </span>
                  </p>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="mevcut"  name="Mevcut ($)"   stroke="#60a5fa" strokeWidth={2}   dot={false} />
                      <Line type="monotone" dataKey="simule"  name="Simüle ($)"   stroke="#a78bfa" strokeWidth={2}   dot={false} strokeDasharray="5 3" />
                      <Line type="monotone" dataKey="rev_cur" name="Gelir Mevcut" stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="rev_sim" name="Gelir Simüle" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Geçmiş benzer dönemler */}
                {simResult.similar_periods.length > 0 && (
                  <div className={cn(glassCard, "overflow-hidden")}>
                    <div className="px-6 py-4 border-b border-slate-800/60">
                      <p className="text-sm font-semibold">
                        <span className="bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                          Geçmiş Benzer Dönemler
                        </span>
                        {simResult.scenario.event_name && (
                          <span className="ml-2 text-xs text-blue-400 font-normal">— {simResult.scenario.event_name}</span>
                        )}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-800/60" style={{ background: "linear-gradient(to right,#0f172a,rgba(30,41,59,0.4))" }}>
                            {["Dönem", "Etkinlik", "Harcama", "Dönüşüm", "ROAS", "CPA"].map(h => (
                              <th key={h} className="text-left text-xs text-slate-500 px-5 py-3 font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {simResult.similar_periods.map((p, i) => (
                            <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">{p.period_start}</td>
                              <td className="px-5 py-3.5"><span className="text-xs text-blue-400 font-medium">{p.event_name}</span></td>
                              <td className="px-5 py-3.5 text-blue-400 font-medium text-xs">${fmt(p.metrics.total_cost)}</td>
                              <td className="px-5 py-3.5 text-emerald-400 font-medium text-xs">{fmt(p.metrics.total_conversions, 1)}</td>
                              <td className="px-5 py-3.5 text-purple-400 font-medium text-xs">{fmt(p.metrics.avg_roas)}x</td>
                              <td className="px-5 py-3.5 text-amber-400 font-medium text-xs">${fmt(p.metrics.avg_cpa)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </>
  );
}
