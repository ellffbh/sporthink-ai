import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import Integer, String, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class ModelPrediction(Base):
    __tablename__ = "model_predictions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    prediction_horizon_days: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_conversions: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    predicted_conversion_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    predicted_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    predictions_detail: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="predictions")
    recommendations: Mapped[list["Recommendation"]] = relationship("Recommendation", back_populates="prediction")

