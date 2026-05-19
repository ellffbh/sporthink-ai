#!/usr/bin/env python3
"""
CSV -> PostgreSQL import for ai_proje_db.

Usage:
    python scripts/import_data.py            # idempotent (ON CONFLICT DO NOTHING)
    python scripts/import_data.py --truncate # truncate all tables first, then insert

Tables without natural unique keys (order_items, meta_ads_breakdowns,
ga4_traffic_daily, ga4_item_interactions_daily) are skipped on re-run
unless --truncate is passed.
"""

import csv
import io
import json
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

# Force UTF-8 output on Windows so Turkish characters don't crash the terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import psycopg2
from psycopg2.extras import execute_values

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).resolve().parent.parent
DATA     = ROOT / "data"
ENV_FILE = ROOT / "backend" / ".env"

# ── enum maps ─────────────────────────────────────────────────────────────────
CAMPAIGN_TYPE_MAP = {
    "SEARCH":           "search",
    "DISPLAY":          "display",
    "SHOPPING":         "shopping",
    "PERFORMANCE_MAX":  "performance_max",
    "VIDEO":            "video",
    "APP":              "app",
    "SMART":            "smart",
    "OUTCOME_AWARENESS":"reach",
    "OUTCOME_TRAFFIC":  "traffic",
    "OUTCOME_SALES":    "sales",
    "OUTCOME_LEADS":    "leads",
    "OUTCOME_ENGAGEMENT":"engagement",
}

CAMPAIGN_STATUS_MAP = {
    "active": "enabled", "completed": "removed",
    "ENABLED": "enabled", "enabled": "enabled",
    "PAUSED": "paused",   "paused": "paused",
    "REMOVED": "removed", "removed": "removed",
}

DEVICE_MAP = {
    "MOBILE": "mobile", "DESKTOP": "desktop",
    "TABLET": "tablet", "CONNECTED_TV": "connected_tv",
    "mobile": "mobile", "desktop": "desktop", "tablet": "tablet",
}

# ── helpers ───────────────────────────────────────────────────────────────────
def load_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


def d(val, default=None):
    if val in (None, "", "N/A", "--"):
        return default
    try:
        return Decimal(str(val))
    except InvalidOperation:
        return default


def n(val, default=None):
    if val in (None, "", "N/A", "--"):
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def date_yyyymmdd(val):
    try:
        return datetime.strptime(str(val).strip(), "%Y%m%d").date()
    except Exception:
        return None


def date_iso(val):
    if not val:
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def dt_iso(val):
    if not val:
        return None
    s = str(val).strip().replace(" ", "T")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def read_csv(name):
    path = DATA / name
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def log(msg):
    print(f"   {msg}", flush=True)


def table_has_rows(cur, table):
    cur.execute(f"SELECT EXISTS (SELECT 1 FROM {table} LIMIT 1)")
    return cur.fetchone()[0]


# ── importers ─────────────────────────────────────────────────────────────────

def import_products(cur):
    print("->products")
    rows = read_csv("products.csv")
    data = [(
        r["sku"] or None,
        r["product_name"],
        r.get("category") or None,
        r.get("sub_category") or None,
        r.get("brand") or None,
        r.get("gender") or None,
        d(r.get("price")),
        d(r.get("cost_price")),
        n(r.get("stock_quantity")),
        r.get("is_active", "True").strip().lower() in ("true", "1", "yes"),
        r.get("color") or None,
        r.get("size_range") or None,
        date_iso(r.get("created_at")),
    ) for r in rows]
    execute_values(cur, """
        INSERT INTO products (sku, product_name, category, sub_category, brand, gender,
            price, cost_price, stock_quantity, is_active, color, size_range, product_created_at)
        VALUES %s
        ON CONFLICT (sku) DO NOTHING
    """, data)
    log(f"{len(data)} rows processed")


def import_customers(cur):
    print("->customers")
    rows = read_csv("orders.csv")
    seen: dict = {}
    for r in rows:
        cid = r["customer_id"]
        if not cid:
            continue
        dt   = r["order_date"]
        city = r.get("city", "")
        if cid not in seen:
            seen[cid] = {"dt": dt, "cities": defaultdict(int)}
        else:
            if dt < seen[cid]["dt"]:
                seen[cid]["dt"] = dt
        if city:
            seen[cid]["cities"][city] += 1

    data = []
    for ext_id, info in seen.items():
        city = max(info["cities"], key=info["cities"].get) if info["cities"] else None
        data.append((ext_id, dt_iso(info["dt"]), city))

    execute_values(cur, """
        INSERT INTO customers (external_customer_id, first_seen_at, city)
        VALUES %s
        ON CONFLICT (external_customer_id) DO NOTHING
    """, data)
    log(f"{len(data)} rows processed")


