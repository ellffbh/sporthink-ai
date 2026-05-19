import time
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.services.prediction_service import (
    train_and_predict,
    train_and_predict_all,
    get_latest_prediction,
)

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.post("/generate/{campaign_id}")
def generate_for_campaign(
    campaign_id: str,
    horizon_days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Tek kampanya için tahmin üret ve kaydet."""
    try:
        return train_and_predict(db, campaign_id, horizon_days)
    except Exception as e:
        return {"error": str(e), "campaign_id": campaign_id}


@router.post("/generate-all")
def generate_for_all(
    horizon_days: int = Query(default=7, ge=1, le=30),
    ad_account_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Tüm aktif kampanyalar için tahmin üret."""
    t0 = time.time()
    total = train_and_predict_all(db, ad_account_id)
    return {
        "total_predictions": total,
        "duration_seconds": round(time.time() - t0, 2),
    }


@router.get("/campaign/{campaign_id}/latest")
def get_latest(campaign_id: str, db: Session = Depends(get_db)):
    """En son tahmini döndür."""
    pred = get_latest_prediction(db, campaign_id)
    if not pred:
        return {"error": "Tahmin bulunamadı", "campaign_id": campaign_id}
    return pred


@router.get("/campaign/{campaign_id}/history")
def get_history(
    campaign_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Tahmin geçmişi."""
    rows = db.execute(text("""
        SELECT id::text, model_version, confidence_score,
               predicted_cost, predicted_conversions, predicted_conversion_value,
               prediction_horizon_days, generated_at
        FROM model_predictions
        WHERE campaign_id = :cid
        ORDER BY generated_at DESC
        LIMIT :lim
    """), {"cid": str(campaign_id), "lim": limit}).fetchall()

    return [
        {
            "id":                str(r.id),
            "model_version":     r.model_version,
            "confidence_score":  float(r.confidence_score or 0),
            "predicted_cost":    float(r.predicted_cost or 0),
            "predicted_conversions": float(r.predicted_conversions or 0),
            "predicted_revenue": float(r.predicted_conversion_value or 0),
            "horizon_days":      r.prediction_horizon_days,
            "generated_at":      str(r.generated_at),
        }
        for r in rows
    ]


@router.get("/dashboard-summary")
def dashboard_summary(db: Session = Depends(get_db)):
    """Tüm kampanyaların tahmin özeti — dashboard için."""
    rows = db.execute(text("""
        SELECT DISTINCT ON (mp.campaign_id)
            mp.campaign_id::text,
            c.campaign_name,
            mp.predicted_cost,
            mp.predicted_conversions,
            mp.predicted_conversion_value,
            mp.confidence_score,
            mp.model_version,
            mp.generated_at
        FROM model_predictions mp
        JOIN campaigns c ON c.id = mp.campaign_id
        WHERE mp.predictions_detail IS NOT NULL
        ORDER BY mp.campaign_id, mp.generated_at DESC
    """)).fetchall()

    if not rows:
        return {
            "total_campaigns": 0,
            "campaigns_with_prediction": 0,
            "next_7d_total_predicted_cost": 0.0,
            "next_7d_total_predicted_revenue": 0.0,
            "next_7d_total_predicted_conversions": 0,
            "predicted_roas": 0.0,
            "best_performing_campaigns": [],
            "at_risk_campaigns": [],
        }

    total_cost  = sum(float(r.predicted_cost or 0)  for r in rows)
    total_rev   = sum(float(r.predicted_conversion_value or 0) for r in rows)
    total_conv  = sum(float(r.predicted_conversions or 0) for r in rows)
    pred_roas   = round(total_rev / total_cost, 2) if total_cost > 0 else 0.0

    campaign_list = [
        {
            "campaign_id":   r.campaign_id,
            "campaign_name": r.campaign_name,
            "predicted_cost":    float(r.predicted_cost or 0),
            "predicted_revenue": float(r.predicted_conversion_value or 0),
            "predicted_conversions": float(r.predicted_conversions or 0),
            "confidence_score": float(r.confidence_score or 0),
            "predicted_roas": round(
                float(r.predicted_conversion_value or 0) / float(r.predicted_cost or 1), 2
            ) if float(r.predicted_cost or 0) > 0 else 0.0,
        }
        for r in rows
    ]

    best = sorted(campaign_list, key=lambda x: x["predicted_roas"], reverse=True)[:3]
    at_risk = sorted(campaign_list, key=lambda x: x["predicted_roas"])[:3]

    total_campaigns = db.execute(text("SELECT COUNT(*) FROM campaigns WHERE status != 'removed'")).scalar()

    return {
        "total_campaigns":                  int(total_campaigns or 0),
        "campaigns_with_prediction":        len(rows),
        "next_7d_total_predicted_cost":     round(total_cost, 2),
        "next_7d_total_predicted_revenue":  round(total_rev, 2),
        "next_7d_total_predicted_conversions": round(total_conv, 0),
        "predicted_roas":                   pred_roas,
        "best_performing_campaigns":        best,
        "at_risk_campaigns":                at_risk,
    }


# -- Eski endpoint (geriye uyumluluk) ------------------------------------
@router.get("/{campaign_id}")
def get_prediction_legacy(campaign_id: str, db: Session = Depends(get_db)):
    """Eski format için geriye uyumluluk."""
    pred = get_latest_prediction(db, campaign_id)
    if not pred or "error" in pred:
        return {"error": "Tahmin bulunamadı", "campaign_id": campaign_id}
    return pred
