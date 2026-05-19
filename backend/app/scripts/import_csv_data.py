import os
import sys
import csv
import json
import logging
from pathlib import Path
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Dict, List, Any
from collections import defaultdict

from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database import Base
from app.config import settings
from app.models import (
    Product, Customer, Order, OrderItem, Campaign, AdMetricDaily, 
    MetaAdBreakdown, GA4Traffic, GA4ItemInteraction, AdAccount, User, Role,
    CampaignType, CampaignStatus
)

# ============================================================================
# LOGGING SETUP
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIG
# ============================================================================
DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"
CSV_FILES = {
    "products": DATA_DIR / "products.csv",
    "orders": DATA_DIR / "orders.csv",
    "order_items": DATA_DIR / "order_items.csv",
    "campaigns": DATA_DIR / "campaigns.csv",
    "google_ads": DATA_DIR / "google_ads.csv",
    "meta_ads": DATA_DIR / "meta_ads.csv",
    "meta_ads_breakdowns": DATA_DIR / "meta_ads_breakdowns.csv",
    "ga4_traffic": DATA_DIR / "ga4_traffic.csv",
    "ga4_item_interactions": DATA_DIR / "ga4_item_interactions.csv",
}

CAMPAIGN_TYPE_MAPPING = {
    "SEARCH": "search",
    "PERFORMANCE_MAX": "pmax",
    "DISPLAY": "display",
    "VIDEO": "video",
    "SHOPPING": "shopping",
    "OUTCOME_AWARENESS": "awareness",
    "OUTCOME_SALES": "sales",
    "OUTCOME_TRAFFIC": "traffic",
    "OUTCOME_ENGAGEMENT": "engagement",
    "OUTCOME_LEADS": "sales",
}

DEVICE_MAPPING = {
    "MOBILE": "mobile",
    "DESKTOP": "desktop",
    "TABLET": "tablet",
}

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def read_csv(filepath: Path) -> List[Dict[str, str]]:
    """Read CSV file with UTF-8-sig encoding."""
    if not filepath.exists():
        logger.warning(f"File not found: {filepath}")
        return []
    
    rows = []
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    except Exception as e:
        logger.error(f"Error reading {filepath}: {e}")
    
    return rows

def parse_date(date_str: Optional[str]) -> Optional[date]:
    """Parse date from various formats."""
    if not date_str or date_str.strip() == "":
        return None
    
    date_str = date_str.strip()
    
    # Try YYYY-MM-DD format
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except:
        pass
    
    # Try YYYYMMDD format
    if len(date_str) == 8 and date_str.isdigit():
        try:
            return datetime.strptime(date_str, '%Y%m%d').date()
        except:
            pass
    
    logger.warning(f"Could not parse date: {date_str}")
    return None

def parse_datetime(datetime_str: Optional[str]) -> Optional[datetime]:
    """Parse datetime from various formats."""
    if not datetime_str or datetime_str.strip() == "":
        return None
    
    datetime_str = datetime_str.strip()
    
    # Try YYYY-MM-DD HH:MM:SS format
    try:
        return datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')
    except:
        pass
    
    logger.warning(f"Could not parse datetime: {datetime_str}")
    return None

def parse_bool(val: Optional[str]) -> bool:
    """Parse boolean from string."""
    if not val or val.strip() == "":
        return True
    return val.strip().lower() in ("true", "1", "yes")

def parse_decimal(val: Optional[str]) -> Optional[Decimal]:
    """Parse decimal from string."""
    if not val or val.strip() == "":
        return None
    try:
        return Decimal(val.strip())
    except:
        return None

def parse_int(val: Optional[str]) -> Optional[int]:
    """Parse integer from string."""
    if not val or val.strip() == "":
        return None
    try:
        return int(float(val.strip()))
    except:
        return None

def get_safe(d: Dict, key: str, default: Any = None) -> Any:
    """Safely get dict value."""
    return d.get(key, default)

# ============================================================================
# IMPORT FUNCTIONS
# ============================================================================

