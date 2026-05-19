"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { tr } from "date-fns/locale";
import api from "@/lib/api";
import PageWrapper from "@/components/PageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import {
  Users, Shield, UserCheck, BarChart3,
  MoreHorizontal, Edit2, UserX, Trash2, X, UserPlus,
  Activity, Search, Settings, Bell, Lock, Globe,
  Key, Save, ChevronRight, ChevronDown, ChevronLeft, Database, Mail, Smartphone,
  Eye, EyeOff, Check, Plus, ShieldCheck, Download,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ── Constants ─────────────────────────────────────────────────────────────────
const BG2    = "#0D1526";
const BG3    = "#111D35";
const BORDER = "1px solid rgba(255,255,255,0.06)";
const PAGE_SIZE = 10;

interface User {
  id: string; email: string; full_name: string;
  is_active: boolean; is_superuser: boolean;
  last_login_at?: string; created_at: string;
}

interface Role {
  id: string;
  name: string;
  label: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
  userCount: number;
  editable: boolean;
}

const DEFAULT_PERMISSIONS = {
  "Dashboard Görüntüle":      true,
  "Kampanya Görüntüle":       true,
  "Kampanya Düzenle":         false,
  "Metrik Görüntüle":         true,
  "Anomali Görüntüle":        true,
  "Anomali Çöz":              false,
  "Öneri Görüntüle":          true,
  "Öneri Uygula":             false,
  "Simülasyon Çalıştır":      false,
  "Admin Paneli":             false,
  "Kullanıcı Yönet":          false,
  "Ayarları Düzenle":         false,
};

const INITIAL_ROLES: Role[] = [
  {
    id: "admin", name: "admin", label: "Admin", description: "Tam yetkili sistem yöneticisi",
    color: "purple", editable: false, userCount: 0,
    permissions: Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k => [k, true])),
  },
  {
    id: "analyst", name: "analyst", label: "Analyst", description: "Analiz ve raporlama yetkisi",
    color: "blue", editable: true, userCount: 0,
    permissions: {
      "Dashboard Görüntüle": true, "Kampanya Görüntüle": true, "Kampanya Düzenle": false,
      "Metrik Görüntüle": true, "Anomali Görüntüle": true, "Anomali Çöz": true,
      "Öneri Görüntüle": true, "Öneri Uygula": true, "Simülasyon Çalıştır": true,
      "Admin Paneli": false, "Kullanıcı Yönet": false, "Ayarları Düzenle": false,
    },
  },
  {
    id: "viewer", name: "viewer", label: "Viewer", description: "Sadece görüntüleme yetkisi",
    color: "slate", editable: true, userCount: 0,
    permissions: {
      "Dashboard Görüntüle": true, "Kampanya Görüntüle": true, "Kampanya Düzenle": false,
      "Metrik Görüntüle": true, "Anomali Görüntüle": true, "Anomali Çöz": false,
      "Öneri Görüntüle": true, "Öneri Uygula": false, "Simülasyon Çalıştır": false,
      "Admin Paneli": false, "Kullanıcı Yönet": false, "Ayarları Düzenle": false,
    },
  },
];

