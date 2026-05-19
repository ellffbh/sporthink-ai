from __future__ import annotations
import uuid
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel
from app.models.campaign import CampaignType, CampaignStatus


class CampaignCreate(BaseModel):
    ad_account_id: uuid.UUID
    external_campaign_id: str
    campaign_name: str
    campaign_type: CampaignType
    status: CampaignStatus = CampaignStatus.enabled
    bidding_strategy: Optional[str] = None
    daily_budget: Optional[Decimal] = None


class CampaignUpdate(BaseModel):
    campaign_name: Optional[str] = None
    status: Optional[CampaignStatus] = None
    bidding_strategy: Optional[str] = None
    daily_budget: Optional[Decimal] = None


class CampaignResponse(BaseModel):
    id: uuid.UUID
    ad_account_id: uuid.UUID
    external_campaign_id: str
    campaign_name: str
    campaign_type: CampaignType
    status: CampaignStatus
    bidding_strategy: Optional[str]
    daily_budget: Optional[Decimal]

    model_config = {"from_attributes": True}
