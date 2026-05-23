"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Campaign } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Topbar from "@/components/Topbar";
import { badge } from "@/lib/styles";
import {
  Search, AlertTriangle, TrendingUp, TrendingDown, Minus,
  ChevronLeft, ChevronRight, Pencil, DollarSign, Target,
  LayoutGrid, List, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Metrics {
  total_cost?: number;
  total_revenue?: number;
  total_conversions?: number;
  roas?: number;
  cpa?: number | null;
  ctr?: number;
  roas_change_7d?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  search: "Arama", display: "Display", shopping: "Alışveriş",
  video: "Video", pmax: "PMax", awareness: "Farkındalık",
  sales: "Satış", retargeting: "Yeniden Hedef", traffic: "Trafik",
  engagement: "Etkileşim", reach: "Erişim", leads: "Lead",
  performance_max: "PMax",
};

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  enabled:   { label: "Aktif",      cls: badge.success, dot: "#10B981" },
  paused:    { label: "Duraklıyor", cls: badge.warning, dot: "#F59E0B" },
  removed:   { label: "Kaldırıldı", cls: badge.danger,  dot: "#F43F5E" },
  completed: { label: "Tamamlandı", cls: badge.info,    dot: "#3B82F6" },
};

const PAGE_SIZE = 8;
const BORDER = "1px solid rgba(255,255,255,0.06)";
const BG2    = "#0D1526";
const BG3    = "#111D35";

const KPI_SPARKLINES = {
  spend:   [72, 68, 75, 70, 82, 79, 84],
  revenue: [78, 74, 80, 76, 88, 84, 92],
  conv:    [60, 58, 65, 62, 68, 72, 71],
  roas:    [85, 87, 84, 88, 84, 83, 80],
};

const PLATFORM_OPTIONS = [
  { key: "all",    label: "Tüm Platformlar" },
  { key: "google", label: "Google" },
  { key: "meta",   label: "Meta" },
] as const;