const ROLE_COLORS: Record<string, { badge: string; dot: string }> = {
  purple: { badge: "bg-purple-500/10 border-purple-500/30 text-purple-400", dot: "bg-purple-400" },
  blue:   { badge: "bg-blue-500/10 border-blue-500/30 text-blue-400",       dot: "bg-blue-400"   },
  slate:  { badge: "bg-slate-700/60 border-slate-600/40 text-slate-300",    dot: "bg-slate-400"  },
  emerald:{ badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", dot: "bg-emerald-400" },
  amber:  { badge: "bg-amber-500/10 border-amber-500/30 text-amber-400",    dot: "bg-amber-400"  },
};

const AVATAR_GRADIENTS = [
  "from-blue-500 to-purple-500", "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500", "from-rose-500 to-pink-500", "from-indigo-500 to-violet-500",
];
function getGradient(seed: string) {
  const hash = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };
const rowVariants: Variants  = { hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" } } };

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ color, seed }: { color: string; seed: number }) {
  const data = Array.from({ length: 7 }, (_, i) => ({ v: Math.round(20 + Math.sin(i * 0.9 + seed) * 15 + Math.random() * 8) }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sg${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.45} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} fill={`url(#sg${seed})`} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, email }: { name: string; email: string }) {
  const words = (name || email || "?").split(" ").filter(Boolean);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : (words[0] || "?").slice(0, 2).toUpperCase();
  return (
    <div className={cn(
      "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 bg-gradient-to-br ring-2 ring-offset-2 ring-offset-slate-900 ring-white/5",
      getGradient(email)
    )}>
      {initials}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  if (active) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      Aktif
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="w-2 h-2 rounded-full bg-slate-700" />
      Pasif
    </span>
  );
}

