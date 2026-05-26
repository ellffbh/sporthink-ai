try:
    from google.ads.googleads.client import GoogleAdsClient
    from google.ads.googleads.errors import GoogleAdsException
    GOOGLE_ADS_AVAILABLE = True
except ImportError:
    GOOGLE_ADS_AVAILABLE = False
    GoogleAdsClient = None
    GoogleAdsException = Exception
import json, logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)


def get_google_ads_client(credentials_json: str, developer_token: str) -> GoogleAdsClient:
    creds = json.loads(credentials_json)
    config = {
        "developer_token": creds.get("developer_token") or developer_token,
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "use_proto_plus": True,
    }
    return GoogleAdsClient.load_from_dict(config)


def sync_google_ads_account(
    customer_id: str,
    credentials_json: str,
    days_back: int = 30,
) -> dict:
    """
    Google Ads hesabından kampanya metriklerini çeker.
    Başarılı olursa {'status': 'success', 'rows': N} döner.
    Hata olursa {'status': 'error', 'message': str} döner.
    """
    try:
        client = get_google_ads_client(credentials_json, "")
        ga_service = client.get_service("GoogleAdsService")

        end_date = date.today()
        start_date = end_date - timedelta(days=days_back)

        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversion_value,
                metrics.impressions,
                metrics.clicks,
                segments.date
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
            AND campaign.status != 'REMOVED'
        """

        clean_customer_id = customer_id.replace("-", "").replace(" ", "")

        response = ga_service.search_stream(
            customer_id=clean_customer_id,
            query=query,
        )

        rows = []
        for batch in response:
            for row in batch.results:
                rows.append({
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name,
                    "campaign_type": row.campaign.advertising_channel_type.name.lower(),
                    "status": row.campaign.status.name.lower(),
                    "cost": row.metrics.cost_micros / 1_000_000,
                    "conversions": row.metrics.conversions,
                    "conversion_value": row.metrics.conversion_value,
                    "impressions": row.metrics.impressions,
                    "clicks": row.metrics.clicks,
                    "date": row.segments.date,
                })

        logger.info(f"Google Ads sync: {len(rows)} rows for customer {clean_customer_id}")
        return {"status": "success", "rows": len(rows), "data": rows}

    except GoogleAdsException as e:
        error_msg = f"Google Ads API error: {e.error.code().name}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}
    except Exception as e:
        logger.error(f"Sync error: {str(e)}")
        return {"status": "error", "message": str(e)}
