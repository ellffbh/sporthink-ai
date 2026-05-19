"""
CSV import script — idempotent, tekrar çalıştırılabilir.
Çalıştır: python scripts/import_csv_data.py
Kök dizin: backend/
"""
import sys
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from datetime import datetime, date

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.database import engine

DATA_DIR = Path(__file__).parent.parent.parent / "data"


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def to_decimal(val, default=Decimal("0")):
    if val is None:
        return default
    try:
        if isinstance(val, float) and pd.isna(val):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return Decimal(str(val))
    except InvalidOperation:
        return default


def to_decimal_or_none(val):
    if val is None:
        return None
    try:
        if isinstance(val, float) and pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return Decimal(str(val))
    except InvalidOperation:
        return None


def to_int(val, default=0):
    if val is None:
        return default
    try:
        if isinstance(val, float) and pd.isna(val):
            return default
    except (TypeError, ValueError):
        pass
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def to_str(val):
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    s = str(val).strip()
    return s if s else None


def to_uuid(val):
    """String UUID → uuid.UUID object, None → None."""
    if val is None:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, AttributeError):
        return None


def batch_insert(conn, sql: str, rows: list, batch_size: int = 500) -> int:
    total = 0
    for i in range(0, len(rows), BATCH := batch_size):
        conn.execute(text(sql), rows[i:i + BATCH])
        total += len(rows[i:i + BATCH])
    conn.commit()
    return total


# ---------------------------------------------------------------------------
# 1. ORDERS
# ---------------------------------------------------------------------------
def import_orders(conn) -> int:
    log("orders.csv okunuyor...")
    df = pd.read_csv(DATA_DIR / "orders.csv", dtype=str)
    log(f"  {len(df)} satır bulundu")

    existing = {row[0] for row in conn.execute(text("SELECT external_order_id FROM orders"))}
    cust_map = {row[0]: uuid.UUID(row[1]) for row in conn.execute(text("SELECT external_customer_id, id::text FROM customers"))}

    rows = []
    for _, r in df.iterrows():
        ext_id = to_str(r.get("order_id"))
        if not ext_id or ext_id in existing:
            continue
        cust_ext = to_str(r.get("customer_id"))
        rows.append({
            "id": uuid.uuid4(),
            "external_order_id": ext_id,
            "customer_id": cust_map.get(cust_ext) if cust_ext else None,
            "order_date": to_str(r.get("order_date")),
            "city": to_str(r.get("city")),
            "device": to_str(r.get("device")),
            "channel": to_str(r.get("channel")),
            "source": to_str(r.get("source")),
            "medium": to_str(r.get("medium")),
            "campaign_name": to_str(r.get("campaign_name")),
            "coupon_code": to_str(r.get("coupon_code")),
            "product_count": to_int(r.get("product_count")),
            "order_revenue": to_decimal(r.get("order_revenue")),
            "shipping_cost": to_decimal(r.get("shipping_cost")),
            "discount_amount": to_decimal(r.get("discount_amount")),
            "refund_amount": to_decimal(r.get("refund_amount")),
            "net_revenue": to_decimal(r.get("net_revenue")),
            "order_status": to_str(r.get("order_status")),
            "payment_method": to_str(r.get("payment_method")),
        })

    if rows:
        sql = """
            INSERT INTO orders (
                id, external_order_id, customer_id, order_date,
                city, device, channel, source, medium, campaign_name, coupon_code,
                product_count, order_revenue, shipping_cost, discount_amount,
                refund_amount, net_revenue, order_status, payment_method
            ) VALUES (
                :id, :external_order_id, :customer_id, :order_date,
                :city, :device, :channel, :source, :medium, :campaign_name, :coupon_code,
                :product_count, :order_revenue, :shipping_cost, :discount_amount,
                :refund_amount, :net_revenue, :order_status, :payment_method
            )
        """
        batch_insert(conn, sql, rows)

    log(f"  orders: {len(rows)} yeni satır eklendi ({len(existing)} zaten vardı)")
    return len(rows)


