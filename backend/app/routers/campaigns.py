import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.models import Campaign, AdAccount, User
from app.core.deps import get_current_user, require_permission
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def _get_campaign_or_404(campaign_id: uuid.UUID, db: Session) -> Campaign:
    c = db.query(Campaign).filter_by(id=campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    return c


@router.get("", response_model=list[CampaignResponse])
def list_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.read")),
):
    if current_user.is_superuser:
        return db.query(Campaign).limit(100).all()
    account_ids = [a.id for a in db.query(AdAccount).filter_by(user_id=current_user.id).all()]
    return db.query(Campaign).filter(Campaign.ad_account_id.in_(account_ids)).limit(100).all()


@router.get("/summary")
def get_campaigns_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.execute(text("""
        WITH base AS (
            SELECT MAX(metric_date) AS max_date FROM ad_metrics_daily
        ),
        current_period AS (
            SELECT
                COALESCE(SUM(cost), 0)             AS spend,
                COALESCE(SUM(conversion_value), 0) AS revenue,
                COALESCE(SUM(conversions), 0)      AS conversions,
                CASE WHEN SUM(cost) > 0
                     THEN ROUND(SUM(conversion_value) / SUM(cost), 2)
                     ELSE 0 END                    AS roas
            FROM ad_metrics_daily, base
            WHERE metric_date > max_date - INTERVAL '7 days'
              AND metric_date <= max_date
        ),
        prev_period AS (
            SELECT
                COALESCE(SUM(cost), 0)             AS spend,
                COALESCE(SUM(conversion_value), 0) AS revenue,
                COALESCE(SUM(conversions), 0)      AS conversions,
                CASE WHEN SUM(cost) > 0
                     THEN ROUND(SUM(conversion_value) / SUM(cost), 2)
                     ELSE 0 END                    AS roas
            FROM ad_metrics_daily, base
            WHERE metric_date > max_date - INTERVAL '14 days'
              AND metric_date <= max_date - INTERVAL '7 days'
        )
        SELECT
            c.spend, c.revenue, c.conversions, c.roas,
            p.spend  AS prev_spend,
            p.revenue AS prev_revenue,
            p.conversions AS prev_conversions,
            p.roas   AS prev_roas
        FROM current_period c, prev_period p
    """)).fetchone()

    def pct(cur: float, prev: float) -> float:
        if prev == 0:
            return 0.0
        return round((cur - prev) / prev * 100, 2)

    return {
        "total_spend":        round(float(row.spend), 2),
        "total_revenue":      round(float(row.revenue), 2),
        "total_conversions":  round(float(row.conversions), 2),
        "avg_roas":           round(float(row.roas), 2),
        "spend_change":       pct(float(row.spend),       float(row.prev_spend)),
        "revenue_change":     pct(float(row.revenue),     float(row.prev_revenue)),
        "conversions_change": pct(float(row.conversions), float(row.prev_conversions)),
        "roas_change":        pct(float(row.roas),        float(row.prev_roas)),
    }


@router.get("/{campaign_id}/metrics-summary")
def get_campaign_metrics_summary(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.read")),
):
    result = db.execute(text("""
        WITH latest AS (
            SELECT MAX(metric_date) AS max_date
            FROM ad_metrics_daily
            WHERE campaign_id = :cid
        ),
        main_metrics AS (
            SELECT
                COALESCE(SUM(cost), 0)             AS total_spend,
                COALESCE(SUM(conversion_value), 0) AS total_revenue,
                COALESCE(SUM(conversions), 0)      AS total_conversions,
                COALESCE(SUM(impressions), 0)      AS total_impressions,
                COALESCE(SUM(clicks), 0)           AS total_clicks,
                CASE WHEN SUM(cost) > 0
                     THEN ROUND(SUM(conversion_value) / SUM(cost), 2)    ELSE 0    END AS roas,
                CASE WHEN SUM(conversions) > 0
                     THEN ROUND(SUM(cost) / SUM(conversions), 2)          ELSE NULL END AS cpa,
                CASE WHEN SUM(impressions) > 0
                     THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 2) ELSE 0 END AS ctr
            FROM ad_metrics_daily, latest
            WHERE campaign_id = :cid
              AND metric_date >= latest.max_date - INTERVAL '90 days'
        ),
        roas_7d AS (
            SELECT CASE WHEN SUM(cost) > 0
                        THEN SUM(conversion_value) / SUM(cost)
                        ELSE NULL END AS roas
            FROM ad_metrics_daily, latest
            WHERE campaign_id = :cid
              AND metric_date >= latest.max_date - INTERVAL '6 days'
        ),
        roas_prev_7d AS (
            SELECT CASE WHEN SUM(cost) > 0
                        THEN SUM(conversion_value) / SUM(cost)
                        ELSE NULL END AS roas
            FROM ad_metrics_daily, latest
            WHERE campaign_id = :cid
              AND metric_date BETWEEN latest.max_date - INTERVAL '13 days'
                                  AND latest.max_date - INTERVAL '7 days'
        )
        SELECT
            m.*,
            ROUND(
                (r7.roas - rp.roas) / NULLIF(rp.roas, 0) * 100,
                1
            ) AS roas_change_7d
        FROM main_metrics m, roas_7d r7, roas_prev_7d rp
    """), {"cid": str(campaign_id)}).fetchone()

    return {
        "total_cost":        float(result.total_spend),
        "total_revenue":     float(result.total_revenue),
        "total_conversions": float(result.total_conversions),
        "total_impressions": int(result.total_impressions),
        "total_clicks":      int(result.total_clicks),
        "roas":              float(result.roas),
        "cpa":               float(result.cpa) if result.cpa is not None else None,
        "ctr":               float(result.ctr),
        "roas_change_7d":    float(result.roas_change_7d) if result.roas_change_7d is not None else None,
    }


@router.get("/{campaign_id}/metrics")
def get_campaign_daily_metrics(
    campaign_id: uuid.UUID,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.read")),
):
    rows = db.execute(text("""
        WITH latest AS (
            SELECT MAX(metric_date) AS max_date
            FROM ad_metrics_daily
            WHERE campaign_id = :cid
        )
        SELECT
            metric_date::text AS date,
            COALESCE(SUM(cost), 0) AS cost,
            COALESCE(SUM(conversions), 0) AS conversions,
            CASE WHEN SUM(cost) > 0
                 THEN ROUND(SUM(conversion_value) / SUM(cost), 2)
                 ELSE 0 END AS roas
        FROM ad_metrics_daily, latest
        WHERE campaign_id = :cid
          AND metric_date >= latest.max_date - (:days * INTERVAL '1 day')
        GROUP BY metric_date
        ORDER BY metric_date ASC
    """), {"cid": str(campaign_id), "days": days}).fetchall()

    return [
        {
            "date": r.date,
            "cost": float(r.cost),
            "conversions": float(r.conversions),
            "roas": float(r.roas),
        }
        for r in rows
    ]


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.read")),
):
    return _get_campaign_or_404(campaign_id, db)


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.create")),
):
    account = db.query(AdAccount).filter_by(id=body.ad_account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Reklam hesabı bulunamadı")
    campaign = Campaign(**body.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.put("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: uuid.UUID,
    body: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.update")),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(campaign, field, value)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.delete")),
):
    campaign = _get_campaign_or_404(campaign_id, db)
    db.delete(campaign)
    db.commit()