import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from datetime import date, timedelta
from app.database import get_db
from app.models.ad_metric import AdMetricDaily

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


@router.post("/detect")
def detect_anomalies(db: Session = Depends(get_db)):
    max_date       = db.query(func.max(AdMetricDaily.metric_date)).scalar() or date.today()
    baseline_start = max_date - timedelta(days=90)
    latest_start   = max_date - timedelta(days=7)

    results = db.execute(text("""
        WITH stats AS (
            SELECT
                campaign_id,
                AVG(cost)                                                              AS avg_cost,
                STDDEV(cost)                                                           AS std_cost,
                AVG(conversions)                                                       AS avg_conv,
                STDDEV(conversions)                                                    AS std_conv,
                AVG(ctr)                                                               AS avg_ctr,
                STDDEV(ctr)                                                            AS std_ctr,
                AVG(CASE WHEN cost > 0 THEN conversion_value / cost ELSE NULL END)    AS avg_roas,
                STDDEV(CASE WHEN cost > 0 THEN conversion_value / cost ELSE NULL END) AS std_roas
            FROM ad_metrics_daily
            WHERE metric_date >= :baseline_start
            GROUP BY campaign_id
        ),
        latest_avg AS (
            SELECT
                campaign_id,
                AVG(cost)                                                           AS avg_cost_7d,
                AVG(conversions)                                                    AS avg_conv_7d,
                AVG(ctr)                                                            AS avg_ctr_7d,
                AVG(CASE WHEN cost > 0 THEN conversion_value / cost ELSE NULL END) AS avg_roas_7d
            FROM ad_metrics_daily
            WHERE metric_date >= :latest_start
            GROUP BY campaign_id
        ),
        latest AS (
            SELECT
                m.campaign_id,
                m.metric_date,
                m.cost,
                m.conversions,
                m.ctr,
                CASE WHEN m.cost > 0 THEN m.conversion_value / m.cost ELSE NULL END AS roas,
                c.campaign_name
            FROM ad_metrics_daily m
            JOIN campaigns c ON c.id = m.campaign_id
            WHERE m.metric_date >= :latest_start
        )
        SELECT
            l.campaign_id,
            l.campaign_name,
            l.metric_date,
            l.cost,
            l.conversions,
            l.ctr,
            l.roas,
            s.avg_cost,
            s.avg_conv,
            s.avg_ctr,
            s.avg_roas,
            la.avg_cost_7d,
            la.avg_conv_7d,
            la.avg_ctr_7d,
            la.avg_roas_7d,
            CASE WHEN s.std_cost > 0
                 THEN ABS(l.cost        - s.avg_cost) / s.std_cost ELSE 0 END AS cost_zscore,
            CASE WHEN s.std_conv > 0
                 THEN ABS(l.conversions - s.avg_conv) / s.std_conv ELSE 0 END AS conv_zscore,
            CASE WHEN s.std_ctr  > 0
                 THEN ABS(l.ctr        - s.avg_ctr)  / s.std_ctr  ELSE 0 END AS ctr_zscore,
            CASE WHEN s.std_roas > 0 AND l.roas IS NOT NULL
                 THEN ABS(l.roas       - s.avg_roas)  / s.std_roas ELSE 0 END AS roas_zscore
        FROM latest l
        JOIN stats      s  ON s.campaign_id  = l.campaign_id
        JOIN latest_avg la ON la.campaign_id = l.campaign_id
        WHERE
            (s.std_cost > 0 AND ABS(l.cost        - s.avg_cost) / s.std_cost > 1.5)
            OR (s.std_conv > 0 AND ABS(l.conversions - s.avg_conv) / s.std_conv > 1.5)
            OR (s.std_ctr  > 0 AND ABS(l.ctr        - s.avg_ctr)  / s.std_ctr  > 2.0)
            OR (s.std_roas > 0 AND l.roas IS NOT NULL
                               AND ABS(l.roas       - s.avg_roas)  / s.std_roas > 1.5)
        ORDER BY l.metric_date DESC
    """), {"baseline_start": baseline_start, "latest_start": latest_start}).fetchall()

    def _pct(val_7d, val_90d) -> float:
        v7, v90 = float(val_7d or 0), float(val_90d or 0)
        return round((v7 - v90) / v90 * 100, 2) if v90 != 0 else 0.0

    anomalies = []
    for r in results:
        cost_z = float(r.cost_zscore or 0)
        conv_z = float(r.conv_zscore or 0)
        ctr_z  = float(r.ctr_zscore  or 0)
        roas_z = float(r.roas_zscore or 0)

        z_by_type: dict[str, float] = {}
        if cost_z > 1.5: z_by_type["Anormal Harcama"]  = cost_z
        if conv_z > 1.5: z_by_type["Anormal Dönüşüm"] = conv_z
        if ctr_z  > 2.0: z_by_type["Anormal CTR"]      = ctr_z
        if roas_z > 1.5: z_by_type["Anormal ROAS"]     = roas_z

        if not z_by_type:
            continue

        max_z    = max(z_by_type.values())
        severity = "high" if max_z >= 3 else "medium" if max_z >= 2 else "low"
        dominant = max(z_by_type, key=z_by_type.get)

        pct_map = {
            "Anormal Harcama":  _pct(r.avg_cost_7d,  r.avg_cost),
            "Anormal Dönüşüm": _pct(r.avg_conv_7d,  r.avg_conv),
            "Anormal CTR":      _pct(r.avg_ctr_7d,   r.avg_ctr),
            "Anormal ROAS":     _pct(r.avg_roas_7d,  r.avg_roas),
        }
        change_pct = pct_map.get(dominant, 0.0)

        note_parts: list[str] = []
        if "Anormal Harcama" in z_by_type:
            a_c = float(r.avg_cost_7d or 0)
            e_c = float(r.avg_cost    or 0)
            ratio = round(a_c / e_c, 1) if e_c > 0 else 0
            dir_  = "üzerinde" if a_c >= e_c else "altında"
            note_parts.append(
                f"Harcama son 7 günde günlük ort. ${a_c:.0f} — "
                f"beklenen ${e_c:.0f} (normalin {ratio:.1f}x {dir_})"
            )
        if "Anormal Dönüşüm" in z_by_type:
            a_v = float(r.avg_conv_7d or 0)
            e_v = float(r.avg_conv    or 0)
            ratio = round(a_v / e_v, 1) if e_v > 0 else 0
            dir_  = "üzerinde" if a_v >= e_v else "altında"
            note_parts.append(
                f"Dönüşüm hacmi son 7 günde ort. {a_v:.1f} — "
                f"beklenen {e_v:.1f} (normalin {ratio:.1f}x {dir_})"
            )
        if "Anormal CTR" in z_by_type:
            a_t = float(r.avg_ctr_7d or 0) * 100
            e_t = float(r.avg_ctr    or 0) * 100
            note_parts.append(
                f"CTR son 7 günde %{a_t:.2f} — beklenen %{e_t:.2f}"
            )
        if "Anormal ROAS" in z_by_type:
            a_r = float(r.avg_roas_7d or 0)
            e_r = float(r.avg_roas    or 0)
            note_parts.append(
                f"ROAS son 7 günde {a_r:.2f}x — beklenen {e_r:.2f}x"
            )
        note = "; ".join(note_parts)

        anomalies.append({
            "campaign_id":   str(r.campaign_id),
            "campaign_name": r.campaign_name,
            "metric_date":   str(r.metric_date),
            "cost":          float(r.cost),
            "conversions":   float(r.conversions),
            "cost_zscore":   round(cost_z, 2),
            "conv_zscore":   round(conv_z, 2),
            "ctr_zscore":    round(ctr_z,  2),
            "roas_zscore":   round(roas_z, 2),
            "anomaly_types": list(z_by_type.keys()),
            "severity":      severity,
            "change_pct":    change_pct,
            "note":          note,
        })

    # Dedup: kampanya + metrik tipi kombinasyonu başına tek kayıt
    # results ORDER BY metric_date DESC olduğundan ilk görülen = en güncel gün
    seen_keys: set[tuple] = set()
    deduped: list[dict]   = []
    for a in anomalies:
        key = (a["campaign_id"], frozenset(a["anomaly_types"]))
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(a)
    anomalies = deduped

    db.execute(text("DELETE FROM anomalies WHERE is_resolved IS FALSE"))

    for a in anomalies:
        db.execute(text("""
            INSERT INTO anomalies (id, campaign_id, metric_name, change_percent, severity, note, detected_at, is_resolved)
            VALUES (gen_random_uuid(), :cid, :metric_name, :change_percent, :severity, :note, NOW(), false)
        """), {
            "cid":            a["campaign_id"],
            "metric_name":    ", ".join(a["anomaly_types"]),
            "change_percent": a["change_pct"],
            "severity":       a["severity"],
            "note":           a["note"],
        })
    db.commit()

    return {"detected": len(anomalies), "anomalies": anomalies}