# ---------------------------------------------------------------------------
# 2. ORDER ITEMS
# ---------------------------------------------------------------------------
def import_order_items(conn) -> int:
    log("order_items.csv okunuyor...")
    df = pd.read_csv(DATA_DIR / "order_items.csv", dtype=str)
    log(f"  {len(df)} satır bulundu")

    order_map = {row[0]: uuid.UUID(row[1]) for row in conn.execute(text("SELECT external_order_id, id::text FROM orders"))}
    prod_map = {row[0]: uuid.UUID(row[1]) for row in conn.execute(text("SELECT sku, id::text FROM products"))}

    existing_pairs = set()
    for row in conn.execute(text("SELECT order_id::text, line_id FROM order_items")):
        existing_pairs.add((row[0], int(row[1])))

    rows = []
    skipped = 0
    for _, r in df.iterrows():
        ext_order_id = to_str(r.get("order_id"))
        order_uuid = order_map.get(ext_order_id)
        if not order_uuid:
            skipped += 1
            continue

        line_id = to_int(r.get("line_id"), 0)
        if (str(order_uuid), line_id) in existing_pairs:
            continue

        item_id = to_str(r.get("item_id"))
        rows.append({
            "id": uuid.uuid4(),
            "order_id": order_uuid,
            "line_id": line_id,
            "product_id": prod_map.get(item_id) if item_id else None,
            "item_id": item_id,
            "item_name": to_str(r.get("item_name")),
            "item_category": to_str(r.get("item_category")),
            "item_category2": to_str(r.get("item_category2")),
            "item_brand": to_str(r.get("item_brand")),
            "quantity": to_int(r.get("quantity"), 1),
            "unit_price": to_decimal(r.get("unit_price")),
            "line_total": to_decimal(r.get("line_total")),
            "discount_amount": to_decimal(r.get("discount_amount")),
            "refund_amount": to_decimal(r.get("refund_amount")),
        })

    if rows:
        sql = """
            INSERT INTO order_items (
                id, order_id, line_id, product_id, item_id,
                item_name, item_category, item_category2, item_brand,
                quantity, unit_price, line_total, discount_amount, refund_amount
            ) VALUES (
                :id, :order_id, :line_id, :product_id, :item_id,
                :item_name, :item_category, :item_category2, :item_brand,
                :quantity, :unit_price, :line_total, :discount_amount, :refund_amount
            )
        """
        batch_insert(conn, sql, rows)

    if skipped:
        log(f"  order_items: {skipped} satır atlandı (sipariş bulunamadı)")
    log(f"  order_items: {len(rows)} yeni satır eklendi")
    return len(rows)


