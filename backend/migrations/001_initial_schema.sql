-- ============================================================
-- ai_proje_db  |  Migration 001 — Initial Schema
-- Run: psql -U postgres -d ai_proje_db -f 001_initial_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
    CREATE TYPE platform_type AS ENUM ('google', 'meta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE campaign_status_type AS ENUM ('enabled', 'paused', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE campaign_type_enum AS ENUM (
        'search', 'display', 'video', 'shopping',
        'performance_max', 'app', 'smart',
        'reach', 'traffic', 'engagement', 'leads', 'sales'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE device_type AS ENUM ('desktop', 'mobile', 'tablet', 'connected_tv', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE severity_type AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE recommendation_action_type AS ENUM (
        'increase_budget', 'decrease_budget',
        'pause_campaign', 'resume_campaign',
        'change_bid', 'change_targeting',
        'change_creative', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE recommendation_status_type AS ENUM (
        'pending', 'accepted', 'rejected', 'applied', 'dismissed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE feedback_status_type AS ENUM (
        'helpful', 'not_helpful', 'implemented', 'ignored'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES  (foreign-key order)
-- ============================================================

-- 1. users -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(255) NOT NULL UNIQUE,
    full_name        VARCHAR(255),
    hashed_password  TEXT         NOT NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    is_superuser     BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. roles -------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. permissions -------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource    VARCHAR(100),
    action      VARCHAR(100),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. user_roles --------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- 5. role_permissions --------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. customers ---------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    external_customer_id VARCHAR(255) UNIQUE,
    first_seen_at        TIMESTAMPTZ,
    city                 VARCHAR(100),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 7. products ----------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    sku                VARCHAR(100)  UNIQUE,
    product_name       VARCHAR(255)  NOT NULL,
    category           VARCHAR(100),
    sub_category       VARCHAR(100),
    brand              VARCHAR(100),
    gender             VARCHAR(50),
    price              NUMERIC(18,2),
    cost_price         NUMERIC(18,2),
    stock_quantity     INTEGER,
    is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
    color              VARCHAR(100),
    size_range         VARCHAR(100),
    product_created_at TIMESTAMPTZ,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 8. ad_accounts -------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_accounts (
    id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    platform            platform_type  NOT NULL,
    account_name        VARCHAR(255)   NOT NULL,
    external_account_id VARCHAR(255)   NOT NULL,
    encrypted_credentials TEXT,
    is_active           BOOLEAN        NOT NULL DEFAULT TRUE,
    last_sync_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (platform, external_account_id)
);

-- 9. campaigns ---------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id                   UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_account_id        UUID                  NOT NULL REFERENCES ad_accounts(id) ON DELETE RESTRICT,
    external_campaign_id VARCHAR(255)          NOT NULL,
    campaign_name        VARCHAR(255)          NOT NULL,
    campaign_type        campaign_type_enum,
    status               campaign_status_type  NOT NULL DEFAULT 'paused',
    bidding_strategy     VARCHAR(100),
    daily_budget         NUMERIC(18,2),
    objective            VARCHAR(100),
    start_date           DATE,
    end_date             DATE,
    total_budget         NUMERIC(18,2),
    target_audience      JSONB,
    created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    UNIQUE (ad_account_id, external_campaign_id)
);

-- 10. ad_metrics_daily -------------------------------------------
CREATE TABLE IF NOT EXISTS ad_metrics_daily (
    id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id          UUID           NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    metric_date          DATE           NOT NULL,
    impressions          BIGINT         NOT NULL DEFAULT 0,
    clicks               BIGINT         NOT NULL DEFAULT 0,
    cost                 NUMERIC(18,4)  NOT NULL DEFAULT 0,
    conversions          NUMERIC(18,4)  NOT NULL DEFAULT 0,
    conversion_value     NUMERIC(18,4)  NOT NULL DEFAULT 0,
    device               device_type,
    network              VARCHAR(100),
    reach                BIGINT,
    frequency            NUMERIC(10,4),
    ctr                  NUMERIC(10,6),
    cpc                  NUMERIC(18,4),
    cpm                  NUMERIC(18,4),
    actions_data         JSONB,
    segment_data         JSONB,
    external_campaign_id VARCHAR(255),
    created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, metric_date, device, network)
);

-- 11. anomalies --------------------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
    id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID           NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    metric_name    VARCHAR(100)   NOT NULL,
    change_percent NUMERIC(10,4),
    severity       severity_type  NOT NULL,
    note           TEXT,
    detected_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    is_resolved    BOOLEAN        NOT NULL DEFAULT FALSE
);

-- 12. model_predictions ------------------------------------------
CREATE TABLE IF NOT EXISTS model_predictions (
    id                         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id                UUID          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    prediction_horizon_days    INTEGER       NOT NULL,
    predicted_conversions      NUMERIC(18,4),
    predicted_conversion_value NUMERIC(18,4),
    predicted_cost             NUMERIC(18,4),
    confidence_score           NUMERIC(5,4),
    model_version              VARCHAR(50),
    generated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    predictions_detail         JSONB
);

-- 13. recommendations --------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
    id                      UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id             UUID                         NOT NULL REFERENCES campaigns(id)        ON DELETE CASCADE,
    prediction_id           UUID                         REFERENCES model_predictions(id) ON DELETE SET NULL,
    action                  recommendation_action_type   NOT NULL,
    suggested_change_percent NUMERIC(10,4),
    reason                  TEXT,
    risk_score              NUMERIC(5,4),
    status                  recommendation_status_type   NOT NULL DEFAULT 'pending',
    generated_at            TIMESTAMPTZ                  NOT NULL DEFAULT NOW()
);

