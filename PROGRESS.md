# PROGRESS.md - AI Dijital Reklam Platformu

Yeni Claude session açıldığında bu dosyayı okutarak devam et.

## Yapıldı

- [x] Proje iskeleti kuruldu (FastAPI + SQLAlchemy + Alembic + venv)
- [x] `backend/app/config.py` - pydantic-settings ile .env okuma
- [x] `backend/app/database.py` - SQLAlchemy engine, SessionLocal, Base, get_db
- [x] `backend/app/main.py` - FastAPI app, CORS, /health endpoint
- [x] `backend/app/core/security.py` - bcrypt hash/verify, JWT encode/decode
- [x] 13 SQLAlchemy modeli yazıldı (SQLAlchemy 2.0, Mapped/mapped_column)
- [x] `alembic/env.py` düzenlendi (models import + DATABASE_URL)
- [x] Alembic migration oluşturuldu ve uygulandı (`alembic upgrade head`) — 13 tablo DB'de
- [x] Seed data yüklendi: 3 rol, 12 permission, admin kullanıcı
- [x] Auth endpoint'leri: POST /auth/register, POST /auth/login, GET /auth/me (test edildi ✓)
- [x] Dependency: get_current_user (JWT), require_permission
- [x] Campaign CRUD endpoint'leri (GET list/detail, POST, PUT, DELETE) + permission kontrollü
- [x] Ad account endpoint'leri (encrypted credentials - Fernet ile)
- [x] CSV import endpoint'i (POST /metrics/import-csv, upsert destekli)
- [x] Next.js 14 frontend kuruldu (App Router, TypeScript, Tailwind CSS koyu tema, shadcn/ui)
- [x] Frontend: /login, /dashboard (KPI + recharts), /campaigns/[id] (grafik+öneri)
- [x] Axios interceptor (JWT header), Next.js middleware (cookie tabanlı auth guard), lib/auth.ts
- [x] **Schema tamamlandı — 20 tablo aktif (2026-05-06)**
  - campaign.py güncellendi: +objective, start_date, end_date, total_budget, target_audience; CampaignType +5 değer, CampaignStatus +completed/scheduled
  - ad_metric.py güncellendi: +reach, frequency, ctr, cpc, cpm, actions_data (JSONB), segment_data (JSONB), external_campaign_id
  - Yeni: `customer.py`, `product.py`, `order.py`, `order_item.py`, `ga4_traffic.py`, `ga4_item.py`, `meta_breakdown.py` yazıldı
  - `models/__init__.py` tüm 20 modeli import ediyor
  - Migration `c8f2a9d14b73` (rebuild 5 tables) çalıştırıldı — DB'de 20 tablo aktif
  - Tablo adları: orders, order_items, ga4_traffic_daily, ga4_item_interactions_daily, meta_ads_breakdowns
  - **Tüm CSV verisi yüklendi:** orders (14,299), order_items (27,406), ga4_traffic_daily (46,317), ga4_item_interactions_daily (29,710), meta_ads_breakdowns (26,946)
  - Import scripti: `backend/scripts/import_csv_data.py` (idempotent)
- [x] **UI modernizasyonu — 5 sayfa tamamlandı (2026-05-06)**
  - /campaigns: Google/Meta platform ikonları, ROAS renk kodu, pill filtreler, pagination
  - /metrics: 8 KPI + trend badge, Pie/Bar/Donut/Area grafikler, 2 sütun grid
  - /recommendations: 3 sütun grid, border-l aksiyon rengi, Uygula/Yoksay + toast, AnimatePresence
  - /anomalies: severity kartları, z-score chip, date-fns relative zaman, çözüm butonu
  - /admin: sparkline stat kartlar, kullanıcı tablosu, 3-nokta menü, "Yeni Kullanıcı" modal
  - Dashboard'a dokunulmadı (zaten iyi)
  - Ortak: framer-motion, sonner, date-fns; PageWrapper, Skeleton, lib/styles.ts, Sidebar yenilendi

