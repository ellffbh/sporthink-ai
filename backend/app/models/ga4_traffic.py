import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Date, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class GA4Traffic(Base):
    __tablename__ = "ga4_traffic_daily"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    traffic_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    session_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    session_medium: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    session_campaign_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_channel_group: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    landing_page: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    new_vs_returning: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bounce_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), nullable=True)
    avg_session_duration: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    pages_per_session: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)
    engaged_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engagement_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 4), nullable=True)
    user_engagement_duration: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    conversions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    purchase_revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    transactions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
