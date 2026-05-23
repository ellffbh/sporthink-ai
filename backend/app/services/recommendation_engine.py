import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.recommendation import Recommendation, RecommendationAction, RecommendationStatus
from app.services.feature_service import compute_campaign_features
from app.services.prediction_service import get_latest_prediction


def _apply_rules(features: dict, campaign_name: str = "") -> dict:
    """
    Feature dict → Yapılandırılmış agresif analiz ve aksiyon planı
    """
    dq   = features.get("data_quality", {})
    t14  = features.get("trend_14d", {})
    t7   = features.get("trend_7d", {})
    cur  = features.get("current_metrics", {})
    info = features.get("campaign_info", {})

    conv_chg  = float(t14.get("conversions_change_pct", 0))
    cost_chg  = float(t14.get("cost_change_pct", 0))
    roas_chg  = float(t14.get("roas_change_pct", 0))
    cpa_chg   = float(t14.get("cpa_change_pct", 0))

    # 7-günlük değerler — reason metinleri için
    conv_chg_7 = float(t7.get("conversions_change_pct", 0))
    roas       = float(cur.get("roas_current", 0))
    cpa        = float(cur.get("cpa_current", 0))
    conv       = float(cur.get("conv_7d", 0))

    roas_cur  = roas
    is_pmax   = bool(info.get("is_pmax", False))

    name = campaign_name or "Kampanya"

    # KURAL 1 — Cold Start
    if dq.get("is_cold_start"):
        return {
            "action": RecommendationAction.review,
            "reason": (
                f"{name} kampanyasında son 7 günde veri dalgalanması tespit edildi. "
                f"ROAS: {roas:.2f}x, CPA: ${cpa:.0f}, Dönüşüm: {conv:.0f}. "
                f"Yeterli veri birikene kadar mevcut bütçe korunmalı, performans günlük izlenmeli."
            ),
            "confidence": 0.30,
            "change_pct": None,
            "metrics": [],
            "action_steps": [
                "Günlük bütçeyi asgari seviyede tutun.",
                "Hedef kitle sinyallerini ve arama terimlerini periyodik kontrol edin."
            ],
            "expected_impact": "Veri birikimi ve model optimizasyonu."
        }

    # KURAL 2 — Volatile
    if dq.get("is_volatile"):
        return {
            "action": RecommendationAction.review,
            "reason": (
                f"{name} kampanyasında son 7 günde veri dalgalanması tespit edildi. "
                f"ROAS: {roas:.2f}x, CPA: ${cpa:.0f}, Dönüşüm: {conv:.0f}. "
                f"Yeterli veri birikene kadar mevcut bütçe korunmalı, performans günlük izlenmeli."
            ),
            "confidence": 0.40,
            "change_pct": None,
            "metrics": [
                {"label": "ROAS Dalgalanması", "value": f"%{abs(roas_chg):.1f}", "is_negative": roas_chg < 0}
            ],
            "action_steps": [
                "Son 7 günlük anomaliyi manuel inceleyin.",
                "Dışsal faktörleri (stok, rakip fiyatlaması) kontrol edin."
            ],
            "expected_impact": "Olası bütçe israfının önlenmesi."
        }

    # KURAL 3 — Artır (Agresif Büyüme)
    if conv_chg > 15 and abs(cpa_chg) < 10 and roas_cur > 2.0:
        suggested = min(20.0, conv_chg * 0.5)
        confidence = 0.85 if is_pmax and roas_cur > 3 else 0.75

        return {
            "action": RecommendationAction.increase,
            "reason": (
                f"Son 7 günde dönüşüm hacmi %{conv_chg_7:.0f} artış gösterdi. "
                f"ROAS {roas:.2f}x ile güçlü performans devam ediyor, CPA ${cpa:.0f} hedef altında. "
                f"Bütçe artışı geliri optimize edebilir."
            ),
            "confidence": confidence,
            "change_pct": round(suggested, 1),
            "metrics": [
                {"label": "Dönüşüm Artışı", "value": f"+%{conv_chg:.1f}", "is_negative": False},
                {"label": "Güncel ROAS", "value": f"{roas:.2f}x", "is_negative": False}
            ],
            "action_steps": [
                f"Günlük bütçeyi derhal %{suggested:.0f} artırın.",
                "Maliyet artışını kompanse etmek için düşük performanslı arama terimlerini negatifleyin.",
                "Hedef ROAS (tROAS) değerini kademeli olarak düşürerek hacmi genişletin."
            ],
            "expected_impact": f"CPA limitleri dahilinde dönüşüm hacminde +%{conv_chg * 0.3:.1f} artış projeksiyonu."
        }

    # KURAL 4 — Azalt (Zarar Kes)
    if cost_chg > 15 and roas_chg < -10:
        confidence = 0.90 if is_pmax and roas_cur < 2 else 0.80

        return {
            "action": RecommendationAction.decrease,
            "reason": (
                f"Harcama artmasına rağmen dönüşüm %{abs(conv_chg_7):.0f} geriledi. "
                f"CPA ${cpa:.0f} ile hedefin üzerinde seyrediyor, ROAS {roas:.2f}x düşüş trendinde. "
                f"Bütçe kısılarak verimlilik yeniden test edilmeli."
            ),
            "confidence": confidence,
            "change_pct": -15.0,
            "metrics": [
                {"label": "Harcama Artışı", "value": f"+%{cost_chg:.1f}", "is_negative": True},
                {"label": "ROAS Düşüşü", "value": f"%{roas_chg:.1f}", "is_negative": True}
            ],
            "action_steps": [
                "Bütçeyi kesintisiz %15 oranında daraltın.",
                "Son 14 günde harcama yapıp dönüşüm getirmeyen (CPA > Kârlılık Sınırı) varlıkları durdurun."
            ],
            "expected_impact": "Negatif nakit akışının durdurulması ve CPA stabilizasyonu."
        }

    # KURAL 5 — Sabit Tut (Koruma)
    if abs(cost_chg) < 5 and abs(roas_chg) < 5:
        confidence = 0.75 if is_pmax and roas_cur > 3 else 0.65

        return {
            "action": RecommendationAction.hold,
            "reason": (
                f"Kampanya {name} son 7 günde stabil performans sergiledi. "
                f"ROAS {roas:.2f}x hedef aralığında, CPA ${cpa:.0f} ile kontrollü seyrediyor. "
                f"Ani değişiklik önerilmez, 14 gün daha izleme yapılmalı."
            ),
            "confidence": confidence,
            "change_pct": None,
            "metrics": [
                {"label": "ROAS Değişimi", "value": f"%{roas_chg:.1f}", "is_negative": roas_chg < 0},
                {"label": "Güncel ROAS", "value": f"{roas:.2f}x", "is_negative": False}
            ],
            "action_steps": [
                "Mevcut bütçe yapısını koruyun.",
                "Yalnızca kreatif (reklam metni/görsel) rotasyonu yaparak CTR'ı (Tıklama Oranı) iyileştirmeyi test edin."
            ],
            "expected_impact": "Mevcut pazar payının kârlı şekilde korunması."
        }

    # DEFAULT
    return {
        "action": RecommendationAction.review,
        "reason": (
            f"{name} kampanyasında son 7 günde veri dalgalanması tespit edildi. "
            f"ROAS: {roas:.2f}x, CPA: ${cpa:.0f}, Dönüşüm: {conv:.0f}. "
            f"Yeterli veri birikene kadar mevcut bütçe korunmalı, performans günlük izlenmeli."
        ),
        "confidence": 0.50,
        "change_pct": None,
        "metrics": [
            {"label": "CPA Değişimi", "value": f"%{cpa_chg:.1f}", "is_negative": cpa_chg > 0}
        ],
        "action_steps": [
            "Mikro dönüşümleri (Sepete Ekleme vb.) analiz edin.",
            "Teklif stratejisini gözden geçirin."
        ],
        "expected_impact": "Gizli darboğazların tespiti."
    }


