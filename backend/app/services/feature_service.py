"""
Feature Engineering Service (Sporthink 4.2)
Ham metriklerden trend, momentum ve sezonsallık özellikleri hesaplar.
"""
from datetime import date, timedelta
from typing import Optional
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_pct(curr: float, prev: float) -> float:
    """Yüzde değişim, sıfır bölme korumalı."""
    if prev == 0:
        return 0.0
    return round((curr - prev) / prev * 100, 2)


def _roas(cost: float, value: float) -> float:
    return round(value / cost, 4) if cost > 0 else 0.0


def _cpa(cost: float, conv: float) -> float:
    return round(cost / conv, 4) if conv > 0 else 0.0


def _ctr(clicks: float, impressions: float) -> float:
    return round(clicks / impressions, 6) if impressions > 0 else 0.0


def _window(df: pd.DataFrame, end_ts: pd.Timestamp, days_back: int, days_start: int = 0) -> pd.DataFrame:
    """end_ts'den geriye [days_start, days_back) aralığını döner."""
    lo = end_ts - pd.Timedelta(days=days_back)
    hi = end_ts - pd.Timedelta(days=days_start)
    return df[(df["metric_date"] > lo) & (df["metric_date"] <= hi)]


# ---------------------------------------------------------------------------
# A) compute_campaign_features
# ---------------------------------------------------------------------------

