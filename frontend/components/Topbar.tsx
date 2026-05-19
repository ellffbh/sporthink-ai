"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Plus, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIODS = ["7G", "14G", "30G", "Özel"] as const;
type Period = typeof PERIODS[number];

interface TopbarProps {
  title: string;
  subtitle?: string;
  anomalyCount?: number;
  onPeriodChange?: (p: Period) => void;
  onCustomRange?: (start: string, end: string) => void;
  hidePeriodSelector?: boolean;
}

export default function Topbar({ title, subtitle, anomalyCount = 0, onPeriodChange, onCustomRange, hidePeriodSelector }: TopbarProps) {
  const [active,       setActive]       = useState<Period>("7G");
  const [showDropdown, setShowDropdown] = useState(false);
  const [customStart,  setCustomStart]  = useState("");
  const [customEnd,    setCustomEnd]    = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showDropdown]);

  function select(p: Period) {
    if (p === "Özel") {
      setActive(p);
      setShowDropdown((v) => !v);
      return;
    }
    setShowDropdown(false);
    setActive(p);
    onPeriodChange?.(p);
  }

  function applyCustom() {
    if (customStart && customEnd) {
      setShowDropdown(false);
      onCustomRange?.(customStart, customEnd);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Main bar */}
      <div className="flex items-center justify-between px-6 py-3.5 gap-4 flex-wrap">
        {/* Title */}
        <div>
          <h1 className="text-[15px] font-bold text-white leading-tight">{title}</h1>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Period selector */}
          {!hidePeriodSelector && (
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center rounded-lg overflow-hidden"
                   style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.08)" }}>
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => select(p)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-all duration-150",
                      active === p
                        ? "text-white"
                        : "text-slate-500 hover:text-slate-300"
                    )}
                    style={active === p ? { background: "#2563EB" } : {}}
                  >
                    {p === "Özel" && <Calendar className="h-3 w-3" />}
                    {p}
                  </button>
                ))}
              </div>

              {showDropdown && (
                <div
                  className="absolute right-0 mt-1 rounded-xl p-3 flex flex-col gap-2.5"
                  style={{
                    top: "100%",
                    zIndex: 9999,
                    background: "#0D1526",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    minWidth: 272,
                  }}
                >
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 mb-1 block">Başlangıç</label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white outline-none"
                        style={{ background: "#111D35", border: "1px solid rgba(255,255,255,0.06)", colorScheme: "dark" }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 mb-1 block">Bitiş</label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-[11px] text-white outline-none"
                        style={{ background: "#111D35", border: "1px solid rgba(255,255,255,0.06)", colorScheme: "dark" }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyCustom}
                    disabled={!customStart || !customEnd}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
                  >
                    Uygula
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Notification bell */}
          <button
            className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
            style={{ background: "#0D1526", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Bell className="h-4 w-4" />
            {anomalyCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    style={{ background: "#F43F5E" }}>
                {anomalyCount > 9 ? "9+" : anomalyCount}
              </span>
            )}
          </button>

          {/* New campaign */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Yeni Kampanya
          </button>
        </div>
      </div>

      {/* Anomaly alert strip */}
      {anomalyCount > 0 && (
        <div className="px-6 py-2 flex items-center gap-3"
             style={{ background: "rgba(244,63,94,0.06)", borderTop: "1px solid rgba(244,63,94,0.15)" }}>
          <span className="w-2 h-2 rounded-full bg-ar-red pulse-dot shrink-0" />
          <p className="text-xs text-rose-400 font-medium">
            {anomalyCount} aktif anomali tespit edildi — kampanya performansınızda beklenmedik değişimler var.
          </p>
          <a href="/anomalies" className="ml-auto text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 whitespace-nowrap">
            İncele →
          </a>
        </div>
      )}
    </div>
  );
}
