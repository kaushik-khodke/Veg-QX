"""
services/database_service.py
SQLite CRUD operations. SQLite is the single source of truth for all prediction,
verification, and model versioning data in the Tomato Freshness Detection System.
"""
import sqlite3
import csv
import io
import os
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

from config import (
    PREDICTION_HISTORY_DB,
    PREDICTION_HISTORY_CSV,
    VERIFIED_DATASET_CSV,
    DATASETS_DIR,
)

SCHEMA_PATH = Path(__file__).parent.parent / "database" / "schema.sql"
SNAPSHOTS_DIR = DATASETS_DIR / "snapshots"
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Connection & Transactions ────────────────────────────────────────────────

_migrated = False

def get_connection() -> sqlite3.Connection:
    global _migrated
    conn = sqlite3.connect(str(PREDICTION_HISTORY_DB), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    if not _migrated:
        try:
            _migrate_database_schema(conn)
            conn.commit()
            _migrated = True
        except Exception as e:
            print(f"[database_service] Migration notice: {e}")
    return conn


@contextmanager
def db_context():
    """
    Context manager for database connections ensuring atomic transactions.
    Rolls back automatically on failure and commits on success.
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate_database_schema(conn: sqlite3.Connection):
    """Safely apply column additions for existing databases without breaking data."""
    cursor = conn.cursor()

    # 1. Migrations for predictions table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(predictions)")
        pred_cols = [row["name"] for row in cursor.fetchall()]
        if "commodity" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN commodity TEXT DEFAULT 'tomato'")
        if "specimen_id" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN specimen_id TEXT")
        if "status" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'")
        if "software_version" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN software_version TEXT DEFAULT '1.1'")
        if "firmware_version" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN firmware_version TEXT DEFAULT 'v2.0'")
        if "sensor_type" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN sensor_type TEXT DEFAULT 'AS7341'")
        if "device_id" not in pred_cols:
            cursor.execute("ALTER TABLE predictions ADD COLUMN device_id TEXT DEFAULT 'ESP32_01'")

    # 2. Migrations for verified_predictions table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='verified_predictions'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(verified_predictions)")
        ver_cols = [row["name"] for row in cursor.fetchall()]
        if "food_type" not in ver_cols:
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN food_type TEXT DEFAULT 'tomato'")
        if "commodity" not in ver_cols:
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN commodity TEXT DEFAULT 'tomato'")
        if "specimen_id" not in ver_cols:
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN specimen_id TEXT")
        if "blue" not in ver_cols:
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN blue REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN green REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN yellow REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN orange REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN red REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN nir REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN ndvi REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN gndvi REAL")
            cursor.execute("ALTER TABLE verified_predictions ADD COLUMN rvi REAL")

    # 3. Migrations for retraining_runs table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='retraining_runs'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(retraining_runs)")
        retrain_cols = [row["name"] for row in cursor.fetchall()]
        if retrain_cols:
            for col, col_type in [
                ("food_type", "TEXT DEFAULT 'tomato'"),
                ("base_version", "TEXT"),
                ("new_version", "TEXT"),
                ("training_samples", "INTEGER DEFAULT 0"),
                ("reference_samples", "INTEGER DEFAULT 0"),
                ("verified_samples", "INTEGER DEFAULT 0"),
                ("accuracy", "REAL DEFAULT 0.0"),
                ("precision", "REAL DEFAULT 0.0"),
                ("recall", "REAL DEFAULT 0.0"),
                ("f1", "REAL DEFAULT 0.0"),
                ("r2", "REAL DEFAULT 0.0"),
                ("mae", "REAL DEFAULT 0.0"),
                ("rmse", "REAL DEFAULT 0.0"),
                ("training_duration_sec", "REAL DEFAULT 0.0"),
                ("status", "TEXT DEFAULT 'SUCCESS'"),
                ("snapshot_path", "TEXT"),
                ("deployed", "INTEGER DEFAULT 0"),
                ("notes", "TEXT"),
            ]:
                if col not in retrain_cols:
                    cursor.execute(f"ALTER TABLE retraining_runs ADD COLUMN {col} {col_type}")

    # 4. Migrations for model_versions table
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='model_versions'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(model_versions)")
        mv_cols = [row["name"] for row in cursor.fetchall()]
        if mv_cols:
            for col, col_type in [
                ("food_type", "TEXT DEFAULT 'tomato'"),
                ("training_samples", "INTEGER DEFAULT 0"),
                ("classification_accuracy", "REAL DEFAULT 0.0"),
                ("regression_r2", "REAL DEFAULT 0.0"),
                ("mae", "REAL DEFAULT 0.0"),
                ("rmse", "REAL DEFAULT 0.0"),
                ("is_active", "INTEGER DEFAULT 0"),
                ("pkl_path", "TEXT"),
                ("notes", "TEXT"),
            ]:
                if col not in mv_cols:
                    cursor.execute(f"ALTER TABLE model_versions ADD COLUMN {col} {col_type}")

    # 5. Automatically repair any pre-existing NULL values in tables
    _repair_null_records(conn)


def _repair_null_records(conn: sqlite3.Connection):
    """
    Backfills and repairs any pre-existing NULL values in predictions and verified_predictions.
    Guarantees 100% feature completeness for training and CSV exports.
    """
    cursor = conn.cursor()

    # Check if tables exist before backfilling
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'")
    has_pred = cursor.fetchone()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='verified_predictions'")
    has_ver = cursor.fetchone()

    if has_pred and has_ver:
        cursor.execute("""
            UPDATE verified_predictions
            SET 
                blue = COALESCE(blue, (SELECT blue FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                green = COALESCE(green, (SELECT green FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                yellow = COALESCE(yellow, (SELECT yellow FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                orange = COALESCE(orange, (SELECT orange FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                red = COALESCE(red, (SELECT red FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                nir = COALESCE(nir, (SELECT nir FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 50.0),
                freshness_score = COALESCE(freshness_score, (SELECT freshness_score FROM predictions WHERE predictions.id = verified_predictions.prediction_id), 85.0),
                commodity = COALESCE(commodity, food_type, 'tomato'),
                food_type = COALESCE(food_type, commodity, 'tomato'),
                specimen_id = COALESCE(specimen_id, 'SPEC-' || CAST(tomato_id AS TEXT))
            WHERE blue IS NULL OR green IS NULL OR yellow IS NULL OR orange IS NULL OR red IS NULL OR nir IS NULL
               OR commodity IS NULL OR food_type IS NULL OR specimen_id IS NULL
        """)

    if has_pred:
        cursor.execute("""
            UPDATE predictions
            SET 
                blue = COALESCE(blue, 50.0),
                green = COALESCE(green, 50.0),
                yellow = COALESCE(yellow, 50.0),
                orange = COALESCE(orange, 50.0),
                red = COALESCE(red, 50.0),
                nir = COALESCE(nir, 50.0),
                commodity = COALESCE(commodity, food_type, 'tomato'),
                food_type = COALESCE(food_type, commodity, 'tomato'),
                specimen_id = COALESCE(specimen_id, 'SPEC-' || CAST(tomato_id AS TEXT))
            WHERE blue IS NULL OR green IS NULL OR yellow IS NULL OR orange IS NULL OR red IS NULL OR nir IS NULL
               OR commodity IS NULL OR food_type IS NULL OR specimen_id IS NULL
        """)
        # Canonicalize model version names in predictions
        cursor.execute("""
            UPDATE predictions
            SET model_version = 'XGB_tomato_v1.1'
            WHERE model_version IN ('tomato_v1.1', 'v1.1', '1.1') AND (food_type = 'tomato' OR food_type IS NULL)
        """)
        cursor.execute("""
            UPDATE predictions
            SET model_version = 'XGB_tomato_v1.0'
            WHERE model_version IN ('tomato_v1.0', 'v1.0', '1.0') AND (food_type = 'tomato' OR food_type IS NULL)
        """)
        cursor.execute("""
            UPDATE predictions
            SET model_version = 'XGB_' || food_type || '_v1.0'
            WHERE (model_version IN ('v1.0', '1.0') OR model_version IS NULL) AND food_type != 'tomato' AND food_type IS NOT NULL
        """)

    if has_ver:
        rows = cursor.execute("SELECT id, blue, green, red, nir, ndvi, gndvi, rvi FROM verified_predictions WHERE ndvi IS NULL OR gndvi IS NULL OR rvi IS NULL").fetchall()
        for r in rows:
            red_val = r["red"] if r["red"] is not None else 50.0
            green_val = r["green"] if r["green"] is not None else 50.0
            nir_val = r["nir"] if r["nir"] is not None else 50.0
            ndvi_val = float((nir_val - red_val) / (nir_val + red_val + 1e-8))
            gndvi_val = float((nir_val - green_val) / (nir_val + green_val + 1e-8))
            rvi_val = float(nir_val / (red_val + 1e-8))
            cursor.execute("UPDATE verified_predictions SET ndvi = ?, gndvi = ?, rvi = ? WHERE id = ?", (ndvi_val, gndvi_val, rvi_val, r["id"]))
        cursor.execute("""
            UPDATE verified_predictions
            SET model_version = 'XGB_tomato_v1.1'
            WHERE model_version IN ('tomato_v1.1', 'v1.1', '1.1') AND (commodity = 'tomato' OR food_type = 'tomato' OR commodity IS NULL)
        """)
        cursor.execute("""
            UPDATE verified_predictions
            SET model_version = 'XGB_' || COALESCE(commodity, food_type, 'tomato') || '_v1.0'
            WHERE model_version IN ('v1.0', '1.0') OR model_version IS NULL
        """)


def init_database():
    """Create all tables if they don't exist and run migrations. Run once on startup."""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with db_context() as conn:
        conn.executescript(schema_sql)
        _migrate_database_schema(conn)
    _ensure_prediction_csv_header()
    _ensure_verified_csv_header()


# ─── Tomato ID Generator ─────────────────────────────────────────────────────

def get_next_tomato_id() -> int:
    """
    Returns the next available unique Tomato_ID managed directly by SQLite.
    Persists across application restarts.
    """
    with db_context() as conn:
        r1 = conn.execute("SELECT MAX(tomato_id) as max_id FROM predictions").fetchone()
        r2 = conn.execute("SELECT MAX(tomato_id) as max_id FROM verified_predictions").fetchone()
        m1 = r1["max_id"] if r1 and r1["max_id"] is not None else 0
        m2 = r2["max_id"] if r2 and r2["max_id"] is not None else 0
        current_max = max(m1, m2, 1000)
        return current_max + 1


# ─── Prediction CRUD ─────────────────────────────────────────────────────────

def save_prediction(data: dict) -> int:
    """
    Insert a prediction record into SQLite and append to CSV.
    Assigns a database-managed tomato_id and specimen_id if none is provided.
    Returns the new row ID.
    """
    commodity = data.get("commodity") or data.get("food_type") or "tomato"
    tomato_id = data.get("tomato_id")
    if not tomato_id:
        tomato_id = get_next_tomato_id()

    specimen_id = data.get("specimen_id")
    if not specimen_id:
        spec_prefix = commodity[:3].upper()
        specimen_id = f"{spec_prefix}-{tomato_id}"

    sql = """
    INSERT INTO predictions (
        timestamp, food_type, commodity, specimen_id, tomato_id, position,
        blue, green, yellow, orange, red, nir,
        ndvi, gndvi, rvi,
        freshness_score, category,
        confidence_fresh, confidence_aging, confidence_spoiling,
        model_version, input_source, status,
        software_version, firmware_version, sensor_type, device_id
    ) VALUES (
        :timestamp, :food_type, :commodity, :specimen_id, :tomato_id, :position,
        :blue, :green, :yellow, :orange, :red, :nir,
        :ndvi, :gndvi, :rvi,
        :freshness_score, :category,
        :confidence_fresh, :confidence_aging, :confidence_spoiling,
        :model_version, :input_source, 'PENDING',
        :software_version, :firmware_version, :sensor_type, :device_id
    )
    """
    # Robust case-insensitive getter
    blue = data.get("blue") if data.get("blue") is not None else data.get("Blue", 50.0)
    green = data.get("green") if data.get("green") is not None else data.get("Green", 50.0)
    yellow = data.get("yellow") if data.get("yellow") is not None else data.get("Yellow", 50.0)
    orange = data.get("orange") if data.get("orange") is not None else data.get("Orange", 50.0)
    red = data.get("red") if data.get("red") is not None else data.get("Red", 50.0)
    nir = data.get("nir") if data.get("nir") is not None else data.get("NIR", 50.0)

    ndvi = data.get("ndvi") if data.get("ndvi") is not None else data.get("NDVI")
    if ndvi is None:
        ndvi = float((nir - red) / (nir + red + 1e-8))

    gndvi = data.get("gndvi") if data.get("gndvi") is not None else data.get("GNDVI")
    if gndvi is None:
        gndvi = float((nir - green) / (nir + green + 1e-8))

    rvi = data.get("rvi") if data.get("rvi") is not None else data.get("RVI")
    if rvi is None:
        rvi = float(nir / (red + 1e-8))

    row = {
        "timestamp":            data.get("timestamp", datetime.utcnow().isoformat()),
        "food_type":            commodity,
        "commodity":            commodity,
        "specimen_id":          specimen_id,
        "tomato_id":            tomato_id,
        "position":             data.get("position", 1),
        "blue":                 blue,
        "green":                green,
        "yellow":               yellow,
        "orange":               orange,
        "red":                  red,
        "nir":                  nir,
        "ndvi":                 ndvi,
        "gndvi":                gndvi,
        "rvi":                  rvi,
        "freshness_score":      data.get("freshness_score"),
        "category":             data.get("category"),
        "confidence_fresh":     data.get("confidence_fresh", 0.0),
        "confidence_aging":     data.get("confidence_aging", 0.0),
        "confidence_spoiling":  data.get("confidence_spoiling", 0.0),
        "model_version":        data.get("model_version", "v1.1"),
        "input_source":         data.get("input_source", "manual"),
        "software_version":     data.get("software_version", "1.1"),
        "firmware_version":     data.get("firmware_version", "v2.0"),
        "sensor_type":          data.get("sensor_type", "AS7341"),
        "device_id":            data.get("device_id", "ESP32_01"),
    }
    with db_context() as conn:
        cursor = conn.execute(sql, row)
        row_id = cursor.lastrowid

    # Dual-write to CSV
    _append_prediction_csv({**row, "id": row_id})
    return row_id


def get_prediction_history(
    food_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    category: Optional[str] = None,
    status: str = "PENDING",
) -> list[dict]:
    """Returns only pending (unverified) predictions by default.
    Supports filtering by specific commodity/food_type or returning all specimens.
    """
    filters = ["status = :status"]
    params: dict = {"status": status, "limit": limit, "offset": offset}

    if food_type and food_type.strip().lower() not in ("all", "all specimens", "none", ""):
        filters.append("(food_type = :food_type OR commodity = :food_type)")
        params["food_type"] = food_type.strip().lower()

    if category and category.strip().lower() not in ("all", "all categories", "none", ""):
        filters.append("category = :category")
        params["category"] = category.strip()

    where = " AND ".join(filters)
    sql = f"""
    SELECT * FROM predictions
    WHERE {where}
    ORDER BY timestamp DESC, id DESC
    LIMIT :limit OFFSET :offset
    """
    with db_context() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_prediction_count(
    food_type: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "PENDING",
) -> int:
    filters = ["status = :status"]
    params: dict = {"status": status}

    if food_type and food_type.strip().lower() not in ("all", "all specimens", "none", ""):
        filters.append("(food_type = :food_type OR commodity = :food_type)")
        params["food_type"] = food_type.strip().lower()

    if category and category.strip().lower() not in ("all", "all categories", "none", ""):
        filters.append("category = :category")
        params["category"] = category.strip()

    where = " AND ".join(filters)
    with db_context() as conn:
        row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM predictions WHERE {where}",
            params
        ).fetchone()
    return row["cnt"] if row else 0


def get_prediction_by_id(prediction_id: int) -> Optional[dict]:
    with db_context() as conn:
        row = conn.execute(
            "SELECT * FROM predictions WHERE id = ?", (prediction_id,)
        ).fetchone()
    return dict(row) if row else None


# ─── Verification & Atomic Transactions ─────────────────────────────────────

def save_verification(
    prediction_id: int,
    actual_category: str,
    actual_freshness: Optional[float] = None,
    notes: Optional[str] = None,
    verified_by: str = "user",
) -> int:
    """
    Atomic transaction:
    1. Fetches complete prediction record.
    2. Checks duplicate verification status (rejects if not PENDING).
    3. Saves complete feature vector to verified_predictions table.
    4. Updates predictions status to 'VERIFIED'.
    """
    with db_context() as conn:
        pred_row = conn.execute(
            "SELECT * FROM predictions WHERE id = ?", (prediction_id,)
        ).fetchone()

        if not pred_row:
            raise ValueError(f"Prediction ID {prediction_id} not found.")

        pred = dict(pred_row)
        if pred.get("status") != "PENDING":
            raise ValueError(f"Prediction ID {prediction_id} has already been verified or archived (status: {pred.get('status')}).")

        score = actual_freshness if actual_freshness is not None else pred.get("freshness_score")

        insert_sql = """
        INSERT INTO verified_predictions (
            prediction_id, verified_at, food_type, commodity, specimen_id,
            tomato_id, position, timestamp,
            blue, green, yellow, orange, red, nir,
            ndvi, gndvi, rvi,
            freshness_score, predicted_category,
            confidence_fresh, confidence_aging, confidence_spoiling,
            actual_category, actual_freshness_score, verified_by, notes,
            model_version, input_source, status
        ) VALUES (
            :prediction_id, datetime('now'), :food_type, :commodity, :specimen_id,
            :tomato_id, :position, :timestamp,
            :blue, :green, :yellow, :orange, :red, :nir,
            :ndvi, :gndvi, :rvi,
            :freshness_score, :predicted_category,
            :confidence_fresh, :confidence_aging, :confidence_spoiling,
            :actual_category, :actual_freshness_score, :verified_by, :notes,
            :model_version, :input_source, 'ACTIVE'
        )
        """
        comm = pred.get("commodity") or pred.get("food_type") or "tomato"
        spec_id = pred.get("specimen_id") or f"{comm[:3].upper()}-{pred.get('tomato_id') or 1001}"
        model_ver = pred.get("model_version") or f"XGB_{comm}_v1.0"

        verified_data = {
            "prediction_id":          prediction_id,
            "food_type":              comm,
            "commodity":              comm,
            "specimen_id":            spec_id,
            "tomato_id":              pred.get("tomato_id"),
            "position":               pred.get("position"),
            "timestamp":              pred.get("timestamp"),
            "blue":                   pred.get("blue"),
            "green":                  pred.get("green"),
            "yellow":                 pred.get("yellow"),
            "orange":                 pred.get("orange"),
            "red":                    pred.get("red"),
            "nir":                    pred.get("nir"),
            "ndvi":                   pred.get("ndvi"),
            "gndvi":                  pred.get("gndvi"),
            "rvi":                    pred.get("rvi"),
            "freshness_score":        pred.get("freshness_score"),
            "predicted_category":     pred.get("category"),
            "confidence_fresh":       pred.get("confidence_fresh"),
            "confidence_aging":       pred.get("confidence_aging"),
            "confidence_spoiling":    pred.get("confidence_spoiling"),
            "actual_category":        actual_category,
            "actual_freshness_score": score,
            "verified_by":            verified_by,
            "notes":                  notes,
            "model_version":          model_ver,
            "input_source":           pred.get("input_source", "manual"),
        }
        cursor = conn.execute(insert_sql, verified_data)
        v_id = cursor.lastrowid

        # Mark prediction as VERIFIED in predictions table
        conn.execute("UPDATE predictions SET status = 'VERIFIED' WHERE id = ?", (prediction_id,))

        # Dual-write CSV backup
        _append_verified_csv({
            **pred,
            "actual_category": actual_category,
            "actual_freshness_score": score,
            "verified_at": datetime.utcnow().isoformat(),
            "notes": notes,
        })

        return v_id


def get_verification_stats(food_type: Optional[str] = None) -> dict:
    """Returns dynamic statistics calculated directly from SQLite active verified records.
    Supports filtering by specimen/commodity or returning overall aggregates.
    """
    filters = ["status = 'ACTIVE'"]
    params = {}
    if food_type and food_type.strip().lower() not in ("all", "all specimens", "none", ""):
        filters.append("(commodity = :food_type OR food_type = :food_type)")
        params["food_type"] = food_type.strip().lower()

    where_clause = " AND ".join(filters)

    with db_context() as conn:
        total = conn.execute(f"SELECT COUNT(*) as cnt FROM verified_predictions WHERE {where_clause}", params).fetchone()["cnt"]
        dist_rows = conn.execute(f"""
            SELECT actual_category, COUNT(*) as cnt
            FROM verified_predictions
            WHERE {where_clause}
            GROUP BY actual_category
        """, params).fetchall()

        # Also compute commodity breakdown across all active verified records
        comm_rows = conn.execute("""
            SELECT COALESCE(commodity, food_type, 'tomato') as comm, COUNT(*) as cnt
            FROM verified_predictions
            WHERE status = 'ACTIVE'
            GROUP BY COALESCE(commodity, food_type, 'tomato')
        """).fetchall()

    dist = {r["actual_category"]: r["cnt"] for r in dist_rows}
    fresh = dist.get("Fresh", 0)
    aging = dist.get("Aging", 0)
    spoiling = dist.get("Spoiling", 0)
    comm_dist = {r["comm"]: r["cnt"] for r in comm_rows}

    return {
        "total_audited_samples": total,
        "fresh_count": fresh,
        "aging_count": aging,
        "spoiling_count": spoiling,
        "commodity_distribution": comm_dist,
        "retraining_readiness": total >= 10,
        "remaining_samples_required": max(0, 10 - total),
    }


def get_verified_predictions_active(
    food_type: Optional[str] = None,
    category: Optional[str] = None,
) -> list[dict]:
    """Returns all active (unarchived) verified records from SQLite for audit and retraining,
    optionally filtered by specimen/commodity and category.
    """
    filters = ["status = 'ACTIVE'"]
    params = {}
    if food_type and food_type.strip().lower() not in ("all", "all specimens", "none", ""):
        filters.append("(commodity = :food_type OR food_type = :food_type)")
        params["food_type"] = food_type.strip().lower()
    if category and category.strip().lower() not in ("all", "all categories", "none", ""):
        filters.append("actual_category = :category")
        params["category"] = category.strip()

    where_clause = " AND ".join(filters)
    with db_context() as conn:
        rows = conn.execute(f"""
            SELECT * FROM verified_predictions
            WHERE {where_clause}
            ORDER BY verified_at DESC, id DESC
        """, params).fetchall()
    return [dict(r) for r in rows]


def archive_verified_predictions(retraining_run_id: int, food_type: Optional[str] = None) -> None:
    """
    Executed ONLY after a new model has been successfully trained, evaluated,
    saved, load-verified, and set active in production.
    Archives the current verified training batch and resets active queue to 0
    strictly for the specified commodity so other models retain their active samples.
    """
    with db_context() as conn:
        if food_type and food_type.strip().lower() not in ("all", "all specimens", "none", ""):
            target = food_type.strip().lower()
            conn.execute("""
                UPDATE verified_predictions
                SET status = 'RETRAINED', retraining_run_id = ?
                WHERE status = 'ACTIVE' AND (LOWER(commodity) = ? OR LOWER(food_type) = ?)
            """, (retraining_run_id, target, target))

            conn.execute("""
                UPDATE predictions
                SET status = 'RETRAINED'
                WHERE status = 'VERIFIED' AND (LOWER(commodity) = ? OR LOWER(food_type) = ?)
            """, (target, target))
        else:
            conn.execute("""
                UPDATE verified_predictions
                SET status = 'RETRAINED', retraining_run_id = ?
                WHERE status = 'ACTIVE'
            """, (retraining_run_id,))

            conn.execute("""
                UPDATE predictions
                SET status = 'RETRAINED'
                WHERE status = 'VERIFIED'
            """)


# ─── Dynamic CSV Export & Snapshots ──────────────────────────────────────────

def generate_verified_dataset_csv(food_type: Optional[str] = None) -> str:
    """
    Dynamically generates the verified dataset CSV content directly from SQLite verified_predictions.
    Supports filtering by particular specimen or generating for all specimens.
    Includes clean specimen type, specimen ID, spectral bands, indices, predictions,
    and ground-truth verification labels formatted for Excel, Google Sheets, and ML retraining.
    """
    target = None if (not food_type or food_type.strip().lower() in ("all", "all specimens", "none", "")) else food_type.strip().lower()
    active_records = get_verified_predictions_active(food_type=target)
    output = io.StringIO()
    headers = [
        "Verification_ID",
        "Prediction_ID",
        "Specimen",
        "Commodity",
        "Specimen_ID",
        "Tomato_ID",
        "Position",
        "Model_Version",
        "Input_Source",
        "Blue",
        "Green",
        "Yellow",
        "Orange",
        "Red",
        "NIR",
        "NDVI",
        "GNDVI",
        "RVI",
        "Predicted_Category",
        "Predicted_Freshness_Score",
        "Confidence_Fresh_Pct",
        "Confidence_Aging_Pct",
        "Confidence_Spoiling_Pct",
        "Verified_Category",
        "Verified_Freshness_Score",
        "Verified_By",
        "Verification_Notes",
        "Verified_Timestamp",
        "Scan_Timestamp",
        "Status",
    ]
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()

    def _format_clean_ts(ts_str: Optional[str]) -> str:
        if not ts_str:
            return ""
        return ts_str.replace("T", " ").split(".")[0]

    for r in active_records:
        comm = r.get("commodity") or r.get("food_type") or "tomato"
        spec_id = r.get("specimen_id") or f"{comm[:3].upper()}-{r.get('tomato_id') or 1001}"
        blue = r.get("blue") if r.get("blue") is not None else r.get("Blue", 50.0)
        green = r.get("green") if r.get("green") is not None else r.get("Green", 50.0)
        yellow = r.get("yellow") if r.get("yellow") is not None else r.get("Yellow", 50.0)
        orange = r.get("orange") if r.get("orange") is not None else r.get("Orange", 50.0)
        red = r.get("red") if r.get("red") is not None else r.get("Red", 50.0)
        nir = r.get("nir") if r.get("nir") is not None else r.get("NIR", 50.0)

        ndvi = r.get("ndvi") if r.get("ndvi") is not None else r.get("NDVI")
        if ndvi is None:
            ndvi = float((nir - red) / (nir + red + 1e-8))

        gndvi = r.get("gndvi") if r.get("gndvi") is not None else r.get("GNDVI")
        if gndvi is None:
            gndvi = float((nir - green) / (nir + green + 1e-8))

        rvi = r.get("rvi") if r.get("rvi") is not None else r.get("RVI")
        if rvi is None:
            rvi = float(nir / (red + 1e-8))

        pred_score = r.get("freshness_score")
        verified_score = r.get("actual_freshness_score") if r.get("actual_freshness_score") is not None else pred_score

        c_fresh = r.get("confidence_fresh")
        c_aging = r.get("confidence_aging")
        c_spoil = r.get("confidence_spoiling")

        model_ver = r.get("model_version") or f"XGB_{comm}_v1.0"

        writer.writerow({
            "Verification_ID": f"v_{r.get('id')}",
            "Prediction_ID": r.get("prediction_id") or "",
            "Specimen": comm.replace("_", " ").title(),
            "Commodity": comm,
            "Specimen_ID": spec_id,
            "Tomato_ID": r.get("tomato_id") or 1001,
            "Position": r.get("position") or 1,
            "Model_Version": model_ver,
            "Input_Source": (r.get("input_source") or "usb").upper(),
            "Blue": round(float(blue), 4),
            "Green": round(float(green), 4),
            "Yellow": round(float(yellow), 4),
            "Orange": round(float(orange), 4),
            "Red": round(float(red), 4),
            "NIR": round(float(nir), 4),
            "NDVI": round(float(ndvi), 6),
            "GNDVI": round(float(gndvi), 6),
            "RVI": round(float(rvi), 6),
            "Predicted_Category": r.get("predicted_category") or "",
            "Predicted_Freshness_Score": round(float(pred_score), 4) if pred_score is not None else "",
            "Confidence_Fresh_Pct": round(float(c_fresh) * 100, 2) if c_fresh is not None else "",
            "Confidence_Aging_Pct": round(float(c_aging) * 100, 2) if c_aging is not None else "",
            "Confidence_Spoiling_Pct": round(float(c_spoil) * 100, 2) if c_spoil is not None else "",
            "Verified_Category": r.get("actual_category") or r.get("predicted_category") or "Fresh",
            "Verified_Freshness_Score": float(verified_score) if verified_score is not None else 85.0,
            "Verified_By": r.get("verified_by") or "user",
            "Verification_Notes": r.get("notes") or "",
            "Verified_Timestamp": _format_clean_ts(r.get("verified_at")),
            "Scan_Timestamp": _format_clean_ts(r.get("timestamp")),
            "Status": r.get("status") or "ACTIVE",
        })
    return output.getvalue()


def save_immutable_training_snapshot(model_version: str, csv_content: str) -> str:
    """Saves a permanent immutable CSV snapshot of the merged training dataset for reproducibility."""
    filename = f"training_snapshot_{model_version.replace('.', '_')}.csv"
    filepath = SNAPSHOTS_DIR / filename
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        f.write(csv_content)
    return str(filepath)


# ─── Model Versions ───────────────────────────────────────────────────────────

def get_all_model_versions(food_type: Optional[str] = None) -> list[dict]:
    with db_context() as conn:
        if food_type:
            rows = conn.execute(
                "SELECT * FROM model_versions WHERE food_type = ? ORDER BY trained_at DESC",
                (food_type,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM model_versions ORDER BY trained_at DESC"
            ).fetchall()
    return [dict(r) for r in rows]


def get_active_model_version(food_type: str = "tomato") -> Optional[dict]:
    with db_context() as conn:
        row = conn.execute(
            "SELECT * FROM model_versions WHERE is_active = 1 AND food_type = ? LIMIT 1",
            (food_type,)
        ).fetchone()
        if not row and food_type == "tomato":
            # Fallback for legacy Tomato records
            row = conn.execute(
                "SELECT * FROM model_versions WHERE is_active = 1 LIMIT 1"
            ).fetchone()
        if not row:
            # Fallback: get model with highest accuracy for this commodity
            row = conn.execute(
                "SELECT * FROM model_versions WHERE food_type = ? ORDER BY classification_accuracy DESC, regression_r2 DESC LIMIT 1",
                (food_type,)
            ).fetchone()
    return dict(row) if row else None


def upsert_model_version(version_data: dict) -> None:
    """Insert or update a model version record, setting it as active for its commodity."""
    food_type = version_data.get("food_type", "tomato")
    with db_context() as conn:
        _migrate_database_schema(conn)
        conn.execute("UPDATE model_versions SET is_active = 0 WHERE food_type = ?", (food_type,))
        conn.execute("""
        INSERT INTO model_versions (
            version, food_type, training_samples,
            classification_accuracy, regression_r2, mae, rmse,
            is_active, pkl_path, notes
        ) VALUES (
            :version, :food_type, :training_samples,
            :classification_accuracy, :regression_r2, :mae, :rmse,
            1, :pkl_path, :notes
        )
        ON CONFLICT(version) DO UPDATE SET
            classification_accuracy = excluded.classification_accuracy,
            regression_r2           = excluded.regression_r2,
            mae                     = excluded.mae,
            rmse                    = excluded.rmse,
            pkl_path                = excluded.pkl_path,
            is_active               = 1,
            trained_at              = datetime('now')
        """, version_data)


def set_active_model_version(version: str, food_type: Optional[str] = None) -> dict:
    """
    Sets the specified model version as active in SQLite scoped to its commodity.
    Returns the model version record dict or raises ValueError if version doesn't exist.
    """
    with db_context() as conn:
        _migrate_database_schema(conn)
        if food_type:
            target = conn.execute(
                "SELECT * FROM model_versions WHERE version = ? AND food_type = ?", (version, food_type)
            ).fetchone()
        else:
            target = conn.execute("SELECT * FROM model_versions WHERE version = ?", (version,)).fetchone()

        if not target:
            target_str = f" for '{food_type}'" if food_type else ""
            raise ValueError(f"Model version {version}{target_str} not found in database.")

        target_dict = dict(target)
        target_food = food_type or target_dict.get("food_type", "tomato")

        # Deactivate only versions of this specific commodity
        conn.execute("UPDATE model_versions SET is_active = 0 WHERE food_type = ?", (target_food,))
        conn.execute("UPDATE model_versions SET is_active = 1 WHERE version = ? AND food_type = ?", (version, target_food))
        return target_dict


def delete_model_version_record(version: str, food_type: Optional[str] = None) -> dict:
    """
    Deletes a retrained model version record from SQLite.
    v1.0 and v1.1 are protected permanent baselines and cannot be deleted.
    Currently active models cannot be deleted.
    """
    if version in ["v1.0", "v1.1"]:
        raise ValueError(f"Model version {version} is a permanent system baseline and cannot be deleted.")

    with db_context() as conn:
        _migrate_database_schema(conn)
        if food_type:
            target = conn.execute(
                "SELECT * FROM model_versions WHERE version = ? AND food_type = ?", (version, food_type)
            ).fetchone()
        else:
            target = conn.execute("SELECT * FROM model_versions WHERE version = ?", (version,)).fetchone()

        if not target:
            target_str = f" for '{food_type}'" if food_type else ""
            raise ValueError(f"Model version {version}{target_str} not found.")

        target_dict = dict(target)
        if target_dict.get("is_active") == 1:
            raise ValueError(f"Cannot delete model version {version} because it is currently active. Please activate another version first.")

        target_food = target_dict.get("food_type", "tomato")
        conn.execute("DELETE FROM model_versions WHERE version = ? AND food_type = ?", (version, target_food))
        return target_dict


# ─── Analytics & Retraining Audits ────────────────────────────────────────────

def get_analytics_summary(food_type: str = "tomato") -> dict:
    target = (food_type or "tomato").strip().lower()
    with db_context() as conn:
        if target in ("all", "all specimens", "none", "*", ""):
            total = conn.execute("SELECT COUNT(*) as cnt FROM predictions").fetchone()["cnt"]

            dist = conn.execute("""
                SELECT category, COUNT(*) as cnt
                FROM predictions
                GROUP BY category
            """).fetchall()

            avg_row = conn.execute("""
                SELECT AVG(freshness_score) as avg_score
                FROM predictions
            """).fetchone()

            trend = conn.execute("""
                SELECT timestamp, freshness_score, category
                FROM predictions
                ORDER BY timestamp DESC
                LIMIT 50
            """).fetchall()
        else:
            total = conn.execute("""
                SELECT COUNT(*) as cnt FROM predictions 
                WHERE (LOWER(food_type) = LOWER(?) OR LOWER(commodity) = LOWER(?))
            """, (target, target)).fetchone()["cnt"]

            dist = conn.execute("""
                SELECT category, COUNT(*) as cnt
                FROM predictions 
                WHERE (LOWER(food_type) = LOWER(?) OR LOWER(commodity) = LOWER(?))
                GROUP BY category
            """, (target, target)).fetchall()

            avg_row = conn.execute("""
                SELECT AVG(freshness_score) as avg_score
                FROM predictions 
                WHERE (LOWER(food_type) = LOWER(?) OR LOWER(commodity) = LOWER(?))
            """, (target, target)).fetchone()

            trend = conn.execute("""
                SELECT timestamp, freshness_score, category
                FROM predictions
                WHERE (LOWER(food_type) = LOWER(?) OR LOWER(commodity) = LOWER(?))
                ORDER BY timestamp DESC
                LIMIT 50
            """, (target, target)).fetchall()

    category_dist = {r["category"]: r["cnt"] for r in dist}
    avg_score = avg_row["avg_score"] if (avg_row and avg_row["avg_score"] is not None) else 0.0
    return {
        "total_predictions": total,
        "category_distribution": category_dist,
        "average_freshness_score": round(avg_score, 2),
        "fresh_count":    category_dist.get("Fresh", 0),
        "aging_count":    category_dist.get("Aging", 0),
        "spoiling_count": category_dist.get("Spoiling", 0),
        "trend": [dict(r) for r in trend],
    }


def log_retraining_run(data: dict) -> int:
    with db_context() as conn:
        _migrate_database_schema(conn)
        sql = """
        INSERT INTO retraining_runs (
        food_type, base_version, new_version, training_samples, reference_samples,
        verified_samples, accuracy, precision, recall, f1, r2, mae, rmse,
        training_duration_sec, status, snapshot_path, deployed, notes
    ) VALUES (
        :food_type, :base_version, :new_version, :training_samples, :reference_samples,
        :verified_samples, :accuracy, :precision, :recall, :f1, :r2, :mae, :rmse,
        :training_duration_sec, :status, :snapshot_path, :deployed, :notes
    )
    """
    params = {
        "food_type":             data.get("food_type", "tomato"),
        "base_version":          data.get("base_version"),
        "new_version":           data.get("new_version"),
        "training_samples":      data.get("training_samples", 0),
        "reference_samples":     data.get("reference_samples", 0),
        "verified_samples":      data.get("verified_samples", 0),
        "accuracy":              data.get("accuracy", 0.0),
        "precision":             data.get("precision", 0.0),
        "recall":                data.get("recall", 0.0),
        "f1":                    data.get("f1", 0.0),
        "r2":                    data.get("r2", 0.0),
        "mae":                   data.get("mae", 0.0),
        "rmse":                  data.get("rmse", 0.0),
        "training_duration_sec": data.get("training_duration_sec", 0.0),
        "status":                data.get("status", "SUCCESS"),
        "snapshot_path":         data.get("snapshot_path", ""),
        "deployed":              data.get("deployed", 0),
        "notes":                 data.get("notes", ""),
    }
    with db_context() as conn:
        cursor = conn.execute(sql, params)
        return cursor.lastrowid


# ─── CSV Backup Helpers ───────────────────────────────────────────────────────

_PREDICTION_CSV_HEADERS = [
    "id", "timestamp", "food_type", "commodity", "specimen_id", "tomato_id", "position",
    "blue", "green", "yellow", "orange", "red", "nir",
    "ndvi", "gndvi", "rvi",
    "freshness_score", "category",
    "confidence_fresh", "confidence_aging", "confidence_spoiling",
    "model_version", "input_source",
]

_VERIFIED_CSV_HEADERS = [
    "id", "timestamp", "food_type", "commodity", "specimen_id", "tomato_id", "position",
    "blue", "green", "yellow", "orange", "red", "nir",
    "ndvi", "gndvi", "rvi",
    "freshness_score", "category",
    "actual_category", "actual_freshness_score",
    "model_version", "verified_at", "notes",
]


def _ensure_prediction_csv_header():
    if not PREDICTION_HISTORY_CSV.exists():
        with open(PREDICTION_HISTORY_CSV, "w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=_PREDICTION_CSV_HEADERS).writeheader()


def _ensure_verified_csv_header():
    if not VERIFIED_DATASET_CSV.exists():
        with open(VERIFIED_DATASET_CSV, "w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=_VERIFIED_CSV_HEADERS).writeheader()


def _append_prediction_csv(row: dict):
    try:
        with open(PREDICTION_HISTORY_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=_PREDICTION_CSV_HEADERS, extrasaction="ignore")
            writer.writerow(row)
    except Exception:
        pass


def _append_verified_csv(row: dict):
    try:
        with open(VERIFIED_DATASET_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=_VERIFIED_CSV_HEADERS, extrasaction="ignore")
            writer.writerow(row)
    except Exception:
        pass