def compute_campaign_features(
    db: Session,
    campaign_id: str,
    end_date: Optional[date] = None,
) -> dict:
    """
    Bir kampanyanın güncel feature vektörünü hesaplar.
    end_date=None ise kampanyanın verisindeki son tarihi kullanır.
    """
    cid = str(campaign_id)

    # Kampanya meta bilgisi
    camp = db.execute(text("""
        SELECT id, campaign_name, campaign_type, daily_budget
        FROM campaigns WHERE id = :cid
    """), {"cid": cid}).fetchone()

    if not camp:
        return {"error": "Campaign not found", "campaign_id": cid}

    # Tüm metrik geçmişi (güne göre aggregate — birden fazla device satırı olabilir)
    rows = db.execute(text("""
        SELECT
            metric_date,
            SUM(cost)::float             AS cost,
            SUM(conversions)::float      AS conversions,
            SUM(conversion_value)::float AS conversion_value,
            SUM(clicks)::float           AS clicks,
            SUM(impressions)::bigint     AS impressions
        FROM ad_metrics_daily
        WHERE campaign_id = :cid
        GROUP BY metric_date
        ORDER BY metric_date
    """), {"cid": cid}).fetchall()

    if not rows:
        return {"error": "No metric data found", "campaign_id": cid}

    df = pd.DataFrame([dict(r._mapping) for r in rows])
    df["metric_date"] = pd.to_datetime(df["metric_date"])
    for col in ["cost", "conversions", "conversion_value", "clicks", "impressions"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    as_of = end_date if end_date else df["metric_date"].max().date()
    as_of_ts = pd.Timestamp(as_of)

    # Zaman pencereleri
    w_7    = _window(df, as_of_ts, 7)
    w_p7   = _window(df, as_of_ts, 14, 7)   # önceki 7
    w_14   = _window(df, as_of_ts, 14)
    w_p14  = _window(df, as_of_ts, 28, 14)  # önceki 14
    w_28   = _window(df, as_of_ts, 28)

    # ── Trend 7d ───────────────────────────────────────────────────────────
    trend_7d = {
        "cost_change_pct":        _safe_pct(w_7["cost"].sum(),        w_p7["cost"].sum()),
        "conversions_change_pct": _safe_pct(w_7["conversions"].sum(), w_p7["conversions"].sum()),
        "roas_change_pct":        _safe_pct(
            _roas(w_7["cost"].sum(),  w_7["conversion_value"].sum()),
            _roas(w_p7["cost"].sum(), w_p7["conversion_value"].sum()),
        ),
        "cpa_change_pct":         _safe_pct(
            _cpa(w_7["cost"].sum(),  w_7["conversions"].sum()),
            _cpa(w_p7["cost"].sum(), w_p7["conversions"].sum()),
        ),
        "ctr_change_pct":         _safe_pct(
            _ctr(w_7["clicks"].sum(),  w_7["impressions"].sum()),
            _ctr(w_p7["clicks"].sum(), w_p7["impressions"].sum()),
        ),
    }

    # ── Trend 14d ──────────────────────────────────────────────────────────
    trend_14d = {
        "cost_change_pct":        _safe_pct(w_14["cost"].sum(),        w_p14["cost"].sum()),
        "conversions_change_pct": _safe_pct(w_14["conversions"].sum(), w_p14["conversions"].sum()),
        "roas_change_pct":        _safe_pct(
            _roas(w_14["cost"].sum(),  w_14["conversion_value"].sum()),
            _roas(w_p14["cost"].sum(), w_p14["conversion_value"].sum()),
        ),
        "cpa_change_pct":         _safe_pct(
            _cpa(w_14["cost"].sum(),  w_14["conversions"].sum()),
            _cpa(w_p14["cost"].sum(), w_p14["conversions"].sum()),
        ),
        "ctr_change_pct":         _safe_pct(
            _ctr(w_14["clicks"].sum(),  w_14["impressions"].sum()),
            _ctr(w_p14["clicks"].sum(), w_p14["impressions"].sum()),
        ),
    }

    # ── Moving Averages ────────────────────────────────────────────────────
    df_hist = df[df["metric_date"] <= as_of_ts].copy()
    df_hist["day_roas"] = df_hist.apply(
        lambda r: r["conversion_value"] / r["cost"] if r["cost"] > 0 else 0.0, axis=1
    )

    def tail_mean(col: str, n: int) -> float:
        s = df_hist[col].tail(n)
        return round(float(s.mean()), 4) if len(s) > 0 else 0.0

    moving_averages = {
        "ma7_cost":         tail_mean("cost", 7),
        "ma7_conversions":  tail_mean("conversions", 7),
        "ma7_roas":         tail_mean("day_roas", 7),
        "ma14_cost":        tail_mean("cost", 14),
        "ma14_conversions": tail_mean("conversions", 14),
        "ma14_roas":        tail_mean("day_roas", 14),
    }

    # ── Current Metrics (last 7d aggregate) ───────────────────────────────
    cost_7  = float(w_7["cost"].sum())
    conv_7  = float(w_7["conversions"].sum())
    val_7   = float(w_7["conversion_value"].sum())
    clk_7   = float(w_7["clicks"].sum())
    imp_7   = float(w_7["impressions"].sum())

    current_metrics = {
        "roas_current": _roas(cost_7, val_7),
        "cpa_current":  _cpa(cost_7, conv_7),
        "ctr_current":  _ctr(clk_7, imp_7),
        "cvr_current":  round(conv_7 / clk_7, 6) if clk_7 > 0 else 0.0,
        "cpc_current":  round(cost_7 / clk_7, 4) if clk_7 > 0 else 0.0,
        "conv_7d":      round(conv_7, 1),
    }

    # ── Data Quality ───────────────────────────────────────────────────────
    days_with_data   = len(w_28)
    total_conv_28    = float(w_28["conversions"].sum())
    is_cold_start    = days_with_data < 7 or total_conv_28 < 5

    if len(w_28) >= 3 and w_28["cost"].mean() > 0:
        cv = float(w_28["cost"].std() / w_28["cost"].mean())
        is_volatile = cv > 0.5
    else:
        is_volatile = False

    conf = min(1.0, days_with_data / 28) * 0.5
    conf += min(1.0, total_conv_28 / 20) * 0.3
    conf += 0.2 if not is_volatile else 0.0

    data_quality = {
        "days_with_data":       days_with_data,
        "total_conversions_28d": int(total_conv_28),
        "is_cold_start":        is_cold_start,
        "is_volatile":          is_volatile,
        "confidence_score":     round(conf, 2),
    }

    # ── Campaign Info ──────────────────────────────────────────────────────
    camp_type = str(camp.campaign_type) if camp.campaign_type else "unknown"
    is_pmax   = camp_type == "pmax"

    total_cost_all = db.execute(text("""
        SELECT COALESCE(SUM(cost), 1)::float
        FROM ad_metrics_daily
        WHERE metric_date > :start
    """), {"start": (as_of_ts - pd.Timedelta(days=28)).date()}).scalar()

    campaign_cost_28 = float(w_28["cost"].sum())
    budget_share_pct = round(campaign_cost_28 / float(total_cost_all) * 100, 2) if float(total_cost_all) > 0 else 0.0

    campaign_info = {
        "campaign_type":     camp_type,
        "is_pmax":           is_pmax,
        "budget_share_pct":  budget_share_pct,
    }

    # ── Seasonality ────────────────────────────────────────────────────────
    if len(w_28) > 0:
        w28c = w_28.copy()
        w28c["dow"] = w28c["metric_date"].dt.strftime("%a")
        dow_avg = w28c.groupby("dow")["cost"].mean().round(2).to_dict()
        dow_avg = {k: float(v) for k, v in dow_avg.items()}
        best_day  = max(dow_avg, key=dow_avg.get) if dow_avg else None
        worst_day = min(dow_avg, key=dow_avg.get) if dow_avg else None
    else:
        dow_avg   = {}
        best_day  = None
        worst_day = None

    seasonality = {
        "day_of_week_avg_cost": dow_avg,
        "best_day":             best_day,
        "worst_day":            worst_day,
    }

    return {
        "campaign_id":     cid,
        "as_of_date":      str(as_of),
        "trend_7d":        trend_7d,
        "trend_14d":       trend_14d,
        "moving_averages": moving_averages,
        "current_metrics": current_metrics,
        "data_quality":    data_quality,
        "campaign_info":   campaign_info,
        "seasonality":     seasonality,
    }


# ---------------------------------------------------------------------------
# B) compute_account_features
# ---------------------------------------------------------------------------

def compute_account_features(db: Session, ad_account_id: str) -> dict:
    """Tüm hesabın özet feature'ları."""
    rows = db.execute(text("""
        SELECT
            c.id::text          AS campaign_id,
            c.campaign_name,
            c.campaign_type,
            SUM(m.cost)::float          AS total_cost,
            SUM(m.conversions)::float   AS total_conversions,
            SUM(m.conversion_value)::float AS total_value,
            COUNT(DISTINCT m.metric_date) AS days_active
        FROM campaigns c
        JOIN ad_accounts a ON a.id = c.ad_account_id
        JOIN ad_metrics_daily m ON m.campaign_id = c.id
        WHERE a.id = :aid
          AND m.metric_date >= (SELECT MAX(metric_date) - INTERVAL '28 days' FROM ad_metrics_daily)
        GROUP BY c.id, c.campaign_name, c.campaign_type
        ORDER BY total_cost DESC
    """), {"aid": str(ad_account_id)}).fetchall()

    if not rows:
        return {"error": "No data for this account", "ad_account_id": str(ad_account_id)}

    total_cost = sum(float(r.total_cost or 0) for r in rows)
    campaigns = []
    for r in rows:
        cost = float(r.total_cost or 0)
        conv = float(r.total_conversions or 0)
        val  = float(r.total_value or 0)
        campaigns.append({
            "campaign_id":    r.campaign_id,
            "campaign_name":  r.campaign_name,
            "campaign_type":  str(r.campaign_type),
            "total_cost":     round(cost, 2),
            "total_conversions": int(conv),
            "roas":           round(val / cost, 2) if cost > 0 else 0.0,
            "cost_share_pct": round(cost / total_cost * 100, 1) if total_cost > 0 else 0.0,
            "days_active":    int(r.days_active),
        })

    return {
        "ad_account_id":     str(ad_account_id),
        "total_cost_28d":    round(total_cost, 2),
        "campaign_count":    len(campaigns),
        "top_campaigns":     campaigns[:5],
        "all_campaigns":     campaigns,
    }


# ---------------------------------------------------------------------------
# C) detect_event_type
# ---------------------------------------------------------------------------

def detect_event_type(d: date) -> Optional[str]:
    """
    Türkiye'ye özgü özel günleri tespit eder.
    Varsa event_type string döner, yoksa None.
    """
    month, day, weekday = d.month, d.day, d.weekday()  # Mon=0, Sun=6

    # --- Sabit tarihler ---
    if month == 2 and day == 14:
        return "sevgililer_gunu"

    if month == 12 and day >= 25 or month == 1 and day <= 5:
        return "yilbasi"

    if month == 9 and 1 <= day <= 15:
        return "okul_sezonu"

    if month in (6, 7, 8):
        return "yaz_sezonu"

    # --- Anneler günü: Mayıs 2. Pazar ---
    if month == 5 and weekday == 6:  # Pazar
        first_day_month = d.replace(day=1)
        first_sunday_offset = (6 - first_day_month.weekday()) % 7
        first_sunday = first_day_month.day + first_sunday_offset
        second_sunday = first_sunday + 7
        if day == second_sunday:
            return "anneler_gunu"

    # --- Babalar günü: Haziran 3. Pazar ---
    if month == 6 and weekday == 6:
        first_day_month = d.replace(day=1)
        first_sunday_offset = (6 - first_day_month.weekday()) % 7
        first_sunday = first_day_month.day + first_sunday_offset
        third_sunday = first_sunday + 14
        if day == third_sunday:
            return "babalar_gunu"

    # --- Black Friday: Kasım son Cuma ---
    if month == 11 and weekday == 4:  # Cuma
        # Son Cuma: 28, 29, 30 olabilir
        if day >= 22:
            next_friday = d + timedelta(days=7)
            if next_friday.month != 11:
                return "black_friday"

    # --- Hardcoded Ramazan/Kurban Bayram (2024-2025) ---
    RAMADAN_BAYRAM = [
        (date(2024, 4, 10), date(2024, 4, 12)),
        (date(2025, 3, 30), date(2025, 4, 1)),
    ]
    KURBAN_BAYRAM = [
        (date(2024, 6, 16), date(2024, 6, 19)),
        (date(2025, 6, 5),  date(2025, 6, 8)),
    ]

    for start, end in RAMADAN_BAYRAM:
        if start <= d <= end:
            return "ramadan_bayram"

    for start, end in KURBAN_BAYRAM:
        if start <= d <= end:
            return "kurban_bayram"

    return None