def ensure_system_user_and_accounts(cur):
    print("->system user + ad_accounts")
    cur.execute("""
        INSERT INTO users (email, hashed_password, full_name, is_superuser)
        VALUES ('system@ai-proje.local', 'N/A', 'System Import User', TRUE)
        ON CONFLICT (email) DO NOTHING
    """)
    cur.execute("SELECT id FROM users WHERE email = 'system@ai-proje.local'")
    user_id = cur.fetchone()[0]

    google_rows = read_csv("google_ads.csv")
    meta_rows   = read_csv("meta_ads.csv")
    google_ext  = google_rows[0]["customer.id"] if google_rows else "0"
    google_name = google_rows[0]["customer.descriptive_name"] if google_rows else "Google Account"
    meta_ext    = meta_rows[0]["account_id"] if meta_rows else "0"
    meta_name   = meta_rows[0]["account_name"] if meta_rows else "Meta Account"

    for platform, name, ext_id in [("google", google_name, google_ext), ("meta", meta_name, meta_ext)]:
        cur.execute("""
            INSERT INTO ad_accounts (user_id, platform, account_name, external_account_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (platform, external_account_id) DO NOTHING
        """, (user_id, platform, name, ext_id))

    cur.execute("SELECT platform, id FROM ad_accounts WHERE platform IN ('google','meta')")
    account_map = {row[0]: row[1] for row in cur.fetchall()}
    log(f"google={account_map.get('google')} | meta={account_map.get('meta')}")
    return account_map


def import_campaigns(cur, account_map):
    print("->campaigns")
    rows = read_csv("campaigns.csv")
    data = []
    skipped = 0
    for r in rows:
        platform = r["platform"].strip().lower()
        acc_id   = account_map.get(platform)
        if acc_id is None:
            skipped += 1
            continue
        ctype  = CAMPAIGN_TYPE_MAP.get(r.get("campaign_type", "").strip().upper())
        status = CAMPAIGN_STATUS_MAP.get(r.get("status", "active").strip(), "paused")
        audience_raw = r.get("target_audience") or None
        audience_json = json.dumps(audience_raw, ensure_ascii=False) if audience_raw else None

        data.append((
            acc_id,
            r["campaign_name"],   # external_campaign_id (no native ID in CSV)
            r["campaign_name"],
            ctype, status, None,
            d(r.get("daily_budget")),
            r.get("objective") or None,
            date_iso(r.get("start_date")),
            date_iso(r.get("end_date")),
            d(r.get("total_budget")),
            audience_json,
        ))

    execute_values(cur, """
        INSERT INTO campaigns (ad_account_id, external_campaign_id, campaign_name,
            campaign_type, status, bidding_strategy, daily_budget, objective,
            start_date, end_date, total_budget, target_audience)
        VALUES %s
        ON CONFLICT (ad_account_id, external_campaign_id) DO NOTHING
    """, data)
    log(f"{len(data)} rows processed, {skipped} skipped (unknown platform)")


def _campaign_map(cur):
    cur.execute("SELECT campaign_name, id FROM campaigns")
    return {row[0]: row[1] for row in cur.fetchall()}


def _product_map(cur):
    cur.execute("SELECT sku, id FROM products WHERE sku IS NOT NULL")
    return {row[0]: row[1] for row in cur.fetchall()}


def _order_map(cur):
    cur.execute("SELECT external_order_id, id FROM orders")
    return {row[0]: row[1] for row in cur.fetchall()}


def import_orders(cur):
    print("->orders")
    rows = read_csv("orders.csv")
    cur.execute("SELECT external_customer_id, id FROM customers")
    cust_map = {row[0]: row[1] for row in cur.fetchall()}

    data = [(
        r["order_id"],
        cust_map.get(r["customer_id"]),
        dt_iso(r["order_date"]),
        r.get("city") or None,
        r.get("device") or None,
        r.get("channel") or None,
        r.get("source") or None,
        r.get("medium") or None,
        r.get("campaign_name") or None,
        r.get("coupon_code") or None,
        n(r.get("product_count")),
        d(r.get("order_revenue")),
        d(r.get("shipping_cost")),
        d(r.get("discount_amount")),
        d(r.get("refund_amount")),
        d(r.get("net_revenue")),
        r.get("order_status") or None,
        r.get("payment_method") or None,
    ) for r in rows]

    execute_values(cur, """
        INSERT INTO orders (external_order_id, customer_id, order_date, city, device,
            channel, source, medium, campaign_name, coupon_code, product_count,
            order_revenue, shipping_cost, discount_amount, refund_amount, net_revenue,
            order_status, payment_method)
        VALUES %s
        ON CONFLICT (external_order_id) DO NOTHING
    """, data)
    log(f"{len(data)} rows processed")


