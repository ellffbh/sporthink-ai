"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Campaign } from "@/lib/types";
import Topbar from "@/components/Topbar";
import {
  Link2, DollarSign, Target, TrendingUp, Megaphone,
  Download, ExternalLink, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from "recharts";

const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";

interface MetricsSummary {
  total_cost?:        number;
  total_revenue?:     number;
  total_conversions?: number;
  roas?:              number;
  cpa?:               number;
  ctr?:               number;
  total_impressions?: number;
  total_clicks?:      number;
}

interface PlatformStats {
  spend:          number;
  revenue:        number;
  campaigns:      number;
  conversions:    number;
  impressions:    number;
  clicks:         number;
  ctr:            number;
  roas:           number;
  activeCampaigns: number;
  campaignList:   Campaign[];
}

interface AdAccount {
  id: string;
  platform: string;
  account_name: string;
  external_account_id: string;
  is_active: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function platformOf(name: string, accountId: string): "google" | "meta" | "unknown" {
  const n = name.toLowerCase();
  const a = accountId.toLowerCase();
  if (n.includes("google") || a === "a1") return "google";
  if (n.includes("meta")   || n.includes("facebook") || a === "a2") return "meta";
  return "unknown";
}

function genSparkline(seed: number, n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    v: Math.round(40 + Math.sin(i * 0.8 + seed) * 20 + Math.cos(i * 0.3 + seed * 2) * 10),
  }));
}

function roasGrade(roas: number): { label: string; color: string } {
  if (roas >= 10) return { label: "A+", color: "#10B981" };
  if (roas >= 5)  return { label: "A",  color: "#3B82F6" };
  if (roas >= 3)  return { label: "B",  color: "#F59E0B" };
  return            { label: "C",  color: "#F43F5E" };
}

function buildPlatformStats(
  campaigns: Campaign[],
  metrics: Record<string, MetricsSummary>,
  platform: "google" | "meta"
): PlatformStats {
  const list   = campaigns.filter((c) => platformOf(c.campaign_name, c.ad_account_id) === platform);
  const active = list.filter((c) => c.status === "enabled");
  let spend = 0, revenue = 0, conversions = 0, impressions = 0, clicks = 0;
  for (const c of list) {
    const m = metrics[c.id] ?? {};
    spend       += m.total_cost        ?? 0;
    revenue     += m.total_revenue     ?? 0;
    conversions += m.total_conversions ?? 0;
    impressions += m.total_impressions  ?? 0;
    clicks      += m.total_clicks      ?? 0;
  }
  const ctr  = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  return { spend, revenue, campaigns: list.length, conversions, impressions, clicks, ctr, roas, activeCampaigns: active.length, campaignList: list };
}

// ── Platform Icons ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

// ── PlatformCard ───────────────────────────────────────────────────────────────

interface PlatformCardProps {
  platform:   "google" | "meta";
  stats:      PlatformStats;
  metrics:    Record<string, MetricsSummary>;
  router:     ReturnType<typeof useRouter>;
  accountId?: string;
}