def _apply_prediction_rules(
    base_rec: dict, roas_current: float, prediction: dict, campaign_name: str = ""
) -> dict:
    """
    Model tahminleri üzerinden mevcut öneriyi ezer (Kural 7 & 8).
    """
    if not prediction or "summary" not in prediction:
        return base_rec

    pred_roas = float(prediction["summary"].get("predicted_roas", 0))
    if pred_roas <= 0 or roas_current <= 0:
        return base_rec

    name = campaign_name or "Kampanya"

    # KURAL 7: Agresif Tahminsel Ölçekleme
    if pred_roas > roas_current * 1.15:
        return {
            "action": RecommendationAction.increase,
            "reason": (
                f"Tahmin modeli önümüzdeki 7 gün için ROAS'ın {pred_roas:.2f}x seviyesine ulaşmasını öngörüyor "
                f"(mevcut: {roas_current:.2f}x). Bütçe artışı bu büyüme potansiyelini değerlendirebilir."
            ),
            "confidence": 0.85,
            "change_pct": 15.0,
            "metrics": [
                {"label": "Güncel ROAS", "value": f"{roas_current:.2f}x", "is_negative": False},
                {"label": "Beklenen ROAS", "value": f"{pred_roas:.2f}x", "is_negative": False}
            ],
            "action_steps": [
                "Model sinyallerini desteklemek için bütçeyi %15 artırın.",
                "Genişleyen gösterim payında dönüşüm oranını korumak için sepet ortalamasını artırıcı teklifler uygulayın."
            ],
            "expected_impact": f"Tahmini getiri eğrisi: {pred_roas:.2f}x seviyesine tırmanış."
        }

    # KURAL 8: Tahminsel Defans
    if pred_roas < roas_current * 0.85:
        return {
            "action": RecommendationAction.decrease,
            "reason": (
                f"Tahmin modeli önümüzdeki 7 gün için ROAS'ın {pred_roas:.2f}x seviyesine düşmesini öngörüyor "
                f"(mevcut: {roas_current:.2f}x). Bütçe azaltımı riski sınırlayabilir."
            ),
            "confidence": 0.85,
            "change_pct": -15.0,
            "metrics": [
                {"label": "Güncel ROAS", "value": f"{roas_current:.2f}x", "is_negative": False},
                {"label": "Beklenen ROAS", "value": f"{pred_roas:.2f}x", "is_negative": True}
            ],
            "action_steps": [
                "Bütçeyi %15 küçülterek defansif stratejiye geçin.",
                "Erişim payı (Impression Share) kaybedilecek ancak CPA korunacak."
            ],
            "expected_impact": "Öngörülen marj daralmasının minimum hasarla atlatılması."
        }

    return base_rec


