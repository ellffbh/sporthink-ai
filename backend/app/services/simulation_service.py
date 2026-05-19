"""
Simulation Service (Sporthink 4.3 / Bölüm 5)
Event tanıma, bütçe simülasyonu, benzer dönem karşılaştırması.
"""
from datetime import date, timedelta
from typing import Optional
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

# ---------------------------------------------------------------------------
# Türkiye Özel Günler
# ---------------------------------------------------------------------------

EVENT_META = {
    "ramazan_bayrami":  {"name": "Ramazan Bayramı",     "category": "holiday",  "emoji": "🌙"},
    "kurban_bayrami":   {"name": "Kurban Bayramı",       "category": "holiday",  "emoji": "🐑"},
    "black_friday":     {"name": "Black Friday",          "category": "shopping", "emoji": "🛍️"},
    "cyber_monday":     {"name": "Cyber Monday",          "category": "shopping", "emoji": "💻"},
    "yilbasi":          {"name": "Yılbaşı Haftası",      "category": "holiday",  "emoji": "🎄"},
    "sevgililer_gunu":  {"name": "Sevgililer Günü",      "category": "seasonal", "emoji": "❤️"},
    "anneler_gunu":     {"name": "Anneler Günü",         "category": "seasonal", "emoji": "🌸"},
    "babalar_gunu":     {"name": "Babalar Günü",         "category": "seasonal", "emoji": "👔"},
    "okul_acilisi":     {"name": "Okul Açılışı",         "category": "seasonal", "emoji": "🎒"},
    "yaz_indirimi":     {"name": "Yaz İndirimi",         "category": "shopping", "emoji": "☀️"},
    "23_nisan":         {"name": "23 Nisan",              "category": "holiday",  "emoji": "🇹🇷"},
    "19_mayis":         {"name": "19 Mayıs",              "category": "holiday",  "emoji": "🇹🇷"},
    "30_agustos":       {"name": "30 Ağustos",            "category": "holiday",  "emoji": "🇹🇷"},
    "29_ekim":          {"name": "29 Ekim Cumhuriyet",   "category": "holiday",  "emoji": "🇹🇷"},
}

BAYRAM_DATES: dict = {
    2024: {
        "ramazan_bayrami": ("2024-04-09", "2024-04-12"),
        "kurban_bayrami":  ("2024-06-16", "2024-06-19"),
    },
    2025: {
        "ramazan_bayrami": ("2025-03-30", "2025-04-02"),
        "kurban_bayrami":  ("2025-06-06", "2025-06-09"),
    },
    2026: {
        "ramazan_bayrami": ("2026-03-20", "2026-03-23"),
        "kurban_bayrami":  ("2026-05-26", "2026-05-29"),
    },
}


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """Ayın n. {weekday}ünü döndür (weekday: 0=Mon…6=Sun)."""
    d = date(year, month, 1)
    delta = (weekday - d.weekday()) % 7
    d = d + timedelta(days=delta)
    return d + timedelta(weeks=n - 1)


def _last_friday_of_november(year: int) -> date:
    d = date(year, 11, 30)
    while d.weekday() != 4:  # 4 = Friday
        d -= timedelta(days=1)
    return d


def _events_for_year(year: int) -> list[dict]:
    events = []

    def add(d: date, etype: str, end_d: Optional[date] = None):
        meta = EVENT_META.get(etype, {"name": etype, "category": "other", "emoji": "📅"})
        events.append({
            "date":       str(d),
            "end_date":   str(end_d) if end_d else str(d),
            "event_type": etype,
            "name":       meta["name"],
            "category":   meta["category"],
            "emoji":      meta["emoji"],
        })

    # Sabit tarihler
    add(date(year, 2, 14), "sevgililer_gunu")
    add(date(year, 4, 23), "23_nisan")
    add(date(year, 5, 19), "19_mayis")
    add(date(year, 8, 30), "30_agustos")
    add(date(year, 10, 29), "29_ekim")

    # Yılbaşı: 25 Aralık - 5 Ocak
    add(date(year, 12, 25), "yilbasi", date(year, 12, 31))

    # Anneler günü: Mayıs 2. Pazar
    try:
        add(_nth_weekday(year, 5, 6, 2), "anneler_gunu")
    except Exception:
        pass

    # Babalar günü: Haziran 3. Pazar
    try:
        add(_nth_weekday(year, 6, 6, 3), "babalar_gunu")
    except Exception:
        pass

    # Black Friday + Cyber Monday
    try:
        bf = _last_friday_of_november(year)
        add(bf, "black_friday", bf + timedelta(days=3))
        add(bf + timedelta(days=3), "cyber_monday")
    except Exception:
        pass

    # Okul açılışı: 1-15 Eylül
    add(date(year, 9, 1), "okul_acilisi", date(year, 9, 15))

    # Yaz indirimi: Haziran 1 - Ağustos 31
    add(date(year, 6, 1), "yaz_indirimi", date(year, 8, 31))

    # Bayramlar
    bayrams = BAYRAM_DATES.get(year, {})
    for etype, (start_s, end_s) in bayrams.items():
        add(date.fromisoformat(start_s), etype, date.fromisoformat(end_s))

    return events


