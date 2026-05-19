# AI Dijital Reklam Performans Yönetim Platformu

Google Ads ve Meta Ads verilerini analiz eden, makine öğrenmesi ile öneri üreten platform.

## Kurulum

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# .env dosyasında DATABASE_URL ve SECRET_KEY düzenle

alembic revision --autogenerate -m "initial"
alembic upgrade head
python -m app.scripts.seed

uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```
