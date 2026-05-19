import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Integer, Numeric, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_order_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    order_date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    channel: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    medium: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    campaign_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    coupon_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    product_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    order_revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    net_revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    order_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    customer: Mapped[Optional["Customer"]] = relationship("Customer", back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
