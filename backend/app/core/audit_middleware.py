from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy.orm import Session
from app.database import SessionLocal
from sqlalchemy import text
import json


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

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
                    INSERT INTO audit_logs (id, user_id, action, resource, resource_id, ip_address, created_at)
                    VALUES (gen_random_uuid(), :user_id, :action, :resource, :resource_id, :ip, NOW())
                """), {
                    "user_id": user_id,
                    "action": request.method,
                    "resource": request.url.path,
                    "resource_id": None,
                    "ip": request.client.host if request.client else None
                })
                db.commit()
                db.close()
            except:
                pass

        return response