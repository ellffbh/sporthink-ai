"""
ML Prediction Service (Sporthink 4.2 / Bölüm 5)
Kampanya bazında 7 günlük tahmin üretir.
Model önceliği: ExponentialSmoothing (ETS) → Linear Regression → Naive
"""
import uuid
import warnings
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sqlalchemy.orm import Session
from sqlalchemy import text

warnings.filterwarnings("ignore")

# -- Model availability -------------------------------------------------
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    HAS_ETS = True
except ImportError:
    HAS_ETS = False


# -----------------------------------------------------------------------
# Internal helpers
# -----------------------------------------------------------------------

def _fill_date_range(df: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Tarih aralığındaki eksik günleri 0 ile doldurur."""
    idx = pd.date_range(start, end, freq="D")
    df = df.set_index("metric_date").reindex(idx, fill_value=0.0).reset_index()
    df = df.rename(columns={"index": "metric_date"})
    return df


def _fit_ets(series: pd.Series, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """ExponentialSmoothing ile tahmin. mean, lower, upper döner."""
    n = len(series)
    if n < 10:
        raise ValueError("Not enough data for ETS")

    # Kısa serilerde trend=None ile daha stabil
    trend_type = "add" if n >= 20 else None
    seasonal_type = "add" if n >= 21 else None
    seasonal_periods = 7 if n >= 21 else None

    model = ExponentialSmoothing(
        series,
        trend=trend_type,
        seasonal=seasonal_type,
        seasonal_periods=seasonal_periods,
        initialization_method="estimated",
    )
    fit = model.fit(optimized=True, disp=False)
    forecast = fit.forecast(horizon)
    forecast = np.maximum(forecast, 0)

    # Güven aralığı: eğitim hatası std'ı üzerinden ±1.5σ
    residuals = series.values - fit.fittedvalues.values
    sigma = np.std(residuals)
    lower = np.maximum(forecast - 1.5 * sigma, 0)
    upper = forecast + 1.5 * sigma

    return forecast, lower, upper, "ets_v1"


def _fit_linreg(series: pd.Series, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Basit lineer regresyon ile tahmin."""
    x = np.arange(len(series), dtype=float)
    y = series.values.astype(float)

    model = LinearRegression()
    model.fit(x.reshape(-1, 1), y)

    future_x = np.arange(len(series), len(series) + horizon, dtype=float)
    forecast = np.maximum(model.predict(future_x.reshape(-1, 1)), 0)

    residuals = y - model.predict(x.reshape(-1, 1))
    sigma = max(np.std(residuals), 0)
    lower = np.maximum(forecast - 1.5 * sigma, 0)
    upper = forecast + 1.5 * sigma

    return forecast, lower, upper, "linreg_v1"


def _fit_naive(series: pd.Series, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Son 7-14 günün ortalaması (naive baseline)."""
    window = min(14, len(series))
    mean_val = float(series.tail(window).mean())
    std_val = float(series.tail(window).std()) if window > 1 else mean_val * 0.2

    forecast = np.full(horizon, max(mean_val, 0))
    lower   = np.maximum(forecast - 1.5 * std_val, 0)
    upper   = forecast + 1.5 * std_val

    return forecast, lower, upper, "naive_v1"


def _predict_series(series: pd.Series, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Uygun modeli seç ve tahmin üret."""
    n = len(series)
    if n < 14:
        return _fit_naive(series, horizon)
    if HAS_ETS:
        try:
            return _fit_ets(series, horizon)
        except Exception:
            pass
    try:
        return _fit_linreg(series, horizon)
    except Exception:
        return _fit_naive(series, horizon)


# -----------------------------------------------------------------------
# A) train_and_predict
# -----------------------------------------------------------------------

def train_and_predict(
    db: Session,
    campaign_id: str,
    horizon_days: int = 7,
    end_date: Optional[date] = None,
) -> dict:
    cid = str(campaign_id)

    rows = db.execute(text("""
        SELECT
            metric_date,
            SUM(cost)::float             AS cost,
            SUM(conversions)::float      AS conversions,
            SUM(conversion_value)::float AS conversion_value
        FROM ad_metrics_daily
        WHERE campaign_id = :cid
        GROUP BY metric_date
        ORDER BY metric_date
    """), {"cid": cid}).fetchall()

    if not rows:
        return {"error": "Veri bulunamadı", "campaign_id": cid}

    df = pd.DataFrame([dict(r._mapping) for r in rows])
    df["metric_date"] = pd.to_datetime(df["metric_date"])
    for col in ["cost", "conversions", "conversion_value"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # as_of: verinin son tarihi veya verilen end_date
    as_of_ts = pd.Timestamp(end_date) if end_date else df["metric_date"].max()

    # Son 60 gün eğitim verisi
    train_start = as_of_ts - pd.Timedelta(days=60)
    df_train = df[(df["metric_date"] >= train_start) & (df["metric_date"] <= as_of_ts)].copy()
    df_train = _fill_date_range(df_train, train_start, as_of_ts)

    training_days = int(df_train["cost"].gt(0).sum())
    is_cold_start = training_days < 14

    # Tahmin tarihleri
    pred_dates = [as_of_ts + pd.Timedelta(days=i + 1) for i in range(horizon_days)]

    # Üç metrik için ayrı model
    cost_f, cost_lo, cost_hi, model_ver = _predict_series(df_train["cost"], horizon_days)
    conv_f, conv_lo, conv_hi, _         = _predict_series(df_train["conversions"], horizon_days)
    val_f,  val_lo,  val_hi,  _         = _predict_series(df_train["conversion_value"], horizon_days)

    def f(v) -> float:
        return round(float(v), 4)

    # Günlük tahmin listesi
    predictions = []
    for i in range(horizon_days):
        predictions.append({
            "date":             str(pred_dates[i].date()),
            "cost":             f(cost_f[i]),
            "conversions":      f(conv_f[i]),
            "conversion_value": f(val_f[i]),
            "lower_bound":      f(conv_lo[i]),
            "upper_bound":      f(conv_hi[i]),
        })

    # Özet (tüm değerler Python float)
    total_cost = float(sum(p["cost"] for p in predictions))
    total_conv = float(sum(p["conversions"] for p in predictions))
    total_val  = float(sum(p["conversion_value"] for p in predictions))
    pred_roas  = round(total_val / total_cost, 4) if total_cost > 0 else 0.0
    pred_cpa   = round(total_cost / total_conv, 4) if total_conv > 0 else 0.0

    # Confidence score
    data_completeness = float(min(1.0, training_days / 30))
    volatility_penalty = 0.0
    if float(df_train["cost"].std()) > 0 and float(df_train["cost"].mean()) > 0:
        cv = float(df_train["cost"].std()) / float(df_train["cost"].mean())
        volatility_penalty = min(0.3, cv * 0.3)
    confidence = round(data_completeness * 0.7 + 0.3 - volatility_penalty, 2)
    confidence = float(max(0.1, min(1.0, confidence)))

    fit_quality = "good" if confidence >= 0.7 else ("medium" if confidence >= 0.4 else "poor")

    result = {
        "campaign_id":   cid,
        "horizon_days":  int(horizon_days),
        "model_version": str(model_ver),
        "as_of_date":    str(as_of_ts.date()),
        "predictions":   predictions,
        "summary": {
            "total_predicted_cost":        round(total_cost, 2),
            "total_predicted_conversions": round(total_conv, 2),
            "total_predicted_revenue":     round(total_val,  2),
            "predicted_roas":              float(pred_roas),
            "predicted_cpa":               float(pred_cpa),
            "confidence_score":            float(confidence),
        },
        "data_quality": {
            "training_days": int(training_days),
            "is_cold_start": bool(is_cold_start),
            "fit_quality":   str(fit_quality),
        },
    }

    # DB'ye kaydet
    _save_prediction(db, cid, horizon_days, result)

    return result


def _save_prediction(db: Session, campaign_id: str, horizon_days: int, result: dict):
    """model_predictions tablosuna upsert (yeni kayıt ekle)."""
    from app.models.prediction import ModelPrediction
    summary = result["summary"]
    rec = ModelPrediction(
        id=uuid.uuid4(),
        campaign_id=uuid.UUID(campaign_id),
        prediction_horizon_days=int(horizon_days),
        predicted_conversions=float(summary["total_predicted_conversions"]),
        predicted_conversion_value=float(summary["total_predicted_revenue"]),
        predicted_cost=float(summary["total_predicted_cost"]),
        confidence_score=float(summary["confidence_score"]),
        model_version=str(result["model_version"]),
        predictions_detail=result,
    )
    db.add(rec)
    db.commit()


# -----------------------------------------------------------------------
# B) train_and_predict_all
# -----------------------------------------------------------------------

def train_and_predict_all(db: Session, ad_account_id: Optional[str] = None) -> int:
    """Tüm aktif kampanyalar için tahmin üretir."""
    if ad_account_id:
        rows = db.execute(text("""
            SELECT c.id::text FROM campaigns c
            JOIN ad_accounts a ON a.id = c.ad_account_id
            WHERE a.id = :aid AND c.status != 'removed'
        """), {"aid": ad_account_id}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT DISTINCT c.id::text
            FROM campaigns c
            JOIN ad_metrics_daily m ON m.campaign_id = c.id
            WHERE c.status != 'removed'
        """)).fetchall()

    count = 0
    for (cid,) in rows:
        try:
            train_and_predict(db, cid)
            count += 1
        except Exception:
            continue
    return count


# -----------------------------------------------------------------------
# C) get_latest_prediction
# -----------------------------------------------------------------------

def get_latest_prediction(db: Session, campaign_id: str) -> Optional[dict]:
    """En son tahmini döndürür."""
    row = db.execute(text("""
        SELECT predictions_detail, model_version, confidence_score,
               predicted_cost, predicted_conversions, predicted_conversion_value,
               generated_at
        FROM model_predictions
        WHERE campaign_id = :cid
          AND predictions_detail IS NOT NULL
        ORDER BY generated_at DESC
        LIMIT 1
    """), {"cid": str(campaign_id)}).fetchone()

    if not row:
        return None
    if row.predictions_detail:
        detail = dict(row.predictions_detail)
        detail["generated_at"] = str(row.generated_at)
        return detail
    # Eski format (predictions_detail yoksa)
    return {
        "model_version": row.model_version,
        "confidence_score": float(row.confidence_score or 0),
        "generated_at": str(row.generated_at),
        "summary": {
            "total_predicted_cost":        float(row.predicted_cost or 0),
            "total_predicted_conversions": float(row.predicted_conversions or 0),
            "total_predicted_revenue":     float(row.predicted_conversion_value or 0),
            "predicted_roas":              0.0,
            "confidence_score":            float(row.confidence_score or 0),
        }
    }