function PlatformCard({ platform, stats, metrics, router, accountId }: PlatformCardProps) {
  const isGoogle  = platform === "google";
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSync() {
    if (!accountId || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      await api.post(`/ad-accounts/${accountId}/sync`);
      setSyncMsg({ ok: true, text: "Son sync: az önce" });
    } catch {
      setSyncMsg({ ok: false, text: "Sync başarısız" });
    } finally {
      setSyncing(false);
    }
  }
  const accent    = isGoogle ? "#10B981" : "#2563EB";
  const name      = isGoogle ? "Google Ads" : "Meta Ads";
  const seed      = isGoogle ? 1 : 3;
  const sparkData = genSparkline(seed);
  const grade     = roasGrade(stats.roas);

  function exportCsv() {
    const statusMap: Record<string, string> = {
      enabled:   "Aktif",
      paused:    "Duraklıyor",
      removed:   "Kaldırıldı",
      completed: "Tamamlandı",
    };
    const rows = [
      ["Kampanya Adı", "Durum", "Harcama (USD)", "Dönüşüm", "ROAS", "CTR (%)"].join(","),
      ...stats.campaignList.map((c) => {
        const m = metrics[c.id] ?? {};
        return [
          `"${c.campaign_name}"`,
          (statusMap[c.status] ?? c.status),
          (m.total_cost        ?? 0).toFixed(2),
          (m.total_conversions ?? 0).toString(),
          (m.roas              ?? 0).toFixed(2),
          (m.ctr               ?? 0).toFixed(2),
        ].join(",");
      }),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${platform}_kampanyalar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
    : n.toString();

  const mini = [
    { label: "Harcama",   value: `₺${stats.spend.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` },
    { label: "Kampanya",  value: stats.campaigns.toString() },
    { label: "Dönüşüm",  value: stats.conversions.toLocaleString("tr-TR") },
    { label: "Gösterim",  value: fmtNum(stats.impressions) },
    { label: "Tıklama",   value: fmtNum(stats.clicks) },
    { label: "CTR",       value: `${stats.ctr.toFixed(2)}%` },
  ];

  return (
    <div className="flex flex-col rounded-xl flex-1" style={{ background: BG2, border: BORDER }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: BORDER }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}
            >
              {isGoogle ? <GoogleIcon /> : <MetaIcon />}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">{name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-slate-500">Bağlı · 2 saat önce</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-600 font-medium uppercase tracking-wide mb-0.5">ROAS Derecesi</p>
            <p className="text-2xl font-black" style={{ color: grade.color }}>{grade.label}</p>
          </div>
        </div>

        <div className="mt-4 flex items-end gap-2">
          <span className="text-3xl font-black text-white">{stats.roas.toFixed(2)}x</span>
          <span className="text-[11px] text-slate-500 mb-1">ortalama ROAS</span>
        </div>
      </div>

      {/* Mini metrics */}
      <div className="px-5 py-4 grid grid-cols-3 gap-y-3 gap-x-4">
        {mini.map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] text-slate-600 font-medium uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm font-bold text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div className="px-5 pb-1" style={{ height: 72 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line type="monotone" dataKey="v" stroke={accent} strokeWidth={1.5} dot={false} />
            <Tooltip
              contentStyle={{ background: BG3, border: BORDER, borderRadius: 8, padding: "4px 8px" }}
              itemStyle={{ color: "#94A3B8", fontSize: 11 }}
              formatter={(v: number) => [v, "Endeks"]}
              labelFormatter={() => ""}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Buttons */}
      <div className="px-5 pb-5 pt-3 mt-auto space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/campaigns?platform=${platform}`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: `${accent}18`, border: `1px solid ${accent}40`, color: accent }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Kampanyaları Gör
          </button>
          {isGoogle && accountId && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: BG3, border: BORDER, color: "#94A3B8" }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync..." : "Sync Et"}
            </button>
          )}
          <button
            onClick={exportCsv}
            disabled={stats.campaigns === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: BG3, border: BORDER, color: "#94A3B8" }}
          >
            <Download className="h-3.5 w-3.5" />
            Rapor İndir
          </button>
          <button
            onClick={() => router.push("/recommendations")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Optimizasyon
          </button>
        </div>
        {syncMsg && (
          <p className={`text-[11px] font-medium ${syncMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {syncMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdAccountsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics,   setMetrics]   = useState<Record<string, MetricsSummary>>({});
  const [accounts,  setAccounts]  = useState<AdAccount[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [camRes, accRes] = await Promise.all([
          api.get<Campaign[]>("/campaigns"),
          api.get<AdAccount[]>("/ad-accounts").catch(() => ({ data: [] as AdAccount[] })),
        ]);
        const list: Campaign[] = camRes.data ?? [];
        setCampaigns(list);
        setAccounts(accRes.data ?? []);

        const map: Record<string, MetricsSummary> = {};
        await Promise.all(
          list.map(async (c) => {
            try {
              map[c.id] = (await api.get<MetricsSummary>(`/campaigns/${c.id}/metrics-summary`)).data;
            } catch {
              map[c.id] = {};
            }
          })
        );
        setMetrics(map);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const googleStats = buildPlatformStats(campaigns, metrics, "google");
  const metaStats   = buildPlatformStats(campaigns, metrics, "meta");

  const totalSpend       = googleStats.spend + metaStats.spend;
  const totalConversions = googleStats.conversions + metaStats.conversions;
  const totalActive      = googleStats.activeCampaigns + metaStats.activeCampaigns;
  const totalCamps       = googleStats.campaigns + metaStats.campaigns;
  const avgRoas          = totalSpend > 0
    ? (googleStats.roas * googleStats.spend + metaStats.roas * metaStats.spend) / totalSpend
    : 0;
  const connectedAccounts = (googleStats.campaigns > 0 ? 1 : 0) + (metaStats.campaigns > 0 ? 1 : 0);

  const KPI_CARDS = [
    {
      label: "Bağlı Hesap",
      value: connectedAccounts.toString(),
      icon:  Link2,
      accent: "#7C3AED",
      sub:   "platform",
    },
    {
      label: "Toplam Harcama",
      value: `₺${totalSpend.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`,
      icon:  DollarSign,
      accent: "#2563EB",
      sub:   "tüm zamanlar",
    },
    {
      label: "Toplam Dönüşüm",
      value: totalConversions.toLocaleString("tr-TR"),
      icon:  Target,
      accent: "#10B981",
      sub:   "tüm kampanyalar",
    },
    {
      label: "Ortalama ROAS",
      value: `${avgRoas.toFixed(2)}x`,
      icon:  TrendingUp,
      accent: "#F59E0B",
      sub:   "ağırlıklı ortalama",
    },
    {
      label: "Aktif Kampanya",
      value: totalActive.toString(),
      icon:  Megaphone,
      accent: "#F43F5E",
      sub:   `${totalCamps} toplam`,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#070C18" }}>
      <Topbar
        title="Reklam Hesapları"
        subtitle="Platform bağlantıları ve performans özeti"
        hidePeriodSelector
      />

      <div className="flex-1 px-6 py-5 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-4">
          {KPI_CARDS.map(({ label, value, icon: Icon, accent, sub }) => (
            <div key={label} className="rounded-xl px-4 py-4" style={{ background: BG2, border: BORDER }}>
              {loading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-3 rounded w-3/4" style={{ background: "#1e2d47" }} />
                  <div className="h-7 rounded w-1/2 mt-2" style={{ background: "#1e2d47" }} />
                  <div className="h-2 rounded w-2/3 mt-1" style={{ background: "#1e2d47" }} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${accent}18` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
                    </div>
                  </div>
                  <p className="text-xl font-black text-white">{value}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Platform Cards */}
        {loading ? (
          <div className="flex gap-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex-1 rounded-xl animate-pulse"
                style={{ background: BG2, border: BORDER, height: 420 }}
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-4">
            <PlatformCard platform="google" stats={googleStats} metrics={metrics} router={router} accountId={accounts.find((a) => a.platform === "google")?.id} />
            <PlatformCard platform="meta"   stats={metaStats}   metrics={metrics} router={router} />
          </div>
        )}
      </div>
    </div>
  );
}