# ---------------------------------------------------------------------------
# A) get_event_for_date_range
# ---------------------------------------------------------------------------

def get_event_for_date_range(start_date: date, end_date: date) -> list[dict]:
    years = set(range(start_date.year, end_date.year + 1))
    all_events: list[dict] = []
    for y in years:
        all_events.extend(_events_for_year(y))

    result = []
    for ev in all_events:
        ev_start = date.fromisoformat(ev["date"])
        ev_end   = date.fromisoformat(ev["end_date"])
        if ev_end >= start_date and ev_start <= end_date:
            result.append(ev)

    result.sort(key=lambda x: x["date"])
    return result


def get_upcoming_events(days: int = 30) -> list[dict]:
    today = date.today()
    return get_event_for_date_range(today, today + timedelta(days=days))


# ---------------------------------------------------------------------------
# B) find_similar_periods
# ---------------------------------------------------------------------------

def find_similar_periods(
    db: Session,
    campaign_id: str,
    event_type: str,
    lookback_days: int = 550,
) -> list[dict]:
    """Geçmişte aynı event_type dönemlerindeki kampanya performansını döner."""
    cid = str(campaign_id)
    today = date.today()
    lookback_start = today - timedelta(days=lookback_days)

    # Geçmişteki event dönemlerini bul
    past_events = get_event_for_date_range(lookback_start, today)
    matching = [e for e in past_events if e["event_type"] == event_type]

    if not matching:
        return []

    results = []
    for ev in matching:
        ev_start = date.fromisoformat(ev["date"])
        ev_end   = date.fromisoformat(ev["end_date"])
        # +2 gün öncesi ve +5 gün sonrası pencere
        q_start = ev_start - timedelta(days=2)
        q_end   = ev_end   + timedelta(days=5)

        rows = db.execute(text("""
            SELECT
                SUM(cost)::float             AS total_cost,
                SUM(conversions)::float      AS total_conversions,
                SUM(conversion_value)::float AS total_revenue,
                AVG(ctr)::float              AS avg_ctr,
                COUNT(DISTINCT metric_date)  AS days_active
            FROM ad_metrics_daily
            WHERE campaign_id = :cid
              AND metric_date BETWEEN :s AND :e
        """), {"cid": cid, "s": q_start, "e": q_end}).fetchone()

        if not rows or (rows.total_cost or 0) == 0:
            continue

        cost = float(rows.total_cost or 0)
        conv = float(rows.total_conversions or 0)
        rev  = float(rows.total_revenue or 0)

        results.append({
            "period_start": str(q_start),
            "period_end":   str(q_end),
            "event_type":   event_type,
            "event_name":   ev["name"],
            "metrics": {
                "total_cost":        round(cost, 2),
                "total_conversions": round(conv, 2),
                "total_revenue":     round(rev, 2),
                "avg_roas":  round(rev / cost, 4) if cost > 0 else 0.0,
                "avg_cpa":   round(cost / conv, 4) if conv > 0 else 0.0,
                "avg_ctr":   round(float(rows.avg_ctr or 0), 6),
                "days_active": int(rows.days_active or 0),
            },
        })

    return results


# ---------------------------------------------------------------------------
# C) simulate_budget
# ---------------------------------------------------------------------------

