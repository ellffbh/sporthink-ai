import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class GA4ItemInteraction(Base):
    __tablename__ = "ga4_item_interactions_daily"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interaction_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    item_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    item_category2: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    item_brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    items_viewed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_added_to_cart: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_checked_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_purchased: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    item_revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    item_list_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    item_list_clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cart_to_view_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    product: Mapped[Optional["Product"]] = relationship("Product")
