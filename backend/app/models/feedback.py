import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class FeedbackStatus(str, enum.Enum):
    applied = "applied"
    ignored = "ignored"
    deferred = "deferred"


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recommendation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recommendations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    feedback_status: Mapped[FeedbackStatus] = mapped_column(Enum(FeedbackStatus), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    recommendation: Mapped["Recommendation"] = relationship("Recommendation", back_populates="feedbacks")