@router.get("/")
def list_anomalies(
    campaign_id: Optional[str] = Query(default=None),
    page:        int           = Query(default=1,  ge=1),
    limit:       int           = Query(default=15, ge=1, le=500),
    db: Session = Depends(get_db),
):
    where  = "WHERE a.campaign_id = :campaign_id" if campaign_id else ""
    base_p = {"campaign_id": campaign_id} if campaign_id else {}
    total  = db.execute(text(f"""
        SELECT COUNT(*) FROM anomalies a
        JOIN campaigns c  ON c.id  = a.campaign_id
        JOIN ad_accounts aa ON aa.id = c.ad_account_id
        {where}
    """), base_p).scalar() or 0
    rows = db.execute(text(f"""
        WITH max_dt AS (
            SELECT MAX(metric_date) AS mdate FROM ad_metrics_daily
        )
        SELECT
            a.id,
            a.campaign_id,
            c.campaign_name,
            aa.platform,
            a.metric_name,
            a.severity,
            a.note,
            a.change_percent,
            a.detected_at,
            a.is_resolved,
            CASE
                WHEN a.metric_name ILIKE '%Anormal Harcama%' THEN
                    (SELECT ROUND(AVG(m.cost)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal Dönüşüm%' THEN
                    (SELECT ROUND(AVG(m.conversions)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal CTR%' THEN
                    (SELECT ROUND(AVG(m.ctr)::numeric, 6)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal ROAS%' THEN
                    (SELECT ROUND(AVG(CASE WHEN m.cost > 0 THEN m.conversion_value / m.cost ELSE NULL END)::numeric, 4)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
            END AS expected_value,
            CASE
                WHEN a.metric_name ILIKE '%Anormal Harcama%' THEN
                    (SELECT ROUND(AVG(m.cost)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal Dönüşüm%' THEN
                    (SELECT ROUND(AVG(m.conversions)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal CTR%' THEN
                    (SELECT ROUND(AVG(m.ctr)::numeric, 6)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal ROAS%' THEN
                    (SELECT ROUND(AVG(CASE WHEN m.cost > 0 THEN m.conversion_value / m.cost ELSE NULL END)::numeric, 4)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
            END AS actual_value
        FROM anomalies a
        JOIN campaigns c  ON c.id  = a.campaign_id
        JOIN ad_accounts aa ON aa.id = c.ad_account_id
        {where}
        ORDER BY a.detected_at DESC
        LIMIT :limit OFFSET :offset
    """), {**base_p, "limit": limit, "offset": (page - 1) * limit}).fetchall()

    return {
        "data": [
            {
                "id":             str(r.id),
                "campaign_id":    str(r.campaign_id),
                "campaign_name":  r.campaign_name,
                "platform":       r.platform,
                "metric_name":    r.metric_name,
                "severity":       r.severity,
                "note":           r.note,
                "change_percent": float(r.change_percent or 0),
                "detected_at":    str(r.detected_at),
                "is_resolved":    bool(r.is_resolved),
                "expected_value": float(r.expected_value) if r.expected_value is not None else None,
                "actual_value":   float(r.actual_value)   if r.actual_value   is not None else None,
            }
            for r in rows
        ],
        "total": total,
        "page":  page,
        "limit": limit,
        "pages": -(-total // limit),  # ceiling division
    }


@router.get("/{anomaly_id}")
def get_anomaly(
    anomaly_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    row = db.execute(text("""
        WITH max_dt AS (
            SELECT MAX(metric_date) AS mdate FROM ad_metrics_daily
        )
        SELECT
            a.id,
            a.campaign_id,
            c.campaign_name,
            aa.platform,
            a.metric_name,
            a.severity,
            a.note,
            a.change_percent,
            a.detected_at,
            a.is_resolved,
            CASE
                WHEN a.metric_name ILIKE '%Anormal Harcama%' THEN
                    (SELECT ROUND(AVG(m.cost)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal Dönüşüm%' THEN
                    (SELECT ROUND(AVG(m.conversions)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal CTR%' THEN
                    (SELECT ROUND(AVG(m.ctr)::numeric, 6)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal ROAS%' THEN
                    (SELECT ROUND(AVG(CASE WHEN m.cost > 0 THEN m.conversion_value / m.cost ELSE NULL END)::numeric, 4)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate)
            END AS expected_value,
            CASE
                WHEN a.metric_name ILIKE '%Anormal Harcama%' THEN
                    (SELECT ROUND(AVG(m.cost)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal Dönüşüm%' THEN
                    (SELECT ROUND(AVG(m.conversions)::numeric, 2)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal CTR%' THEN
                    (SELECT ROUND(AVG(m.ctr)::numeric, 6)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
                WHEN a.metric_name ILIKE '%Anormal ROAS%' THEN
                    (SELECT ROUND(AVG(CASE WHEN m.cost > 0 THEN m.conversion_value / m.cost ELSE NULL END)::numeric, 4)
                     FROM ad_metrics_daily m, max_dt
                     WHERE m.campaign_id = a.campaign_id
                       AND m.metric_date BETWEEN max_dt.mdate - 7 AND max_dt.mdate)
            END AS actual_value
        FROM anomalies a
        JOIN campaigns c   ON c.id   = a.campaign_id
        JOIN ad_accounts aa ON aa.id = c.ad_account_id
        WHERE a.id = :anomaly_id
    """), {"anomaly_id": str(anomaly_id)}).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Anomali bulunamadı")

    trend_rows = db.execute(text("""
        WITH max_dt AS (
            SELECT MAX(metric_date) AS mdate FROM ad_metrics_daily
        )
        SELECT
            m.metric_date,
            m.cost,
            m.conversions,
            m.ctr,
            CASE WHEN m.cost > 0
                 THEN ROUND((m.conversion_value / m.cost)::numeric, 4)
                 ELSE 0 END AS roas
        FROM ad_metrics_daily m, max_dt
        WHERE m.campaign_id = :campaign_id
          AND m.metric_date BETWEEN max_dt.mdate - 30 AND max_dt.mdate
        ORDER BY m.metric_date ASC
    """), {"campaign_id": str(row.campaign_id)}).fetchall()

    other_rows = db.execute(text("""
        SELECT
            a.id,
            a.metric_name,
            a.severity,
            a.change_percent,
            a.detected_at,
            a.is_resolved
        FROM anomalies a
        WHERE a.campaign_id = :campaign_id
          AND a.id != :anomaly_id
        ORDER BY a.detected_at DESC
        LIMIT 5
    """), {"campaign_id": str(row.campaign_id), "anomaly_id": str(anomaly_id)}).fetchall()

    rec_row = db.execute(text("""
        SELECT id, action, suggested_change_percent, reason, risk_score, status, generated_at
        FROM recommendations
        WHERE campaign_id = :campaign_id
        ORDER BY generated_at DESC
        LIMIT 1
    """), {"campaign_id": str(row.campaign_id)}).fetchone()

    return {
        "id":             str(row.id),
        "campaign_id":    str(row.campaign_id),
        "campaign_name":  row.campaign_name,
        "platform":       row.platform,
        "metric_name":    row.metric_name,
        "severity":       row.severity,
        "note":           row.note,
        "change_percent": float(row.change_percent or 0),
        "detected_at":    str(row.detected_at),
        "is_resolved":    bool(row.is_resolved),
        "expected_value": float(row.expected_value) if row.expected_value is not None else None,
        "actual_value":   float(row.actual_value)   if row.actual_value   is not None else None,
        "trend": [
            {
                "date":        str(t.metric_date),
                "cost":        float(t.cost),
                "conversions": float(t.conversions),
                "ctr":         float(t.ctr),
                "roas":        float(t.roas),
            }
            for t in trend_rows
        ],
        "other_anomalies": [
            {
                "id":             str(o.id),
                "metric_name":    o.metric_name,
                "severity":       o.severity,
                "change_percent": float(o.change_percent or 0),
                "detected_at":    str(o.detected_at),
                "is_resolved":    bool(o.is_resolved),
            }
            for o in other_rows
        ],
        "recommendation": {
            "id":                      str(rec_row.id),
            "action":                  rec_row.action,
            "suggested_change_percent": float(rec_row.suggested_change_percent) if rec_row.suggested_change_percent is not None else None,
            "reason":                  rec_row.reason,
            "risk_score":              float(rec_row.risk_score) if rec_row.risk_score is not None else None,
            "status":                  rec_row.status,
            "generated_at":            str(rec_row.generated_at),
        } if rec_row else None,
    }