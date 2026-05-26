"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import api from "@/lib/api";
import {
  Eye, EyeOff, Lock, RefreshCw, Download, CheckCircle,
  Shield, Database, Cpu, Server, Activity, Link2,
  BarChart2, Lightbulb, DollarSign,
} from "lucide-react";

const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ background: BG2, border: BORDER, borderRadius: 12 }}>
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5" style={{ borderBottom: BORDER }}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{children}</p>
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative shrink-0 w-10 h-5 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: checked ? "#2563EB" : "rgba(255,255,255,0.1)" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
        style={{ left: checked ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );
}


const SYS_INFO = [
  { label: "Model Versiyonu", value: "v2.1.0",               icon: Cpu      },
  { label: "Son Eğitim",      value: "3 gün önce",           icon: Activity },
  { label: "Veri Kaynağı",    value: "Google Ads API v18",   icon: Link2    },
  { label: "Veritabanı",      value: "PostgreSQL 15",         icon: Database },
  { label: "Uptime",          value: "%99.8",                 icon: Server   },
];

const NOTIF_SETTINGS = [
  { key: "anomaly",     label: "Kritik Anomali Alertleri",   desc: "Tespit edilen anomaliler için anlık bildirim al",    icon: Shield    },
  { key: "daily",      label: "Günlük Performans Raporu",   desc: "Her sabah kampanya özet raporu e-posta ile gelir",   icon: BarChart2 },
  { key: "suggestion", label: "Öneri Bildirimleri",          desc: "AI önerileri hazır olduğunda bildirim al",          icon: Lightbulb },
  { key: "budget",     label: "Bütçe Eşiği Uyarıları",      desc: "Bütçe kullanımı %90'ı geçince uyar",               icon: DollarSign },
];