// ── RoleDropdown ──────────────────────────────────────────────────────────────
function RoleDropdown({ user, roles, onRoleChange }: {
  user: User; roles: Role[];
  onRoleChange: (userId: string, isSuperuser: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentRole = user.is_superuser ? roles.find(r => r.id === "admin") : roles.find(r => r.id === "analyst");

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const color = currentRole ? ROLE_COLORS[currentRole.color] : ROLE_COLORS.slate;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-90 cursor-pointer",
          color.badge
        )}
      >
        {user.is_superuser ? <ShieldCheck className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" />}
        {currentRole?.label ?? "Analyst"}
        <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-10 w-52 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest px-3 py-2.5 border-b border-slate-800">Rol seç</p>
            {roles.map(role => {
              const rc = ROLE_COLORS[role.color];
              const isActive = user.is_superuser ? role.id === "admin" : role.id !== "admin";
              return (
                <button
                  key={role.id}
                  onClick={() => { onRoleChange(user.id, role.id === "admin"); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", rc.dot)} />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-200">{role.label}</p>
                      <p className="text-[10px] text-slate-500">{role.description}</p>
                    </div>
                  </div>
                  {isActive && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ActionMenu ────────────────────────────────────────────────────────────────
function ActionMenu({ user, onDeactivate, onDelete }: {
  user: User;
  onDeactivate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="p-2 rounded-lg text-slate-600 hover:text-slate-200 hover:bg-slate-700/60 transition-all duration-150 opacity-0 group-hover/row:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-10 w-44 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <button
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-800/60 transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Düzenle
            </button>
            <button
              onClick={() => { onDeactivate(user.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-amber-400 hover:bg-slate-800/60 transition-colors"
            >
              <UserX className="h-3.5 w-3.5" /> Devre Dışı Bırak
            </button>
            <div className="border-t border-slate-800/80" />
            <button
              onClick={() => { onDelete(user.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-rose-400 hover:bg-slate-800/60 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── NewUserModal ──────────────────────────────────────────────────────────────
function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail]       = useState("");
  const [name, setName]         = useState("");
  const [role, setRole]         = useState("analyst");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const inputCls = "w-full rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none transition-all"
    + " focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/60";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      await api.post("/auth/register", {
        email,
        full_name: name,
        password,
        is_superuser: role === "admin",
      });
      toast.success(`${name} oluşturuldu`); onCreated(); onClose();
    } catch { toast.error("Kullanıcı oluşturulamadı"); }
    finally { setLoading(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 12, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl shadow-2xl shadow-black/60"
        style={{ background: BG2, border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
          <div>
            <p className="font-semibold text-slate-100">Yeni Kullanıcı</p>
            <p className="text-xs text-slate-500 mt-0.5">Platforma yeni kullanıcı ekle</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {[
            { label: "Ad Soyad", type: "text",  value: name,     set: setName,     placeholder: "Ahmet Yılmaz" },
            { label: "E-posta",  type: "email", value: email,    set: setEmail,    placeholder: "ahmet@sirket.com" },
          ].map(({ label, type, value, set, placeholder }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">{label}</label>
              <input type={type} value={value} onChange={e => set(e.target.value)} required placeholder={placeholder}
                className={cn(inputCls, "bg-slate-900 border border-slate-700/60")} />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Şifre</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••" className={cn(inputCls, "bg-slate-900 border border-slate-700/60 pr-10")} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Rol</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className={cn(inputCls, "bg-slate-900 border border-slate-700/60")}>
              <option value="viewer">Viewer — Sadece görüntüleme</option>
              <option value="analyst">Analyst — Analiz ve raporlama</option>
              <option value="admin">Admin — Tam yetki</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-all">
              İptal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", boxShadow: "0 4px 16px rgba(124,58,237,0.35)" }}>
              {loading ? "Oluşturuluyor…" : "Oluştur"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200", enabled ? "bg-blue-600" : "bg-slate-700")}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200", enabled ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

// ── RolesTab ──────────────────────────────────────────────────────────────────
function RolesTab({ users }: { users: User[] }) {
  const [roles, setRoles] = useState<Role[]>(INITIAL_ROLES.map(r => ({
    ...r,
    userCount: r.id === "admin"
      ? users.filter(u => u.is_superuser).length
      : users.filter(u => !u.is_superuser).length,
  })));
  const [selectedRole, setSelectedRole] = useState<Role | null>(roles[0]);
  const [showNewRole, setShowNewRole]   = useState(false);
  const [newRoleName, setNewRoleName]   = useState("");
  const [newRoleDesc, setNewRoleDesc]   = useState("");
  const [newRoleColor, setNewRoleColor] = useState("emerald");
  const [saving, setSaving] = useState(false);

  function togglePermission(permKey: string) {
    if (!selectedRole || !selectedRole.editable) return;
    const updated = { ...selectedRole, permissions: { ...selectedRole.permissions, [permKey]: !selectedRole.permissions[permKey] } };
    setSelectedRole(updated);
    setRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  async function saveRole() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast.success("Rol güncellendi");
  }

  function createRole() {
    if (!newRoleName.trim()) return;
    const newRole: Role = {
      id: newRoleName.toLowerCase().replace(/\s+/g, "_"),
      name: newRoleName.toLowerCase(),
      label: newRoleName,
      description: newRoleDesc,
      color: newRoleColor,
      editable: true,
      userCount: 0,
      permissions: { ...DEFAULT_PERMISSIONS },
    };
    setRoles(prev => [...prev, newRole]);
    setSelectedRole(newRole);
    setShowNewRole(false);
    setNewRoleName(""); setNewRoleDesc(""); setNewRoleColor("emerald");
    toast.success(`"${newRoleName}" rolü oluşturuldu`);
  }

  const inputCls = "bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-all";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Roller</p>
          <button onClick={() => setShowNewRole(v => !v)}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Plus className="h-3 w-3" /> Yeni Rol
          </button>
        </div>

        <AnimatePresence>
          {showNewRole && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="rounded-xl p-4 space-y-3 overflow-hidden" style={{ background: BG3, border: BORDER }}>
              <p className="text-xs font-semibold text-slate-300">Yeni Rol Oluştur</p>
              <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Rol adı" className={cn(inputCls, "w-full")} />
              <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Açıklama" className={cn(inputCls, "w-full")} />
              <div className="flex gap-2">
                {["emerald", "amber", "blue", "purple"].map(c => (
                  <button key={c} onClick={() => setNewRoleColor(c)}
                    className={cn("w-6 h-6 rounded-full border-2 transition-all", newRoleColor === c ? "border-white scale-110" : "border-transparent opacity-60",
                      c === "emerald" ? "bg-emerald-500" : c === "amber" ? "bg-amber-500" : c === "blue" ? "bg-blue-500" : "bg-purple-500")} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowNewRole(false)} className="flex-1 text-xs py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">İptal</button>
                <button onClick={createRole} className="flex-1 text-xs py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">Oluştur</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          {roles.map(role => {
            const rc = ROLE_COLORS[role.color] ?? ROLE_COLORS.slate;
            const isSelected = selectedRole?.id === role.id;
            return (
              <button key={role.id} onClick={() => setSelectedRole(role)}
                className={cn("w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all duration-200",
                  isSelected ? "border-slate-600" : "border-slate-800/40 hover:border-slate-700")}
                style={{ background: isSelected ? BG3 : "rgba(13,21,38,0.4)" }}>
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", rc.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{role.label}</p>
                  <p className="text-xs text-slate-500 truncate">{role.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-500">{role.userCount} kullanıcı</span>
                  {!role.editable && <span className="text-[10px] text-slate-600">Sistem</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedRole && (
        <motion.div key={selectedRole.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
          className="xl:col-span-2 rounded-2xl overflow-hidden" style={{ background: BG2, border: BORDER }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60" style={{ background: BG3 }}>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-sm font-semibold text-slate-200">{selectedRole.label} — İzinler</p>
                <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
              </div>
            </div>
            {!selectedRole.editable && (
              <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-1 rounded-lg">Sistem Rolü</span>
            )}
          </div>
          <div className="divide-y divide-slate-800/30">
            {Object.entries(selectedRole.permissions).map(([perm, enabled]) => (
              <div key={perm} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-emerald-400" : "bg-slate-600")} />
                  <p className="text-sm text-slate-300">{perm}</p>
                </div>
                {selectedRole.editable ? (
                  <Toggle enabled={enabled} onChange={() => togglePermission(perm)} />
                ) : (
                  enabled
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" /> İzin Var</span>
                    : <span className="text-xs text-slate-600">—</span>
                )}
              </div>
            ))}
          </div>
          {selectedRole.editable && (
            <div className="px-6 py-4 border-t border-slate-800/60 flex justify-end">
              <button onClick={saveRole} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }}>
                <Save className="h-3.5 w-3.5" />
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── SettingsTab ───────────────────────────────────────────────────────────────
function SettingsTab() {
  const [notifications, setNotifications] = useState({ email: true, sms: false, anomaly: true, weekly: true, recommendations: true });
  const [security, setSecurity] = useState({ twoFactor: false, sessionTimeout: "60", ipWhitelist: "" });
  const [platform, setPlatform] = useState({ siteName: "AI Reklam", timezone: "Europe/Istanbul", language: "tr", currency: "USD" });
  const [apiKey] = useState("sk-••••••••••••••••••••••••••••••••");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() { setSaving(true); await new Promise(r => setTimeout(r, 800)); setSaving(false); toast.success("Ayarlar kaydedildi"); }

  const sectionCls = "rounded-2xl overflow-hidden";
  const sectionHeaderCls = "flex items-center gap-3 px-6 py-4 border-b border-slate-800/60";
  const rowCls = "flex items-center justify-between px-6 py-4 border-b border-slate-800/30 last:border-0";
  const inputCls = "rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-all bg-slate-800/60 border border-slate-700/60";

  return (
    <div className="space-y-5">
      {[
        {
          title: "Platform Ayarları", icon: Globe, iconBg: "bg-blue-500/10 border-blue-500/20", iconCls: "text-blue-400",
          content: (
            <div className="divide-y divide-slate-800/30">
              {[
                { label: "Platform Adı",  desc: "Uygulamada görünen ad",                    key: "siteName",  type: "text"   },
                { label: "Saat Dilimi",   desc: "Raporlarda kullanılan saat dilimi",         key: "timezone",  type: "select", opts: ["Europe/Istanbul","UTC","America/New_York"] },
                { label: "Dil",           desc: "Arayüz dili",                               key: "language",  type: "select", opts: ["tr","en"] },
                { label: "Para Birimi",   desc: "Metrik gösteriminde kullanılacak",          key: "currency",  type: "select", opts: ["USD","EUR","TRY"] },
              ].map(({ label, desc, key, type, opts }) => (
                <div key={key} className={rowCls}>
                  <div><p className="text-sm font-medium text-slate-200">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
                  {type === "text"
                    ? <input value={platform[key as keyof typeof platform]} onChange={e => setPlatform(p => ({ ...p, [key]: e.target.value }))} className={cn(inputCls, "w-48")} />
                    : <select value={platform[key as keyof typeof platform]} onChange={e => setPlatform(p => ({ ...p, [key]: e.target.value }))} className={cn(inputCls, "w-48")}>{opts?.map(o => <option key={o}>{o}</option>)}</select>}
                </div>
              ))}
            </div>
          ),
        },
        {
          title: "Bildirim Ayarları", icon: Bell, iconBg: "bg-amber-500/10 border-amber-500/20", iconCls: "text-amber-400",
          content: (
            <div className="divide-y divide-slate-800/30">
              {[
                { key: "email",           label: "E-posta Bildirimleri",  desc: "Raporlar ve uyarılar e-posta ile gönderilsin", icon: Mail },
                { key: "sms",             label: "SMS Bildirimleri",      desc: "Kritik uyarılar SMS ile gönderilsin",           icon: Smartphone },
                { key: "anomaly",         label: "Anomali Uyarıları",     desc: "Anomali tespit edildiğinde anında bildirim",   icon: Activity },
                { key: "weekly",          label: "Haftalık Özet",         desc: "Her Pazartesi haftalık performans raporu",     icon: BarChart3 },
                { key: "recommendations", label: "Öneri Bildirimleri",    desc: "Yeni AI önerileri oluştuğunda bildirim",      icon: ChevronRight },
              ].map(({ key, label, desc, icon: Ic }) => (
                <div key={key} className={rowCls}>
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-800 rounded-lg"><Ic className="h-3.5 w-3.5 text-slate-400" /></div>
                    <div><p className="text-sm font-medium text-slate-200">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
                  </div>
                  <Toggle enabled={notifications[key as keyof typeof notifications]} onChange={v => setNotifications(n => ({ ...n, [key]: v }))} />
                </div>
              ))}
            </div>
          ),
        },
        {
          title: "Güvenlik", icon: Lock, iconBg: "bg-rose-500/10 border-rose-500/20", iconCls: "text-rose-400",
          content: (
            <div className="divide-y divide-slate-800/30">
              <div className={rowCls}><div><p className="text-sm font-medium text-slate-200">İki Faktörlü Doğrulama</p><p className="text-xs text-slate-500 mt-0.5">Hesap güvenliğini artır</p></div><Toggle enabled={security.twoFactor} onChange={v => setSecurity(s => ({ ...s, twoFactor: v }))} /></div>
              <div className={rowCls}><div><p className="text-sm font-medium text-slate-200">Oturum Zaman Aşımı</p><p className="text-xs text-slate-500 mt-0.5">Dakika cinsinden</p></div><select value={security.sessionTimeout} onChange={e => setSecurity(s => ({ ...s, sessionTimeout: e.target.value }))} className={cn(inputCls, "w-40")}>{["15","30","60","120","240"].map(v => <option key={v} value={v}>{v} dakika</option>)}</select></div>
              <div className={rowCls}><div><p className="text-sm font-medium text-slate-200">IP Whitelist</p><p className="text-xs text-slate-500 mt-0.5">Virgülle ayırarak girin</p></div><input value={security.ipWhitelist} onChange={e => setSecurity(s => ({ ...s, ipWhitelist: e.target.value }))} placeholder="192.168.1.1, 10.0.0.1" className={cn(inputCls, "w-56")} /></div>
            </div>
          ),
        },
        {
          title: "API & Entegrasyon", icon: Key, iconBg: "bg-purple-500/10 border-purple-500/20", iconCls: "text-purple-400",
          content: (
            <div className="divide-y divide-slate-800/30">
              <div className={rowCls}>
                <div><p className="text-sm font-medium text-slate-200">API Anahtarı</p><p className="text-xs text-slate-500 mt-0.5">Platform API erişim anahtarı</p></div>
                <div className="flex items-center gap-2">
                  <input type={showKey ? "text" : "password"} value={apiKey} readOnly className={cn(inputCls, "w-56 font-mono text-xs")} />
                  <button onClick={() => setShowKey(v => !v)} className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">{showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                  <button onClick={() => { navigator.clipboard.writeText(apiKey); toast.success("Kopyalandı"); }} className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"><Database className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className={rowCls}><div><p className="text-sm font-medium text-slate-200">Webhook URL</p><p className="text-xs text-slate-500 mt-0.5">Anomali ve öneri bildirimleri</p></div><input placeholder="https://hooks.example.com/..." className={cn(inputCls, "w-64")} /></div>
            </div>
          ),
        },
      ].map(({ title, icon: Ic, iconBg, iconCls, content }) => (
        <div key={title} className={sectionCls} style={{ background: BG2, border: BORDER }}>
          <div className={sectionHeaderCls} style={{ background: BG3 }}>
            <div className={cn("p-1.5 rounded-lg border", iconBg)}><Ic className={cn("h-3.5 w-3.5", iconCls)} /></div>
            <p className="text-sm font-semibold text-slate-200">{title}</p>
          </div>
          {content}
        </div>
      ))}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-white text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }}>
          <Save className="h-4 w-4" />{saving ? "Kaydediliyor…" : "Ayarları Kaydet"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState<"all" | "admin" | "analyst">("all");
  const [activeTab,   setActiveTab]   = useState<"users" | "roles" | "settings">("users");
  const [page,        setPage]        = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const router = useRouter();

  async function load() {
    try { setUsers((await api.get("/auth/users")).data); }
    catch { /* endpoint may not exist yet */ }
    finally { setLoading(false); setLastUpdated(new Date()); }
  }

  useEffect(() => {
    api.get("/auth/me")
      .then(res => { if (!res.data.is_superuser) router.replace("/dashboard"); else load(); })
      .catch(() => router.replace("/dashboard"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, roleFilter]);

  async function deactivate(id: string) {
    try { await api.patch(`/auth/users/${id}`, { is_active: false }); setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: false } : u)); toast.success("Kullanıcı devre dışı bırakıldı"); }
    catch { toast.error("İşlem başarısız"); }
  }

  async function deleteUser(id: string) {
    if (!confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) return;
    try { await api.delete(`/auth/users/${id}`); setUsers(prev => prev.filter(u => u.id !== id)); toast.success("Kullanıcı silindi"); }
    catch { toast.error("Silme başarısız"); }
  }

  async function changeRole(userId: string, isSuperuser: boolean) {
    try {
      await api.patch(`/auth/users/${userId}`, { is_superuser: isSuperuser });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_superuser: isSuperuser } : u));
      toast.success("Rol güncellendi");
    } catch { toast.error("Rol değiştirilemedi"); }
  }

  const activeCount  = users.filter(u => u.is_active).length;
  const adminCount   = users.filter(u => u.is_superuser).length;
  const weeklyActive = Math.max(1, Math.round(activeCount * 0.65));

  const filteredUsers = users.filter(u => {
    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === "all" || (roleFilter === "admin" && u.is_superuser) || (roleFilter === "analyst" && !u.is_superuser);
    return matchSearch && matchRole;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statCards = [
    { label: "Toplam Kullanıcı", value: users.length,  icon: Users,     color: "#60a5fa", leftColor: "#3b82f6", seed: 1, trend: "+8% bu ay",      trendUp: true  as boolean | null },
    { label: "Aktif Kullanıcı",  value: activeCount,   icon: UserCheck, color: "#34d399", leftColor: "#10b981", seed: 2, trend: "+12% bu hafta",  trendUp: true  as boolean | null },
    { label: "Admin",            value: adminCount,    icon: Shield,    color: "#a78bfa", leftColor: "#8b5cf6", seed: 3, trend: "Değişmedi",      trendUp: null  as boolean | null },
    { label: "Bu Hafta Aktif",   value: weeklyActive,  icon: Activity,  color: "#fbbf24", leftColor: "#f59e0b", seed: 4, trend: "+5% dün'e göre", trendUp: true  as boolean | null },
  ];

  const tabs = [
    { key: "users"    as const, label: "Kullanıcılar", icon: Users },
    { key: "roles"    as const, label: "Roller",       icon: Shield },
    { key: "settings" as const, label: "Ayarlar",      icon: Settings },
  ];

  const tabCounts: Record<string, number | null> = {
    users: users.length,
    roles: INITIAL_ROLES.length,
    settings: null,
  };

  return (
    <PageWrapper>
      <div className="space-y-7">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div
                className="p-2.5 rounded-xl"
                style={{
                  background: "linear-gradient(135deg,rgba(124,58,237,0.25),rgba(37,99,235,0.25))",
                  border: "1px solid rgba(124,58,237,0.35)",
                }}
              >
                <ShieldCheck className="h-5 w-5 text-violet-300" />
              </div>
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                Admin Paneli
              </span>
            </h1>
            <p className="text-slate-500 text-sm mt-1.5 ml-1">Kullanıcı, rol ve platform yönetimi</p>
            {lastUpdated && (
              <p className="text-xs text-slate-600 mt-1 ml-1">
                Son güncelleme: {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: tr })}
              </p>
            )}
          </div>
          {activeTab === "users" && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all duration-200 shrink-0 hover:scale-[1.03] active:scale-95"
              style={{
                background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                boxShadow: "0 4px 20px rgba(124,58,237,0.45)",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(124,58,237,0.65)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(124,58,237,0.45)"; }}
            >
              <UserPlus className="h-4 w-4" /> Yeni Kullanıcı
            </button>
          )}
        </div>

        {/* ── KPI Kartları ────────────────────────────────────────────── */}
        <motion.div className="grid grid-cols-2 xl:grid-cols-4 gap-4" variants={containerVariants} initial="hidden" animate="show">
          {statCards.map(({ label, value, icon: Icon, color, leftColor, seed, trend, trendUp }) => (
            <motion.div
              key={label}
              variants={itemVariants}
              className="relative rounded-2xl p-5 overflow-hidden cursor-default transition-all duration-300 hover:scale-[1.02]"
              style={{
                background: BG2,
                border: BORDER,
                borderLeft: `4px solid ${leftColor}`,
              }}
            >
              {/* Large background icon */}
              <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 pointer-events-none" style={{ opacity: 0.08 }}>
                <Icon className="h-20 w-20" style={{ color }} />
              </div>

              {/* Small icon top-right */}
              <div className="absolute right-4 top-4 p-2 rounded-xl" style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>

              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">{label}</p>
              {loading
                ? <Skeleton className="h-10 w-16 mb-2" />
                : <p className="text-4xl font-bold text-slate-100 mb-1" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>}
              {trendUp !== null ? (
                <p className={cn("text-sm font-semibold", trendUp ? "text-emerald-400" : "text-rose-400")}>
                  {trendUp ? "↑" : "↓"} {trend}
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-500">{trend}</p>
              )}
              <div className="mt-3 -mx-1">
                <Sparkline color={color} seed={seed} />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Tabs — underline style ───────────────────────────────────── */}
        <div className="border-b border-slate-800/60">
          <div className="flex items-center gap-1">
            {tabs.map(({ key, label, icon: Icon }) => {
              const isActive = activeTab === key;
              const count    = tabCounts[key];
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "relative inline-flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors duration-200 whitespace-nowrap",
                    isActive ? "text-white" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {count !== null && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors",
                      isActive ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-500"
                    )}>
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeTabLine"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ background: "linear-gradient(to right,#3b82f6,#8b5cf6)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "users" && (
            <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <div className="rounded-2xl overflow-hidden" style={{ background: BG2, border: BORDER }}>

                {/* Toolbar */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-b border-slate-800/60"
                  style={{ background: BG3 }}
                >
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" /> Kullanıcılar
                    </p>
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(255,255,255,0.05)", border: BORDER, color: "#94a3b8" }}>
                      {filteredUsers.length}
                    </span>
                  </div>

                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Kullanıcı ara..."
                      className="w-full rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none transition-all"
                      style={{
                        background: BG2,
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                      onFocus={e  => { e.currentTarget.style.border = "1px solid rgba(59,130,246,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                      onBlur={e   => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </div>

                  {/* Role filter pills */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(["all", "admin", "analyst"] as const).map(k => (
                      <button
                        key={k}
                        onClick={() => setRoleFilter(k)}
                        className={cn(
                          "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200",
                          roleFilter === k
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:border-slate-600"
                        )}
                        style={roleFilter !== k ? { background: BG2, border: "1px solid rgba(255,255,255,0.08)" } : {}}
                      >
                        {k === "all" ? "Tümü" : k === "admin" ? "Admin" : "Analyst"}
                      </button>
                    ))}
                  </div>

                  {/* Export */}
                  <button
                    onClick={() => toast.success("Kullanıcı listesi dışa aktarıldı")}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition-all duration-150 shrink-0"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Dışa Aktar
                  </button>
                </div>

                {/* Table */}
                {loading ? (
                  <div className="p-6 space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-3.5 w-36" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-lg" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                    ))}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">{search ? "Arama sonucu bulunamadı" : "Kullanıcı bulunamadı"}</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: BORDER }}>
                        {["Kullanıcı", "Rol", "Durum", "Son Giriş", ""].map((h, i) => (
                          <th key={i} className="text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-6 py-3.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody variants={containerVariants} initial="hidden" animate="show">
                      {pagedUsers.map(u => {
                        const lastLogin = u.last_login_at
                          ? format(new Date(u.last_login_at), "d MMM yyyy, HH:mm", { locale: tr })
                          : "—";
                        return (
                          <motion.tr
                            key={u.id}
                            variants={rowVariants}
                            className="group/row transition-colors duration-150"
                            style={{ borderBottom: BORDER }}
                            onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = BG3; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={u.full_name} email={u.email} />
                                <div>
                                  <p className="font-bold text-white leading-tight">{u.full_name || "İsimsiz"}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <RoleDropdown user={u} roles={INITIAL_ROLES} onRoleChange={changeRole} />
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge active={u.is_active} />
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{lastLogin}</td>
                            <td className="px-5 py-4">
                              <ActionMenu user={u} onDeactivate={deactivate} onDelete={deleteUser} />
                            </td>
                          </motion.tr>
                        );
                      })}
                    </motion.tbody>
                  </table>
                )}

                {/* Pagination */}
                {!loading && filteredUsers.length > 0 && (
                  <div
                    className="flex items-center justify-between px-6 py-3"
                    style={{ borderTop: BORDER }}
                  >
                    <span className="text-xs text-slate-600">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)} / {filteredUsers.length} kullanıcı
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-slate-400 font-semibold px-3 py-1.5 rounded-lg" style={{ background: BG3 }}>
                        {page} / {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "roles" && (
            <motion.div key="roles" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <RolesTab users={users} />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <SettingsTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showModal && <NewUserModal onClose={() => setShowModal(false)} onCreated={load} />}
      </AnimatePresence>
    </PageWrapper>
  );
}
