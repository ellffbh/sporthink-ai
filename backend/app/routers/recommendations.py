from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.services.recommendation_engine import generate_recommendations

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.post("/generate")
def generate(db: Session = Depends(get_db)):
    results = generate_recommendations(db)
    return {"generated": len(results), "recommendations": results}


@router.get("/")
def list_recommendations(
    campaign_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    where = "WHERE r.campaign_id = :campaign_id" if campaign_id else ""
    rows = db.execute(text(f"""
        SELECT r.id, r.campaign_id, c.campaign_name, r.action,
               r.reason, r.risk_score, r.suggested_change_percent,
               r.status, r.generated_at
        FROM recommendations r
        JOIN campaigns c ON c.id = r.campaign_id
        {where}
        ORDER BY r.generated_at DESC
        LIMIT 100
    """), {"campaign_id": campaign_id} if campaign_id else {}).fetchall()

    return [
        {
            "id": str(row.id),
            "campaign_id": str(row.campaign_id),
            "campaign_name": row.campaign_name,
            "action": row.action,
            "reason": row.reason,
            "risk_score": float(row.risk_score or 0),
            "change_percent": float(row.suggested_change_percent or 0) if row.suggested_change_percent else None,
            "status": "ignored" if row.status == "dismissed" else row.status,
            "generated_at": str(row.generated_at),
        }
        for row in rows
    ]


VALID_STATUSES = {"pending", "accepted", "rejected", "applied", "dismissed"}

# "ignored" is the API-level alias for the DB enum value "dismissed"
_STATUS_TO_DB = {"ignored": "dismissed"}


@router.put("/{rec_id}")
def update_recommendation_status(
    rec_id: str,
    status: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    db_status = _STATUS_TO_DB.get(status, status)
    if db_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Geçersiz durum: {status}")
    result = db.execute(
        text("UPDATE recommendations SET status = :status WHERE id = :id"),
        {"status": db_status, "id": rec_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Öneri bulunamadı")
    db.commit()
    return {"id": rec_id, "status": status}


@router.patch("/{rec_id}/status")
def patch_recommendation_status(
    rec_id: str,
    status: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    db_status = _STATUS_TO_DB.get(status, status)
    if db_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Geçersiz durum: {status}")
    result = db.execute(
        text("UPDATE recommendations SET status = :status WHERE id = :id"),
        {"status": db_status, "id": rec_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Öneri bulunamadı")
    db.commit()
    return {"id": rec_id, "status": status}