def import_order_items(cur):
    print("->order_items")
    if table_has_rows(cur, "order_items"):
        log("already has data - skipping (pass --truncate to reload)")
        return

    rows      = read_csv("order_items.csv")
    order_map = _order_map(cur)
    prod_map  = _product_map(cur)

    data = []
    skipped = 0
    for r in rows:
        order_id = order_map.get(r["order_id"])
        if order_id is None:
            skipped += 1
            continue
        data.append((
            order_id,
            r.get("line_id") or None,
            prod_map.get(r.get("item_id", "")),
            r.get("item_id") or None,
            r.get("item_name") or None,
            r.get("item_category") or None,
            r.get("item_category2") or None,
            r.get("item_brand") or None,
            n(r.get("quantity"), 1),
            d(r.get("unit_price")),
            d(r.get("line_total")),
            d(r.get("discount_amount")),
            d(r.get("refund_amount")),
        ))

    execute_values(cur, """
        INSERT INTO order_items (order_id, line_id, product_id, item_id, item_name,
            item_category, item_category2, item_brand, quantity, unit_price, line_total,
            discount_amount, refund_amount)
        VALUES %s
    """, data)
    log(f"{len(data)} rows inserted, {skipped} skipped (order not found)")


def import_google_ads_metrics(cur):
    print("->ad_metrics_daily  [google]")
    rows     = read_csv("google_ads.csv")
    camp_map = _campaign_map(cur)

    agg: dict = defaultdict(lambda: {
        "impressions": 0, "clicks": 0, "cost_micros": 0,
        "conversions": Decimal("0"), "conversion_value": Decimal("0"),
    })

    skipped = 0
    for r in rows:
        camp_id = camp_map.get(r["campaign.name"])
        if camp_id is None:
            skipped += 1
            continue
        dt     = date_iso(r["segments.date"])
        device = DEVICE_MAP.get(r["segments.device"], "unknown")
        net    = (r["segments.ad_network_type"] or "unknown").lower()
        key    = (camp_id, dt, device, net)
        agg[key]["impressions"]      += n(r["metrics.impressions"], 0)
        agg[key]["clicks"]           += n(r["metrics.clicks"], 0)
        agg[key]["cost_micros"]      += n(r["metrics.cost_micros"], 0)
        agg[key]["conversions"]      += d(r["metrics.conversions"], Decimal("0"))
        agg[key]["conversion_value"] += d(r["metrics.conversions_value"], Decimal("0"))

    data = []
    for (camp_id, dt, device, net), m in agg.items():
        cost = Decimal(m["cost_micros"]) / Decimal("1000000")
        imp  = m["impressions"]
        clk  = m["clicks"]
        ctr  = Decimal(clk) / Decimal(imp) if imp > 0 else None
        cpc  = cost / Decimal(clk)         if clk > 0 else None
        cpm  = cost / Decimal(imp) * 1000  if imp > 0 else None
        data.append((
            camp_id, dt, imp, clk, cost,
            m["conversions"], m["conversion_value"],
            device, net, None, None, ctr, cpc, cpm, None, None, None,
        ))

    execute_values(cur, """
        INSERT INTO ad_metrics_daily (campaign_id, metric_date, impressions, clicks, cost,
            conversions, conversion_value, device, network, reach, frequency,
            ctr, cpc, cpm, actions_data, segment_data, external_campaign_id)
        VALUES %s
        ON CONFLICT (campaign_id, metric_date, device, network) DO NOTHING
    """, data)
    log(f"{len(data)} aggregated rows | {skipped} source rows skipped (campaign not found)")


