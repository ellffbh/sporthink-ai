"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, AlertOctagon, AlertTriangle, AlertCircle, Info,
  CheckCircle2, DollarSign, TrendingUp, TrendingDown, Target,
  MousePointer, BarChart3, Clock, Zap, Activity,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrendPoint {
  date: string;
  cost: number;
  conversions: number;
  ctr: number;
  roas: number;
}

interface OtherAnomaly {
  id: string;
  metric_name: string;
  severity: string;
  change_percent: number;
  detected_at: string;
  is_resolved: boolean;
}

interface AnomalyRecommendation {
  id: string;
  reason: string;
  action: "increase" | "decrease" | "hold" | "review";
  status: "pending" | "applied" | "ignored";
  suggested_change_percent: number | null;
  created_at: string;
}

interface AnomalyDetail {
  id: string;
  campaign_id: string;
  campaign_name: string;
  platform: string;
  metric_name: string;
  severity: string;
  note: string;
  change_percent: number;
  detected_at: string;
  is_resolved: boolean;
  expected_value: number | null;
  actual_value: number | null;
  trend: TrendPoint[];
  other_anomalies: OtherAnomaly[];
  recommendation: AnomalyRecommendation | null;
}

interface MetricsSummary {
  total_cost?: number;
  roas?: number;
  total_conversions?: number;
  cpa?: number;
  ctr?: number;
}

// ── Configs ───────────────────────────────────────────────────────────────────
const SEV: Record<string, {
  label: string; icon: React.ElementType;
  color: string; textColor: string; bgColor: string; borderColor: string;
}> = {
  critical: { label: "Kritik",  icon: AlertOctagon,  color: "#f43f5e", textColor: "#fb7185", bgColor: "rgba(244,63,94,0.12)",  borderColor: "rgba(244,63,94,0.35)"  },
  high:     { label: "Yüksek", icon: AlertTriangle,  color: "#f97316", textColor: "#fb923c", bgColor: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.35)" },
  medium:   { label: "Orta",   icon: AlertCircle,    color: "#f59e0b", textColor: "#fbbf24", bgColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" },
  low:      { label: "Düşük",  icon: Info,           color: "#3b82f6", textColor: "#60a5fa", bgColor: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.35)" },
};

const ACTION: Record<string, { label: string; color: string }> = {
  increase: { label: "Artır",      color: "#22c55e" },
  decrease: { label: "Azalt",      color: "#ef4444" },
  hold:     { label: "Sabit Tut",  color: "#3b82f6" },
  review:   { label: "İncele",     color: "#f59e0b" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Beklemede", color: "#f59e0b" },
  applied: { label: "Uygulandı", color: "#22c55e" },
  ignored: { label: "Yoksayıldı", color: "#64748b" },
};

function getTrendConfig(metricName: string) {
  if (metricName.includes("ROAS"))    return { key: "roas",        label: "ROAS",        color: "#8b5cf6", fmt: (v: number) => `${v.toFixed(2)}x` };
  if (metricName.includes("CTR"))     return { key: "ctr",         label: "CTR",         color: "#06b6d4", fmt: (v: number) => `${(v * 100).toFixed(2)}%` };
  if (metricName.includes("Dönüşüm")) return { key: "conversions", label: "Dönüşüm",     color: "#10b981", fmt: (v: number) => v.toLocaleString() };
  return                                       { key: "cost",       label: "Harcama ($)", color: "#f59e0b", fmt: (v: number) => `$${v.toLocaleString()}` };
}

function fmtExpAct(metricName: string, v: number | null): string {
  if (v == null) return "—";
  if (metricName.includes("Harcama"))  return `$${Math.round(v).toLocaleString("tr-TR")}`;
  if (metricName.includes("Dönüşüm")) return v.toFixed(1);
  if (metricName.includes("CTR"))      return `%${(v * 100).toFixed(2)}`;
  if (metricName.includes("ROAS"))     return `${v.toFixed(2)}x`;
  return v.toFixed(2);
}

function relTime(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr }); }
  catch { return iso; }
}

