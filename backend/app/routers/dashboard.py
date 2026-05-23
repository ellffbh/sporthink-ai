from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import date, timedelta
from app.database import get_db
from app.models.ad_metric import AdMetricDaily

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def get_date_range(db: Session, days: int):
    max_date = db.query(func.max(AdMetricDaily.metric_date)).scalar()
    if not max_date:
        max_date = date.today()
    start = max_date - timedelta(days=days)
    return start, max_date, start


@router.get("/overview")
def get_overview(
    days:       int            = Query(default=7),
    start_date: Optional[date] = Query(default=None),
    end_date:   Optional[date] = Query(default=None),
    db:         Session        = Depends(get_db),
):
    if start_date and end_date:
        start, end, trend_start = start_date, end_date, start_date
    else:
        start, end, trend_start = get_date_range(db, days)

    kpi = db.execute(text("""
        SELECT
            COALESCE(SUM(cost), 0) as total_spend,
            COALESCE(SUM(conversions), 0) as total_conversions,
            COALESCE(SUM(impressions), 0) as total_impressions,
            COALESCE(SUM(clicks), 0) as total_clicks,
            CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(conversion_value) / SUM(cost), 2) ELSE 0 END as avg_roas,
            CASE WHEN SUM(conversions) > 0 THEN ROUND(SUM(cost) / SUM(conversions), 2) ELSE 0 END as avg_cpa,
            CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::numeric / SUM(impressions), 4) ELSE 0 END as avg_ctr
        FROM ad_metrics_daily
        WHERE metric_date BETWEEN :start AND :end
    """), {"start": start, "end": end}).fetchone()

    period_length = (end - start).days
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_length)

    prev_kpi = db.execute(text("""
        SELECT
            COALESCE(SUM(cost), 0) as total_spend,
            COALESCE(SUM(conversions), 0) as total_conversions,
            CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(conversion_value) / SUM(cost), 2) ELSE 0 END as avg_roas,
            CASE WHEN SUM(conversions) > 0 THEN ROUND(SUM(cost) / SUM(conversions), 2) ELSE 0 END as avg_cpa
        FROM ad_metrics_daily
        WHERE metric_date BETWEEN :start AND :end
    """), {"start": prev_start, "end": prev_end}).fetchone()

    def pct_change(current: float, previous: float) -> float:
        if previous == 0:
            return 0.0
        return round((current - previous) / previous * 100, 2)

    active_campaigns = db.execute(text("""
        SELECT COUNT(*) FROM campaigns WHERE status = 'enabled'
    """)).scalar()

    trend = db.execute(text("""
        SELECT metric_date, SUM(cost) as spend, SUM(conversions) as conversions,
               SUM(impressions) as impressions, SUM(clicks) as clicks,
               SUM(conversion_value) as conversion_value
        FROM ad_metrics_daily
        WHERE metric_date BETWEEN :start AND :end
        GROUP BY metric_date
        ORDER BY metric_date
    """), {"start": trend_start, "end": end}).fetchall()

    # Google vs Meta karşılaştırma
    platform = db.execute(text("""
        SELECT
            aa.platform,
            SUM(m.cost) as spend,
            SUM(m.conversions) as conversions,
            SUM(m.impressions) as impressions,
            CASE WHEN SUM(m.cost) > 0 THEN ROUND(SUM(m.conversion_value) / SUM(m.cost), 2) ELSE 0 END as roas
        FROM ad_metrics_daily m
        JOIN campaigns c ON c.id = m.campaign_id
        JOIN ad_accounts aa ON aa.id = c.ad_account_id
        WHERE m.metric_date BETWEEN :start AND :end
        GROUP BY aa.platform
    """), {"start": start, "end": end}).fetchall()

    # En iyi 5 kampanya (ROAS'a göre)
    top_campaigns = db.execute(text("""
        SELECT
            c.campaign_name,
            a.platform,
            SUM(m.cost) as spend,
            SUM(m.conversions) as conversions,
            CASE WHEN SUM(m.cost) > 0 THEN ROUND(SUM(m.conversion_value) / SUM(m.cost), 2) ELSE 0 END as roas,
            CASE WHEN SUM(m.conversions) > 0 THEN ROUND(SUM(m.cost) / SUM(m.conversions), 2) ELSE 0 END as cpa
        FROM ad_metrics_daily m
        JOIN campaigns c ON c.id = m.campaign_id
        JOIN ad_accounts a ON a.id = c.ad_account_id
        WHERE m.metric_date BETWEEN :start AND :end
        GROUP BY c.id, c.campaign_name, a.platform
        ORDER BY roas DESC
        LIMIT 5
    """), {"start": start, "end": end}).fetchall()

    # Anomali ve öneri sayıları
    anomaly_count = db.execute(text("SELECT COUNT(*) FROM anomalies")).scalar()
    pending_recs = db.execute(text("SELECT COUNT(*) FROM recommendations WHERE status = 'pending'")).scalar()

    return {
        "kpis": {
            "total_spend": float(kpi.total_spend),
            "total_conversions": float(kpi.total_conversions),
            "total_impressions": int(kpi.total_impressions),
            "total_clicks": int(kpi.total_clicks),
            "avg_roas": float(kpi.avg_roas),
            "avg_cpa": float(kpi.avg_cpa),
            "avg_ctr": float(kpi.avg_ctr),
            "active_campaigns": active_campaigns,
            "anomaly_count": anomaly_count,
            "pending_recommendations": pending_recs,
            "spend_change": pct_change(float(kpi.total_spend), float(prev_kpi.total_spend)),
            "roas_change": pct_change(float(kpi.avg_roas), float(prev_kpi.avg_roas)),
            "conversions_change": pct_change(float(kpi.total_conversions), float(prev_kpi.total_conversions)),
            "cpa_change": pct_change(float(kpi.avg_cpa), float(prev_kpi.avg_cpa)),
        },
        "weekly_trend": [
            {
                "date": str(r.metric_date),
                "spend": float(r.spend),
                "conversions": float(r.conversions),
                "impressions": int(r.impressions),
                "clicks": int(r.clicks),
                "conversion_value": float(r.conversion_value)
            }
            for r in trend
        ],
        "platform_comparison": [
            {
                "platform": r.platform,
                "spend": float(r.spend),
                "conversions": float(r.conversions),
                "impressions": int(r.impressions),
                "roas": float(r.roas)
            }
            for r in platform
        ],
        "top_campaigns": [
            {
                "campaign_name": r.campaign_name,
                "platform": r.platform,
                "spend": float(r.spend),
                "conversions": float(r.conversions),
                "roas": float(r.roas),
                "cpa": float(r.cpa)
            }
            for r in top_campaigns
        ]
    }