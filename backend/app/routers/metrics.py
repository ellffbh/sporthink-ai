import csv
import io
import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from app.database import get_db
from app.models import AdMetricDaily, Campaign, User
from app.models.ad_metric import DeviceType
from app.core.deps import require_permission

router = APIRouter(prefix="/metrics", tags=["metrics"])

REQUIRED_COLS = {"campaign_id", "metric_date", "impressions", "clicks", "cost", "conversions", "conversion_value"}


@router.post("/import-csv", status_code=status.HTTP_200_OK)
def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("campaign.update")),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sadece .csv dosyası yüklenebilir")

    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    missing = REQUIRED_COLS - set(reader.fieldnames or [])
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV'de eksik sütunlar: {missing}")

    rows = []
    errors = []
    for i, row in enumerate(reader, start=2):
        try:
            campaign_id = uuid.UUID(row["campaign_id"].strip())
            if not db.query(Campaign).filter_by(id=campaign_id).first():
                errors.append(f"Satır {i}: campaign_id bulunamadı")
                continue

            device_raw = row.get("device", "").strip().lower() or None
            device = DeviceType(device_raw) if device_raw in DeviceType._value2member_map_ else None

            rows.append({
                "campaign_id": campaign_id,
                "metric_date": date.fromisoformat(row["metric_date"].strip()),
                "impressions": int(row["impressions"] or 0),
                "clicks": int(row["clicks"] or 0),
                "cost": Decimal(row["cost"] or 0),
                "conversions": Decimal(row["conversions"] or 0),
                "conversion_value": Decimal(row["conversion_value"] or 0),
                "device": device,
                "network": row.get("network", "").strip() or None,
            })
        except Exception as e:
            errors.append(f"Satır {i}: {e}")

    inserted = 0
    if rows:
        stmt = insert(AdMetricDaily).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_metric_campaign_date_device",
            set_={
                "impressions": stmt.excluded.impressions,
                "clicks": stmt.excluded.clicks,
                "cost": stmt.excluded.cost,
                "conversions": stmt.excluded.conversions,
                "conversion_value": stmt.excluded.conversion_value,
            },
        )
        db.execute(stmt)
        db.commit()
        inserted = len(rows)

    return {"inserted_or_updated": inserted, "errors": errors}
