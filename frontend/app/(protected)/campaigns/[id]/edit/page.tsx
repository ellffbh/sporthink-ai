"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Save, Loader2, Tag, Megaphone, Activity,
  DollarSign, Target, Server, Hash, Clock, CheckCircle2,
  AlertCircle,
} from "lucide-react";

const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.07)";

const TYPE_MAP: Record<string, string> = {
  search:          "Arama",
  display:         "Display",
  shopping:        "Alışveriş",
  video:           "Video",
  pmax:            "PMax",
  performance_max: "Performance Max",
  awareness:       "Farkındalık",
  sales:           "Satış",
  retargeting:     "Yeniden Hedef",
  traffic:         "Trafik",
  engagement:      "Etkileşim",
  reach:           "Erişim",
};

const STATUS_OPTS = [
  { value: "enabled",   label: "Aktif",      dot: "#10B981", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  { value: "paused",    label: "Duraklıyor", dot: "#F59E0B", bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/30"   },
  { value: "removed",   label: "Kaldırıldı", dot: "#F43F5E", bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/30"    },
  { value: "completed", label: "Tamamlandı", dot: "#3B82F6", bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/30"    },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTS.find((o) => o.value === status) ?? STATUS_OPTS[0];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border",
      opt.bg, opt.text, opt.border,
    )}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: opt.dot }} />
      {opt.label}
    </span>
  );
}

function CardHeader({ icon: Icon, title, subtitle }: {
  icon: React.ElementType; title: string; subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: BORDER }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)" }}>
        <Icon className="h-4 w-4 text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ValidationMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 mt-1.5 text-[11px] text-rose-400">
      <AlertCircle className="h-3 w-3 shrink-0" />{msg}
    </p>
  );
}

const inputCls = [
  "w-full rounded-lg text-sm text-slate-200 px-3 py-2.5",
  "bg-[#080F1E] border border-slate-700/80",
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
  "placeholder:text-slate-600 transition-all duration-150",
].join(" ");

const selectCls = [
  "w-full rounded-lg text-sm text-slate-200 px-3 py-2.5 appearance-none cursor-pointer",
  "bg-[#080F1E] border border-slate-700/80",
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
  "transition-all duration-150",
].join(" ");

