"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageWrapper from "@/components/PageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { card, tooltipStyle, axisStyle } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { BarChart2, TrendingUp, DollarSign, Target, MousePointerClick, Eye, ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";

interface KPIs {
  total_spend: number; total_conversions: number;
  total_impressions: number; total_clicks: number;
  avg_roas: number; avg_cpa: number; avg_ctr: number;
  active_campaigns: number;
}
interface DailyMetric { date: string; spend: number; conversions: number; impressions: number; clicks: number; }

function fmt(n: number, d = 2) { return n.toLocaleString("tr-TR", { maximumFractionDigits: d }); }

function toDateInputValue(d: Date) { return d.toISOString().slice(0, 10); }

const DATE_OPTIONS = [{ label: "7 Gün", days: 7 }, { label: "14 Gün", days: 14 }, { label: "30 Gün", days: 30 }];

const DEVICE_DATA = [
  { name: "Mobil",   value: 58, color: "#60a5fa" },
  { name: "Desktop", value: 31, color: "#a78bfa" },
  { name: "Tablet",  value: 11, color: "#34d399" },
];

const CHANNEL_DATA = [
  { channel: "Organic",   sessions: 4820, conversions: 94  },
  { channel: "Paid Srch", sessions: 3210, conversions: 148 },
  { channel: "Direct",    sessions: 1890, conversions: 62  },
  { channel: "Social",    sessions: 1240, conversions: 37  },
  { channel: "Email",     sessions:  670, conversions: 28  },
];

const CAMPAIGN_TYPE_DATA = [
  { name: "Search",    value: 35, color: "#60a5fa" },
  { name: "PMax",      value: 25, color: "#a78bfa" },
  { name: "Sales",     value: 18, color: "#34d399" },
  { name: "Display",   value: 12, color: "#fbbf24" },
  { name: "Awareness", value: 10, color: "#f87171" },
];

const HOURLY_DATA = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, "0")}:00`,
  sessions: Math.round(80 + Math.sin((h - 10) * 0.5) * 60 + Math.random() * 20),
}));

const TRENDS: Record<string, { pct: number }> = {
  spend: { pct: 8.3 }, conversions: { pct: 12.4 },
  roas:  { pct: -3.1 }, ctr: { pct: 5.7 },
};

function TrendBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-emerald-400" : "text-rose-400")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

function ChartCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className={cn(card, "p-5")}>
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function CustomPieLegend({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="mt-4 space-y-2">
      {data.map((d) => (
        <li key={d.name} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-slate-300">{d.name}</span>
          </span>
          <span className="text-slate-400 font-mono">{Math.round(d.value / total * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

export default function MetricsPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [trend, setTrend] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() - 14);
  const [startDate, setStartDate] = useState(toDateInputValue(defaultStart));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [useCustomRange, setUseCustomRange] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = useCustomRange
          ? `start_date=${startDate}&end_date=${endDate}`
          : `days=${days}`;
        const res = await api.get(`/api/dashboard/overview?${params}`);
        setKpis(res.data.kpis);
        setTrend(res.data.weekly_trend ?? []);
      } catch { /* no data yet */ }
      finally { setLoading(false); }
    })();
  }, [days, startDate, endDate, useCustomRange]);

  const kpiCards = [
    { label: "Toplam Harcama", value: kpis ? `$${fmt(kpis.total_spend)}` : "—",   icon: DollarSign,        color: "text-blue-400",    trend: TRENDS.spend },
    { label: "Dönüşüm",        value: kpis ? fmt(kpis.total_conversions, 0) : "—", icon: Target,            color: "text-emerald-400", trend: TRENDS.conversions },
    { label: "ROAS",            value: kpis ? `${fmt(kpis.avg_roas)}x` : "—",      icon: TrendingUp,        color: "text-purple-400",  trend: TRENDS.roas },
    { label: "CTR",             value: kpis ? `%${fmt(kpis.avg_ctr * 100)}` : "—", icon: MousePointerClick, color: "text-amber-400",   trend: TRENDS.ctr },
    { label: "Gösterim",        value: kpis ? fmt(kpis.total_impressions, 0) : "—", icon: Eye,               color: "text-cyan-400",    trend: null },
    { label: "Tıklama",         value: kpis ? fmt(kpis.total_clicks, 0) : "—",     icon: MousePointerClick, color: "text-pink-400",    trend: null },
    { label: "CPA",             value: kpis ? `$${fmt(kpis.avg_cpa)}` : "—",       icon: BarChart2,         color: "text-orange-400",  trend: null },
    { label: "Aktif Kampanya",  value: kpis ? fmt(kpis.active_campaigns, 0) : "—", icon: BarChart2,         color: "text-indigo-400",  trend: null },
  ];

  return (
    <PageWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-blue-400" /> Metrikler
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Reklam performans analizi</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!useCustomRange && DATE_OPTIONS.map((o) => (
              <button key={o.days} onClick={() => { setDays(o.days); setUseCustomRange(false); }}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-full font-medium transition-all duration-200",
                  days === o.days ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600"
                )}>{o.label}</button>
            ))}
            <button
              onClick={() => setUseCustomRange(!useCustomRange)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full font-medium transition-all duration-200",
                useCustomRange ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Tarih Aralığı
            </button>
            {useCustomRange && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-slate-500 text-xs">—</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={toDateInputValue(today)}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, color, trend: t }) => (
            <div key={label} className={cn(card, "p-4 space-y-2")}>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <Icon className={cn("h-3.5 w-3.5", color)} />
              </div>
              {loading
                ? <Skeleton className="h-6 w-20" />
                : (
                  <div>
                    <p className="text-xl font-bold text-slate-100">{value}</p>
                    {t && <TrendBadge pct={t.pct} />}
                  </div>
                )}
            </div>
          ))}
        </div>

        {/* Trend Line */}
        <ChartCard
          title="Harcama & Dönüşüm Trendi"
          desc={useCustomRange ? `${startDate} – ${endDate}` : `Son ${days} günlük reklam performansı`}
        >
          {loading
            ? <Skeleton className="h-[260px] w-full" />
            : trend.length === 0
            ? <div className="h-[260px] flex items-center justify-center text-slate-500 text-sm">Veri yok</div>
            : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="spend" name="Harcama ($)" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="conversions" name="Dönüşüm" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
        </ChartCard>

        {/* Row 2: Pie + Bar */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Cihaz Dağılımı" desc="Oturum ve dönüşümlerin cihaz kırılımı">
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={DEVICE_DATA} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" strokeWidth={0}>
                    {DEVICE_DATA.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <CustomPieLegend data={DEVICE_DATA} />
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Kanal Performansı" desc="Oturum kaynağına göre dönüşüm dağılımı">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={CHANNEL_DATA} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis dataKey="channel" type="category" tick={axisStyle} tickLine={false} axisLine={false} width={68} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="sessions" name="Oturum" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                <Bar dataKey="conversions" name="Dönüşüm" fill="#34d399" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 3: Donut + Hourly Area */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Kampanya Türü Dağılımı" desc="Harcamanın kampanya türlerine dağılımı">
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={CAMPAIGN_TYPE_DATA} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" strokeWidth={0}>
                    {CAMPAIGN_TYPE_DATA.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <CustomPieLegend data={CAMPAIGN_TYPE_DATA} />
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Saat Bazlı Trafik" desc="Gün içi oturum yoğunluğu (24 saat)">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={HOURLY_DATA} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" tick={axisStyle} tickLine={false} interval={3} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="sessions" name="Oturum" stroke="#60a5fa" fill="url(#hourGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Clicks & Impressions */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Günlük Tıklama" desc="">
            {trend.length === 0
              ? <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">Veri yok</div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="clicks" name="Tıklama" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </ChartCard>

          <ChartCard title="Günlük Gösterim" desc="">
            {trend.length === 0
              ? <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">Veri yok</div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={axisStyle} tickLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="impressions" name="Gösterim" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </ChartCard>
        </div>
      </div>
    </PageWrapper>
  );
}