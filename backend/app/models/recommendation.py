import uuid
import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional, Any, TYPE_CHECKING
from sqlalchemy import Text, Enum, ForeignKey, Numeric, func, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

# Pylance/VS Code uyarılarını gidermek için statik tip kontrolü
if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.prediction import ModelPrediction
    # Eğer feedback modelin farklı bir yerdeyse yolunu ona göre güncelle
    from app.models.feedback import RecommendationFeedback

class RecommendationAction(str, enum.Enum):
    increase = "increase"
    decrease = "decrease"
    hold = "hold"
    review = "review"

class RecommendationStatus(str, enum.Enum):
    pending = "pending"
    applied = "applied"
    ignored = "ignored"

class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    prediction_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("model_predictions.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[RecommendationAction] = mapped_column(Enum(RecommendationAction, name="recommendation_action_type", create_type=False), nullable=False)
    suggested_change_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    risk_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    status: Mapped[RecommendationStatus] = mapped_column(Enum(RecommendationStatus), default=RecommendationStatus.pending, nullable=False)
    
    # --- Yeni Eklenen Profesyonel Analiz Alanları ---
    metrics: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB, nullable=True)
    action_steps: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)
    expected_impact: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # -----------------------------------------------

    generated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    # İlişkiler
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="recommendations")
    prediction: Mapped[Optional["ModelPrediction"]] = relationship("ModelPrediction", back_populates="recommendations")
    feedbacks: Mapped[list["RecommendationFeedback"]] = relationship("RecommendationFeedback", back_populates="recommendation", cascade="all, delete-orphan")