const STATUS_OPTIONS = [
  { key: "all",     label: "Tümü" },
  { key: "enabled", label: "Aktif" },
  { key: "paused",  label: "Duraklıyor" },
  { key: "removed", label: "Kaldırıldı" },
] as const;

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function fmtChange(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function rowBorderColor(c: Campaign, platform: string): string {
  if (c.status === "removed") return "#F43F5E";
  if (c.status === "paused")  return "#F59E0B";
  if (platform === "meta")    return "#7C3AED";
  return "#2563EB";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function platformOf(name: string, accountId: string) {
  const n = name.toLowerCase();
  const a = accountId.toLowerCase();
  if (n.includes("google") || a === "a1") return "google";
  if (n.includes("meta") || n.includes("facebook") || a === "a2") return "meta";
  return "unknown";
}

function PlatformBadge({ platform }: { platform: string }) {
  if (platform === "google")
    return <span className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-md px-2 py-0.5 text-xs text-blue-300"><GoogleIcon />Google</span>;
  if (platform === "meta")
    return <span className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded-md px-2 py-0.5 text-xs text-purple-300"><MetaIcon />Meta</span>;
  return null;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 60, H = 22;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
    </svg>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color, change, sparkData }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color: string; change: string; sparkData: number[];
}) {
  const isPos = change.startsWith("+");
  return (
    <div className="p-4 rounded-xl relative overflow-hidden"
         style={{ background: `linear-gradient(135deg, ${BG2} 0%, ${color}0A 100%)`, border: `1px solid ${color}22` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <Sparkline data={sparkData} color={color} />
      </div>
      <p className="num text-xl font-bold text-white leading-none">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      <div className="flex items-center gap-1.5 mt-2.5">
        <span className={cn(
          "text-[10px] font-bold px-1.5 py-0.5 rounded",
          isPos ? "text-emerald-400 bg-emerald-500/12" : "text-rose-400 bg-rose-500/12"
        )}>
          {change}
        </span>
        <span className="text-[10px] text-slate-600">geçen haftaya göre</span>
      </div>
    </div>
  );
}

function BudgetBar({ pct }: { pct: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);
  const color = pct > 85 ? "#F59E0B" : "#2563EB";
  return (
    <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out"
           style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function PillGroup<T extends string>({
  options, value, onChange,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 font-medium whitespace-nowrap",
            value === key
              ? "bg-blue-600 border-blue-500 text-white"
              : "text-slate-400 hover:text-slate-200 hover:border-slate-600"
          )}
          style={value !== key ? { background: BG3, borderColor: "rgba(255,255,255,0.08)" } : {}}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CampaignCard({ c, m, platform, isRisky, onClick, onEdit }: {
  c: Campaign; m: Metrics | undefined; platform: string;
  isRisky: boolean; onClick: () => void; onEdit: (e: React.MouseEvent) => void;
}) {
  const st = STATUS_MAP[c.status];
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl cursor-pointer transition-all duration-150 group"
      style={{ background: BG2, border: BORDER }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
            {c.campaign_name}
          </p>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">{c.external_campaign_id}</p>
        </div>
        {isRisky && <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />}
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PlatformBadge platform={platform} />
        <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded" style={{ background: BG3 }}>
          {TYPE_LABEL[c.campaign_type] ?? c.campaign_type}
        </span>
        {st && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: st.dot, background: `${st.dot}18` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
            {st.label}
          </span>
        )}
      </div>
      {m ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Harcama",  value: m.total_cost != null ? `$${fmt(m.total_cost)}` : "—" },
            { label: "ROAS",     value: `${fmt(m.roas, 1)}x` },
            { label: "Dönüşüm", value: fmt(m.total_conversions ?? 0) },
            { label: "CPA",      value: m.cpa != null ? `$${fmt(m.cpa, 2)}` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg p-2 text-center" style={{ background: BG3 }}>
              <p className="num text-xs font-bold text-white">{value}</p>
              <p className="text-[9px] text-slate-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-16 rounded-lg mb-3" style={{ background: BG3 }} />
      )}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: BORDER }}>
        <span className="text-[10px] text-slate-600">
          {c.daily_budget != null ? `$${fmt(c.daily_budget)} / gün` : "Bütçe yok"}
        </span>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-slate-400 hover:text-white px-2 py-1 rounded"
          style={{ background: BG3 }}
        >
          <Pencil className="h-3 w-3" /> Düzenle
        </button>
      </div>
    </div>
  );
}

const selectCls = "text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none transition-colors text-slate-300 hover:border-slate-600";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns,       setCampaigns]       = useState<Campaign[]>([]);
  const [metrics,         setMetrics]         = useState<Record<string, Metrics>>({});
  const [riskIds,         setRiskIds]         = useState<Set<string>>(new Set());
  const [anomalies,       setAnomalies]       = useState<Array<{ campaign_id: string; is_resolved?: boolean }>>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState("");
  const [statusFilter,    setStatusFilter]    = useState<"all"|"enabled"|"paused"|"removed">("all");
  const [typeFilter,      setTypeFilter]      = useState("all");
  const [platformFilter,  setPlatformFilter]  = useState<"all"|"google"|"meta">("all");
  const [riskyOnly,       setRiskyOnly]       = useState(false);
  const [viewMode,        setViewMode]        = useState<"table"|"grid">("table");
  const [page,            setPage]            = useState(1);
  const [changes, setChanges] = useState({ spend_change: 0, revenue_change: 0, conversions_change: 0, roas_change: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [cRes, aRes] = await Promise.all([
          api.get<Campaign[]>("/campaigns"),
          api.get("/api/anomalies/").catch(() => ({ data: [] })),
        ]);
        const data: Campaign[] = cRes.data ?? [];
        setCampaigns(data);
        const anomalyList = aRes.data?.data ?? [];
        setAnomalies(anomalyList);
        setRiskIds(new Set<string>(anomalyList.map((a: { campaign_id: string }) => a.campaign_id)));

        const map: Record<string, Metrics> = {};
        await Promise.all(
          data.map(async (c) => {
            try { map[c.id] = (await api.get(`/campaigns/${c.id}/metrics-summary`)).data; }
            catch { map[c.id] = { total_cost: 0, total_revenue: 0, total_conversions: 0, roas: 0, cpa: 0, ctr: 0 }; }
          })
        );
        setMetrics(map);
      } catch (err) {
        console.error("Kampanya verisi alınamadı:", err);
        setCampaigns([]);
        setMetrics({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, platformFilter, riskyOnly]);

  useEffect(() => {
    api.get("/campaigns/summary")
      .then((res) => setChanges({
        spend_change:       res.data.spend_change       ?? 0,
        revenue_change:     res.data.revenue_change     ?? 0,
        conversions_change: res.data.conversions_change ?? 0,
        roas_change:        res.data.roas_change        ?? 0,
      }))
      .catch(() => {});
  }, []);

  const types = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.campaign_type))).sort(),
    [campaigns]
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return campaigns.filter((c) => {
      const plat = platformOf(c.campaign_name, c.ad_account_id);
      return (
        (c.campaign_name.toLowerCase().includes(s) || c.external_campaign_id?.toLowerCase().includes(s)) &&
        (statusFilter   === "all" || c.status        === statusFilter) &&
        (typeFilter     === "all" || c.campaign_type === typeFilter) &&
        (platformFilter === "all" || plat             === platformFilter) &&
        (!riskyOnly || riskIds.has(c.id))
      );
    });
  }, [campaigns, search, statusFilter, typeFilter, platformFilter, riskyOnly, riskIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const vals = Object.values(metrics);
    return {
      spend:   vals.reduce((s, m) => s + (m.total_cost ?? 0), 0),
      conv:    vals.reduce((s, m) => s + (m.total_conversions ?? 0), 0),
      revenue: vals.reduce((s, m) => s + (m.total_revenue ?? (m.total_cost ?? 0) * (m.roas ?? 0)), 0),
      roas:    vals.length ? vals.reduce((s, m) => s + (m.roas ?? 0), 0) / (vals.filter(m => (m.roas ?? 0) > 0).length || 1) : 0,
    };
  }, [metrics]);

  const activeCount = campaigns.filter((c) => c.status === "enabled").length;
  const campaignIdSet = new Set(campaigns.map((c) => c.id));
  const activeAnomalyCount = anomalies.filter((a) => !a.is_resolved && campaignIdSet.has(a.campaign_id)).length;

  // ── Shared pagination ─────────────────────────────────────────────────────
  function Pagination() {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-4" style={{ borderTop: BORDER }}>
        <p className="text-xs text-slate-500">
          {filtered.length === 0
            ? "0 kampanya"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} / ${filtered.length} kampanya`}
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: BG3, border: BORDER }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn("w-9 h-9 rounded-lg text-sm font-semibold transition-all",
                  page === p ? "text-white" : "text-slate-400 hover:text-white"
                )}
                style={{
                  background: page === p ? "#2563EB" : BG3,
                  border: page === p ? "1px solid #3b82f6" : BORDER,
                }}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && <span className="text-slate-600 text-xs">…{totalPages}</span>}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: BG3, border: BORDER }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <Topbar
        title="Kampanyalar"
        subtitle={loading ? "Yükleniyor…" : `${filtered.length} / ${campaigns.length} kampanya · ${activeCount} aktif`}
        anomalyCount={activeAnomalyCount}
        hidePeriodSelector
      />

      <div className="p-6 space-y-5">

        {/* KPI Summary */}
        {!loading && Object.keys(metrics).length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Toplam Harcama"  value={`$${fmt(totals.spend)}`}                              sub={`${campaigns.length} kampanya`} icon={DollarSign}        color="#2563EB" change={fmtChange(changes.spend_change)}       sparkData={KPI_SPARKLINES.spend}   />
            <KpiCard label="Toplam Gelir"    value={`$${fmt(totals.revenue)}`}                            sub="tahmini"                        icon={TrendingUp}        color="#10B981" change={fmtChange(changes.revenue_change)}     sparkData={KPI_SPARKLINES.revenue}  />
            <KpiCard label="Toplam Dönüşüm" value={fmt(totals.conv)}                                      sub="son 7 gün"                      icon={Target}            color="#7C3AED" change={fmtChange(changes.conversions_change)} sparkData={KPI_SPARKLINES.conv}    />
            <KpiCard label="Ort. ROAS"       value={`${fmt(isNaN(totals.roas) ? 0 : totals.roas, 1)}x`}   sub="ağırlıklı ortalama"             icon={SlidersHorizontal} color="#F59E0B" change={fmtChange(changes.roas_change)}       sparkData={KPI_SPARKLINES.roas} />
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: BG2, border: BORDER }}>
          {/* Row 1: Search + Type + Risk + View */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="Kampanya adı, ID veya tür ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm h-9"
                style={{ background: BG3, border: BORDER, color: "#e2e8f0" }}
              />
            </div>

            {types.length > 0 && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={selectCls}
                style={{ background: BG3, border: BORDER }}
              >
                <option value="all">Tüm Türler</option>
                {types.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
                ))}
              </select>
            )}

            {riskIds.size > 0 && (
              <button
                onClick={() => setRiskyOnly((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all",
                  riskyOnly
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                    : "border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                )}
                style={!riskyOnly ? { background: BG3 } : {}}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {riskIds.size} riskli
              </button>
            )}

            <div className="ml-auto flex items-center rounded-lg overflow-hidden" style={{ border: BORDER, background: BG3 }}>
              <button
                onClick={() => setViewMode("table")}
                className={cn("p-2 transition-colors", viewMode === "table" ? "text-white" : "text-slate-500 hover:text-slate-300")}
                style={viewMode === "table" ? { background: "#2563EB" } : {}}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn("p-2 transition-colors", viewMode === "grid" ? "text-white" : "text-slate-500 hover:text-slate-300")}
                style={viewMode === "grid" ? { background: "#2563EB" } : {}}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Platform pills */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider shrink-0 w-16">Platform</span>
            <PillGroup options={PLATFORM_OPTIONS} value={platformFilter} onChange={setPlatformFilter} />
          </div>

          {/* Row 3: Status pills */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider shrink-0 w-16">Durum</span>
            <PillGroup options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-20 text-center rounded-xl" style={{ background: BG2, border: BORDER }}>
            <Search className="h-8 w-8 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">Eşleşen kampanya bulunamadı</p>
            <p className="text-slate-600 text-xs mt-1">Filtrelerinizi değiştirmeyi deneyin</p>
          </div>
        ) : viewMode === "table" ? (
          /* ── Table view ───────────────────────────────────────────── */
          <div className="rounded-xl overflow-hidden" style={{ background: BG2, border: BORDER }}>
            <table className="w-full text-sm">
              <thead style={{ background: "linear-gradient(to right, #0f172a, rgba(30,41,59,0.5))" }}>
                <tr style={{ borderBottom: BORDER }}>
                  {["Kampanya", "Platform", "Tür", "Durum", "Harcama", "ROAS", "Dönüşüm", "CPA", "Son 7g ROAS", ""].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "text-[10px] font-semibold text-slate-600 uppercase tracking-wider py-3 px-4 whitespace-nowrap",
                        ["Harcama", "ROAS", "Dönüşüm", "CPA", "Son 7g ROAS"].includes(h) ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((c, i) => {
                  const platform = platformOf(c.campaign_name, c.ad_account_id);
                  const m        = metrics[c.id];
                  const st       = STATUS_MAP[c.status];
                  const isRisky  = riskIds.has(c.id);
                  const bColor   = rowBorderColor(c, platform);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/campaigns/${c.id}`)}
                      className="cursor-pointer group transition-all duration-150"
                      style={{
                        borderBottom: i < paginated.length - 1 ? BORDER : "none",
                        borderLeft: `3px solid ${bColor}55`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = BG3;
                        e.currentTarget.style.borderLeft = `3px solid ${bColor}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderLeft = `3px solid ${bColor}55`;
                      }}
                    >
                      {/* Kampanya */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {isRisky && <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                          <div>
                            <p className="font-medium text-slate-200 group-hover:text-white transition-colors truncate max-w-[200px] text-xs">
                              {c.campaign_name}
                            </p>
                            <span className="inline-block text-[9px] font-mono text-slate-500 bg-slate-800/80 border border-slate-700/60 px-1.5 py-0.5 rounded-md mt-0.5">
                              {c.external_campaign_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Platform */}
                      <td className="px-4 py-3.5"><PlatformBadge platform={platform} /></td>

                      {/* Tür */}
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded" style={{ background: BG3 }}>
                          {TYPE_LABEL[c.campaign_type] ?? c.campaign_type}
                        </span>
                      </td>

                      {/* Durum */}
                      <td className="px-4 py-3.5">
                        {st && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ color: st.dot, background: `${st.dot}18` }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                            {st.label}
                          </span>
                        )}
                      </td>

                      {/* Harcama */}
                      <td className="px-4 py-3.5 text-right num text-xs text-slate-300 font-medium">
                        {m?.total_cost != null ? `$${fmt(m.total_cost)}` : "—"}
                      </td>

                      {/* ROAS */}
                      <td className="px-4 py-3.5 text-right">
                        {m ? (
                          <div className="flex items-center justify-end gap-1">
                            {m.roas >= 10
                              ? <TrendingUp   className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              : m.roas >= 5
                              ? <Minus        className="h-3.5 w-3.5 text-amber-400   shrink-0" />
                              : <TrendingDown className="h-3.5 w-3.5 text-rose-400    shrink-0" />}
                            <span className={cn("num text-sm font-bold",
                              m.roas >= 10 ? "text-emerald-400" : m.roas >= 5 ? "text-amber-400" : "text-rose-400"
                            )}>
                              {fmt(m.roas, 1)}x
                            </span>
                          </div>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>

                      {/* Dönüşüm */}
                      <td className="px-4 py-3.5 text-right num text-xs text-slate-300">
                        {m ? fmt(m.total_conversions ?? 0) : "—"}
                      </td>

                      {/* CPA */}
                      <td className="px-4 py-3.5 text-right">
                        {m?.cpa != null ? (
                          <span className={cn("num text-xs font-medium",
                            m.cpa < 10 ? "text-emerald-400" : m.cpa < 25 ? "text-amber-400" : "text-rose-400"
                          )}>
                            ${fmt(m.cpa, 2)}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>

                      {/* Son 7g ROAS */}
                      <td className="px-4 py-3.5 text-right">
                        {m?.roas_change_7d != null ? (
                          <div className="flex items-center justify-end gap-1">
                            {Math.abs(m.roas_change_7d) < 1
                              ? <Minus        className="h-3.5 w-3.5 text-amber-400   shrink-0" />
                              : m.roas_change_7d > 0
                              ? <TrendingUp   className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              : <TrendingDown className="h-3.5 w-3.5 text-rose-400    shrink-0" />}
                            <span className={cn("num text-xs font-medium",
                              Math.abs(m.roas_change_7d) < 1 ? "text-amber-400" : m.roas_change_7d > 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {m.roas_change_7d > 0 ? "+" : ""}{m.roas_change_7d.toFixed(1)}%
                            </span>
                          </div>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>

                      {/* Düzenle */}
                      <td className="px-4 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/campaigns/${c.id}/edit`); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded text-slate-400 hover:text-white"
                          style={{ background: BG3 }}
                        >
                          <Pencil className="h-3 w-3" /> Düzenle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination />
          </div>
        ) : (
          /* ── Grid view ────────────────────────────────────────────── */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginated.map((c) => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  m={metrics[c.id]}
                  platform={platformOf(c.campaign_name, c.ad_account_id)}
                  isRisky={riskIds.has(c.id)}
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                  onEdit={(e) => { e.stopPropagation(); router.push(`/campaigns/${c.id}/edit`); }}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="rounded-xl" style={{ background: BG2, border: BORDER }}>
                <Pagination />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
