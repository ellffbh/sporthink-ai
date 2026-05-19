import uuid
import enum
from datetime import date, datetime
from typing import Optional
from decimal import Decimal
from sqlalchemy import String, Enum, ForeignKey, Numeric, Date, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class CampaignType(str, enum.Enum):
    search = "search"
    pmax = "pmax"
    display = "display"
    video = "video"
    shopping = "shopping"
    awareness = "awareness"
    sales = "sales"
    retargeting = "retargeting"
    traffic = "traffic"
    engagement = "engagement"
    reach = "reach"
    performance_max = "performance_max"


class CampaignStatus(str, enum.Enum):
    enabled = "enabled"
    paused = "paused"
    removed = "removed"
    completed = "completed"
    scheduled = "scheduled"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ad_accounts.id", ondelete="CASCADE"), nullable=False)
    external_campaign_id: Mapped[str] = mapped_column(String(100), nullable=False)
    campaign_name: Mapped[str] = mapped_column(String(255), nullable=False)
    campaign_type: Mapped[CampaignType] = mapped_column(Enum(CampaignType, name="campaigntype"), nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(Enum(CampaignStatus, name="campaignstatus"), nullable=False, default=CampaignStatus.enabled)
    bidding_strategy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    daily_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    # yeni alanlar
    objective: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    target_audience: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    ad_account: Mapped["AdAccount"] = relationship("AdAccount", back_populates="campaigns")
    metrics: Mapped[list["AdMetricDaily"]] = relationship("AdMetricDaily", back_populates="campaign", cascade="all, delete-orphan")
    predictions: Mapped[list["ModelPrediction"]] = relationship("ModelPrediction", back_populates="campaign", cascade="all, delete-orphan")
    recommendations: Mapped[list["Recommendation"]] = relationship("Recommendation", back_populates="campaign", cascade="all, delete-orphan")
    anomalies: Mapped[list["Anomaly"]] = relationship("Anomaly", back_populates="campaign", cascade="all, delete-orphan")
    meta_breakdowns: Mapped[list["MetaAdBreakdown"]] = relationship("MetaAdBreakdown", back_populates="campaign", cascade="all, delete-orphan")