def simulate_budget(
    db: Session,
    campaign_id: str,
    new_daily_budget: float,
    horizon_days: int = 7,
    event_type: Optional[str] = None,
) -> dict:
    cid = str(campaign_id)

    # Mevcut bütçeyi kampanyadan al; yoksa son 7 gün ortalaması
    camp = db.execute(text("""
        SELECT campaign_name, daily_budget, campaign_type
        FROM campaigns WHERE id = :cid
    """), {"cid": cid}).fetchone()

    if not camp:
        return {"error": "Kampanya bulunamadı", "campaign_id": cid}

    # Mevcut bütçe: ya DB'deki ya da son 7 gün harcama ortalaması
    db_budget = float(camp.daily_budget or 0)
    if db_budget <= 0:
        avg_cost_row = db.execute(text("""
            SELECT COALESCE(AVG(daily_cost), 0)::float FROM (
                SELECT SUM(cost) AS daily_cost
                FROM ad_metrics_daily
                WHERE campaign_id = :cid
                GROUP BY metric_date
                ORDER BY metric_date DESC LIMIT 7
            ) t
        """), {"cid": cid}).scalar()
        db_budget = float(avg_cost_row or 50.0)

    # Mevcut tahmini al
    from app.services.prediction_service import get_latest_prediction
    pred = get_latest_prediction(db, cid)

    if not pred or "summary" not in pred:
        # Tahmin yoksa basit ortalama hesapla
        rows = db.execute(text("""
            SELECT
                AVG(daily_cost)::float  AS avg_cost,
                AVG(daily_conv)::float  AS avg_conv,
                AVG(daily_rev)::float   AS avg_rev
            FROM (
                SELECT SUM(cost) AS daily_cost, SUM(conversions) AS daily_conv,
                       SUM(conversion_value) AS daily_rev
                FROM ad_metrics_daily
                WHERE campaign_id = :cid
                GROUP BY metric_date
                ORDER BY metric_date DESC LIMIT 14
            ) t
        """), {"cid": cid}).fetchone()
        base_cost = float(rows.avg_cost or 0) * horizon_days
        base_conv = float(rows.avg_conv or 0) * horizon_days
        base_rev  = float(rows.avg_rev  or 0) * horizon_days
    else:
        s = pred["summary"]
        factor = horizon_days / int(pred.get("horizon_days", 7))
        base_cost = float(s.get("total_predicted_cost", 0)) * factor
        base_conv = float(s.get("total_predicted_conversions", 0)) * factor
        base_rev  = float(s.get("total_predicted_revenue", 0)) * factor

    base_roas = round(base_rev / base_cost, 4) if base_cost > 0 else 0.0
    base_cpa  = round(base_cost / base_conv, 4) if base_conv > 0 else 0.0

    # Simülasyon — diminishing returns
    budget_ratio = new_daily_budget / max(db_budget, 1.0)
    scale = budget_ratio ** 0.85  # azalan getiri

    # Event varsa benzer dönem boost'u uygula
    event_boost = 1.0
    similar = []
    event_name = None
    if event_type:
        similar = find_similar_periods(db, cid, event_type)
        all_events = _events_for_year(date.today().year)
        ev_meta = next((e for e in all_events if e["event_type"] == event_type), None)
        event_name = ev_meta["name"] if ev_meta else event_type

        if similar:
            hist_roas_list = [s["metrics"]["avg_roas"] for s in similar if s["metrics"]["avg_roas"] > 0]
            if hist_roas_list and base_roas > 0:
                hist_avg_roas = sum(hist_roas_list) / len(hist_roas_list)
                event_boost = min(2.0, max(0.5, hist_avg_roas / max(base_roas, 0.01)))

    sim_conv = base_conv * scale * event_boost
    sim_cost = new_daily_budget * horizon_days
    avg_order_value = base_rev / max(base_conv, 1.0)
    sim_rev  = sim_conv * avg_order_value
    sim_roas = round(sim_rev / sim_cost, 4) if sim_cost > 0 else 0.0

    def pct(a, b): return round((a - b) / max(b, 0.01) * 100, 2)

    # Risk değerlendirmesi
    risk_factors = []
    risk_level = "low"

    budget_change_pct = pct(new_daily_budget, db_budget)
    if budget_change_pct >= 50:
        risk_factors.append(f"Bütçe %{abs(budget_change_pct):.0f} artıyor — büyük değişiklik")
        risk_level = "high"
    elif budget_change_pct >= 20:
        risk_factors.append(f"Bütçe %{abs(budget_change_pct):.0f} artıyor")
        risk_level = "medium"
    elif budget_change_pct <= -20:
        risk_factors.append(f"Bütçe %{abs(budget_change_pct):.0f} azalıyor")
        risk_level = "medium"

    dq = pred.get("data_quality", {}) if pred else {}
    if dq.get("is_cold_start"):
        risk_factors.append("Cold start kampanya — veri yetersiz")
        risk_level = "high"

    if base_roas < 1.5:
        risk_factors.append(f"Mevcut ROAS düşük ({base_roas:.2f}x)")
        if risk_level != "high":
            risk_level = "medium"

    if sim_roas < base_roas * 0.85:
        risk_factors.append("Simülasyon ROAS'ı mevcut tahmine göre düşük")

    if not risk_factors:
        risk_factors.append("Değişiklik makul görünüyor")

    rec_text = (
        "Bütçeyi %20 artırarak test etmenizi öneririz." if budget_change_pct > 20
        else "Mevcut bütçeyi koruyup performans izlemenizi öneririz." if budget_change_pct < -20
        else "Planladığınız değişiklik makul seviyede."
    )

    # Confidence
    conf_pred = float((pred or {}).get("summary", {}).get("confidence_score", 0.5))
    confidence = round(conf_pred * (0.9 if event_type and not similar else 1.0), 2)

    return {
        "campaign_id":   cid,
        "campaign_name": camp.campaign_name,
        "scenario": {
            "current_daily_budget":  round(db_budget, 2),
            "new_daily_budget":      round(new_daily_budget, 2),
            "budget_change_pct":     round(budget_change_pct, 2),
            "horizon_days":          horizon_days,
            "event_type":            event_type,
            "event_name":            event_name,
        },
        "current_forecast": {
            "predicted_cost":        round(base_cost, 2),
            "predicted_conversions": round(base_conv, 2),
            "predicted_revenue":     round(base_rev, 2),
            "predicted_roas":        base_roas,
            "predicted_cpa":         base_cpa,
        },
        "simulated_forecast": {
            "predicted_cost":        round(sim_cost, 2),
            "predicted_conversions": round(sim_conv, 2),
            "predicted_revenue":     round(sim_rev, 2),
            "predicted_roas":        sim_roas,
            "predicted_cpa":         round(sim_cost / max(sim_conv, 0.01), 4),
        },
        "delta": {
            "cost_change_pct":        pct(sim_cost, base_cost),
            "conversions_change_pct": pct(sim_conv, base_conv),
            "revenue_change_pct":     pct(sim_rev, base_rev),
            "roas_change_pct":        pct(sim_roas, base_roas),
        },
        "similar_periods": similar,
        "risk_assessment": {
            "level":          risk_level,
            "factors":        risk_factors,
            "recommendation": rec_text,
        },
        "confidence_score": confidence,
    }


