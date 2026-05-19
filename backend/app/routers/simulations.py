from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.simulation_service import (
    get_event_for_date_range,
    get_upcoming_events,
    find_similar_periods,
    simulate_budget,
    compare_vs_similar_period,
)

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


class BudgetSimRequest(BaseModel):
    campaign_id: str
    new_daily_budget: float
    horizon_days: int = 7
    event_type: Optional[str] = None


@router.get("/events")
def events_in_range(
    start_date: date = Query(...),
    end_date: date   = Query(...),
):
    return get_event_for_date_range(start_date, end_date)


@router.get("/events/upcoming")
def upcoming_events(days: int = Query(default=30, ge=1, le=180)):
    return get_upcoming_events(days)


@router.post("/budget")
def budget_simulation(body: BudgetSimRequest, db: Session = Depends(get_db)):
    try:
        return simulate_budget(
            db,
            body.campaign_id,
            body.new_daily_budget,
            body.horizon_days,
            body.event_type,
        )
    except Exception as e:
        return {"error": str(e), "campaign_id": body.campaign_id}


@router.get("/campaign/{campaign_id}/similar-periods")
def similar_periods(
    campaign_id: str,
    event_type: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return find_similar_periods(db, campaign_id, event_type)
    except Exception as e:
        return {"error": str(e)}


@router.get("/campaign/{campaign_id}/vs-history")
def vs_history(
    campaign_id: str,
    event_type: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return compare_vs_similar_period(db, campaign_id, event_type)
    except Exception as e:
        return {"error": str(e)}