def generate_recommendations(db: Session) -> list[dict]:
    """
    Tüm kampanyalar için feature-based öneri üretir.
    Mevcut 'pending' önerileri siler, yenilerini kaydeder.
    """
    campaign_ids = db.execute(text("""
        SELECT DISTINCT c.id::text, c.campaign_name
        FROM campaigns c
        JOIN ad_metrics_daily m ON m.campaign_id = c.id
        WHERE c.status != 'removed'
        ORDER BY c.campaign_name
    """)).fetchall()

    generated = []

    for row in campaign_ids:
        cid  = row[0]
        name = row[1]

        try:
            features = compute_campaign_features(db, cid)
        except Exception:
            continue

        if "error" in features:
            continue

        # Temel kuralları uygula
        rec_data = _apply_rules(features, name)

        # Tahmin destekli ezici kuralları uygula
        prediction = get_latest_prediction(db, cid)
        roas_cur = float(features.get("current_metrics", {}).get("roas_current", 0))
        rec_data = _apply_prediction_rules(rec_data, roas_cur, prediction, name)

        # Eski pending öneriyi sil
        db.execute(text("""
            DELETE FROM recommendations
            WHERE campaign_id = :cid AND status = 'pending'
        """), {"cid": cid})

        risk_score = round((1.0 - rec_data["confidence"]) * 10, 1)

        rec = Recommendation(
            id=uuid.uuid4(),
            campaign_id=uuid.UUID(cid),
            action=rec_data["action"],
            suggested_change_percent=rec_data["change_pct"],
            reason=rec_data["reason"],
            risk_score=risk_score,
            status=RecommendationStatus.pending,
            metrics=rec_data["metrics"],
            action_steps=rec_data["action_steps"],
            expected_impact=rec_data["expected_impact"]
        )
        db.add(rec)

        generated.append({
            "campaign_id":    cid,
            "campaign_name":  name,
            "action":         rec_data["action"].value,
            "reason":         rec_data["reason"],
            "confidence":     rec_data["confidence"],
            "risk_score":     risk_score,
            "change_percent": rec_data["change_pct"],
            "metrics":        rec_data["metrics"],
            "action_steps":   rec_data["action_steps"],
            "expected_impact":rec_data["expected_impact"],
            "as_of_date":     features.get("as_of_date")
        })

    db.commit()
    return generated