# ---------------------------------------------------------------------------
# D) compare_vs_similar_period
# ---------------------------------------------------------------------------

def compare_vs_similar_period(
    db: Session,
    campaign_id: str,
    event_type: str,
) -> dict:
    cid = str(campaign_id)

    from app.services.prediction_service import get_latest_prediction
    pred = get_latest_prediction(db, cid)
    similar = find_similar_periods(db, cid, event_type)

    if not pred or "summary" not in pred:
        return {"error": "Tahmin bulunamadı", "campaign_id": cid}

    cur = pred["summary"]
    cur_roas = float(cur.get("predicted_roas", 0))
    cur_cpa  = float(cur.get("predicted_cpa", 0))
    cur_conv = float(cur.get("total_predicted_conversions", 0))

    if not similar:
        return {
            "campaign_id":        cid,
            "current_prediction": cur,
            "historical_average": None,
            "similar_periods":    [],
            "delta_vs_history":   None,
            "insight": f"Geçmişte '{event_type}' dönemine ait veri bulunamadı.",
        }

    hist_roas = sum(s["metrics"]["avg_roas"] for s in similar) / len(similar)
    hist_cpa  = sum(s["metrics"]["avg_cpa"]  for s in similar) / len(similar)
    hist_conv = sum(s["metrics"]["total_conversions"] for s in similar) / len(similar)

    ev_name = similar[0]["event_name"]
    is_under = cur_roas < hist_roas * 0.9

    roas_diff = round(cur_roas - hist_roas, 4)
    cpa_diff  = round(cur_cpa  - hist_cpa,  4)
    conv_diff_pct = round((cur_conv - hist_conv) / max(hist_conv, 0.01) * 100, 2)

    if is_under:
        insight = (
            f"Bu kampanya geçmiş {ev_name} döneminde ortalama ROAS {hist_roas:.2f}x yapmıştı, "
            f"şu an {cur_roas:.2f}x bekleniyor — performans riski var."
        )
    else:
        insight = (
            f"Geçmiş {ev_name} ortalaması ROAS {hist_roas:.2f}x, "
            f"mevcut tahmin {cur_roas:.2f}x — iyi seyirde."
        )

    return {
        "campaign_id": cid,
        "current_prediction": {
            "predicted_roas": cur_roas,
            "predicted_cpa":  cur_cpa,
            "predicted_conversions": cur_conv,
        },
        "historical_average": {
            "avg_roas": round(hist_roas, 4),
            "avg_cpa":  round(hist_cpa, 4),
            "avg_conversions": round(hist_conv, 2),
            "periods_found": len(similar),
        },
        "similar_periods": similar,
        "delta_vs_history": {
            "roas_diff":       roas_diff,
            "cpa_diff":        cpa_diff,
            "conv_diff_pct":   conv_diff_pct,
            "is_underperforming": is_under,
        },
        "insight": insight,
    }
