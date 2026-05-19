import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AdPlatform(str, enum.Enum):
    google_ads = "google_ads"
    meta_ads = "meta_ads"


class AdAccount(Base):
    __tablename__ = "ad_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[AdPlatform] = mapped_column(Enum(AdPlatform), nullable=False)
    account_name: Mapped[str] = mapped_column(String(200), nullable=False)
    external_account_id: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_credentials: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="ad_accounts")
    campaigns: Mapped[list["Campaign"]] = relationship("Campaign", back_populates="ad_account", cascade="all, delete-orphan")