function ChevronDown() {
  return (
    <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CampaignEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [touched,  setTouched]  = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    campaign_name:    "",
    campaign_type:    "",
    status:           "enabled",
    bidding_strategy: "",
    daily_budget:     "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Campaign>(`/campaigns/${id}`);
        const c = res.data;
        setCampaign(c);
        setForm({
          campaign_name:    c.campaign_name    ?? "",
          campaign_type:    c.campaign_type    ?? "",
          status:           c.status           ?? "enabled",
          bidding_strategy: c.bidding_strategy ?? "",
          daily_budget:     c.daily_budget != null ? String(c.daily_budget) : "",
        });
      } catch {
        setError("Kampanya yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const field = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const nameError = touched.campaign_name && !form.campaign_name.trim()
    ? "Kampanya adı zorunludur" : null;
  const budgetError = touched.daily_budget && form.daily_budget !== "" && Number(form.daily_budget) <= 0
    ? "Bütçe 0'dan büyük olmalıdır" : null;

  const isFormValid =
    form.campaign_name.trim().length > 0 &&
    form.campaign_type.trim().length > 0 &&
    form.status.trim().length > 0 &&
    (form.daily_budget === "" || Number(form.daily_budget) > 0);

  const handleSubmit = async () => {
    setTouched({ campaign_name: true, daily_budget: true });
    if (!isFormValid) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.patch(`/campaigns/${id}`, {
        ...form,
        daily_budget: form.daily_budget !== "" ? Number(form.daily_budget) : null,
      });
      setSuccess(true);
      setTimeout(() => router.push(`/campaigns/${id}`), 1400);
    } catch {
      setError("Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080F1E" }}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="page-enter min-h-screen" style={{ background: "#080F1E" }}>

      {/* ── Sticky header ───────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
        style={{
          background: "rgba(8,15,30,0.88)",
          backdropFilter: "blur(12px)",
          borderBottom: BORDER,
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/campaigns")}
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Kampanyalara Dön
          </button>

          <div className="h-4 w-px bg-slate-700/80" />

          <div>
            <p className="text-sm font-semibold text-slate-200 leading-none">
              {campaign?.campaign_name ?? "Kampanyayı Düzenle"}
            </p>
            <p className="text-[10px] text-slate-600 font-mono mt-0.5">
              {campaign?.external_campaign_id}
            </p>
          </div>
        </div>

        <StatusBadge status={form.status} />
      </div>

      {/* ── Form content ────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">

        {/* CARD A — Temel Bilgiler */}
        <div className="rounded-xl p-6" style={{ background: BG2, border: BORDER }}>
          <CardHeader
            icon={Megaphone}
            title="Temel Bilgiler"
            subtitle="Kampanyanın kimliğini ve durumunu düzenleyin"
          />

          {/* Kampanya Adı */}
          <div className="mb-5">
            <FieldLabel icon={Tag} label="Kampanya Adı" />
            <input
              className={inputCls}
              value={form.campaign_name}
              onChange={(e) => field("campaign_name", e.target.value)}
              placeholder="Kampanya adını girin"
            />
            <ValidationMsg msg={nameError} />
          </div>

          {/* Tür + Durum */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel icon={Activity} label="Kampanya Türü" />
              <div className="relative">
                <select
                  className={selectCls}
                  value={form.campaign_type}
                  onChange={(e) => field("campaign_type", e.target.value)}
                >
                  {Object.entries(TYPE_MAP).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <ChevronDown />
                </div>
              </div>
            </div>

            <div>
              <FieldLabel icon={CheckCircle2} label="Durum" />
              <div className="relative">
                <select
                  className={selectCls}
                  value={form.status}
                  onChange={(e) => field("status", e.target.value)}
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <ChevronDown />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD B — Bütçe & Strateji */}
        <div className="rounded-xl p-6" style={{ background: BG2, border: BORDER }}>
          <CardHeader
            icon={DollarSign}
            title="Bütçe & Strateji"
            subtitle="Günlük harcama limiti ve teklif yöntemini ayarlayın"
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Günlük Bütçe */}
            <div>
              <FieldLabel icon={DollarSign} label="Günlük Bütçe" />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium select-none">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={cn(inputCls, "pl-7")}
                  value={form.daily_budget}
                  onChange={(e) => field("daily_budget", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <ValidationMsg msg={budgetError} />
            </div>

            {/* Teklif Stratejisi */}
            <div>
              <FieldLabel icon={Target} label="Teklif Stratejisi" />
              <input
                className={inputCls}
                value={form.bidding_strategy}
                onChange={(e) => field("bidding_strategy", e.target.value)}
                placeholder="ör. target_cpa"
              />
            </div>
          </div>
        </div>

        {/* CARD C — Sistem Bilgileri (readonly) */}
        <div className="rounded-xl p-6" style={{ background: BG3, border: BORDER }}>
          <CardHeader
            icon={Server}
            title="Sistem Bilgileri"
            subtitle="Bu alanlar salt okunurdur, düzenlenemez"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel icon={Server} label="Ad Account ID" />
              <div
                className="px-3 py-2.5 rounded-lg text-xs font-mono text-slate-500 select-all cursor-text"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                {campaign?.ad_account_id ?? "—"}
              </div>
            </div>
            <div>
              <FieldLabel icon={Hash} label="External Campaign ID" />
              <div
                className="px-3 py-2.5 rounded-lg text-xs font-mono text-slate-500 select-all cursor-text"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                {campaign?.external_campaign_id ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Hata / Başarı bildirim */}
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Kaydedildi! Yönlendiriliyor…
          </div>
        )}

        {/* ── Footer: Son güncelleme + butonlar ───────────────── */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <Clock className="h-3.5 w-3.5" />
            Son güncelleme: {formatDate(campaign?.updated_at)}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/campaigns")}
              className="px-4 py-2 text-sm rounded-lg text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all"
              style={{ background: BG3 }}
            >
              İptal
            </button>

            <button
              onClick={handleSubmit}
              disabled={saving || success}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                boxShadow: "0 0 20px rgba(37,99,235,0.35)",
              }}
              onMouseEnter={(e) => {
                if (!saving && !success)
                  e.currentTarget.style.boxShadow = "0 0 30px rgba(37,99,235,0.55)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 20px rgba(37,99,235,0.35)";
              }}
            >
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