# ---------------------------------------------------------------------------
# 3. GA4 TRAFFIC DAILY
# ---------------------------------------------------------------------------
def import_ga4_traffic(conn) -> int:
    log("ga4_traffic.csv okunuyor...")
    df = pd.read_csv(DATA_DIR / "ga4_traffic.csv", dtype=str)
    log(f"  {len(df)} satır bulundu — tablo temizleniyor...")
    conn.execute(text("TRUNCATE TABLE ga4_traffic_daily"))
    conn.commit()

    rows = []
    for _, r in df.iterrows():
        date_raw = to_str(r.get("date"))
        if not date_raw:
            continue
        try:
            traffic_date = datetime.strptime(date_raw, "%Y%m%d").date()
        except ValueError:
            continue

        rows.append({
            "id": uuid.uuid4(),
            "traffic_date": traffic_date,
            "session_source": to_str(r.get("sessionSource")),
            "session_medium": to_str(r.get("sessionMedium")),
            "session_campaign_name": to_str(r.get("sessionCampaignName")),
            "default_channel_group": to_str(r.get("sessionDefaultChannelGroup")),
            "device_category": to_str(r.get("deviceCategory")),
            "city": to_str(r.get("city")),
            "landing_page": to_str(r.get("landingPagePlusQueryString")),
            "new_vs_returning": to_str(r.get("newVsReturning")),
            "sessions": to_int(r.get("sessions")),
            "total_users": to_int(r.get("totalUsers")),
            "new_users": to_int(r.get("newUsers")),
            "bounce_rate": to_decimal_or_none(r.get("bounceRate")),
            "avg_session_duration": to_decimal_or_none(r.get("averageSessionDuration")),
            "pages_per_session": to_decimal_or_none(r.get("screenPageViewsPerSession")),
            "engaged_sessions": to_int(r.get("engagedSessions")),
            "engagement_rate": to_decimal_or_none(r.get("engagementRate")),
            "user_engagement_duration": to_decimal_or_none(r.get("userEngagementDuration")),
            "conversions": to_int(r.get("conversions")),
            "purchase_revenue": to_decimal_or_none(r.get("purchaseRevenue")),
            "transactions": to_int(r.get("transactions")),
        })

    sql = """
        INSERT INTO ga4_traffic_daily (
            id, traffic_date, session_source, session_medium, session_campaign_name,
            default_channel_group, device_category, city, landing_page, new_vs_returning,
            sessions, total_users, new_users, bounce_rate, avg_session_duration,
            pages_per_session, engaged_sessions, engagement_rate, user_engagement_duration,
            conversions, purchase_revenue, transactions
        ) VALUES (
            :id, :traffic_date, :session_source, :session_medium, :session_campaign_name,
            :default_channel_group, :device_category, :city, :landing_page, :new_vs_returning,
            :sessions, :total_users, :new_users, :bounce_rate, :avg_session_duration,
            :pages_per_session, :engaged_sessions, :engagement_rate, :user_engagement_duration,
            :conversions, :purchase_revenue, :transactions
        )
    """
    total = batch_insert(conn, sql, rows)
    log(f"  ga4_traffic_daily: {total} satır eklendi")
    return total


# ---------------------------------------------------------------------------
# 4. GA4 ITEM INTERACTIONS DAILY
# ---------------------------------------------------------------------------
def import_ga4_items(conn) -> int:
    log("ga4_item_interactions.csv okunuyor...")
    df = pd.read_csv(DATA_DIR / "ga4_item_interactions.csv", dtype=str)
    log(f"  {len(df)} satır bulundu — tablo temizleniyor...")
    conn.execute(text("TRUNCATE TABLE ga4_item_interactions_daily"))
    conn.commit()

    prod_map = {row[0]: uuid.UUID(row[1]) for row in conn.execute(text("SELECT sku, id::text FROM products"))}

    rows = []
    for _, r in df.iterrows():
        date_raw = to_str(r.get("date"))
        if not date_raw:
            continue
        try:
            interaction_date = datetime.strptime(date_raw, "%Y%m%d").date()
        except ValueError:
            continue

        item_id = to_str(r.get("itemId"))
        rows.append({
            "id": uuid.uuid4(),
            "interaction_date": interaction_date,
            "product_id": prod_map.get(item_id) if item_id else None,
            "item_id": item_id,
            "item_name": to_str(r.get("itemName")),
            "item_category": to_str(r.get("itemCategory")),
            "item_category2": to_str(r.get("itemCategory2")),
            "item_brand": to_str(r.get("itemBrand")),
            "items_viewed": to_int(r.get("itemsViewed")),
            "items_added_to_cart": to_int(r.get("itemsAddedToCart")),
            "items_checked_out": to_int(r.get("itemsCheckedOut")),
            "items_purchased": to_int(r.get("itemsPurchased")),
            "item_revenue": to_decimal_or_none(r.get("itemRevenue")),
            "item_list_views": to_int(r.get("itemListViews")),
            "item_list_clicks": to_int(r.get("itemListClicks")),
            "cart_to_view_rate": to_decimal_or_none(r.get("cartToViewRate")),
        })

    sql = """
        INSERT INTO ga4_item_interactions_daily (
            id, interaction_date, product_id, item_id,
            item_name, item_category, item_category2, item_brand,
            items_viewed, items_added_to_cart, items_checked_out, items_purchased,
            item_revenue, item_list_views, item_list_clicks, cart_to_view_rate
        ) VALUES (
            :id, :interaction_date, :product_id, :item_id,
            :item_name, :item_category, :item_category2, :item_brand,
            :items_viewed, :items_added_to_cart, :items_checked_out, :items_purchased,
            :item_revenue, :item_list_views, :item_list_clicks, :cart_to_view_rate
        )
    """
    total = batch_insert(conn, sql, rows)
    log(f"  ga4_item_interactions_daily: {total} satır eklendi")
    return total


