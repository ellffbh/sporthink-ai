import uuid
import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import Integer, BigInteger, Date, Enum, ForeignKey, Numeric, String, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class DeviceType(str, enum.Enum):
    mobile = "mobile"
    desktop = "desktop"
    tablet = "tablet"


class AdMetricDaily(Base):
    __tablename__ = "ad_metrics_daily"
    __table_args__ = (
        UniqueConstraint("campaign_id", "metric_date", "device", name="uq_metric_campaign_date_device"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    metric_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    impressions: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    conversions: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    device: Mapped[Optional[DeviceType]] = mapped_column(Enum(DeviceType), nullable=True)
    network: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Meta için
    reach: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)
    frequency: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    # hesaplanmış metrikler
    ctr: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), nullable=True)
    cpc: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    cpm: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    # platform raw data
    actions_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    segment_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    external_campaign_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="metrics")
