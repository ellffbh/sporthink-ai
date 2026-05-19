"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import {
  DollarSign, TrendingUp, Target, Percent, Eye, MousePointer,
  BarChart2, Megaphone, AlertTriangle, Lightbulb, Zap, ArrowUpRight,
  ArrowDownRight, MoreHorizontal, CheckCircle, Clock, XCircle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
  ComposedChart, Area,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrendItem    { date: string; spend: number; conversions: number; impressions: number; clicks: number; conversion_value: number; }
interface PlatformItem { platform: string; spend: number; conversions: number; roas: number; }
interface TopCampaign  { campaign_name: string; spend: number; conversions: number; roas: number; cpa: number; }
interface AnomalyItem  { id: string; campaign_name: string; metric_name: string; severity: string; change_percent: number; detected_at: string; is_resolved?: boolean; }
interface RecItem      { id: string; campaign_name: string; action: string; reason: string; risk_score: number; status: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, dec = 0) {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

const BORDER = "1px solid rgba(255,255,255,0.06)";
const BG2    = "#0D1526";
const BG3    = "#111D35";

// ── Tooltip style ─────────────────────────────────────────────────────────────
const ttStyle = {
  background: "#0D1526",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 11,
  color: "#e2e8f0",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ background: BG2, border: BORDER, borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{children}</p>;
}

function KpiCard({
  label, value, sub, icon: Icon, iconColor, trend,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconColor: string; trend?: { value: number; label: string };
}) {
  const up = (trend?.value ?? 0) >= 0;
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}30` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
      </div>
      <div>
        <p className="num text-2xl font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
      </div>
      {trend && (
        <div className="flex items-center gap-1">
          {up
            ? <ArrowUpRight className="h-3.5 w-3.5 text-ar-green" />
            : <ArrowDownRight className="h-3.5 w-3.5 text-ar-red" />}
          <span className={`text-xs font-medium ${up ? "text-ar-green" : "text-ar-red"}`}>
            {up ? "+" : ""}{trend.value}%
          </span>
          <span className="text-xs text-slate-600">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: BG3, border: BORDER }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div>
        <p className="num text-sm font-bold text-white">{value}</p>
        <p className="text-[10px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    enabled:  { label: "Aktif",        color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
    paused:   { label: "Durduruldu",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
    removed:  { label: "Kaldırıldı",   color: "#F43F5E", bg: "rgba(244,63,94,0.1)"   },
  };
  const s = map[status] ?? { label: status, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ color: s.color, background: s.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function SeverityBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; color: string }> = {
    critical: { label: "Kritik",  color: "#F43F5E" },
    high:     { label: "Yüksek", color: "#F59E0B" },
    medium:   { label: "Orta",   color: "#7C3AED" },
    low:      { label: "Düşük",  color: "#10B981" },
  };
  const v = map[s] ?? { label: s, color: "#94a3b8" };
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ color: v.color, background: `${v.color}18` }}>
      {v.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, string> = { low: "#10B981", medium: "#F59E0B", high: "#F43F5E" };
  const color = map[risk] ?? "#94a3b8";
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ color, background: `${color}18` }}>
      {risk === "low" ? "Düşük Risk" : risk === "medium" ? "Orta Risk" : "Yüksek Risk"}
    </span>
  );
}

// Performance ring (SVG)
function PerfRing({ score, size = 80, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#F43F5E";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [kpis,            setKpis]            = useState<Record<string, number> | null>(null);
  const [trend,           setTrend]           = useState<TrendItem[]>([]);
  const [platforms,       setPlatforms]       = useState<PlatformItem[]>([]);
  const [topCampaigns,    setTopCampaigns]    = useState<TopCampaign[]>([]);
  const [anomalies,       setAnomalies]       = useState<AnomalyItem[]>([]);
  const [recommendations, setRecommendations] = useState<RecItem[]>([]);
  const [days,      setDays]      = useState(7);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  function handlePeriodChange(p: "7G" | "14G" | "30G" | "Özel") {
    if (p === "Özel") return;
    setDateRange(null);
    setDays({ "7G": 7, "14G": 14, "30G": 30 }[p] ?? 7);
  }

  function handleCustomRange(start: string, end: string) {
    setDateRange({ start, end });
  }

  useEffect(() => {
    const qs = dateRange
      ? `?start_date=${dateRange.start}&end_date=${dateRange.end}`
      : `?days=${days}`;
    Promise.all([
      api.get(`/api/dashboard/overview${qs}`),
      api.get("/api/anomalies/").catch(() => ({ data: [] })),
      api.get("/api/recommendations/").catch(() => ({ data: [] })),
    ]).then(([ovRes, anRes, recRes]) => {
      setKpis(ovRes.data.kpis);
      setTrend(ovRes.data.weekly_trend ?? []);
      setPlatforms(ovRes.data.platform_comparison ?? []);
      setTopCampaigns(ovRes.data.top_campaigns ?? []);
      setAnomalies(anRes.data?.data ?? []);
      setRecommendations(recRes.data.filter((r: RecItem) => r.status === "pending").slice(0, 3));
    }).catch(() => {});
  }, [days, dateRange]);

  const spend  = kpis?.total_spend       ?? 0;
  const roas   = kpis?.avg_roas          ?? 0;
  const conv   = kpis?.total_conversions ?? 0;
  const cpa    = kpis?.avg_cpa           ?? 0;
  const impr   = kpis?.total_impressions ?? 0;
  const clicks = kpis?.total_clicks      ?? 0;
  const ctr    = kpis ? kpis.avg_ctr * 100 : 0;
  const active = kpis?.active_campaigns  ?? 0;
  const activeAnomalies = anomalies.filter((a) => !a.is_resolved).slice(0, 3);
  const anomCnt = anomalies.filter((a) => !a.is_resolved).length;

  const totalPlatSpend = platforms.reduce((s, p) => s + p.spend, 0);
  const platformDonut  = platforms.map((p) => ({
    name:  p.platform,
    value: totalPlatSpend > 0 ? Math.round((p.spend / totalPlatSpend) * 100) : 0,
    spend: p.spend,
  }));

  const perfScores = kpis ? [
    { label: "ROAS Hedefi",     score: Math.min(100, Math.round((kpis.avg_roas / 12) * 100)),          color: "#10B981" },
    { label: "CTR Performansı", score: Math.min(100, Math.round((kpis.avg_ctr / 0.025) * 100)),         color: "#F59E0B" },
    { label: "Dönüşüm Oranı",  score: Math.min(100, Math.round((kpis.total_conversions / 400) * 100)), color: "#7C3AED" },
  ] : [];
  const overallScore = perfScores.length ? Math.round(perfScores.reduce((s, p) => s + p.score, 0) / perfScores.length) : 0;

  return (
    <div className="page-enter">
      <Topbar
        title="Genel Bakış"
        subtitle={`${active} kampanya aktif · Bugün güncellendi`}
        anomalyCount={anomCnt}
        onPeriodChange={handlePeriodChange}
        onCustomRange={handleCustomRange}
      />

      <div className="p-6 space-y-6">
        {/* ── KPI cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Toplam Harcama"  value={`$${fmt(spend)}`}      sub="Son 7 gün"         icon={DollarSign}  iconColor="#2563EB" trend={{ value: +8.4,  label: "geçen hafta" }} />
          <KpiCard label="ROAS"            value={`${fmt(roas, 2)}x`}    sub="Hedef: 12.0x"      icon={TrendingUp}  iconColor="#10B981" trend={{ value: +18.6, label: "geçen hafta" }} />
          <KpiCard label="Dönüşüm"         value={fmt(conv)}              sub="328 işlem"         icon={Target}      iconColor="#7C3AED" trend={{ value: +5.2,  label: "geçen hafta" }} />
          <KpiCard label="CPA"             value={`$${fmt(cpa, 2)}`}     sub="Hedef: $140"       icon={BarChart2}   iconColor="#F59E0B" trend={{ value: -11.2, label: "geçen hafta" }} />
        </div>

        {/* ── Mini stats ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Gösterim"       value={fmt(impr)}              icon={Eye}             color="#2563EB" />
          <MiniStat label="Tıklama"        value={fmt(clicks)}            icon={MousePointer}    color="#7C3AED" />
          <MiniStat label="CTR"            value={`%${fmt(ctr, 2)}`}      icon={Percent}         color="#10B981" />
          <MiniStat label="Aktif Kampanya" value={fmt(active)}            icon={Megaphone}       color="#F59E0B" />
        </div>

        {/* ── Row 1: Spending trend + Donut ─────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Spending & conversion trend */}
          <Card className="xl:col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle>Harcama & Dönüşüm Trendi</SectionTitle>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Harcama</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Dönüşüm</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={ttStyle} />
                <Area yAxisId="left" type="monotone" dataKey="spend" name="Harcama ($)" fill="url(#spendGrad)" stroke="#2563EB" strokeWidth={2} dot={false} />
                <Line  yAxisId="right" type="monotone" dataKey="conversions" name="Dönüşüm" stroke="#10B981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Donut */}
          <Card className="p-5 flex flex-col">
            <SectionTitle>Platform Dağılımı</SectionTitle>
            <div className="flex-1 flex flex-col items-center justify-center gap-4 mt-4">
              <div className="relative">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={platformDonut.length ? platformDonut : [{ name: "—", value: 1, spend: 0 }]}
                         dataKey="value" cx="50%" cy="50%"
                         innerRadius={48} outerRadius={72} paddingAngle={4} startAngle={90} endAngle={-270}>
                      <Cell fill="#2563EB" />
                      <Cell fill="#7C3AED" />
                    </Pie>
                    <Tooltip contentStyle={ttStyle} formatter={(v) => [`${v}%`, "Pay"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="num text-xl font-bold text-white">{platformDonut[0]?.value ?? 0}%</p>
                  <p className="text-[10px] text-slate-500">{platformDonut[0]?.name ?? "—"}</p>
                </div>
              </div>
              <div className="w-full space-y-2">
                {platformDonut.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: i === 0 ? "#2563EB" : "#7C3AED" }} />
                      <span className="text-slate-300">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span className="num text-white font-medium">{p.value}%</span>
                      <span>${fmt(p.spend)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* ── ROAS & CTR Trendi ────────────────────────────────── */}
        {(() => {
          const roasCtrData = trend.map((t) => ({
            date: t.date,
            roas: t.spend > 0 ? +(t.conversion_value / t.spend).toFixed(2) : 0,
            ctr:  t.impressions > 0 ? +(t.clicks / t.impressions * 100).toFixed(3) : 0,
          }));
          return (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <SectionTitle>ROAS &amp; CTR Trendi</SectionTitle>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />ROAS</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" />CTR (%)</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-600 mb-4">Seçili dönem — çift eksen</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={roasCtrData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ctrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => `%${v}`} />
                  <Tooltip contentStyle={ttStyle} formatter={(v, name) => name === "ROAS" ? [`${Number(v).toFixed(2)}x`, name] : [`%${Number(v).toFixed(3)}`, name]} />
                  <Area yAxisId="left"  type="monotone" dataKey="roas" name="ROAS"     fill="url(#roasGrad)" stroke="#7C3AED" strokeWidth={2} dot={false} />
                  <Area yAxisId="right" type="monotone" dataKey="ctr"  name="CTR (%)"  fill="url(#ctrGrad)"  stroke="#06B6D4" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          );
        })()}

        {/* ── Row 2: Daily bar + ROAS trend ─────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Platform harcama karşılaştırması */}
          <Card className="p-5">
            <SectionTitle>Platform Harcama Karşılaştırması</SectionTitle>
            <ResponsiveContainer width="100%" height={200} className="mt-4">
              <BarChart data={platforms} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="platform" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={ttStyle} />
                <Bar dataKey="spend"       name="Harcama ($)"  fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="conversions" name="Dönüşüm"      fill="#7C3AED" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* En yüksek ROAS kampanyaları */}
          <Card className="p-5">
            <SectionTitle>En Yüksek ROAS — Top 5</SectionTitle>
            <ResponsiveContainer width="100%" height={200} className="mt-4">
              <BarChart layout="vertical"
                data={topCampaigns.slice(0, 5).map(c => ({
                  name: c.campaign_name.split("_").slice(-2).join(" "),
                  roas: c.roas,
                }))}
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={ttStyle} formatter={(v) => [`${Number(v).toFixed(1)}x`, "ROAS"]} />
                <Bar dataKey="roas" name="ROAS" fill="#10B981" radius={[0, 4, 4, 0]} maxBarSize={14}
                     background={{ fill: "rgba(255,255,255,0.03)" }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Conversion by campaign (horizontal bar) ───────────── */}
        <Card className="p-5">
          <SectionTitle>Kampanyaya Göre Dönüşüm</SectionTitle>
          <ResponsiveContainer width="100%" height={180} className="mt-4">
            <BarChart layout="vertical"
              data={topCampaigns.map(c => ({ name: c.campaign_name.split("_").slice(-2).join(" "), conversions: c.conversions }))}
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={130} />
              <Tooltip contentStyle={ttStyle} />
              <Bar dataKey="conversions" name="Dönüşüm" fill="#2563EB" radius={[0, 4, 4, 0]} maxBarSize={14}
                   background={{ fill: "rgba(255,255,255,0.03)" }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* ── Campaign table ────────────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: BORDER }}>
            <SectionTitle>Kampanya Performansı</SectionTitle>
            <a href="/campaigns" className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">Tümünü Gör →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: BORDER }}>
                  {["Kampanya", "Platform", "Harcama", "Tahmini Gelir", "ROAS", "Dönüşüm", "CPA", ""].map((h) => (
                    <th key={h} className="text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c, i) => {
                  const platform = c.campaign_name.toLowerCase().includes("meta") ? "meta" : "google";
                  const revenue  = c.spend * c.roas;
                  return (
                    <tr key={i} className="group transition-colors"
                        style={{ borderBottom: i < topCampaigns.length - 1 ? BORDER : "none" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = BG3)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                               style={{ background: platform === "google" ? "rgba(37,99,235,0.15)" : "rgba(124,58,237,0.15)" }}>
                            <Zap className="h-2.5 w-2.5" style={{ color: platform === "google" ? "#60a5fa" : "#a78bfa" }} />
                          </div>
                          <span className="text-slate-200 font-medium truncate max-w-[160px]">{c.campaign_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-400">{platform}</td>
                      <td className="px-4 py-3 num text-slate-200 font-medium">${fmt(c.spend)}</td>
                      <td className="px-4 py-3 num text-emerald-400 font-medium">${fmt(revenue)}</td>
                      <td className="px-4 py-3 num font-bold" style={{ color: c.roas >= 12 ? "#10B981" : "#F59E0B" }}>
                        {fmt(c.roas, 1)}x
                      </td>
                      <td className="px-4 py-3 num text-slate-300">{fmt(c.conversions, 1)}</td>
                      <td className="px-4 py-3 num text-slate-400">${fmt(c.cpa, 2)}</td>
                      <td className="px-4 py-3">
                        <button className="text-slate-600 hover:text-slate-400 transition-colors">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Bottom grid: Anomalies | Recommendations | Score ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Anomaly panel */}
          <Card>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: BORDER }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <SectionTitle>Anomali Tespiti</SectionTitle>
              </div>
              <span className="num text-[10px] font-bold px-2 py-0.5 rounded-full text-rose-400" style={{ background: "rgba(244,63,94,0.12)" }}>
                {anomCnt}
              </span>
            </div>
            <div className="p-3 space-y-2">
              {activeAnomalies.length === 0 ? (
                <p className="text-[11px] text-slate-600 text-center py-4">Anomali tespit edilmedi</p>
              ) : activeAnomalies.map((a, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: BG3, border: BORDER }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-[11px] font-semibold text-slate-200 truncate">{a.campaign_name}</p>
                    <SeverityBadge s={a.severity} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{a.metric_name}</span>
                    <span className={`num text-[11px] font-bold ${a.change_percent < 0 ? "text-rose-400" : "text-amber-400"}`}>
                      {a.change_percent > 0 ? "+" : ""}{fmt(a.change_percent, 1)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">{new Date(a.detected_at).toLocaleDateString("tr-TR")}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Recommendations panel */}
          <Card>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: BORDER }}>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                <SectionTitle>AI Önerileri</SectionTitle>
              </div>
              <span className="num text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-400" style={{ background: "rgba(245,158,11,0.12)" }}>
                {recommendations.length}
              </span>
            </div>
            <div className="p-3 space-y-2">
              {recommendations.length === 0 ? (
                <p className="text-[11px] text-slate-600 text-center py-4">Bekleyen öneri yok</p>
              ) : recommendations.map((r, i) => {
                const riskLabel = r.risk_score >= 7 ? "high" : r.risk_score >= 4 ? "medium" : "low";
                return (
                  <div key={i} className="p-3 rounded-lg" style={{ background: BG3, border: BORDER }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[11px] font-semibold text-white capitalize">{r.action}</p>
                      <RiskBadge risk={riskLabel} />
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{r.campaign_name}</p>
                    <p className="text-[10px] text-blue-400 mt-1 line-clamp-2">{r.reason}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors">
                        <CheckCircle className="h-3 w-3" /> Uygula
                      </button>
                      <button className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-rose-400 transition-colors ml-auto">
                        <XCircle className="h-3 w-3" /> Reddet
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Performance score */}
          <Card className="p-5">
            <SectionTitle>Performans Skoru</SectionTitle>
            <div className="flex flex-col items-center mt-4 mb-4">
              <div className="relative">
                <PerfRing score={overallScore} size={100} stroke={8} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="num text-2xl font-bold text-white">{overallScore}</p>
                  <p className="text-[10px] text-slate-500">/100</p>
                </div>
              </div>
              <p className="text-xs text-amber-400 font-medium mt-2">
                {overallScore >= 80 ? "Mükemmel" : overallScore >= 60 ? "İyi · İyileştirilebilir" : "Dikkat Gerekiyor"}
              </p>
            </div>
            <div className="space-y-3">
              {perfScores.map(({ label, score, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400">{label}</span>
                    <span className="num text-[11px] font-bold text-slate-200">{score}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${score}%`, background: color, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