-- 14. recommendation_feedback ------------------------------------
CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID                  NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    user_id           UUID                  REFERENCES users(id) ON DELETE SET NULL,
    feedback_status   feedback_status_type  NOT NULL,
    comment           TEXT,
    created_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

-- 15. audit_logs -------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 16. orders -----------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    external_order_id VARCHAR(255)  NOT NULL UNIQUE,
    customer_id       UUID          REFERENCES customers(id) ON DELETE SET NULL,
    order_date        TIMESTAMPTZ   NOT NULL,
    city              VARCHAR(100),
    device            VARCHAR(100),
    channel           VARCHAR(100),
    source            VARCHAR(100),
    medium            VARCHAR(100),
    campaign_name     VARCHAR(255),
    coupon_code       VARCHAR(100),
    product_count     INTEGER,
    order_revenue     NUMERIC(18,4),
    shipping_cost     NUMERIC(18,4),
    discount_amount   NUMERIC(18,4),
    refund_amount     NUMERIC(18,4),
    net_revenue       NUMERIC(18,4),
    order_status      VARCHAR(50),
    payment_method    VARCHAR(100),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 17. order_items ------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    line_id         VARCHAR(100),
    product_id      UUID          REFERENCES products(id) ON DELETE SET NULL,
    item_id         VARCHAR(255),
    item_name       VARCHAR(255),
    item_category   VARCHAR(100),
    item_category2  VARCHAR(100),
    item_brand      VARCHAR(100),
    quantity        INTEGER       NOT NULL DEFAULT 1,
    unit_price      NUMERIC(18,4),
    line_total      NUMERIC(18,4),
    discount_amount NUMERIC(18,4),
    refund_amount   NUMERIC(18,4),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 18. meta_ads_breakdowns ----------------------------------------
