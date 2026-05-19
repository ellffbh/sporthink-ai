import uuid
import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Text, Boolean, Enum, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AnomalySeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(50), nullable=False)
    change_percent: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    severity: Mapped[AnomalySeverity] = mapped_column(Enum(AnomalySeverity), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="anomalies")

