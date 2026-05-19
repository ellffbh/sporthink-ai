"""
Tüm kampanyalar için ilk ML tahminlerini üretir.
Çalıştır: python -m app.scripts.generate_initial_predictions
"""
import sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database import SessionLocal
from app.services.prediction_service import train_and_predict_all

if __name__ == "__main__":
    db = SessionLocal()
    t0 = time.time()
    try:
        total = train_and_predict_all(db)
        elapsed = round(time.time() - t0, 1)
        print(f"Toplam {total} kampanya için tahmin üretildi ({elapsed}s)")
    finally:
        db.close()
