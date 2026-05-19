import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_customer_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    first_seen_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")
