"""rebuild 5 tables to match CSV import schema

Revision ID: c8f2a9d14b73
Revises: 71373059747c
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c8f2a9d14b73'
down_revision: Union[str, Sequence[str], None] = '71373059747c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Drop old tables in dependency order ---
    op.drop_index('ix_meta_ad_breakdowns_breakdown_date', table_name='meta_ad_breakdowns')
    op.drop_table('meta_ad_breakdowns')

    op.drop_table('order_items')

    op.drop_index('ix_orders_order_number', table_name='orders')
    op.drop_table('orders')

    op.drop_index('ix_ga4_item_interactions_item_id', table_name='ga4_item_interactions')
    op.drop_index('ix_ga4_item_interactions_interaction_date', table_name='ga4_item_interactions')
    op.drop_table('ga4_item_interactions')

    op.drop_index('ix_ga4_traffic_traffic_date', table_name='ga4_traffic')
    op.drop_table('ga4_traffic')

    # --- Create new orders ---
    op.create_table(
        'orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_order_id', sa.String(length=50), nullable=False),
        sa.Column('customer_id', sa.UUID(), nullable=True),
        sa.Column('order_date', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('device', sa.String(length=50), nullable=True),
        sa.Column('channel', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=100), nullable=True),
        sa.Column('medium', sa.String(length=100), nullable=True),
        sa.Column('campaign_name', sa.String(length=255), nullable=True),
        sa.Column('coupon_code', sa.String(length=100), nullable=True),
        sa.Column('product_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('order_revenue', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('shipping_cost', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('discount_amount', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('refund_amount', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('net_revenue', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('order_status', sa.String(length=50), nullable=True),
        sa.Column('payment_method', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_orders_external_order_id'), 'orders', ['external_order_id'], unique=True)

    # --- Create new order_items ---
    op.create_table(
        'order_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('order_id', sa.UUID(), nullable=False),
        sa.Column('line_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=True),
        sa.Column('item_id', sa.String(length=100), nullable=True),
        sa.Column('item_name', sa.String(length=255), nullable=True),
        sa.Column('item_category', sa.String(length=100), nullable=True),
        sa.Column('item_category2', sa.String(length=100), nullable=True),
        sa.Column('item_brand', sa.String(length=100), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('line_total', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('refund_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_order_items_order_line', 'order_items', ['order_id', 'line_id'], unique=False)

    # --- Create ga4_traffic_daily ---
    op.create_table(
        'ga4_traffic_daily',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('traffic_date', sa.Date(), nullable=False),
        sa.Column('session_source', sa.String(length=100), nullable=True),
        sa.Column('session_medium', sa.String(length=100), nullable=True),
        sa.Column('session_campaign_name', sa.String(length=255), nullable=True),
        sa.Column('default_channel_group', sa.String(length=100), nullable=True),
        sa.Column('device_category', sa.String(length=50), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('landing_page', sa.String(length=500), nullable=True),
        sa.Column('new_vs_returning', sa.String(length=20), nullable=True),
        sa.Column('sessions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('new_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bounce_rate', sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column('avg_session_duration', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('pages_per_session', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('engaged_sessions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('engagement_rate', sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column('user_engagement_duration', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('conversions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('purchase_revenue', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('transactions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ga4_traffic_daily_traffic_date'), 'ga4_traffic_daily', ['traffic_date'], unique=False)

    # --- Create ga4_item_interactions_daily ---
    op.create_table(
        'ga4_item_interactions_daily',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('interaction_date', sa.Date(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=True),
        sa.Column('item_id', sa.String(length=100), nullable=True),
        sa.Column('item_name', sa.String(length=255), nullable=True),
        sa.Column('item_category', sa.String(length=100), nullable=True),
        sa.Column('item_category2', sa.String(length=100), nullable=True),
        sa.Column('item_brand', sa.String(length=100), nullable=True),
        sa.Column('items_viewed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('items_added_to_cart', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('items_checked_out', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('items_purchased', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('item_revenue', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('item_list_views', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('item_list_clicks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cart_to_view_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ga4_item_interactions_daily_interaction_date'), 'ga4_item_interactions_daily', ['interaction_date'], unique=False)
    op.create_index(op.f('ix_ga4_item_interactions_daily_item_id'), 'ga4_item_interactions_daily', ['item_id'], unique=False)

    # --- Create meta_ads_breakdowns ---
    op.create_table(
        'meta_ads_breakdowns',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('campaign_id', sa.UUID(), nullable=True),
        sa.Column('breakdown_date', sa.Date(), nullable=False),
        sa.Column('campaign_name', sa.String(length=255), nullable=True),
        sa.Column('adset_name', sa.String(length=255), nullable=True),
        sa.Column('ad_name', sa.String(length=255), nullable=True),
        sa.Column('publisher_platform', sa.String(length=100), nullable=True),
        sa.Column('platform_position', sa.String(length=100), nullable=True),
        sa.Column('impression_device', sa.String(length=100), nullable=True),
        sa.Column('impressions', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('clicks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('spend', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_meta_ads_breakdowns_breakdown_date'), 'meta_ads_breakdowns', ['breakdown_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_meta_ads_breakdowns_breakdown_date'), table_name='meta_ads_breakdowns')
    op.drop_table('meta_ads_breakdowns')

    op.drop_index(op.f('ix_ga4_item_interactions_daily_item_id'), table_name='ga4_item_interactions_daily')
    op.drop_index(op.f('ix_ga4_item_interactions_daily_interaction_date'), table_name='ga4_item_interactions_daily')
    op.drop_table('ga4_item_interactions_daily')

    op.drop_index(op.f('ix_ga4_traffic_daily_traffic_date'), table_name='ga4_traffic_daily')
    op.drop_table('ga4_traffic_daily')

    op.drop_index('ix_order_items_order_line', table_name='order_items')
    op.drop_table('order_items')

    op.drop_index(op.f('ix_orders_external_order_id'), table_name='orders')
    op.drop_table('orders')

    # Restore old tables (abbreviated - use previous migration for full restore)
    op.create_table(
        'ga4_traffic',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('traffic_date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=100), nullable=False),
        sa.Column('medium', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'ga4_item_interactions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('interaction_date', sa.Date(), nullable=False),
        sa.Column('item_id', sa.String(length=100), nullable=False),
        sa.Column('item_name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'orders',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('customer_id', sa.UUID(), nullable=False),
        sa.Column('order_number', sa.String(length=50), nullable=False),
        sa.Column('order_date', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('final_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'order_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('order_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('line_total', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'meta_ad_breakdowns',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('campaign_id', sa.UUID(), nullable=False),
        sa.Column('breakdown_date', sa.Date(), nullable=False),
        sa.Column('breakdown_type', sa.String(length=50), nullable=False),
        sa.Column('breakdown_value', sa.String(length=255), nullable=False),
        sa.Column('impressions', sa.BigInteger(), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=False),
        sa.Column('spend', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