# ---------------------------------------------------------------------------
# 5. META ADS BREAKDOWNS
# ---------------------------------------------------------------------------
def import_meta_breakdowns(conn) -> int:
    log("meta_ads_breakdowns.csv okunuyor...")
    df = pd.read_csv(DATA_DIR / "meta_ads_breakdowns.csv", dtype=str)
    log(f"  {len(df)} satır bulundu — tablo temizleniyor...")
    conn.execute(text("TRUNCATE TABLE meta_ads_breakdowns"))
    conn.commit()

    camp_map = {row[0].lower(): uuid.UUID(row[1]) for row in conn.execute(text("SELECT campaign_name, id::text FROM campaigns"))}

    rows = []
    for _, r in df.iterrows():
        date_raw = to_str(r.get("date_start"))
        if not date_raw:
            continue
        try:
            breakdown_date = datetime.strptime(date_raw, "%Y-%m-%d").date()
        except ValueError:
            continue

        camp_name = to_str(r.get("campaign_name"))
        campaign_uuid = camp_map.get(camp_name.lower() if camp_name else "") if camp_name else None

        rows.append({
            "id": uuid.uuid4(),
            "campaign_id": campaign_uuid,
            "breakdown_date": breakdown_date,
            "campaign_name": camp_name,
            "adset_name": to_str(r.get("adset_name")),
            "ad_name": to_str(r.get("ad_name")),
            "publisher_platform": to_str(r.get("publisher_platform")),
            "platform_position": to_str(r.get("platform_position")),
            "impression_device": to_str(r.get("impression_device")),
            "impressions": to_int(r.get("impressions")),
            "clicks": to_int(r.get("clicks")),
            "spend": to_decimal(r.get("spend")),
        })

    sql = """
        INSERT INTO meta_ads_breakdowns (
            id, campaign_id, breakdown_date,
            campaign_name, adset_name, ad_name,
            publisher_platform, platform_position, impression_device,
            impressions, clicks, spend
        ) VALUES (
            :id, :campaign_id, :breakdown_date,
            :campaign_name, :adset_name, :ad_name,
            :publisher_platform, :platform_position, :impression_device,
            :impressions, :clicks, :spend
        )
    """
    total = batch_insert(conn, sql, rows)
    log(f"  meta_ads_breakdowns: {total} satır eklendi")
    return total


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    log("=== CSV Import Başlıyor ===")
    with engine.connect() as conn:
        o = import_orders(conn)
        oi = import_order_items(conn)
        ga4t = import_ga4_traffic(conn)
        ga4i = import_ga4_items(conn)
        mb = import_meta_breakdowns(conn)

    log("=== Özet ===")
    log(f"  orders                     : {o}")
    log(f"  order_items                : {oi}")
    log(f"  ga4_traffic_daily          : {ga4t}")
    log(f"  ga4_item_interactions_daily: {ga4i}")
    log(f"  meta_ads_breakdowns        : {mb}")
    log("=== Tamamlandı ===")


if __name__ == "__main__":
    main()
