from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy.orm import Session
from app.database import SessionLocal
from sqlalchemy import text
import json
import logging

logger = logging.getLogger(__name__)


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        method = request.method
        path   = request.url.path
        ip     = request.client.host if request.client else "-"
        status = response.status_code

        if status == 401:
            logger.warning(f"Unauthorized: {method} {path} from {ip}")
        elif status == 403:
            logger.warning(f"Forbidden: {method} {path} from {ip}")
        elif status == 429:
            logger.warning(f"Rate limit exceeded: {method} {path} from {ip}")

        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            try:
                db: Session = SessionLocal()
                
                user_id = None
                auth = request.headers.get("authorization", "")
                if auth.startswith("Bearer "):
                    try:
                        from app.core.security import decode_token
                        token = auth.split(" ")[1]
                        payload = decode_token(token)
                        user_id = payload.get("sub")
                    except:
                        pass

                db.execute(text("""
                    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, ip_address, created_at)
                    VALUES (gen_random_uuid(), :user_id, :action, :entity_type, :entity_id, :ip, NOW())
                """), {
                    "user_id": user_id,
                    "action": request.method,
                    "entity_type": request.url.path,
                    "entity_id": None,
                    "ip": request.client.host if request.client else None
                })
                db.commit()
                db.close()
            except:
                pass

        return response