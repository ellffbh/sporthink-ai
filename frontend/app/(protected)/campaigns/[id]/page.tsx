"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Edit2, DollarSign, TrendingUp, TrendingDown, Target,
  MousePointer, BarChart3, AlertTriangle, AlertOctagon, AlertCircle, Info,
  CheckCircle2, XCircle, Activity, Clock, Brain, Zap, ShieldAlert,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  campaign_name: string;
  campaign_type?: string;
  status?: string;
  daily_budget?: number;
  bidding_strategy?: string;
  ad_account_id?: string;
  external_campaign_id?: string;
}

interface MetricsSummary {
  total_cost?: number;
  total_revenue?: number;
  roas?: number;
  total_conversions?: number;
  cpa?: number;
  ctr?: number;
}

interface DailyMetric {
  date: string;
  cost?: number;
  conversions?: number;
  roas?: number;
}

interface Prediction {
  campaign_id?: string;
  horizon_days?: number;
  model_version?: string;
  as_of_date?: string;
  generated_at?: string;
  summary?: {
    total_predicted_conversions?: number;
    total_predicted_revenue?: number;
    total_predicted_cost?: number;
    predicted_roas?: number;
    predicted_cpa?: number;
    confidence_score?: number;
  };
}

interface Recommendation {
  id: string;
  campaign_id?: string;
  action?: string;
  change_percent?: number;
  reason?: string;
  risk_score?: number;
  status?: string;
  generated_at?: string;
}

interface Anomaly {
  id: string;
  campaign_id?: string;
  metric_name?: string;
  severity?: string;
  note?: string;
  change_percent?: number;
  is_resolved?: boolean;
  detected_at?: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCurrency = (v?: number) =>
  v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
const fmtRoas     = (v?: number) => v != null ? `${v.toFixed(2)}x` : "—";
const fmtPct      = (v?: number) => v != null ? `${v.toFixed(2)}%` : "—";
const fmtNum      = (v?: number) => v != null ? v.toLocaleString("en-US") : "—";
const relTime     = (iso?: string) => {
  try { return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr }) : "—"; }
  catch { return "—"; }
};

// ── Severity & Action configs ─────────────────────────────────────────────────
const SEV: Record<string, {
  label: string; icon: React.ElementType;
  textColor: string; bgColor: string; borderColor: string;
}> = {
  critical: { label: "Kritik",  icon: AlertOctagon, textColor: "#fb7185", bgColor: "rgba(244,63,94,0.12)",  borderColor: "rgba(244,63,94,0.35)"  },
  high:     { label: "Yüksek", icon: AlertTriangle, textColor: "#fb923c", bgColor: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.35)" },
  medium:   { label: "Orta",   icon: AlertCircle,   textColor: "#fbbf24", bgColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" },
  low:      { label: "Düşük",  icon: Info,          textColor: "#94a3b8", bgColor: "rgba(71,85,105,0.15)",  borderColor: "rgba(71,85,105,0.3)"   },
};

const ACTION: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  increase: { label: "Artır",  color: "#10b981", icon: TrendingUp   },
  decrease: { label: "Azalt",  color: "#f43f5e", icon: TrendingDown },
  hold:     { label: "Bekle",  color: "#f59e0b", icon: Activity     },
  review:   { label: "İncele", color: "#8b5cf6", icon: ShieldAlert  },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; dot: string; cls: string }> = {
    enabled: { label: "Aktif",      dot: "bg-emerald-400 animate-pulse", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
    paused:  { label: "Duraklıyor", dot: "bg-amber-400",                 cls: "text-amber-400   bg-amber-500/10   border-amber-500/25"   },
    removed: { label: "Kaldırıldı", dot: "bg-rose-400",                  cls: "text-rose-400    bg-rose-500/10    border-rose-500/25"     },
  };
  const s = map[status ?? ""] ?? { label: status ?? "—", dot: "bg-slate-500", cls: "text-slate-400 bg-slate-700/40 border-slate-600/40" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border", s.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
      {s.label}
    </span>
  );
}

function SectionCard({
  icon: Icon, title, subtitle, color = "#60a5fa", children,
}: {
  icon: React.ElementType; title: string; subtitle?: string; color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: BG2, border: BORDER }}>
      <div
        className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60"
        style={{ background: BG3 }}
      >
        <div className="p-2 rounded-lg" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-200">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ text = "Veri bulunamadı" }: { text?: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-2.5">
      <div className="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center">
        <Info className="h-5 w-5 text-slate-700" />
      </div>
      <p className="text-xs text-slate-600">{text}</p>
    </div>
  );
}

