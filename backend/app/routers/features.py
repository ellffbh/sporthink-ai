from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.feature_service import (
    compute_campaign_features,
    compute_account_features,
    detect_event_type,
)

router = APIRouter(prefix="/api/features", tags=["features"])

# Basit in-memory cache: key → (timestamp, result)
_cache: dict = {}
_CACHE_TTL_SECONDS = 300  # 5 dk


def _cached(key: str, fn):
    now = datetime.utcnow().timestamp()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < _CACHE_TTL_SECONDS:
            return val
    result = fn()
    _cache[key] = (now, result)
    return result


# ---------------------------------------------------------------------------
# GET /api/campaigns/{campaign_id}/features
# (prefix /api/features değil, campaigns prefix'i altında)
# ---------------------------------------------------------------------------

campaigns_router = APIRouter(prefix="/api/campaigns", tags=["features"])


@campaigns_router.get("/{campaign_id}/features")
def get_campaign_features(
    campaign_id: str,
    end_date: Optional[date] = Query(default=None, description="YYYY-MM-DD, yoksa verinin son tarihi"),
    db: Session = Depends(get_db),
):
    """Kampanya feature vektörünü döner (trend, momentum, data quality, seasonality)."""
    cache_key = f"feat:{campaign_id}:{end_date}"
    try:
        return _cached(cache_key, lambda: compute_campaign_features(db, campaign_id, end_date))
    except Exception as e:
        return {"error": str(e), "campaign_id": campaign_id}


# ---------------------------------------------------------------------------
# GET /api/features/event/{date}
# ---------------------------------------------------------------------------

@router.get("/event/{event_date}")
def get_event_type(event_date: date):
    """Verilen tarih için Türkiye özel gün tespiti."""
    result = detect_event_type(event_date)
    return {
        "date": str(event_date),
        "event_type": result,
        "is_special_day": result is not None,
    }


# ---------------------------------------------------------------------------
# GET /api/features/account-summary
# ---------------------------------------------------------------------------

@router.get("/account-summary")
def get_account_summary(
    ad_account_id: str = Query(..., description="Ad account UUID"),
    db: Session = Depends(get_db),
):
    """Hesap genelinde kampanya dağılımı ve performans özeti."""
    cache_key = f"acct:{ad_account_id}"
    try:
        return _cached(cache_key, lambda: compute_account_features(db, ad_account_id))
    except Exception as e:
        return {"error": str(e), "ad_account_id": ad_account_id}
