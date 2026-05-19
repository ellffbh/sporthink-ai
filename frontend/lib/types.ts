export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
}

export interface Campaign {
  id: string;
  ad_account_id: string;
  external_campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  status: "enabled" | "paused" | "removed" | "completed" | "scheduled";
  bidding_strategy: string | null;
  daily_budget: number | null;
  updated_at?: string;
  created_at?: string;
}

export interface AdMetric {
  campaign_id: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversion_value: number;
  device: string | null;
  network: string | null;
}

export interface Recommendation {
  id: string;
  campaign_id: string;
  action: string;
  description: string;
  status: string;
  created_at: string;
}