function absTime(iso: string) {
  try { return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: tr }); }
  catch { return iso; }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionCard({
  icon: Icon, title, subtitle, color = "#60a5fa", children,
}: {
  icon: React.ElementType; title: string; subtitle?: string; color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: BG2, border: BORDER }}>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60" style={{ background: BG3 }}>
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

function makeTooltip(fmt: (v: number) => string) {
  return function ChartTip({
    active, payload, label,
  }: { active?: boolean; payload?: Array<{ value: number; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl px-3 py-2.5 text-xs shadow-2xl"
        style={{ background: "#060e1a", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <p className="text-slate-500 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="font-bold" style={{ color: p.color }}>{fmt(p.value ?? 0)}</p>
        ))}
      </div>
    );
  };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnomalyDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();

  const [anomaly,   setAnomaly]   = useState<AnomalyDetail | null>(null);
  const [summary,   setSummary]   = useState<MetricsSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolved,  setResolved]  = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<AnomalyDetail>(`/api/anomalies/${id}`);
        setAnomaly(data);
        setResolved(data.is_resolved);
        api.get<MetricsSummary>(`/campaigns/${data.campaign_id}/metrics-summary`)
          .then(r => setSummary(r.data))
          .catch(() => {});
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          toast.error("Anomali bulunamadı");
          router.replace("/anomalies");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  async function handleResolve() {
    if (!anomaly) return;
    setResolving(true);
    try {
      await api.patch(`/api/anomalies/${anomaly.id}/resolve`);
      setResolved(true);
      toast.success("Anomali çözüldü olarak işaretlendi");
    } catch {
      toast.error("İşlem başarısız");
    } finally {
      setResolving(false);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-enter">
        <Topbar title="Yükleniyor…" subtitle="Anomali detayı" />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-6 w-24 rounded-lg" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-44 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!anomaly) return null;

  const sev      = SEV[anomaly.severity] ?? SEV.low;
  const SevIcon  = sev.icon;
  const trendCfg = getTrendConfig(anomaly.metric_name);

  const expVal  = anomaly.expected_value ?? 0;
  const actVal  = anomaly.actual_value   ?? 0;
  const calcPct =
    anomaly.expected_value != null && anomaly.actual_value != null && expVal !== 0
      ? Math.round(((actVal - expVal) / expVal) * 1000) / 10
      : anomaly.change_percent;
  const calcPos = calcPct >= 0;

  const maxBarVal = Math.max(expVal, actVal, 0.001);
  const expBarPct = Math.min((expVal / maxBarVal) * 100, 100);
  const actBarPct = Math.min((actVal / maxBarVal) * 100, 100);

  const fmtCurrency = (v?: number | null) =>
    v != null ? `$${Math.round(v).toLocaleString("tr-TR")}` : "—";
  const fmtRoas = (v?: number | null) => v != null ? `${v.toFixed(2)}x` : "—";
  const fmtPct  = (v?: number | null) => v != null ? `${v.toFixed(2)}%` : "—";
  const fmtNum  = (v?: number | null) => v != null ? v.toLocaleString("tr-TR") : "—";

  const kpiCards = [
    { label: "ROAS",     value: fmtRoas(summary?.roas),            icon: BarChart3,    color: "#8b5cf6" },
    { label: "CPA",      value: fmtCurrency(summary?.cpa),         icon: Activity,     color: "#f97316" },
    { label: "CTR",      value: fmtPct(summary?.ctr),              icon: MousePointer, color: "#06b6d4" },
    { label: "Harcama",  value: fmtCurrency(summary?.total_cost),  icon: DollarSign,   color: "#f59e0b" },
    { label: "Dönüşüm", value: fmtNum(summary?.total_conversions), icon: Target,       color: "#10b981" },
  ];

  return (
    <div className="page-enter">
      <Topbar title={anomaly.campaign_name} subtitle="Anomali detayı" />

      <div className="p-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/anomalies"
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition-all duration-150"
              style={{ background: BG3, border: BORDER }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Geri Dön
            </Link>

            <span
              className="inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase"
              style={
                anomaly.platform === "meta"
                  ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }
                  : { background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }
              }
            >
              {anomaly.platform === "meta" ? "META ADS" : "GOOGLE ADS"}
            </span>

            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border"
              style={{ background: sev.bgColor, borderColor: sev.borderColor, color: sev.textColor }}
            >
              <SevIcon className="h-3 w-3" />
              {sev.label}
            </span>

            {resolved && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="h-3.5 w-3.5" /> Çözüldü
              </span>
            )}
          </div>

          {!resolved && (
            <button
              disabled
              onClick={handleResolve}
              title="Bu özellik yakında eklenecek"
              className="inline-flex items-center gap-2 text-xs font-semibold text-white px-4 py-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg,#059669,#10b981)",
                boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {resolving ? "İşleniyor…" : "Çözüldü İşaretle"}
            </button>
          )}
        </div>

        {/* ── Özet Kartı + Beklenen/Gerçekleşen ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Anomali özet */}
          <div
            className="lg:col-span-2 rounded-2xl p-6 space-y-4"
            style={{
              background: BG2,
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: `4px solid ${sev.color}`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                  {anomaly.metric_name}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className="text-5xl font-black leading-none tabular-nums"
                    style={{ color: calcPos ? "#f97316" : "#60a5fa" }}
                  >
                    {calcPos ? "+" : ""}{calcPct.toFixed(1)}%
                  </span>
                  {calcPos
                    ? <TrendingUp  className="h-8 w-8" style={{ color: "#f97316" }} />
                    : <TrendingDown className="h-8 w-8" style={{ color: "#60a5fa" }} />
                  }
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-slate-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {absTime(anomaly.detected_at)}
                </span>
                <span className="text-[10px] text-slate-700">{relTime(anomaly.detected_at)}</span>
              </div>
            </div>

            {anomaly.note && (
              <p className="text-sm text-slate-400 leading-relaxed pl-4 border-l-2 border-slate-700">
                {anomaly.note}
              </p>
            )}
          </div>

          {/* Beklenen / Gerçekleşen */}
          <div className="rounded-2xl overflow-hidden" style={{ background: BG2, border: BORDER }}>
            <div className="px-5 py-3.5 border-b border-slate-800/60" style={{ background: BG3 }}>
              <p className="text-xs font-bold text-slate-300">Beklenen / Gerçekleşen</p>
              <p className="text-[10px] text-slate-500 mt-0.5">30g ort. karşı 7g ort.</p>
            </div>
            <div className="p-5 space-y-5">
              {anomaly.expected_value != null && anomaly.actual_value != null ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        Beklenen (30g ort.)
                      </span>
                      <span className="text-sm font-bold text-slate-300 tabular-nums">
                        {fmtExpAct(anomaly.metric_name, anomaly.expected_value)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${expBarPct}%`, background: "#334155" }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        Gerçekleşen (7g ort.)
                      </span>
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: calcPos ? "#f97316" : "#60a5fa" }}
                      >
                        {fmtExpAct(anomaly.metric_name, anomaly.actual_value)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${actBarPct}%`, background: calcPos ? "#f97316" : "#3b82f6" }}
                      />
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                    style={{
                      background: calcPos ? "rgba(249,115,22,0.08)" : "rgba(59,130,246,0.08)",
                      border: `1px solid ${calcPos ? "rgba(249,115,22,0.25)" : "rgba(59,130,246,0.25)"}`,
                    }}
                  >
                    <span className="text-[10px] font-semibold text-slate-400">Sapma</span>
                    <span
                      className="text-sm font-black tabular-nums"
                      style={{ color: calcPos ? "#f97316" : "#60a5fa" }}
                    >
                      {calcPos ? "+" : ""}{calcPct.toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2.5">
                  <Info className="h-6 w-6 text-slate-700" />
                  <p className="text-xs text-slate-600">Veri mevcut değil</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Trend Grafiği ─────────────────────────────────────────────────── */}
        <SectionCard
          icon={BarChart3}
          title="30 Günlük Trend"
          subtitle={`${trendCfg.label} — son 30 gün günlük`}
          color={trendCfg.color}
        >
          {anomaly.trend.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2.5">
              <Info className="h-5 w-5 text-slate-700" />
              <p className="text-xs text-slate-600">Trend verisi bulunamadı</p>
            </div>
          ) : (
            <div className="p-5 pt-6">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={anomaly.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
                    width={40}
                  />
                  <Tooltip content={makeTooltip(trendCfg.fmt)} />
                  <Line
                    type="monotone"
                    dataKey={trendCfg.key}
                    stroke={trendCfg.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: trendCfg.color }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* ── Kampanya Metrikleri ───────────────────────────────────────────── */}
        <SectionCard icon={Activity} title="Kampanya Metrikleri" subtitle="Güncel performans özeti" color="#f59e0b">
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {kpiCards.map(({ label, value, icon: Icon, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="p-4 rounded-xl relative overflow-hidden"
                  style={{ background: BG3, border: BORDER, borderLeft: `3px solid ${color}` }}
                >
                  <div
                    className="absolute right-0 bottom-0 translate-x-2 translate-y-2 pointer-events-none"
                    style={{ opacity: 0.07 }}
                  >
                    <Icon className="h-12 w-12" style={{ color }} />
                  </div>
                  <div
                    className="p-1.5 rounded-lg w-fit mb-2"
                    style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                  >
                    <Icon className="h-3 w-3" style={{ color }} />
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-xl font-bold text-white leading-none">{value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── Öneri + Diğer Anomaliler ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* İlgili Öneri */}
          <SectionCard icon={Zap} title="İlgili Öneri" color="#f59e0b">
            {anomaly.recommendation ? (() => {
              const rec = anomaly.recommendation;
              const ac  = ACTION[rec.action] ?? { label: rec.action, color: "#94a3b8" };
              const st  = STATUS_LABELS[rec.status] ?? null;
              return (
                <div className="p-5 space-y-3">
                  {/* Action badge + suggested change + status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wide"
                      style={{ color: ac.color, background: `${ac.color}18`, borderColor: `${ac.color}35` }}
                    >
                      {ac.label}
                    </div>
                    {rec.suggested_change_percent != null && (
                      <span
                        className="text-[10px] font-bold tabular-nums"
                        style={{ color: ac.color }}
                      >
                        {rec.suggested_change_percent > 0 ? "+" : ""}{rec.suggested_change_percent}%
                      </span>
                    )}
                    {st && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
                        style={{ color: st.color, background: `${st.color}15`, borderColor: `${st.color}30` }}
                      >
                        {st.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {rec.reason}
                  </p>
                  <p className="text-[10px] text-slate-600 flex items-center gap-1 pt-2 border-t border-slate-800/60">
                    <Clock className="h-3 w-3" />
                    {relTime(rec.created_at)}
                  </p>
                </div>
              );
            })() : (
              <div className="py-10 flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800/60 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-slate-700" />
                </div>
                <p className="text-xs text-slate-500 text-center px-4">
                  Bu kampanya için henüz öneri üretilmedi
                </p>
              </div>
            )}
          </SectionCard>

          {/* Diğer Anomaliler */}
          <SectionCard
            icon={AlertTriangle}
            title="Aynı Kampanyanın Diğer Anomalileri"
            subtitle={anomaly.other_anomalies.length > 0 ? `${anomaly.other_anomalies.length} anomali` : undefined}
            color="#f43f5e"
          >
            {anomaly.other_anomalies.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-60" />
                <p className="text-xs text-slate-500">Başka anomali yok</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {anomaly.other_anomalies.map(o => {
                  const os     = SEV[o.severity] ?? SEV.low;
                  const OsIcon = os.icon;
                  const oPos   = o.change_percent >= 0;
                  return (
                    <Link
                      key={o.id}
                      href={`/anomalies/${o.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors duration-150 group"
                      style={{ opacity: o.is_resolved ? 0.45 : 1 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = BG3; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${os.color}1a`, border: `1px solid ${os.color}30` }}
                      >
                        <OsIcon className="h-3.5 w-3.5" style={{ color: os.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-300 truncate group-hover:text-white transition-colors">
                          {o.metric_name}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{relTime(o.detected_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: oPos ? "#f97316" : "#60a5fa" }}
                        >
                          {oPos ? "+" : ""}{o.change_percent.toFixed(1)}%
                        </span>
                        {o.is_resolved ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background:  `${os.color}18`,
                              color:       os.textColor,
                              border:      `1px solid ${os.color}30`,
                            }}
                          >
                            {os.label}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>

        </div>
      </div>
    </div>
  );
}
