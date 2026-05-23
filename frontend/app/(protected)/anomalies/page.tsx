"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";
import api from "@/lib/api";
import Topbar from "@/components/Topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AlertOctagon, AlertTriangle, AlertCircle, Info,
  CheckCircle2, ScanLine, ShieldAlert, Download,
  ChevronUp, ChevronDown, ChevronsUpDown, TrendingDown, TrendingUp,
  DollarSign, Target, MousePointer, Clock,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";

interface Anomaly {
  id: string;
  campaign_id: string;
  campaign_name: string;
  metric_name: string;
  severity: string;
  z_score?: number;
  note: string;
  change_percent: number;
  is_resolved?: boolean;
  detected_at: string;
  platform?: string;
  expected_value?: number | null;
  actual_value?: number | null;
}

const SEV: Record<string, {
  label: string; icon: React.ElementType;
  iconCls: string; color: string; borderColor: string; bgColor: string; textColor: string; priority: number;
}> = {
  critical: {
    label: "Kritik", icon: AlertOctagon,
    iconCls: "text-rose-400",
    color: "#f43f5e", borderColor: "#F43F5E", bgColor: "rgba(244,63,94,0.12)", textColor: "#fb7185",
    priority: 4,
  },
  high: {
    label: "Yüksek", icon: AlertTriangle,
    iconCls: "text-orange-400",
    color: "#f97316", borderColor: "#F97316", bgColor: "rgba(249,115,22,0.12)", textColor: "#fb923c",
    priority: 3,
  },
  medium: {
    label: "Orta", icon: AlertCircle,
    iconCls: "text-amber-400",
    color: "#f59e0b", borderColor: "#F59E0B", bgColor: "rgba(245,158,11,0.12)", textColor: "#fbbf24",
    priority: 2,
  },
  low: {
    label: "Düşük", icon: Info,
    iconCls: "text-blue-400",
    color: "#3b82f6", borderColor: "#3B82F6", bgColor: "rgba(59,130,246,0.12)", textColor: "#60a5fa",
    priority: 1,
  },
};

const METRIC_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  Cost:        { icon: DollarSign,   label: "Harcama",  color: "#f59e0b" },
  Conversions: { icon: Target,       label: "Dönüşüm",  color: "#8b5cf6" },
  CTR:         { icon: MousePointer, label: "CTR",      color: "#06b6d4" },
  ROAS:        { icon: TrendingUp,   label: "ROAS",     color: "#10b981" },
  CPA:         { icon: DollarSign,   label: "CPA",      color: "#f97316" },
  CVR:         { icon: Target,       label: "CVR",      color: "#a855f7" },
  Impressions: { icon: ScanLine,     label: "Gösterim", color: "#64748b" },
  Clicks:      { icon: MousePointer, label: "Tıklama",  color: "#3b82f6" },
};

const SEV_FILTERS = [
  { key: "all",      label: "Tümü" },
  { key: "critical", label: "Kritik" },
  { key: "high",     label: "Yüksek" },
  { key: "medium",   label: "Orta" },
  { key: "low",      label: "Düşük" },
] as const;

const STATUS_FILTERS = [
  { key: "all",      label: "Tümü" },
  { key: "active",   label: "Aktif" },
  { key: "resolved", label: "Çözüldü" },
] as const;

type SortKey = "severity" | "campaign_name" | "metric_name" | "change_percent" | "detected_at";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "severity",       label: "Önem" },
  { key: "change_percent", label: "Değişim" },
  { key: "detected_at",    label: "Tarih" },
  { key: "campaign_name",  label: "Kampanya" },
];

function getRelTime(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr }); }
  catch { return iso; }
}

function getAbsTime(iso: string) {
  try { return format(new Date(iso), "d MMM, HH:mm", { locale: tr }); }
  catch { return ""; }
}