function makeTooltip(fmt: (v: number) => string) {
  return function ChartTip({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; color: string }>;
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl px-3 py-2.5 text-xs shadow-2xl"
        style={{ background: "#060e1a", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <p className="text-slate-500 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="font-bold" style={{ color: p.color }}>
            {fmt(p.value ?? 0)}
          </p>
        ))}
      </div>
    );
  };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const router          = useRouter();
  const { id }          = useParams<{ id: string }>();

  const [campaign,    setCampaign]    = useState<Campaign | null>(null);
  const [summary,     setSummary]     = useState<MetricsSummary | null>(null);
  const [dailyData,   setDailyData]   = useState<DailyMetric[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [recs,        setRecs]        = useState<Recommendation[]>([]);
  const [anomalies,   setAnomalies]   = useState<Anomaly[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [applyingId,  setApplyingId]  = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [camp, sum, daily, pred, rec, anom] = await Promise.allSettled([
        api.get<Campaign>(`/campaigns/${id}`),
        api.get<MetricsSummary>(`/campaigns/${id}/metrics-summary`),
        api.get<DailyMetric[]>(`/campaigns/${id}/metrics?days=30`),
        api.get<Prediction>(`/api/predictions/campaign/${id}/latest`),
        api.get<Recommendation[]>(`/api/recommendations/?campaign_id=${id}`),
        api.get<Anomaly[]>(`/api/anomalies/?campaign_id=${id}`),
      ]);
      if (camp.status  === "fulfilled") setCampaign(camp.value.data);
      if (sum.status   === "fulfilled") setSummary(sum.value.data);
      if (daily.status === "fulfilled") setDailyData(Array.isArray(daily.value.data) ? daily.value.data : []);
      if (pred.status  === "fulfilled" && !("error" in (pred.value.data as object))) {
        setPredictions([pred.value.data as Prediction]);
      }
      if (rec.status   === "fulfilled") {
        const all = Array.isArray(rec.value.data) ? rec.value.data : [];
        setRecs(all.filter((r: Recommendation) => !r.campaign_id || r.campaign_id === id));
      }
      if (anom.status  === "fulfilled") {
        const all = Array.isArray(anom.value.data) ? anom.value.data : [];
        setAnomalies(all.filter((a: Anomaly) => !a.campaign_id || a.campaign_id === id));
      }
      setLoading(false);
    })();
  }, [id]);

  async function resolveAnomaly(anomId: string) {
    setResolvingId(anomId);
    try {
      await api.put(`/api/anomalies/${anomId}/resolve`, { is_resolved: true });
      setAnomalies(prev => prev.map(a => a.id === anomId ? { ...a, is_resolved: true } : a));
      toast.success("Anomali çözüldü olarak işaretlendi");
    } catch { toast.error("İşlem başarısız"); }
    finally { setResolvingId(null); }
  }

  async function applyRec(recId: string) {
    setApplyingId(recId);
    try {
      await api.post(`/api/recommendations/${recId}/apply`);
      setRecs(prev => prev.map(r => r.id === recId ? { ...r, status: "applied" } : r));
      toast.success("Öneri uygulandı");
    } catch { toast.error("Uygulama başarısız"); }
    finally { setApplyingId(null); }
  }

  async function dismissRec(recId: string) {
    try {
      await api.post(`/api/recommendations/${recId}/dismiss`);
      setRecs(prev => prev.filter(r => r.id !== recId));
      toast.success("Öneri yoksayıldı");
    } catch { toast.error("İşlem başarısız"); }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-enter">
        <Topbar title="Yükleniyor…" subtitle="Kampanya detayı" />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-56 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const pred          = predictions[0];
  const activeAnomalies = anomalies.filter(a => !a.is_resolved);
  const activeRecs      = recs.filter(r => r.status !== "applied" && r.status !== "dismissed");

  const kpiCards = [
    { label: "Harcama",   value: fmtCurrency(summary?.total_cost),       icon: DollarSign,   color: "#f59e0b", sub: "toplam maliyet"       },
    { label: "Gelir",     value: fmtCurrency(summary?.total_revenue),     icon: TrendingUp,   color: "#10b981", sub: "elde edilen gelir"    },
    { label: "ROAS",      value: fmtRoas(summary?.roas),                  icon: BarChart3,    color: "#8b5cf6", sub: "harcama başı gelir"   },
    { label: "Dönüşüm",  value: fmtNum(summary?.total_conversions),       icon: Target,       color: "#06b6d4", sub: "toplam dönüşüm"      },
    { label: "CPA",       value: fmtCurrency(summary?.cpa),               icon: Activity,     color: "#f97316", sub: "dönüşüm başı maliyet" },
    { label: "CTR",       value: fmtPct(summary?.ctr),                    icon: MousePointer, color: "#a78bfa", sub: "tıklama oranı"        },
  ];

  const charts = [
    { key: "cost",        label: "Günlük Harcama",  color: "#f59e0b", fmt: (v: number) => `$${v.toLocaleString()}` },
    { key: "conversions", label: "Günlük Dönüşüm", color: "#06b6d4", fmt: (v: number) => v.toLocaleString()        },
    { key: "roas",        label: "Günlük ROAS",     color: "#8b5cf6", fmt: (v: number) => `${v.toFixed(2)}x`       },
  ];

  return (
    <div className="page-enter">
      <Topbar
        title={campaign?.campaign_name ?? "Kampanya"}
        subtitle={campaign?.campaign_type ? `${campaign.campaign_type} kampanyası` : "Kampanya detayı"}
        anomalyCount={activeAnomalies.length}
      />

      <div className="p-6 space-y-6">

        {/* ── Header row ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition-all duration-150"
              style={{ background: BG3, border: BORDER }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kampanyalara Dön
            </button>
            <StatusBadge status={campaign?.status} />
          </div>
          <button
            onClick={() => router.push(`/campaigns/${id}/edit`)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-white px-4 py-2 rounded-lg transition-all duration-200 hover:scale-[1.03] active:scale-95"
            style={{
              background: "linear-gradient(135deg,#2563eb,#3b82f6)",
              boxShadow: "0 3px 12px rgba(37,99,235,0.35)",
            }}
          >
            <Edit2 className="h-3.5 w-3.5" /> Düzenle
          </button>
        </div>

        {/* ── KPI kartları ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, color, sub }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-2xl relative overflow-hidden"
              style={{ background: BG2, border: BORDER, borderLeft: `3px solid ${color}` }}
            >
              {/* Ghost background icon */}
              <div
                className="absolute right-0 bottom-0 translate-x-3 translate-y-3 pointer-events-none"
                style={{ opacity: 0.07 }}
              >
                <Icon className="h-16 w-16" style={{ color }} />
              </div>
              <div
                className="p-1.5 rounded-lg w-fit mb-2"
                style={{ background: `${color}15`, border: `1px solid ${color}25` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Performans Grafikleri ─────────────────────────────────────────── */}
        <SectionCard icon={BarChart3} title="Geçmiş Performans" subtitle="Son 30 günlük günlük metrikler" color="#60a5fa">
          {dailyData.length === 0 ? (
            <Empty text="Geçmiş metrik verisi bulunamadı" />
          ) : (
            <div
              className="grid grid-cols-1 lg:grid-cols-3 gap-px"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              {charts.map(({ key, label, color, fmt }) => (
                <div key={key} className="p-5" style={{ background: BG2 }}>
                  <p className="text-xs font-semibold text-slate-400 mb-4">{label}</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        tick={{ fill: "#475569", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip content={makeTooltip(fmt)} />
                      <Line
                        type="monotone"
                        dataKey={key}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: color }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Tahmin + Öneri (2 kolon) ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Prediction */}
          <SectionCard icon={Brain} title="Model Tahmini" subtitle="Önümüzdeki 7 günlük AI tahmini" color="#8b5cf6">
            {!pred ? (
              <div className="py-10 flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-violet-400" />
                </div>
                <p className="text-xs text-slate-500">Bu kampanya için henüz tahmin üretilmemiş</p>
                <button
                  onClick={async () => {
                    try {
                      const res = await api.post(`/api/predictions/generate/${id}`);
                      if (res.data && !res.data.error) setPredictions([res.data]);
                      toast.success("Tahmin başarıyla üretildi");
                    } catch { toast.error("Tahmin üretilemedi"); }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg,#7c3aed,#8b5cf6)",
                    boxShadow: "0 3px 12px rgba(124,58,237,0.35)",
                  }}
                >
                  <Zap className="h-3.5 w-3.5" /> Tahmin Üret
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Main metrics */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Tahmini Dönüşüm", value: fmtNum(pred.summary?.total_predicted_conversions),  color: "#06b6d4", icon: Target      },
                    { label: "Tahmini Değer",    value: fmtCurrency(pred.summary?.total_predicted_revenue), color: "#10b981", icon: DollarSign },
                  ].map(({ label, value, color, icon: Ic }) => (
                    <div key={label} className="rounded-xl p-3.5" style={{ background: BG3, border: BORDER }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Ic className="h-3.5 w-3.5" style={{ color }} />
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                      </div>
                      <p className="text-xl font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Confidence score */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-400">Güven Skoru</p>
                    <p className="text-xs font-bold text-violet-400">
                      {pred.summary?.confidence_score != null
                        ? `${(pred.summary.confidence_score * 100).toFixed(0)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((pred.summary?.confidence_score ?? 0) * 100).toFixed(0)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(to right,#7c3aed,#a78bfa)" }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-800/60"
                >
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {pred.horizon_days ?? 7} günlük ufuk
                  </span>
                  <span>Üretim: {relTime(pred.generated_at)}</span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Recommendations */}
          <SectionCard
            icon={Zap}
            title="Öneriler"
            subtitle={`${activeRecs.length} aktif öneri`}
            color="#f59e0b"
          >
            {activeRecs.length === 0 ? (
              <Empty text="Aktif öneri bulunamadı" />
            ) : (
              <div className="divide-y divide-slate-800/40">
                {activeRecs.map(rec => {
                  const ac      = ACTION[rec.action ?? ""] ?? ACTION.review;
                  const ActIcon = ac.icon;
                  const isApplying = applyingId === rec.id;
                  const riskVal   = rec.risk_score ?? 0;
                  const riskPct   = Math.min((riskVal / 10) * 100, 100);
                  const riskColor = riskVal >= 7 ? "#f43f5e" : riskVal >= 4 ? "#f59e0b" : "#10b981";

                  return (
                    <div key={rec.id} className="p-5 space-y-3">
                      {/* Action + change pct */}
                      <div className="flex items-center justify-between">
                        <div
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border"
                          style={{ background: `${ac.color}15`, borderColor: `${ac.color}35`, color: ac.color }}
                        >
                          <ActIcon className="h-3 w-3" />
                          {ac.label}
                        </div>
                        {rec.change_percent != null && (
                          <span className="text-sm font-extrabold" style={{ color: ac.color }}>
                            {rec.change_percent > 0 ? "+" : ""}{rec.change_percent}%
                          </span>
                        )}
                      </div>

                      {/* Reason */}
                      {rec.reason && (
                        <p className="text-xs text-slate-400 leading-relaxed">{rec.reason}</p>
                      )}

                      {/* Risk bar + action buttons */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-600 whitespace-nowrap">Risk:</p>
                          <div
                            className="h-1.5 w-20 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${riskPct.toFixed(0)}%`, background: riskColor }}
                            />
                          </div>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {rec.risk_score != null ? `${riskVal}/10` : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => dismissRec(rec.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-300 px-2.5 py-1.5 rounded-lg transition-all"
                            style={{ border: BORDER, background: "rgba(255,255,255,0.03)" }}
                          >
                            <XCircle className="h-3 w-3" /> Yoksay
                          </button>
                          <button
                            disabled={isApplying}
                            onClick={() => applyRec(rec.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-white px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
                            style={{
                              background: "linear-gradient(135deg,#059669,#10b981)",
                              boxShadow: "0 2px 8px rgba(16,185,129,0.35)",
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {isApplying ? "…" : "Uygula"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Anomali Paneli ────────────────────────────────────────────────── */}
        <SectionCard
          icon={AlertTriangle}
          title="Anomaliler"
          subtitle={
            anomalies.length === 0
              ? "Anomali yok"
              : `${activeAnomalies.length} aktif · ${anomalies.length} toplam`
          }
          color="#f43f5e"
        >
          {anomalies.length === 0 ? (
            <Empty text="Bu kampanyada anomali tespit edilmedi" />
          ) : (
            <div className="divide-y divide-slate-800/40">
              {anomalies.map(a => {
                const s       = SEV[a.severity ?? "low"] ?? SEV.low;
                const SevIcon = s.icon;
                const resolved = !!a.is_resolved;
                const isPos    = (a.change_percent ?? 0) >= 0;

                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-4 px-6 py-4 transition-colors duration-150"
                    style={{ opacity: resolved ? 0.4 : 1 }}
                    onMouseEnter={e => {
                      if (!resolved) (e.currentTarget as HTMLDivElement).style.background = BG3;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    {/* Severity badge */}
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0"
                      style={{ background: s.bgColor, borderColor: s.borderColor, color: s.textColor }}
                    >
                      <SevIcon className="h-3 w-3" />
                      {s.label}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-slate-300">{a.metric_name ?? "—"}</p>
                        {a.change_percent != null && (
                          <span className={cn("text-xs font-bold", isPos ? "text-emerald-400" : "text-rose-400")}>
                            {isPos ? "+" : ""}{a.change_percent}%
                          </span>
                        )}
                      </div>
                      {a.note && (
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{a.note}</p>
                      )}
                      {a.detected_at && (
                        <p className="text-[10px] text-slate-700 mt-1 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {relTime(a.detected_at)}
                        </p>
                      )}
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {resolved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Çözüldü
                        </span>
                      ) : (
                        <button
                          disabled={resolvingId === a.id}
                          onClick={() => resolveAnomaly(a.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap"
                          style={{
                            background: "linear-gradient(135deg,#059669,#10b981)",
                            boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {resolvingId === a.id ? "…" : "Çözüldü İşaretle"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