def import_meta_ads_metrics(cur):
    print("->ad_metrics_daily  [meta]")
    rows     = read_csv("meta_ads.csv")
    camp_map = _campaign_map(cur)

    ACTION_COLS = [
        "actions:link_click", "actions:landing_page_view",
        "actions:offsite_conversion.fb_pixel_view_content",
        "actions:offsite_conversion.fb_pixel_add_to_cart",
        "actions:offsite_conversion.fb_pixel_initiate_checkout",
        "actions:offsite_conversion.fb_pixel_purchase",
        "action_values:offsite_conversion.fb_pixel_purchase",
        "actions:page_engagement", "actions:post_engagement", "actions:video_view",
    ]

    agg: dict = defaultdict(lambda: {
        "impressions": 0, "clicks": 0, "spend": Decimal("0"),
        "reach": 0, "conversions": Decimal("0"), "conversion_value": Decimal("0"),
        "actions": defaultdict(Decimal),
    })

    skipped = 0
    for r in rows:
        camp_id = camp_map.get(r["campaign_name"])
        if camp_id is None:
            skipped += 1
            continue
        key = (camp_id, date_iso(r["date_start"]))
        agg[key]["impressions"]      += n(r.get("impressions"), 0)
        agg[key]["clicks"]           += n(r.get("clicks"), 0)
        agg[key]["spend"]            += d(r.get("spend"), Decimal("0"))
        agg[key]["reach"]            += n(r.get("reach"), 0)
        agg[key]["conversions"]      += d(r.get("actions:offsite_conversion.fb_pixel_purchase"), Decimal("0"))
        agg[key]["conversion_value"] += d(r.get("action_values:offsite_conversion.fb_pixel_purchase"), Decimal("0"))
        for col in ACTION_COLS:
            agg[key]["actions"][col] += d(r.get(col), Decimal("0"))

    data = []
    for (camp_id, dt), m in agg.items():
        cost = m["spend"]
        imp  = m["impressions"]
        clk  = m["clicks"]
        reach = m["reach"] if m["reach"] > 0 else None
        freq  = Decimal(imp) / Decimal(reach) if reach else None
        ctr   = Decimal(clk) / Decimal(imp) if imp > 0 else None
        cpc   = cost / Decimal(clk)         if clk > 0 else None
        cpm   = cost / Decimal(imp) * 1000  if imp > 0 else None
        actions_json = json.dumps({k: str(v) for k, v in m["actions"].items()}, ensure_ascii=False)
        data.append((
            camp_id, dt, imp, clk, cost,
            m["conversions"], m["conversion_value"],
            "unknown", "meta", reach, freq, ctr, cpc, cpm,
            actions_json, None, None,
        ))

    execute_values(cur, """
        INSERT INTO ad_metrics_daily (campaign_id, metric_date, impressions, clicks, cost,
            conversions, conversion_value, device, network, reach, frequency,
            ctr, cpc, cpm, actions_data, segment_data, external_campaign_id)
        VALUES %s
        ON CONFLICT (campaign_id, metric_date, device, network) DO NOTHING
    """, data)
    log(f"{len(data)} aggregated rows | {skipped} source rows skipped (campaign not found)")


def import_meta_ads_breakdowns(cur):
    print("->meta_ads_breakdowns")
    if table_has_rows(cur, "meta_ads_breakdowns"):
        log("already has data - skipping (pass --truncate to reload)")
        return

    rows     = read_csv("meta_ads_breakdowns.csv")
    camp_map = _campaign_map(cur)

    data = [(
        camp_map.get(r.get("campaign_name", "")),
        date_iso(r.get("date_start")),
        r.get("campaign_name") or None,
        r.get("adset_name") or None,
        r.get("ad_name") or None,
        r.get("publisher_platform") or None,
        r.get("platform_position") or None,
        r.get("impression_device") or None,
        n(r.get("impressions"), 0),
        n(r.get("clicks"), 0),
        d(r.get("spend"), Decimal("0")),
    ) for r in rows]

    execute_values(cur, """
        INSERT INTO meta_ads_breakdowns (campaign_id, breakdown_date, campaign_name,
            adset_name, ad_name, publisher_platform, platform_position, impression_device,
            impressions, clicks, spend)
        VALUES %s
    """, data)
    log(f"{len(data)} rows inserted")