export default function SettingsPage() {
  const [showGoogle, setShowGoogle] = useState({
    developerToken: false, clientId: false, clientSecret: false, refreshToken: false,
  });
  const [showMeta, setShowMeta] = useState({
    appId: false, appSecret: false, accessToken: false,
  });

  const [googleForm, setGoogleForm] = useState({
    name: "", customerId: "", developerToken: "", clientId: "", clientSecret: "", refreshToken: "",
  });
  const [metaForm, setMetaForm] = useState({
    name: "", accountId: "", appId: "", appSecret: "", accessToken: "",
  });

  const [googleSaved, setGoogleSaved] = useState(false);
  const [metaSaved,   setMetaSaved]   = useState(false);

  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    anomaly: true, daily: true, suggestion: true, budget: true,
  });
  const [isReadonly, setIsReadonly] = useState(false);

  interface AuditLog {
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    ip_address: string | null;
    created_at: string;
  }
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    api.get("/api/audit-logs/")
      .then(res => setAuditLogs(res.data))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, []);

  useEffect(() => {
    api.get("/auth/me")
      .then(res => { if (!res.data.is_superuser) setIsReadonly(true); })
      .catch(() => {});
  }, []);

  function toggleNotif(key: string) {
    if (isReadonly) return;
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function saveGoogle() {
    if (isReadonly) return;
    try {
      await api.post("/ad-accounts", {
        platform: "google",
        account_name: googleForm.name,
        external_account_id: googleForm.customerId,
        credentials: JSON.stringify({
          developer_token: googleForm.developerToken,
          client_id: googleForm.clientId,
          client_secret: googleForm.clientSecret,
          refresh_token: googleForm.refreshToken,
        }),
      });
      setGoogleSaved(true);
      setTimeout(() => setGoogleSaved(false), 2000);
    } catch {}
  }

  async function saveMeta() {
    if (isReadonly) return;
    try {
      await api.post("/ad-accounts", {
        platform: "meta",
        account_name: metaForm.name,
        external_account_id: metaForm.accountId,
        credentials: JSON.stringify({
          app_id: metaForm.appId,
          app_secret: metaForm.appSecret,
          access_token: metaForm.accessToken,
        }),
      });
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    } catch {}
  }

  return (
    <div className="page-enter">
      <Topbar title="Ayarlar" subtitle="Hesap ve sistem ayarları" />

      {isReadonly && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl"
             style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <Shield className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 font-medium">
            Sadece görüntüleme — Ayarları değiştirmek için Admin yetkisi gereklidir.
          </p>
        </div>
      )}

      <div className="p-6 space-y-6">

        {/* ── SECTION A: Google Ads Bağlantısı ─────────────────────── */}
        <Card>
          <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: BORDER }}>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
              style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)", color: "#60a5fa" }}
            >
              G
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Google Ads Bağlantısı</p>
          </div>
          <div className="p-5 space-y-4">

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Hesap Adı
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type="text"
                  value={googleForm.name}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, name: e.target.value }))}
                  placeholder="ör. Sporthink Main Account"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Customer ID
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type="text"
                  value={googleForm.customerId}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, customerId: e.target.value }))}
                  placeholder="MCC ID: 123-456-7890"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Developer Token
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showGoogle.developerToken ? "text" : "password"}
                  value={googleForm.developerToken}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, developerToken: e.target.value }))}
                  placeholder="Google Ads Developer Token"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowGoogle((v) => ({ ...v, developerToken: !v.developerToken }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showGoogle.developerToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Client ID
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showGoogle.clientId ? "text" : "password"}
                  value={googleForm.clientId}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, clientId: e.target.value }))}
                  placeholder="OAuth2 Client ID"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowGoogle((v) => ({ ...v, clientId: !v.clientId }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showGoogle.clientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Client Secret
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showGoogle.clientSecret ? "text" : "password"}
                  value={googleForm.clientSecret}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, clientSecret: e.target.value }))}
                  placeholder="OAuth2 Client Secret"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowGoogle((v) => ({ ...v, clientSecret: !v.clientSecret }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showGoogle.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Refresh Token
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showGoogle.refreshToken ? "text" : "password"}
                  value={googleForm.refreshToken}
                  onChange={(e) => setGoogleForm((v) => ({ ...v, refreshToken: e.target.value }))}
                  placeholder="OAuth2 Refresh Token"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowGoogle((v) => ({ ...v, refreshToken: !v.refreshToken }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showGoogle.refreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Lock className="h-3 w-3 text-slate-600" />
                <p className="text-[11px] text-slate-600">SHA-256 ile şifrelendi</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveGoogle}
                disabled={isReadonly}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#2563EB,#1d4ed8)", border: "1px solid rgba(37,99,235,0.4)" }}
              >
                Bağlantıyı Kaydet
              </button>
              {googleSaved && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Kaydedildi
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* ── SECTION A2: Meta Ads Bağlantısı ──────────────────────── */}
        <Card>
          <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: BORDER }}>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
              style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", color: "#a78bfa" }}
            >
              f
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Meta Ads Bağlantısı</p>
          </div>
          <div className="p-5 space-y-4">

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Hesap Adı
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type="text"
                  value={metaForm.name}
                  onChange={(e) => setMetaForm((v) => ({ ...v, name: e.target.value }))}
                  placeholder="ör. Sporthink Meta Account"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Ad Account ID
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type="text"
                  value={metaForm.accountId}
                  onChange={(e) => setMetaForm((v) => ({ ...v, accountId: e.target.value }))}
                  placeholder="Ad Account ID: act_xxxxxxxxx"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                App ID
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showMeta.appId ? "text" : "password"}
                  value={metaForm.appId}
                  onChange={(e) => setMetaForm((v) => ({ ...v, appId: e.target.value }))}
                  placeholder="Meta App ID"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowMeta((v) => ({ ...v, appId: !v.appId }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showMeta.appId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                App Secret
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showMeta.appSecret ? "text" : "password"}
                  value={metaForm.appSecret}
                  onChange={(e) => setMetaForm((v) => ({ ...v, appSecret: e.target.value }))}
                  placeholder="Meta App Secret"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowMeta((v) => ({ ...v, appSecret: !v.appSecret }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showMeta.appSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Access Token
              </label>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: BG3, border: BORDER }}>
                <input
                  type={showMeta.accessToken ? "text" : "password"}
                  value={metaForm.accessToken}
                  onChange={(e) => setMetaForm((v) => ({ ...v, accessToken: e.target.value }))}
                  placeholder="Meta Access Token"
                  disabled={isReadonly}
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-300 outline-none placeholder:text-slate-600 font-mono disabled:opacity-50"
                />
                <button
                  onClick={() => setShowMeta((v) => ({ ...v, accessToken: !v.accessToken }))}
                  className="px-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showMeta.accessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Lock className="h-3 w-3 text-slate-600" />
                <p className="text-[11px] text-slate-600">SHA-256 ile şifrelendi</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveMeta}
                disabled={isReadonly}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6d28d9)", border: "1px solid rgba(124,58,237,0.4)" }}
              >
                Bağlantıyı Kaydet
              </button>
              {metaSaved && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Kaydedildi
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* ── SECTION B: Bildirim Ayarları ─────────────────────────── */}
        <Card>
          <SectionHeader>Bildirim Ayarları</SectionHeader>
          <div className="p-5 space-y-3">
            {NOTIF_SETTINGS.map(({ key, label, desc, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center justify-between px-4 py-3.5 rounded-xl"
                style={{ background: BG3, border: BORDER }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.2)" }}>
                    <Icon className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
                <Toggle checked={notifs[key]} onChange={() => toggleNotif(key)} disabled={isReadonly} />
              </div>
            ))}
          </div>
        </Card>

        {/* ── SECTION C: Sistem Bilgileri ───────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: BORDER }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Sistem Bilgileri</p>
            <button
              disabled={isReadonly}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Modeli Yeniden Eğit
            </button>
          </div>
          <div className="p-5">
            <div className="rounded-xl overflow-hidden" style={{ border: BORDER }}>
              {SYS_INFO.map(({ label, value, icon: Icon }, i) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderBottom: i < SYS_INFO.length - 1 ? BORDER : "none",
                    background: i % 2 === 0 ? "transparent" : BG3,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="text-sm text-slate-400">{label}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-200 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── SECTION D: Güvenlik & Audit Log ──────────────────────── */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: BORDER }}>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Güvenlik & Audit Log</p>
            </div>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              style={{ background: BG3, border: BORDER }}
            >
              <Download className="h-3.5 w-3.5" />
              Tüm Logları İndir
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: BORDER }}>
                  {["Tarih & Saat", "İşlem", "Kullanıcı"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-5 py-2.5 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-center text-xs text-slate-500">Yükleniyor...</td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-6 text-center text-xs text-slate-500">Kayıt bulunamadı</td>
                  </tr>
                ) : auditLogs.map((log, i) => {
                  const user = log.user_id ?? log.ip_address ?? "sistem";
                  const isSystem = !log.user_id;
                  const entityType = log.entity_type ?? "";
                  let actionLabel: string;
                  if (entityType === "/auth/login" && log.action === "POST") actionLabel = "Giriş yapıldı";
                  else if (entityType === "/api/anomalies/detect" && log.action === "POST") actionLabel = "Anomali tarandı";
                  else if (entityType === "/api/recommendations/generate" && log.action === "POST") actionLabel = "Öneri üretildi";
                  else if (log.action === "DELETE") actionLabel = "Silindi";
                  else if (log.action === "PUT" || log.action === "PATCH") actionLabel = "Güncellendi";
                  else actionLabel = `${log.action} ${entityType}`;
                  const date = new Date(log.created_at).toLocaleString("tr-TR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <tr
                      key={log.id}
                      style={{ borderBottom: i < auditLogs.length - 1 ? BORDER : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = BG3)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      className="transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-[11px] text-slate-500">{date}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-slate-200">{actionLabel}</span>
                        {log.entity_id && (
                          <span className="ml-1.5 text-slate-600 text-[10px] font-mono">{log.entity_id.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{
                            background: isSystem ? "rgba(124,58,237,0.12)" : "rgba(37,99,235,0.12)",
                            color: isSystem ? "#a78bfa" : "#60a5fa",
                          }}
                        >
                          {user}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
}
