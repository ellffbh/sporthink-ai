from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.models import User
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("/")
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Yetkisiz erişim")

    rows = db.execute(text("""
        SELECT id, user_id, action, entity_type, entity_id, ip_address, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 50
    """)).fetchall()

    return [
        {
            "id":          str(row.id),
            "user_id":     str(row.user_id) if row.user_id else None,
            "action":      row.action,
            "entity_type": row.entity_type,
            "entity_id":   str(row.entity_id) if row.entity_id else None,
            "ip_address":  row.ip_address,
            "created_at":  str(row.created_at),
        }
        for row in rows
    ]