CREATE TABLE IF NOT EXISTS meta_ads_breakdowns (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        UUID          REFERENCES campaigns(id) ON DELETE SET NULL,
    breakdown_date     DATE          NOT NULL,
    campaign_name      VARCHAR(255),
    adset_name         VARCHAR(255),
    ad_name            VARCHAR(255),
    publisher_platform VARCHAR(100),
    platform_position  VARCHAR(100),
    impression_device  VARCHAR(100),
    impressions        BIGINT        NOT NULL DEFAULT 0,
    clicks             BIGINT        NOT NULL DEFAULT 0,
    spend              NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 19. ga4_traffic_daily ------------------------------------------
CREATE TABLE IF NOT EXISTS ga4_traffic_daily (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    traffic_date             DATE          NOT NULL,
    session_source           VARCHAR(255),
    session_medium           VARCHAR(255),
    session_campaign_name    VARCHAR(255),
    default_channel_group    VARCHAR(100),
    device_category          VARCHAR(50),
    city                     VARCHAR(100),
    landing_page             TEXT,
    new_vs_returning         VARCHAR(50),
    sessions                 BIGINT,
    total_users              BIGINT,
    new_users                BIGINT,
    bounce_rate              NUMERIC(10,6),
    avg_session_duration     NUMERIC(18,4),
    pages_per_session        NUMERIC(10,4),
    engaged_sessions         BIGINT,
    engagement_rate          NUMERIC(10,6),
    user_engagement_duration NUMERIC(18,4),
    conversions              BIGINT,
    purchase_revenue         NUMERIC(18,4),
    transactions             BIGINT,
    created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 20. ga4_item_interactions_daily --------------------------------
CREATE TABLE IF NOT EXISTS ga4_item_interactions_daily (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_date    DATE          NOT NULL,
    product_id          UUID          REFERENCES products(id) ON DELETE SET NULL,
    item_id             VARCHAR(255),
    item_name           VARCHAR(255),
    item_category       VARCHAR(100),
    item_category2      VARCHAR(100),
    item_brand          VARCHAR(100),
    items_viewed        BIGINT        NOT NULL DEFAULT 0,
    items_added_to_cart BIGINT        NOT NULL DEFAULT 0,
    items_checked_out   BIGINT        NOT NULL DEFAULT 0,
    items_purchased     BIGINT        NOT NULL DEFAULT 0,
    item_revenue        NUMERIC(18,4) NOT NULL DEFAULT 0,
    item_list_views     BIGINT        NOT NULL DEFAULT 0,
    item_list_clicks    BIGINT        NOT NULL DEFAULT 0,
    cart_to_view_rate   NUMERIC(10,6),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email                   ON users(email);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_id           ON ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_platform          ON ad_accounts(platform);

CREATE INDEX IF NOT EXISTS idx_campaigns_ad_account_id       ON campaigns(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status              ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_ext_id              ON campaigns(external_campaign_id);

CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign_date      ON ad_metrics_daily(campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_date               ON ad_metrics_daily(metric_date);

CREATE INDEX IF NOT EXISTS idx_anomalies_campaign_id         ON anomalies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity            ON anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at         ON anomalies(detected_at);

CREATE INDEX IF NOT EXISTS idx_model_pred_campaign_id        ON model_predictions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_model_pred_generated_at       ON model_predictions(generated_at);

CREATE INDEX IF NOT EXISTS idx_recommendations_campaign_id   ON recommendations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status        ON recommendations(status);

CREATE INDEX IF NOT EXISTS idx_rec_feedback_rec_id           ON recommendation_feedback(recommendation_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id            ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity             ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at         ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id            ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date             ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_ext_order_id           ON orders(external_order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id          ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id        ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_meta_ads_campaign_id          ON meta_ads_breakdowns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdown_date       ON meta_ads_breakdowns(breakdown_date);

CREATE INDEX IF NOT EXISTS idx_ga4_traffic_date              ON ga4_traffic_daily(traffic_date);
CREATE INDEX IF NOT EXISTS idx_ga4_traffic_source_medium     ON ga4_traffic_daily(session_source, session_medium);

CREATE INDEX IF NOT EXISTS idx_ga4_item_date                 ON ga4_item_interactions_daily(interaction_date);
CREATE INDEX IF NOT EXISTS idx_ga4_item_product_id           ON ga4_item_interactions_daily(product_id);
