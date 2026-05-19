from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from app.models import User, UserRole, RolePermission, Permission

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        email: str = payload.get("sub")
        if not email:
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz token")

    user = db.query(User).filter_by(email=email, is_active=True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kullanıcı bulunamadı")
    return user


def require_permission(permission_code: str):
    def checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.is_superuser:
            return current_user
        has_perm = (
            db.query(RolePermission)
            .join(Permission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .filter(
                UserRole.user_id == current_user.id,
                Permission.code == permission_code,
            )
            .first()
        )
        if not has_perm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yetersiz yetki")
        return current_user
    return checker