def import_products(session: Session) -> int:
    """Import products from CSV."""
    logger.info("=" * 80)
    logger.info("IMPORTING PRODUCTS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["products"])
    if not rows:
        logger.error("No products data found")
        return 0
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            sku = get_safe(row, "sku", "").strip()
            if not sku:
                logger.warning(f"Row {idx}: Missing SKU, skipping")
                skipped += 1
                continue
            
            # Check if product already exists (idempotent)
            existing = session.query(Product).filter(Product.sku == sku).first()
            if existing:
                skipped += 1
                continue
            
            # Parse fields
            created_at = parse_date(get_safe(row, "created_at"))
            price = parse_decimal(get_safe(row, "price"))
            cost_price = parse_decimal(get_safe(row, "cost_price"))
            stock_qty = parse_int(get_safe(row, "stock_quantity"))
            is_active = parse_bool(get_safe(row, "is_active"))
            
            product = Product(
                sku=sku,
                product_name=get_safe(row, "product_name", ""),
                category=get_safe(row, "category", ""),
                sub_category=get_safe(row, "sub_category"),
                brand=get_safe(row, "brand"),
                gender=get_safe(row, "gender"),
                price=price or Decimal(0),
                cost_price=cost_price,
                stock_quantity=stock_qty or 0,
                is_active=is_active,
                color=get_safe(row, "color"),
                size_range=get_safe(row, "size_range"),
                product_created_at=created_at,
            )
            session.add(product)
            count += 1
            
            if count % 100 == 0:
                logger.info(f"  {count} products processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} products imported (skipped {skipped} duplicates)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_customers_and_orders(session: Session) -> tuple[int, int]:
    """Import customers and orders from CSV."""
    logger.info("=" * 80)
    logger.info("IMPORTING CUSTOMERS & ORDERS")
    logger.info("=" * 80)
    
    order_rows = read_csv(CSV_FILES["orders"])
    if not order_rows:
        logger.error("No orders data found")
        return 0, 0
    
    # ========== CUSTOMERS ==========
    customer_data: Dict[str, Dict[str, Any]] = {}
    
    for row in order_rows:
        cust_id = get_safe(row, "customer_id", "").strip()
        if not cust_id:
            continue
        
        if cust_id not in customer_data:
            customer_data[cust_id] = {
                "first_seen_at": None,
                "cities": [],
            }
        
        order_date = parse_datetime(get_safe(row, "order_date"))
        city = get_safe(row, "city", "").strip()
        
        # Track first seen date (minimum order_date)
        if order_date:
            if customer_data[cust_id]["first_seen_at"] is None:
                customer_data[cust_id]["first_seen_at"] = order_date.date()
            else:
                if order_date.date() < customer_data[cust_id]["first_seen_at"]:
                    customer_data[cust_id]["first_seen_at"] = order_date.date()
        
        # Track cities
        if city:
            customer_data[cust_id]["cities"].append(city)
    
    cust_count = 0
    cust_skipped = 0
    
    for cust_id, data in customer_data.items():
        try:
            # Check if customer already exists
            existing = session.query(Customer).filter(
                Customer.external_customer_id == cust_id
            ).first()
            if existing:
                cust_skipped += 1
                continue
            
            # Most frequent city or first city
            city = None
            if data["cities"]:
                from collections import Counter
                counter = Counter(data["cities"])
                city = counter.most_common(1)[0][0]
            
            customer = Customer(
                external_customer_id=cust_id,
                first_seen_at=data["first_seen_at"],
                city=city,
            )
            session.add(customer)
            cust_count += 1
        
        except Exception as e:
            logger.error(f"Customer {cust_id} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {cust_count} customers imported (skipped {cust_skipped} duplicates)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0, 0
    
    # ========== ORDERS ==========
    # Build customer_id map (external_id -> db id)
    customers = session.query(Customer).all()
    cust_id_map = {c.external_customer_id: c.id for c in customers}
    
    ord_count = 0
    ord_skipped = 0
    
    for idx, row in enumerate(order_rows, 1):
        try:
            order_id = get_safe(row, "order_id", "").strip()
            if not order_id:
                logger.warning(f"Row {idx}: Missing order_id")
                ord_skipped += 1
                continue
            
            # Check if order already exists
            existing = session.query(Order).filter(Order.order_number == order_id).first()
            if existing:
                ord_skipped += 1
                continue
            
            external_cust_id = get_safe(row, "customer_id", "").strip()
            db_cust_id = cust_id_map.get(external_cust_id)
            if not db_cust_id:
                logger.warning(f"Row {idx}: Customer {external_cust_id} not found in DB")
                ord_skipped += 1
                continue
            
            order_date = parse_datetime(get_safe(row, "order_date"))
            if not order_date:
                logger.warning(f"Row {idx}: Invalid order_date")
                ord_skipped += 1
                continue
            
            total_amt = parse_decimal(get_safe(row, "order_revenue")) or Decimal(0)
            discount_amt = parse_decimal(get_safe(row, "discount_amount")) or Decimal(0)
            refund_amt = parse_decimal(get_safe(row, "refund_amount")) or Decimal(0)
            net_revenue = parse_decimal(get_safe(row, "net_revenue")) or Decimal(0)
            
            # Calculate tax (if needed)
            tax_amt = total_amt - net_revenue - discount_amt
            tax_amt = max(Decimal(0), tax_amt)
            
            final_amt = net_revenue
            
            order = Order(
                customer_id=db_cust_id,
                order_number=order_id,
                order_date=order_date,
                total_amount=total_amt,
                discount_amount=discount_amt,
                tax_amount=tax_amt,
                final_amount=final_amt,
                status=get_safe(row, "order_status", "pending"),
                payment_status="pending",  # Not in CSV
                shipping_address=None,
                notes=None,
            )
            session.add(order)
            ord_count += 1
            
            if ord_count % 100 == 0:
                logger.info(f"  {ord_count} orders processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {ord_count} orders imported (skipped {ord_skipped} duplicates)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return cust_count, 0
    
    return cust_count, ord_count

def import_order_items(session: Session) -> int:
    """Import order items from CSV."""
    logger.info("=" * 80)
    logger.info("IMPORTING ORDER ITEMS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["order_items"])
    if not rows:
        logger.error("No order_items data found")
        return 0
    
    # Build lookup maps
    orders = session.query(Order).all()
    order_map = {o.order_number: o.id for o in orders}
    
    products = session.query(Product).all()
    product_map = {p.sku: p.id for p in products}
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            order_id = get_safe(row, "order_id", "").strip()
            line_id = get_safe(row, "line_id", "").strip()
            
            if not order_id or not line_id:
                skipped += 1
                continue
            
            # Map to order
            db_order_id = order_map.get(order_id)
            if not db_order_id:
                logger.warning(f"Row {idx}: Order {order_id} not found")
                skipped += 1
                continue
            
            # Map to product (by item_id as SKU)
            item_id = get_safe(row, "item_id", "").strip()
            db_product_id = product_map.get(item_id)
            
            if not db_product_id:
                logger.warning(f"Row {idx}: Product {item_id} not found, setting to NULL")
            
            quantity = parse_int(get_safe(row, "quantity")) or 1
            unit_price = parse_decimal(get_safe(row, "unit_price")) or Decimal(0)
            line_total = parse_decimal(get_safe(row, "line_total")) or Decimal(0)
            discount_amt = parse_decimal(get_safe(row, "discount_amount"))
            
            item = OrderItem(
                order_id=db_order_id,
                product_id=db_product_id,
                quantity=quantity,
                unit_price=unit_price,
                discount_amount=discount_amt,
                line_total=line_total,
            )
            session.add(item)
            count += 1
            
            if count % 100 == 0:
                logger.info(f"  {count} order items processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} order items imported (skipped {skipped})")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_campaigns(session: Session) -> int:
    """Import campaigns from CSV."""
    logger.info("=" * 80)
    logger.info("IMPORTING CAMPAIGNS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["campaigns"])
    if not rows:
        logger.error("No campaigns data found")
        return 0
    
    # Get or create default ad_account
    default_account = session.query(AdAccount).first()
    if not default_account:
        # Create a default account if none exists
        # Get admin user (use email to find)
        admin_user = session.query(User).filter(User.is_superuser == True).first()
        if not admin_user:
            logger.error("No admin user found, cannot create default ad_account")
            return 0
        
        default_account = AdAccount(
            account_name="CSV Import Hesabı",
            platform="google_ads",
            external_account_id="csv-import-001",
            encrypted_credentials="",
            user_id=admin_user.id,
        )
        session.add(default_account)
        session.commit()
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            campaign_name = get_safe(row, "campaign_name", "").strip()
            if not campaign_name:
                logger.warning(f"Row {idx}: Missing campaign_name")
                skipped += 1
                continue
            
            # Check if campaign already exists (by name and account)
            existing = session.query(Campaign).filter(
                Campaign.campaign_name == campaign_name,
                Campaign.ad_account_id == default_account.id
            ).first()
            if existing:
                skipped += 1
                continue
            
            # Parse campaign type
            campaign_type_str = get_safe(row, "campaign_type", "").strip().upper()
            campaign_type_mapped = CAMPAIGN_TYPE_MAPPING.get(campaign_type_str, "search")
            campaign_type = CampaignType(campaign_type_mapped)
            
            start_date = parse_date(get_safe(row, "start_date"))
            end_date = parse_date(get_safe(row, "end_date"))
            daily_budget = parse_decimal(get_safe(row, "daily_budget"))
            total_budget = parse_decimal(get_safe(row, "total_budget"))
            
            campaign = Campaign(
                ad_account_id=default_account.id,
                external_campaign_id=campaign_name,  # Use campaign name as external ID
                campaign_name=campaign_name,
                campaign_type=campaign_type,
                status=CampaignStatus.enabled,
                objective=get_safe(row, "objective"),
                bidding_strategy=None,
                daily_budget=daily_budget,
                start_date=start_date,
                end_date=end_date,
                total_budget=total_budget,
                target_audience=get_safe(row, "target_audience"),
            )
            session.add(campaign)
            count += 1
            
            if count % 50 == 0:
                logger.info(f"  {count} campaigns processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} campaigns imported (skipped {skipped} duplicates)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_google_ads(session: Session) -> int:
    """Import Google Ads data to ad_metrics_daily."""
    logger.info("=" * 80)
    logger.info("IMPORTING GOOGLE ADS METRICS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["google_ads"])
    if not rows:
        logger.error("No google_ads data found")
        return 0
    
    # Build campaign lookup
    campaigns = session.query(Campaign).all()
    campaign_map = {c.campaign_name: c.id for c in campaigns}
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            metric_date = parse_date(get_safe(row, "segments.date"))
            campaign_name = get_safe(row, "campaign.name", "").strip()
            
            if not metric_date or not campaign_name:
                logger.warning(f"Row {idx}: Missing date or campaign name")
                skipped += 1
                continue
            
            # Find campaign
            campaign_id = campaign_map.get(campaign_name)
            if not campaign_id:
                logger.warning(f"Row {idx}: Campaign '{campaign_name}' not found in DB")
                skipped += 1
                continue
            
            # Parse device
            device_str = get_safe(row, "segments.device", "").strip().upper()
            device = DEVICE_MAPPING.get(device_str)
            
            # Parse metrics
            impressions = parse_int(get_safe(row, "metrics.impressions")) or 0
            clicks = parse_int(get_safe(row, "metrics.clicks")) or 0
            cost_micros = parse_int(get_safe(row, "metrics.cost_micros")) or 0
            cost = Decimal(cost_micros) / Decimal(1_000_000)
            conversions = parse_decimal(get_safe(row, "metrics.conversions")) or Decimal(0)
            conversion_value = parse_decimal(get_safe(row, "metrics.conversions_value")) or Decimal(0)
            
            ctr = parse_decimal(get_safe(row, "metrics.ctr"))
            avg_cpc_micros = parse_int(get_safe(row, "metrics.average_cpc")) or 0
            cpc = Decimal(avg_cpc_micros) / Decimal(1_000_000) if avg_cpc_micros > 0 else None
            
            avg_cpm_micros = parse_int(get_safe(row, "metrics.average_cpm")) or 0
            cpm = Decimal(avg_cpm_micros) / Decimal(1_000_000) if avg_cpm_micros > 0 else None
            
            # Build segment_data JSONB
            segment_data = {
                "keyword": get_safe(row, "ad_group_criterion.keyword.text"),
                "match_type": get_safe(row, "ad_group_criterion.keyword.match_type"),
                "ad_group": get_safe(row, "ad_group.name"),
                "product_id": get_safe(row, "segments.product_item_id"),
                "impression_share": get_safe(row, "metrics.search_impression_share"),
            }
            segment_data = {k: v for k, v in segment_data.items() if v}
            
            # Check if metric already exists (campaign + date + device)
            existing = session.query(AdMetricDaily).filter(
                AdMetricDaily.campaign_id == campaign_id,
                AdMetricDaily.metric_date == metric_date,
                AdMetricDaily.device == device
            ).first()
            
            if existing:
                # Upsert: update cost and other metrics
                existing.impressions = (existing.impressions or 0) + impressions
                existing.clicks = (existing.clicks or 0) + clicks
                existing.cost = (existing.cost or Decimal(0)) + cost
                existing.conversions = (existing.conversions or Decimal(0)) + conversions
                existing.conversion_value = (existing.conversion_value or Decimal(0)) + conversion_value
                skipped += 1
            else:
                metric = AdMetricDaily(
                    campaign_id=campaign_id,
                    metric_date=metric_date,
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    conversion_value=conversion_value,
                    device=device,
                    network=get_safe(row, "segments.ad_network_type"),
                    ctr=ctr,
                    cpc=cpc,
                    cpm=cpm,
                    segment_data=segment_data if segment_data else None,
                    external_campaign_id=get_safe(row, "campaign.id"),
                )
                session.add(metric)
                count += 1
            
            if (count + skipped) % 100 == 0:
                logger.info(f"  {count + skipped} Google Ads rows processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} Google Ads metrics imported ({skipped} upserted)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_meta_ads(session: Session) -> int:
    """Import Meta Ads data to ad_metrics_daily."""
    logger.info("=" * 80)
    logger.info("IMPORTING META ADS METRICS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["meta_ads"])
    if not rows:
        logger.error("No meta_ads data found")
        return 0
    
    # Build campaign lookup
    campaigns = session.query(Campaign).all()
    campaign_map = {c.campaign_name: c.id for c in campaigns}
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            metric_date = parse_date(get_safe(row, "date_start"))
            campaign_name = get_safe(row, "campaign_name", "").strip()
            
            if not metric_date or not campaign_name:
                logger.warning(f"Row {idx}: Missing date or campaign name")
                skipped += 1
                continue
            
            # Find campaign
            campaign_id = campaign_map.get(campaign_name)
            if not campaign_id:
                logger.warning(f"Row {idx}: Campaign '{campaign_name}' not found in DB")
                skipped += 1
                continue
            
            # Parse metrics
            impressions = parse_int(get_safe(row, "impressions")) or 0
            reach = parse_int(get_safe(row, "reach")) or 0
            frequency = parse_decimal(get_safe(row, "frequency"))
            clicks = parse_int(get_safe(row, "clicks")) or 0
            spend = parse_decimal(get_safe(row, "spend")) or Decimal(0)
            conversions = parse_decimal(get_safe(row, "actions:offsite_conversion.fb_pixel_purchase")) or Decimal(0)
            conversion_value = parse_decimal(get_safe(row, "action_values:offsite_conversion.fb_pixel_purchase")) or Decimal(0)
            ctr = parse_decimal(get_safe(row, "ctr"))
            cpc = parse_decimal(get_safe(row, "cpc"))
            cpm = parse_decimal(get_safe(row, "cpm"))
            
            # Build actions_data JSONB
            actions_data = {
                "link_click": get_safe(row, "actions:link_click"),
                "landing_page_view": get_safe(row, "actions:landing_page_view"),
                "view_content": get_safe(row, "actions:offsite_conversion.fb_pixel_view_content"),
                "add_to_cart": get_safe(row, "actions:offsite_conversion.fb_pixel_add_to_cart"),
                "initiate_checkout": get_safe(row, "actions:offsite_conversion.fb_pixel_initiate_checkout"),
                "page_engagement": get_safe(row, "actions:page_engagement"),
                "post_engagement": get_safe(row, "actions:post_engagement"),
                "video_view": get_safe(row, "actions:video_view"),
            }
            actions_data = {k: v for k, v in actions_data.items() if v}
            
            # Build segment_data JSONB
            segment_data = {
                "adset_name": get_safe(row, "adset_name"),
                "ad_name": get_safe(row, "ad_name"),
                "objective": get_safe(row, "objective"),
                "buying_type": get_safe(row, "buying_type"),
            }
            segment_data = {k: v for k, v in segment_data.items() if v}
            
            # Check if metric already exists (campaign + date + no device for Meta)
            existing = session.query(AdMetricDaily).filter(
                AdMetricDaily.campaign_id == campaign_id,
                AdMetricDaily.metric_date == metric_date,
                AdMetricDaily.device.is_(None)
            ).first()
            
            if existing:
                # Upsert: update cost and metrics
                existing.impressions = (existing.impressions or 0) + impressions
                existing.reach = (existing.reach or 0) + reach
                existing.clicks = (existing.clicks or 0) + clicks
                existing.cost = (existing.cost or Decimal(0)) + spend
                existing.conversions = (existing.conversions or Decimal(0)) + conversions
                existing.conversion_value = (existing.conversion_value or Decimal(0)) + conversion_value
                skipped += 1
            else:
                metric = AdMetricDaily(
                    campaign_id=campaign_id,
                    metric_date=metric_date,
                    impressions=impressions,
                    clicks=clicks,
                    cost=spend,
                    conversions=conversions,
                    conversion_value=conversion_value,
                    device=None,
                    network=None,
                    reach=reach,
                    frequency=frequency,
                    ctr=ctr,
                    cpc=cpc,
                    cpm=cpm,
                    actions_data=actions_data if actions_data else None,
                    segment_data=segment_data if segment_data else None,
                    external_campaign_id=get_safe(row, "campaign_id"),
                )
                session.add(metric)
                count += 1
            
            if (count + skipped) % 100 == 0:
                logger.info(f"  {count + skipped} Meta Ads rows processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} Meta Ads metrics imported ({skipped} upserted)")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_meta_ads_breakdowns(session: Session) -> int:
    """Import Meta Ads Breakdowns."""
    logger.info("=" * 80)
    logger.info("IMPORTING META ADS BREAKDOWNS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["meta_ads_breakdowns"])
    if not rows:
        logger.error("No meta_ads_breakdowns data found")
        return 0
    
    # Build campaign lookup
    campaigns = session.query(Campaign).all()
    campaign_map = {c.campaign_name: c.id for c in campaigns}
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            breakdown_date = parse_date(get_safe(row, "date_start"))
            campaign_name = get_safe(row, "campaign_name", "").strip()
            
            if not breakdown_date:
                logger.warning(f"Row {idx}: Missing date")
                skipped += 1
                continue
            
            # Find campaign (optional)
            campaign_id = campaign_map.get(campaign_name) if campaign_name else None
            
            impressions = parse_int(get_safe(row, "impressions")) or 0
            clicks = parse_int(get_safe(row, "clicks")) or 0
            spend = parse_decimal(get_safe(row, "spend")) or Decimal(0)
            
            breakdown = MetaAdBreakdown(
                campaign_id=campaign_id,
                breakdown_date=breakdown_date,
                breakdown_type="device_platform",  # Dummy value, can be enhanced
                breakdown_value=get_safe(row, "impression_device", "unknown"),
                impressions=impressions,
                clicks=clicks,
                spend=spend,
                reach=0,
                conversions=0,
            )
            session.add(breakdown)
            count += 1
            
            if count % 100 == 0:
                logger.info(f"  {count} breakdowns processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} Meta Ads breakdowns imported (skipped {skipped})")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_ga4_traffic(session: Session) -> int:
    """Import GA4 Traffic data."""
    logger.info("=" * 80)
    logger.info("IMPORTING GA4 TRAFFIC")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["ga4_traffic"])
    if not rows:
        logger.error("No ga4_traffic data found")
        return 0
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            traffic_date = parse_date(get_safe(row, "date"))
            
            if not traffic_date:
                logger.warning(f"Row {idx}: Missing date")
                skipped += 1
                continue
            
            # Check if row already exists (dedup)
            source = get_safe(row, "sessionSource", "").strip()
            medium = get_safe(row, "sessionMedium", "").strip()
            
            existing = session.query(GA4Traffic).filter(
                GA4Traffic.traffic_date == traffic_date,
                GA4Traffic.source == source,
                GA4Traffic.medium == medium,
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            sessions = parse_int(get_safe(row, "sessions")) or 0
            users = parse_int(get_safe(row, "totalUsers")) or 0
            pageviews = parse_int(get_safe(row, "screenPageViewsPerSession")) or 0
            bounce_rate = parse_decimal(get_safe(row, "bounceRate"))
            conversions = parse_int(get_safe(row, "conversions")) or 0
            
            traffic = GA4Traffic(
                traffic_date=traffic_date,
                source=source,
                medium=medium,
                campaign=get_safe(row, "sessionCampaignName"),
                users=users,
                new_users=parse_int(get_safe(row, "newUsers")) or 0,
                sessions=sessions,
                bounce_rate=bounce_rate,
                pageviews=pageviews,
                events=0,  # Not in CSV
                conversions=conversions,
                conversion_value=parse_decimal(get_safe(row, "purchaseRevenue")),
                device=get_safe(row, "deviceCategory"),
                country=None,
            )
            session.add(traffic)
            count += 1
            
            if count % 100 == 0:
                logger.info(f"  {count} GA4 traffic rows processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} GA4 traffic records imported (skipped {skipped})")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

def import_ga4_items(session: Session) -> int:
    """Import GA4 Item Interactions."""
    logger.info("=" * 80)
    logger.info("IMPORTING GA4 ITEM INTERACTIONS")
    logger.info("=" * 80)
    
    rows = read_csv(CSV_FILES["ga4_item_interactions"])
    if not rows:
        logger.error("No ga4_item_interactions data found")
        return 0
    
    # Build product lookup
    products = session.query(Product).all()
    product_map = {p.sku: p.id for p in products}
    
    count = 0
    skipped = 0
    
    for idx, row in enumerate(rows, 1):
        try:
            interaction_date = parse_date(get_safe(row, "date"))
            item_id = get_safe(row, "itemId", "").strip()
            
            if not interaction_date or not item_id:
                logger.warning(f"Row {idx}: Missing date or itemId")
                skipped += 1
                continue
            
            # Check if already exists
            existing = session.query(GA4ItemInteraction).filter(
                GA4ItemInteraction.interaction_date == interaction_date,
                GA4ItemInteraction.item_id == item_id,
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            # Find product by SKU
            product_id = product_map.get(item_id)
            
            view_count = parse_int(get_safe(row, "itemsViewed")) or 0
            cart_count = parse_int(get_safe(row, "itemsAddedToCart")) or 0
            checkout_count = parse_int(get_safe(row, "itemsCheckedOut")) or 0
            purchase_count = parse_int(get_safe(row, "itemsPurchased")) or 0
            purchase_revenue = parse_decimal(get_safe(row, "itemRevenue"))
            
            item = GA4ItemInteraction(
                interaction_date=interaction_date,
                item_id=item_id,
                item_name=get_safe(row, "itemName", ""),
                item_category=get_safe(row, "itemCategory"),
                item_brand=get_safe(row, "itemBrand"),
                view_count=view_count,
                add_to_cart_count=cart_count,
                checkout_count=checkout_count,
                purchase_count=purchase_count,
                purchase_quantity=purchase_count,
                purchase_revenue=purchase_revenue,
            )
            session.add(item)
            count += 1
            
            if count % 100 == 0:
                logger.info(f"  {count} GA4 items processed...")
        
        except Exception as e:
            logger.error(f"Row {idx} - Error: {e}")
            continue
    
    try:
        session.commit()
        logger.info(f"✓ {count} GA4 item interactions imported (skipped {skipped})")
    except IntegrityError as e:
        session.rollback()
        logger.error(f"Database error: {e}")
        return 0
    
    return count

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main import function."""
    logger.info("\n")
    logger.info("╔" + "=" * 78 + "╗")
    logger.info("║" + " " * 78 + "║")
    logger.info("║" + " CSV DATA IMPORT SCRIPT ".center(78) + "║")
    logger.info("║" + " " * 78 + "║")
    logger.info("╚" + "=" * 78 + "╝")
    logger.info("")
    
    # Create engine and session
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    
    stats = {}
    
    try:
        with SessionLocal() as session:
            # 1. Import products
            stats['products'] = import_products(session)
            
            # 2. Import customers and orders
            cust_count, ord_count = import_customers_and_orders(session)
            stats['customers'] = cust_count
            stats['orders'] = ord_count
            
            # 3. Import order items
            stats['order_items'] = import_order_items(session)
            
            # 4. Import campaigns
            stats['campaigns'] = import_campaigns(session)
            
            # 5. Import Google Ads metrics
            stats['google_ads_metrics'] = import_google_ads(session)
            
            # 6. Import Meta Ads metrics
            stats['meta_ads_metrics'] = import_meta_ads(session)
            
            # 7. Import Meta Ads Breakdowns
            stats['meta_ads_breakdowns'] = import_meta_ads_breakdowns(session)
            
            # 8. Import GA4 Traffic
            stats['ga4_traffic'] = import_ga4_traffic(session)
            
            # 9. Import GA4 Items
            stats['ga4_items'] = import_ga4_items(session)
    
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        return 1
    
    # Print summary
    logger.info("")
    logger.info("=" * 80)
    logger.info("IMPORT SUMMARY")
    logger.info("=" * 80)
    logger.info(f"Products:              {stats.get('products', 0):>6}")
    logger.info(f"Customers:             {stats.get('customers', 0):>6}")
    logger.info(f"Orders:                {stats.get('orders', 0):>6}")
    logger.info(f"Order Items:           {stats.get('order_items', 0):>6}")
    logger.info(f"Campaigns:             {stats.get('campaigns', 0):>6}")
    logger.info(f"Google Ads Metrics:    {stats.get('google_ads_metrics', 0):>6}")
    logger.info(f"Meta Ads Metrics:      {stats.get('meta_ads_metrics', 0):>6}")
    logger.info(f"Meta Ads Breakdowns:   {stats.get('meta_ads_breakdowns', 0):>6}")
    logger.info(f"GA4 Traffic:           {stats.get('ga4_traffic', 0):>6}")
    logger.info(f"GA4 Item Interactions: {stats.get('ga4_items', 0):>6}")
    logger.info("=" * 80)
    
    total_metrics = stats.get('google_ads_metrics', 0) + stats.get('meta_ads_metrics', 0)
    logger.info(f"\nTotal Ad Metrics:      {total_metrics:>6}")
    logger.info("")
    logger.info("✓ Import completed successfully!")
    logger.info("")
    
    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
