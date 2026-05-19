"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { saveToken, saveRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, BarChart3, CheckCircle2 } from "lucide-react";

const ROLE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    color: "#a78bfa",
    bg: "rgba(124,58,237,0.12)",
    border: "rgba(124,58,237,0.35)",
  },
  analyst: {
    label: "Analyst",
    icon: BarChart3,
    color: "#60a5fa",
    bg: "rgba(37,99,235,0.12)",
    border: "rgba(37,99,235,0.35)",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [loggedInRole, setLoggedInRole] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<{ access_token: string; token_type: string; role: string }>(
        "/auth/login",
        { email, password }
      );
      saveToken(data.access_token);
      saveRole(data.role ?? "analyst");
      setLoggedInRole(data.role ?? "analyst");
      // Kısa gecikme ile badge göster, sonra yönlendir
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Giriş başarısız";
      setError(msg);
      setLoading(false);
    }
  }

  const meta = loggedInRole ? ROLE_META[loggedInRole] ?? ROLE_META.analyst : null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#070C18" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Sporthink</h1>
          <p className="text-xs text-slate-500">Ad Intelligence Platform</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {loggedInRole && meta ? (
            /* Başarılı giriş — rol badge */
            <div className="py-6 flex flex-col items-center gap-4 animate-in fade-in">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
              >
                <meta.icon className="h-7 w-7" style={{ color: meta.color }} />
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-sm font-semibold text-slate-200">Giriş başarılı</p>
                </div>
                <p className="text-xs text-slate-500 mb-3">Yönlendiriliyorsunuz…</p>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                >
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-base font-semibold text-slate-100">Giriş Yap</p>
                <p className="text-xs text-slate-500 mt-0.5">Hesabınıza erişin</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-400">E-posta</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@sporthink.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-slate-900/60 border-slate-700/60 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold text-slate-400">Şifre</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="bg-slate-900/60 border-slate-700/60 text-slate-200 focus:border-blue-500/60"
                  />
                </div>
                {error && (
                  <p className="text-xs text-rose-400 font-medium">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 hover:scale-[1.02] active:scale-95"
                  style={{
                    background: "linear-gradient(135deg,#2563EB,#7C3AED)",
                    boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
                  }}
                >
                  {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