def import_ga4_traffic(cur):
    print("->ga4_traffic_daily")
    if table_has_rows(cur, "ga4_traffic_daily"):
        log("already has data - skipping (pass --truncate to reload)")
        return

    rows = read_csv("ga4_traffic.csv")
    data = [(
        date_yyyymmdd(r.get("date")),
        r.get("sessionSource") or None,
        r.get("sessionMedium") or None,
        r.get("sessionCampaignName") or None,
        r.get("sessionDefaultChannelGroup") or None,
        r.get("deviceCategory") or None,
        r.get("city") or None,
        r.get("landingPagePlusQueryString") or None,
        r.get("newVsReturning") or None,
        n(r.get("sessions")),
        n(r.get("totalUsers")),
        n(r.get("newUsers")),
        d(r.get("bounceRate")),
        d(r.get("averageSessionDuration")),
        d(r.get("screenPageViewsPerSession")),
        n(r.get("engagedSessions")),
        d(r.get("engagementRate")),
        d(r.get("userEngagementDuration")),
        n(r.get("conversions")),
        d(r.get("purchaseRevenue")),
        n(r.get("transactions")),
    ) for r in rows]

    execute_values(cur, """
        INSERT INTO ga4_traffic_daily (traffic_date, session_source, session_medium,
            session_campaign_name, default_channel_group, device_category, city,
            landing_page, new_vs_returning, sessions, total_users, new_users,
            bounce_rate, avg_session_duration, pages_per_session, engaged_sessions,
            engagement_rate, user_engagement_duration, conversions, purchase_revenue, transactions)
        VALUES %s
    """, data)
    log(f"{len(data)} rows inserted")


def import_ga4_item_interactions(cur):
    print("->ga4_item_interactions_daily")
    if table_has_rows(cur, "ga4_item_interactions_daily"):
        log("already has data - skipping (pass --truncate to reload)")
        return

    rows     = read_csv("ga4_item_interactions.csv")
    prod_map = _product_map(cur)

    data = [(
        date_yyyymmdd(r.get("date")),
        prod_map.get(r.get("itemId", "")),
        r.get("itemId") or None,
        r.get("itemName") or None,
        r.get("itemCategory") or None,
        r.get("itemCategory2") or None,
        r.get("itemBrand") or None,
        n(r.get("itemsViewed"), 0),
        n(r.get("itemsAddedToCart"), 0),
        n(r.get("itemsCheckedOut"), 0),
        n(r.get("itemsPurchased"), 0),
        d(r.get("itemRevenue"), Decimal("0")),
        n(r.get("itemListViews"), 0),
        n(r.get("itemListClicks"), 0),
        d(r.get("cartToViewRate")),
    ) for r in rows]

    execute_values(cur, """
        INSERT INTO ga4_item_interactions_daily (interaction_date, product_id, item_id,
            item_name, item_category, item_category2, item_brand, items_viewed,
            items_added_to_cart, items_checked_out, items_purchased, item_revenue,
            item_list_views, item_list_clicks, cart_to_view_rate)
        VALUES %s
    """, data)
    log(f"{len(data)} rows inserted")


# ── truncate helper ───────────────────────────────────────────────────────────

TRUNCATE_ORDER = [
    "ga4_item_interactions_daily", "ga4_traffic_daily",
    "meta_ads_breakdowns", "ad_metrics_daily",
    "order_items", "orders",
    "anomalies", "recommendation_feedback", "recommendations",
    "model_predictions", "campaigns",
    "ad_accounts", "customers", "products",
    "users",
]

def truncate_all(cur):
    print("TRUNCATING all data tables...")
    for tbl in TRUNCATE_ORDER:
        cur.execute(f"TRUNCATE TABLE {tbl} CASCADE")
        print(f"   truncated {tbl}")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    do_truncate = "--truncate" in sys.argv

    env = load_env()
    db_url = env.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ai_proje_db")
    print(f"Connecting -> {db_url}\n")

    conn = psycopg2.connect(db_url, client_encoding="utf-8")
    conn.autocommit = False
    cur = conn.cursor()

    try:
        if do_truncate:
            truncate_all(cur)
            print()

        import_products(cur)
        import_customers(cur)
        account_map = ensure_system_user_and_accounts(cur)
        import_campaigns(cur, account_map)
        import_orders(cur)
        import_order_items(cur)
        import_google_ads_metrics(cur)
        import_meta_ads_metrics(cur)
        import_meta_ads_breakdowns(cur)
        import_ga4_traffic(cur)
        import_ga4_item_interactions(cur)

        print("\n-> channel_mapping.csv  (reference only - no target table, skipped)")

        conn.commit()
        print("\nAll imports committed successfully.")

    except Exception as exc:
        conn.rollback()
        print(f"\nImport FAILED - rolled back.\n   {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
