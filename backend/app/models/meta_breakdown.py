import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Integer, BigInteger, Numeric, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class MetaAdBreakdown(Base):
    __tablename__ = "meta_ads_breakdowns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    breakdown_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    campaign_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    adset_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ad_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    publisher_platform: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    platform_position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    impression_device: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    impressions: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    spend: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    campaign: Mapped[Optional["Campaign"]] = relationship("Campaign")
