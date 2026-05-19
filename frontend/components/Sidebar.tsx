"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import {
  LayoutDashboard, Megaphone, BarChart2, AlertTriangle,
  Lightbulb, FlaskConical, Settings, LogOut, ChevronRight, Shield, Wallet,
} from "lucide-react";

interface Me {
  full_name: string;
  email: string;
  is_superuser: boolean;
  role: string;
}

const NAV_GROUPS = [
  {
    label: "GENEL",
    items: [
      { href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
    ],
  },
  {
    label: "REKLAM YÖNETİMİ",
    items: [
      { href: "/campaigns",   label: "Kampanyalar",     icon: Megaphone },
      { href: "/ad-accounts", label: "Reklam Hesapları", icon: Wallet },
      { href: "/metrics",     label: "Metrikler",        icon: BarChart2 },
    ],
  },
  {
    label: "YAPAY ZEKA",
    items: [
      { href: "/anomalies",       label: "Anomaliler", icon: AlertTriangle },
      { href: "/recommendations", label: "Öneriler",   icon: Lightbulb },
      { href: "/simulations",     label: "Simülasyon", icon: FlaskConical },
    ],
  },
  {
    label: "SİSTEM",
    items: [
      { href: "/settings", label: "Ayarlar",      icon: Settings },
      { href: "/admin",    label: "Admin Paneli", icon: Shield, adminOnly: true },
    ],
  },
];

function getInitials(fullName: string, email: string): string {
  const words = (fullName || email || "?").split(" ").filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0] || "?").slice(0, 2).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.get("/auth/me")
      .then((res) => setMe(res.data))
      .catch(() => {});
  }, []);

  const initials    = me ? getInitials(me.full_name, me.email) : "…";
  const displayName = me?.full_name || me?.email || "…";
  const role        = me?.role ?? (me?.is_superuser ? "admin" : "analyst");
  const roleLabel   = role === "admin" ? "Admin" : "Analyst";
  const roleBadgeCls = role === "admin"
    ? "bg-purple-500/10 border border-purple-500/25 text-purple-400"
    : "bg-blue-500/10 border border-blue-500/25 text-blue-400";

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col min-h-screen"
      style={{ background: "#070C18", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight text-white">Sporthink</span>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5">Ad Intelligence Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !("adminOnly" in item && item.adminOnly && !me?.is_superuser)
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-slate-600 tracking-widest px-2 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                        active ? "text-white" : "text-slate-500 hover:text-slate-300"
                      )}
                      style={active
                        ? { background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)" }
                        : { border: "1px solid transparent" }
                      }
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-blue-400" : "text-slate-600 group-hover:text-slate-400")} />
                      <span className="flex-1">{label}</span>
                      {active && <ChevronRight className="h-3 w-3 text-blue-500/60" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Workspace */}
      <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mt-3 px-3 py-2.5 rounded-lg" style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[10px] text-slate-600 font-medium uppercase tracking-wider mb-0.5">Çalışma Alanı</p>
          <p className="text-xs text-slate-300 font-medium">Sporthink TR</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500">Canlı · 12 kampanya</span>
          </div>
        </div>

        {/* User */}
        <div
          className="mt-2 px-3 py-2.5 rounded-lg flex items-center gap-2.5"
          style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#7C3AED,#2563EB)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">{displayName}</p>
            <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${roleBadgeCls}`}>
              {roleLabel}
            </span>
          </div>
          <button
            onClick={() => { clearToken(); router.push("/login"); }}
            className="text-slate-600 hover:text-slate-400 transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
