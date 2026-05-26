from __future__ import annotations
import uuid
from typing import Optional
from pydantic import BaseModel
from app.models.ad_account import AdPlatform


class AdAccountCreate(BaseModel):
    model_config = {"use_enum_values": True}
    platform: AdPlatform
    account_name: str
    external_account_id: str
    credentials: str  # ham metin, backend şifreler


class AdAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    is_active: Optional[bool] = None


class AdAccountResponse(BaseModel):
    id: uuid.UUID
    platform: AdPlatform
    account_name: str
    external_account_id: str
    is_active: bool

    model_config = {"from_attributes": True}