- [x] **Simülasyon katmanı tamamlandı — Sporthink dokümanı %100 tamamlandı (2026-05-06)**
  - `backend/app/services/simulation_service.py`: 14 Türkiye özel günü (bayramlar, black friday, anneler/babalar günü, yılbaşı, okul, yaz indirimi, milli tatiller)
  - `backend/app/routers/simulations.py`: 5 endpoint (/events, /events/upcoming, /budget, /similar-periods, /vs-history)
  - Diminishing returns: budget_ratio ** 0.85 ile azalan getiri modeli
  - Risk değerlendirmesi: düşük/orta/yüksek (bütçe değişim %, cold start, ROAS seviyesi)
  - Frontend: /simulations yeni sayfa (form + karşılaştırma + risk kartı + grafik + geçmiş dönem tablosu)
  - Frontend: Sidebar'a "Simülasyon" linki eklendi (FlaskConical ikonu)
  - Frontend: Campaign detail'e mini bütçe simülatörü (slider + hızlı butonlar + 4 KPI, debounce 500ms)
  - Frontend: Dashboard'a "Yaklaşan Olaylar" widget'ı (14 günlük olaylar + /simulations linki)

- [x] **ML tahmin katmanı tamamlandı (2026-05-06)**
  - `backend/app/services/prediction_service.py`: ETS (statsmodels) + linreg fallback + naive fallback
  - model_predictions tablosuna `predictions_detail` JSONB kolonu eklendi (migration d3e7f1a2b9c4)
  - Yeni endpoint'ler: POST /api/predictions/generate/{id}, POST /api/predictions/generate-all, GET /api/predictions/campaign/{id}/latest, GET /api/predictions/dashboard-summary
  - 19 kampanya için 7 günlük tahmin üretildi (linreg_v1, conf: 0.30–0.94)
  - recommendation_engine.py: Kural 7 (pred ROAS +%15 → artır, conf 0.85) + Kural 8 (pred ROAS -%15 → azalt, conf 0.85)
  - Frontend campaign detail: ML tahmin kartı (4 KPI + grafik + güven bandı + yeniden hesapla butonu)
  - Frontend dashboard: tahmin özeti bölümü (3 KPI + en iyi 3 + risk altındaki 3 kampanya)
  - `backend/app/scripts/generate_initial_predictions.py` idempotent script

- [x] **Feature Engineering tamamlandı, kural motoru güçlendi (2026-05-06)**
  - `backend/app/services/feature_service.py`: compute_campaign_features, compute_account_features, detect_event_type
  - Yeni endpoint'ler: GET /api/campaigns/{id}/features, GET /api/features/event/{date}, GET /api/features/account-summary
  - 5 dk in-memory cache eklendi
  - Türkiye özel gün tespiti: ramadan/kurban bayram, black friday, anneler/babalar günü, yılbaşı, okul/yaz sezonu, sevgililer günü
  - recommendation_engine.py yeniden yazıldı: 6 feature-based kural (cold start, volatile, artır, azalt, hold, default) + PMax modifier
  - Test: 19 kampanya için öneri üretildi, event detection doğru çalışıyor

## Sırada

- [ ] **Küçük düzeltmeler:**
  - Öneri kartlarındaki -100% change_percent sorunu
  - $0 harcama gösteren kampanya satırları
  - Anomali detection threshold ayarı
- [ ] Anomaly detection (basit eşik tabanlı)
- [ ] Gemini API entegrasyonu (öneri açıklamaları için)

## Stack

- Backend: FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL (port 8000)
- Frontend: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui + recharts + framer-motion (port 3000)
- DB: ai_proje_db (localhost:5432, postgres kullanıcısı)
- CSV verisi: `data/` klasöründe 10 dosya (campaigns, orders, products, ga4_traffic, meta_ads, vb.)
- Klasör: C:\Users\Pc\Desktop\ai-proje
- venv: backend\venv (Python)

## Önemli Bilgiler

- DB şifresi .env'de, .gitignore'da hariç tutulmuş
- Seed kullanıcı: admin@aiproje.local / Admin123!
- bcrypt==4.0.1 sabitlendi (passlib uyumsuzluğu nedeniyle)
- LoginRequest/RegisterRequest: EmailStr → str (.local domain reddi nedeniyle)
- Alembic migrations: b6b8d0f99604 → 71373059747c → c8f2a9d14b73 (head)
- CSV import scripti: `backend/scripts/import_csv_data.py` (idempotent, tekrar çalıştırılabilir)