function humanizeNote(note: string, metricName: string, changePct: number): string {
  if (!note || !/Z-score:/i.test(note)) return note;

  const matches = [...note.matchAll(/(\w+)=([\d.]+)/g)];
  let maxZ = 0;
  let dominantKey = "";
  for (const m of matches) {
    const v = parseFloat(m[2]);
    if (v > maxZ) { maxZ = v; dominantKey = m[1].toLowerCase(); }
  }

  const dir   = changePct >= 0 ? "üzerinde" : "altında";
  const times = maxZ > 0 ? `normalin ${maxZ.toFixed(1)}x ` : "";

  const msgs: Record<string, string> = {
    cost:  `Harcama ${times}${dir} seyrediyor`,
    conv:  `Dönüşüm hacmi ${times}${dir} seyrediyor`,
    ctr:   changePct >= 0 ? "Tıklama oranı beklenmedik biçimde yükseldi" : "Tıklama oranı belirgin şekilde düştü",
    roas:  `ROAS değeri ${times}${dir}`,
    impr:  `Gösterim sayısı ${times}${dir}`,
    click: `Tıklama sayısı ${times}${dir}`,
  };

  const fallbackLabel = METRIC_CONFIG[metricName]?.label ?? metricName;
  return msgs[dominantKey] ?? `${fallbackLabel} ${times}${dir} seyrediyor`;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-slate-600" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />;
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

// ── FilterDropdown ────────────────────────────────────────────────────────────
function FilterDropdown<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== ("all" as T);
  const selectedLabel = options.find((o) => o.key === value)?.label ?? "Tümü";

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border transition-all duration-150 whitespace-nowrap",
          isActive
            ? "border-blue-500/70 text-blue-300 bg-blue-600/10"
            : "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 bg-transparent"
        )}
      >
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}:</span>
        <span>{selectedLabel}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 min-w-[110px] rounded-lg overflow-hidden py-1"
          style={{
            background: "#0D1526",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {options.map(({ key, label: optLabel }) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                value === key
                  ? "text-blue-300 bg-blue-600/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              {optLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AnomalyCard ───────────────────────────────────────────────────────────────
function AnomalyCard({
  a, idx, resolving, onResolve,
}: {
  a: Anomaly;
  idx: number;
  resolving: string | null;
  onResolve: (id: string) => void;
}) {
  const sev        = SEV[a.severity] ?? SEV.low;
  const Icon       = sev.icon;
  const resolved   = !!a.is_resolved;
  const isPos      = a.change_percent >= 0;
  const isCritical = a.severity === "critical" && !resolved;

  const anomalyLabel =
    a.metric_name.includes("Harcama") && a.metric_name.includes("Dönüşüm")
      ? "Harcama & Dönüşüm"
      : a.metric_name.includes("Harcama")
      ? "Harcama Artışı"
      : a.metric_name.includes("Dönüşüm")
      ? "Dönüşüm Sapması"
      : (a.metric_name.split(",")[0]?.trim() ?? a.metric_name);

  return (
    <div className="relative h-full">
      {/* Critical pulse ring */}
      {isCritical && (
        <div
          className="absolute -inset-px rounded-xl pointer-events-none animate-pulse z-0"
          style={{ border: `1px solid ${sev.color}55` }}
        />
      )}

      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: resolved ? 0.45 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ delay: idx * 0.04, duration: 0.25 }}
        whileHover={!resolved ? { y: -2 } : {}}
        className="relative rounded-xl overflow-hidden flex flex-col h-full"
        style={{
          background: "rgba(13,21,38,0.82)",
          backdropFilter: "blur(14px)",
          border: "1px solid rgba(51,65,85,0.5)",
          borderLeft: `3px solid ${sev.color}`,
        }}
      >
        {/* ── Top row: icon + label | severity badge ── */}
        <div className="px-4 pt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${sev.color}1a`, border: `1px solid ${sev.color}30` }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: sev.color }} />
            </div>
            <span className="text-xs font-semibold truncate" style={{ color: sev.color }}>
              {anomalyLabel}
            </span>
          </div>
          <span
            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-widest uppercase whitespace-nowrap shrink-0"
            style={{
              background: `${sev.color}18`,
              color:      sev.textColor,
              border:     `1px solid ${sev.color}35`,
            }}
          >
            {sev.label}
          </span>
        </div>

        {/* ── Body ── */}
        <div className="px-4 pt-3 pb-0 flex flex-col gap-3 flex-1">

          {/* Campaign name + platform badge */}
          <div>
            <p className="text-base font-bold text-white leading-snug">{a.campaign_name}</p>
            {a.platform && (
              <span
                className="inline-flex items-center mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase"
                style={a.platform === "meta"
                  ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }
                  : { background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }
                }
              >
                {a.platform === "meta" ? "META ADS" : "GOOGLE ADS"}
              </span>
            )}
          </div>

          {/* Metric change */}
          {(() => {
            const dispPos = a.change_percent >= 0;
            return (
              <div className="flex items-center gap-2">
                <span className="text-xl font-black leading-none" style={{ color: dispPos ? "#f97316" : "#60a5fa" }}>
                  {dispPos ? "▲" : "▼"}
                </span>
                <span className="text-2xl font-black leading-none tabular-nums" style={{ color: dispPos ? "#f97316" : "#60a5fa" }}>
                  {dispPos ? "+" : ""}{a.change_percent.toFixed(1)}%
                </span>
              </div>
            );
          })()}

          {/* Expected / Actual — per metric block */}
          {a.expected_value != null && a.actual_value != null && (() => {
            const expVal     = a.expected_value as number;
            const actVal     = a.actual_value   as number;
            const hasHarcama = a.metric_name?.includes("Harcama");
            const hasDonusum = a.metric_name?.includes("Dönüşüm");
            const hasRoas    = a.metric_name?.includes("ROAS");
            const hasCtr     = a.metric_name?.includes("CTR");
            const blocks: { key: string; label: string; isCost: boolean }[] = [];
            if (hasHarcama) blocks.push({ key: "harcama", label: "Harcama", isCost: true });
            if (hasDonusum && !hasHarcama) blocks.push({ key: "donusum", label: "Dönüşüm", isCost: false });
            if (hasRoas && !hasHarcama && !hasDonusum) blocks.push({ key: "roas", label: "ROAS", isCost: false });
            if (hasCtr && !hasHarcama && !hasDonusum && !hasRoas) blocks.push({ key: "ctr", label: "CTR", isCost: false });
            const maxVal = Math.max(expVal, actVal, 0.01);
            const expPct = Math.min((expVal / maxVal) * 100, 100);
            const actPct = Math.min((actVal / maxVal) * 100, 100);
            return (
              <div className="space-y-3">
                {blocks.map(({ key, label, isCost }) => {
                  const fmt    = (v: number) => isCost
                    ? `$${Math.round(v).toLocaleString("tr-TR")}`
                    : v.toFixed(1);
                  const blkPos = actVal >= expVal;
                  return (
                    <div key={key}>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
                      <div className="space-y-1.5">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500">Beklenen (30g ort.)</span>
                            <span className="text-[11px] font-mono font-semibold text-slate-400">{fmt(expVal)}</span>
                          </div>
                          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${expPct}%`, background: "#334155" }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500">Gerçekleşen (7g ort.)</span>
                            <span className="text-[11px] font-mono font-semibold" style={{ color: blkPos ? "#f97316" : "#60a5fa" }}>
                              {fmt(actVal)}
                            </span>
                          </div>
                          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${actPct}%`, background: blkPos ? "#f97316" : "#3b82f6" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Spacer — boş alanı doldurur, note her kartta aynı konumda kalır */}
          <div className="flex-1" />

          {/* Note */}
          {a.note && (
            <p
              className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 cursor-default"
              title={a.note}
            >
              {a.note}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="px-4 py-3 mt-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid rgba(51,65,85,0.4)" }}
        >
          <Link
            href={`/anomalies/${a.id}`}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            İncele →
          </Link>

          {resolved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5" /> Çözüldü
            </span>
          ) : (
            <button
              disabled={resolving === a.id}
              onClick={() => onResolve(a.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg,#059669,#10b981)",
                boxShadow:  "0 2px 8px rgba(16,185,129,0.3)",
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {resolving === a.id ? "İşleniyor…" : "Çözüldü İşaretle"}
            </button>
          )}
        </div>
      </motion.div>

      {/* Resolved overlay */}
      {resolved && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl"
            style={{
              background:     "rgba(6,20,15,0.88)",
              border:         "1px solid rgba(16,185,129,0.35)",
              backdropFilter: "blur(4px)",
            }}
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 tracking-widest uppercase">Çözüldü</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnomaliesPage() {
  const [anomalies,    setAnomalies]    = useState<Anomaly[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [detecting,    setDetecting]    = useState(false);
  const [sevFilter,    setSevFilter]    = useState<typeof SEV_FILTERS[number]["key"]>("all");
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]["key"]>("active");
  const [resolving,    setResolving]    = useState<string | null>(null);
  const [sortKey,      setSortKey]      = useState<SortKey>("severity");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [currentPage,  setCurrentPage]  = useState(1);

  async function load() {
    try {
      const res = await api.get("/api/anomalies/?limit=500");
      setAnomalies(Array.isArray(res.data) ? res.data : (res.data.data ?? []));
    } catch (err) {
      console.error("Anomali verisi alınamadı:", err);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }

  async function detect() {
    setDetecting(true);
    try {
      await api.post("/api/anomalies/detect");
      await load();
      toast.success("Anomali taraması tamamlandı");
    } catch {
      toast.error("Tarama başarısız");
    } finally {
      setDetecting(false);
    }
  }

  async function resolve(id: string) {
    setResolving(id);
    try {
      await api.put(`/api/anomalies/${id}/resolve`, { is_resolved: true });
      setAnomalies((prev) => prev.map((a) => a.id === id ? { ...a, is_resolved: true } : a));
      toast.success("Anomali çözüldü olarak işaretlendi");
    } catch {
      toast.error("İşlem başarısız");
    } finally {
      setResolving(null);
    }
  }

  function exportCsv() {
    const SEV_TR: Record<string, string> = {
      low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik",
    };
    const headers = [
      "Kampanya Adı", "Platform", "Anomali Tipi", "Değişim Yüzdesi",
      "Önem", "Beklenen Değer", "Gerçekleşen Değer", "Açıklama", "Tespit Tarihi", "Durum",
    ];
    const rows = filtered.map((a) => [
      a.campaign_name,
      a.platform ?? "",
      a.metric_name,
      a.change_percent,
      SEV_TR[a.severity] ?? a.severity,
      a.expected_value ?? "",
      a.actual_value ?? "",
      a.note,
      format(new Date(a.detected_at), "d MMM yyyy, HH:mm", { locale: tr }),
      a.is_resolved ? "Çözüldü" : "Aktif",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anomaliler_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { load(); }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    const list = anomalies.filter((a) => {
      const matchSev    = sevFilter    === "all" || a.severity === sevFilter;
      const matchStatus = statusFilter === "all"
        ? true : statusFilter === "resolved" ? !!a.is_resolved : !a.is_resolved;
      return matchSev && matchStatus;
    });
    return [...list].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if      (sortKey === "severity")       { va = SEV[a.severity]?.priority ?? 0; vb = SEV[b.severity]?.priority ?? 0; }
      else if (sortKey === "change_percent") { va = Math.abs(a.change_percent);     vb = Math.abs(b.change_percent); }
      else if (sortKey === "detected_at")    { va = a.detected_at;                  vb = b.detected_at; }
      else                                   { va = (a[sortKey] as string).toLowerCase(); vb = (b[sortKey] as string).toLowerCase(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1  : -1;
      return 0;
    });
  }, [anomalies, sevFilter, statusFilter, sortKey, sortDir]);

  const PAGE_SIZE  = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [sevFilter, statusFilter, sortKey, sortDir]);

  const activeCount   = anomalies.filter((a) => !a.is_resolved).length;
  const resolvedCount = anomalies.filter((a) => !!a.is_resolved).length;
  const criticalCount = anomalies.filter((a) => a.severity === "critical" && !a.is_resolved).length;
  const highCount     = anomalies.filter((a) => a.severity === "high"     && !a.is_resolved).length;
  const activePct     = anomalies.length > 0 ? Math.round((activeCount / anomalies.length) * 100) : 0;

  const KPI_CARDS = [
    {
      label: "Toplam", value: anomalies.length, cls: "text-slate-100", sub: "anomali",
      icon: ShieldAlert, borderColor: "#475569", iconColor: "#64748b", glowColor: "rgba(71,85,105,0.35)",
      pulse: false, showProgress: false, progressPct: 0,
    },
    {
      label: "Aktif", value: activeCount, cls: "text-rose-400", sub: "çözülmedi",
      icon: AlertOctagon, borderColor: "#F43F5E", iconColor: "#F43F5E", glowColor: "rgba(244,63,94,0.3)",
      pulse: true, showProgress: true, progressPct: activePct,
    },
    {
      label: "Kritik & Yüksek", value: criticalCount + highCount, cls: "text-orange-400", sub: "öncelikli",
      icon: AlertTriangle, borderColor: "#F97316", iconColor: "#F97316", glowColor: "rgba(249,115,22,0.3)",
      pulse: false, showProgress: false, progressPct: 0,
    },
    {
      label: "Çözüldü", value: resolvedCount, cls: "text-emerald-400", sub: "tamamlandı",
      icon: CheckCircle2, borderColor: "#10B981", iconColor: "#10B981", glowColor: "rgba(16,185,129,0.3)",
      pulse: false, showProgress: false, progressPct: 0,
    },
  ];

  return (
    <div className="page-enter">
      <Topbar title="Anomaliler" subtitle="Kampanya performans sapmaları" anomalyCount={activeCount} hidePeriodSelector />

      {/* ── Critical alert banner ─────────────────────────────────────────── */}
      <AnimatePresence>
        {criticalCount > 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="px-6 pt-4"
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-xl animate-pulse pointer-events-none"
                style={{ border: "1px solid rgba(244,63,94,0.5)" }}
              />
              <div
                className="relative rounded-xl flex items-center gap-4 px-5 py-3.5"
                style={{
                  background: "linear-gradient(135deg,rgba(244,63,94,0.13),rgba(244,63,94,0.04))",
                  border: "1px solid rgba(244,63,94,0.22)",
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <AlertOctagon className="h-5 w-5 text-rose-400 shrink-0 animate-pulse" />
                  <p className="text-sm font-semibold text-rose-300">
                    {criticalCount} kritik anomali acil müdahale gerektiriyor
                  </p>
                </div>
                <button
                  onClick={() => { setSevFilter("critical"); setStatusFilter("active"); }}
                  className="text-xs font-semibold text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-400/50 px-4 py-1.5 rounded-lg transition-all whitespace-nowrap hover:bg-rose-500/10 shrink-0"
                >
                  Hepsini Gör →
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 space-y-5">

        {/* ── KPI Kartları ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPI_CARDS.map(({ label, value, cls, sub, icon: Ic, borderColor, iconColor, glowColor, pulse, showProgress, progressPct }) => (
            <div
              key={label}
              className="p-4 pt-5 rounded-xl relative overflow-hidden"
              style={{
                background: BG2,
                border: `1px solid ${borderColor}20`,
                borderLeft: `4px solid ${borderColor}`,
              }}
            >
              <div
                className="absolute right-3 top-3 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `${iconColor}15`,
                  border: `1px solid ${iconColor}25`,
                  boxShadow: `0 0 14px ${glowColor}`,
                }}
              >
                <Ic className="h-5 w-5" style={{ color: iconColor }} />
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">{label}</p>
              <div className="flex items-end gap-2 mb-0.5">
                <p className={cn("text-3xl font-bold leading-none", cls)}>{value}</p>
                {pulse && value > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse mb-1.5 shrink-0" />
                )}
              </div>
              <p className="text-xs text-slate-600">{sub}</p>
              {showProgress && (
                <div className="mt-3">
                  <div className="flex justify-between text-[9px] text-slate-600 mb-1">
                    <span>Aktif / Toplam</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%`, background: "linear-gradient(to right,#F43F5E,#fb7185)" }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Filtreler ─────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2.5">

          {/* Satır 1: Önem | Durum | Anomali Tara */}
          <div className="flex items-center gap-2 min-w-0">
            <FilterDropdown
              label="Önem"
              options={SEV_FILTERS}
              value={sevFilter}
              onChange={setSevFilter}
            />

            <div className="w-px self-stretch bg-white/10 shrink-0" />

            <FilterDropdown
              label="Durum"
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={setStatusFilter}
            />

            {/* Anomali Tara + Dışa Aktar — en sağa */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap hover:opacity-90"
                style={{
                  background: BG3,
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8",
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Dışa Aktar
              </button>
              <button
                onClick={detect}
                disabled={detecting}
                className="inline-flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-50 whitespace-nowrap hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg,#e11d48,#f43f5e)",
                  boxShadow: "0 2px 10px rgba(244,63,94,0.35)",
                }}
              >
                <ScanLine className={cn("h-3.5 w-3.5", detecting && "animate-spin")} />
                {detecting ? "Taranıyor…" : "Anomali Tara"}
              </button>
            </div>
          </div>

          {/* Satır 2: Sırala | sonuç sayacı */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Sırala:</span>
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md border transition-all duration-150 whitespace-nowrap",
                    sortKey === key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-transparent border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20"
                  )}
                >
                  {label}
                  <SortIcon active={sortKey === key} dir={sortDir} />
                </button>
              ))}
            </div>

            {/* Sonuç sayacı — en sağa */}
            <span className="ml-auto text-xs text-slate-500 shrink-0">
              <span className="text-slate-300 font-semibold">{filtered.length}</span> sonuç
            </span>
          </div>
        </div>

        {/* ── Kart Grid ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center rounded-xl" style={{ background: BG2, border: BORDER }}>
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">Gösterilecek anomali yok</p>
            <p className="text-slate-500 text-sm mt-1">Filtreleri değiştirin veya yeni tarama başlatın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {pageItems.map((a, idx) => (
                <AnomalyCard
                  key={a.id}
                  a={a}
                  idx={idx}
                  resolving={resolving}
                  onResolve={resolve}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: BG3 }}
            >
              ← Önceki
            </button>
            <span className="text-xs text-slate-500">
              <span className="text-slate-200 font-semibold">{currentPage}</span>
              {" / "}
              <span className="text-slate-200 font-semibold">{totalPages}</span>
              {" sayfa"}
              <span className="ml-2 text-slate-600">({filtered.length} sonuç)</span>
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: BG3 }}
            >
              Sonraki →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
