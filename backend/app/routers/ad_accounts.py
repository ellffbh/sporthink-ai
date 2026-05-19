import uuid
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models import AdAccount, User
from app.core.deps import get_current_user, require_permission
from app.schemas.ad_account import AdAccountCreate, AdAccountUpdate, AdAccountResponse

router = APIRouter(prefix="/ad-accounts", tags=["ad-accounts"])


def _get_fernet() -> Fernet:
    import base64, hashlib
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def _get_account_or_404(account_id: uuid.UUID, db: Session) -> AdAccount:
    a = db.query(AdAccount).filter_by(id=account_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Reklam hesabı bulunamadı")
    return a


@router.get("", response_model=list[AdAccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ad_account.read")),
):
    if current_user.is_superuser:
        return db.query(AdAccount).limit(100).all()
    return db.query(AdAccount).filter_by(user_id=current_user.id).limit(100).all()


@router.post("", response_model=AdAccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AdAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ad_account.create")),
):
    f = _get_fernet()
    encrypted = f.encrypt(body.credentials.encode()).decode()
    account = AdAccount(
        user_id=current_user.id,
        platform=body.platform,
        account_name=body.account_name,
        external_account_id=body.external_account_id,
        encrypted_credentials=encrypted,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/{account_id}", response_model=AdAccountResponse)
def update_account(
    account_id: uuid.UUID,
    body: AdAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ad_account.update")),
):
    account = _get_account_or_404(account_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ad_account.delete")),
):
    account = _get_account_or_404(account_id, db)
    db.delete(account)
    db.commit()
