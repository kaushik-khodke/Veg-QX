-- schema.sql

-- SQLite schema for Tomato Freshness Detection System
-- Modular design: food_type column supports future food products

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. predictions
--    Every inference call is recorded here (never overwritten, always appended).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp           TEXT    NOT NULL DEFAULT (datetime('now')),
    food_type           TEXT    NOT NULL DEFAULT 'tomato',
    commodity           TEXT    NOT NULL DEFAULT 'tomato',

    -- Specimen identification
    specimen_id         TEXT,
    tomato_id           INTEGER,
    position            INTEGER,

    -- Raw spectral bands (AS7341 output)
    blue                REAL,
    green               REAL,
    yellow              REAL,
    orange              REAL,
    red                 REAL,
    nir                 REAL,

    -- Computed vegetation indices
    ndvi                REAL,
    gndvi               REAL,
    rvi                 REAL,

    -- ML model outputs
    freshness_score     REAL,
    category            TEXT,
    confidence_fresh    REAL,
    confidence_aging    REAL,
    confidence_spoiling REAL,

    -- Metadata & System Telemetry
    model_version       TEXT,
    input_source        TEXT    DEFAULT 'manual',   -- 'usb' | 'csv_upload' | 'manual'
    status              TEXT    NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'VERIFIED' | 'RETRAINED' | 'ARCHIVED'
    software_version    TEXT    DEFAULT '1.1',
    firmware_version    TEXT    DEFAULT 'v2.0',
    sensor_type         TEXT    DEFAULT 'AS7341',
    device_id           TEXT    DEFAULT 'ESP32_01',
    ripeness_stage      TEXT    DEFAULT 'Ripe',
    is_unripe           INTEGER DEFAULT 0,
    ripeness_index      REAL    DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_predictions_timestamp  ON predictions(timestamp);
CREATE INDEX IF NOT EXISTS idx_predictions_tomato_id  ON predictions(tomato_id);
CREATE INDEX IF NOT EXISTS idx_predictions_food_type  ON predictions(food_type);
CREATE INDEX IF NOT EXISTS idx_predictions_commodity  ON predictions(commodity);
CREATE INDEX IF NOT EXISTS idx_predictions_specimen   ON predictions(specimen_id);
CREATE INDEX IF NOT EXISTS idx_predictions_category   ON predictions(category);
CREATE INDEX IF NOT EXISTS idx_predictions_status     ON predictions(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. verified_predictions
--    Complete human-verified records for model retraining.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verified_predictions (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id           INTEGER NOT NULL REFERENCES predictions(id),
    verified_at             TEXT    NOT NULL DEFAULT (datetime('now')),
    
    -- Identification
    food_type               TEXT    NOT NULL DEFAULT 'tomato',
    commodity               TEXT    NOT NULL DEFAULT 'tomato',
    specimen_id             TEXT,
    tomato_id               INTEGER,
    position                INTEGER,
    timestamp               TEXT,

    -- Raw spectral features
    blue                    REAL,
    green                   REAL,
    yellow                  REAL,
    orange                  REAL,
    red                     REAL,
    nir                     REAL,

    -- Vegetation indices
    ndvi                    REAL,
    gndvi                   REAL,
    rvi                     REAL,

    -- Model outputs during prediction
    freshness_score         REAL,
    predicted_category      TEXT,
    confidence_fresh        REAL,
    confidence_aging        REAL,
    confidence_spoiling     REAL,

    -- Human verified ground truth
    actual_category         TEXT    NOT NULL,
    actual_freshness_score  REAL,
    verified_by             TEXT    DEFAULT 'user',
    notes                   TEXT,

    -- Lineage metadata
    model_version           TEXT,
    input_source            TEXT    DEFAULT 'manual',
    status                  TEXT    NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'RETRAINED' | 'ARCHIVED'
    retraining_run_id       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_verified_prediction_id ON verified_predictions(prediction_id);
CREATE INDEX IF NOT EXISTS idx_verified_at            ON verified_predictions(verified_at);
CREATE INDEX IF NOT EXISTS idx_verified_status           ON verified_predictions(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. model_versions
--    Tracks every trained model version with its performance metrics.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_versions (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    version                     TEXT    NOT NULL UNIQUE,
    food_type                   TEXT    NOT NULL DEFAULT 'tomato',
    trained_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
    training_samples            INTEGER,
    classification_accuracy     REAL,
    regression_r2               REAL,
    mae                         REAL,
    rmse                        REAL,
    is_active                   INTEGER NOT NULL DEFAULT 0,
    pkl_path                    TEXT,
    notes                       TEXT
);

-- Seed with known versions
INSERT OR IGNORE INTO model_versions (version, food_type, training_samples, classification_accuracy, regression_r2, is_active, pkl_path, notes)
VALUES
    ('v1.0', 'tomato', 100000, 0.8087, 0.9999, 0, 'tomato_freshness_pipeline_v1.pkl',   'Original model trained on reference 100k dataset'),
    ('v1.1', 'tomato', 200000, 0.8124, 0.9947, 1, 'tomato_freshness_pipeline_v1.1.pkl', 'Retrained on 200k combined dataset (reference + cleaned Dataset 3). Noise removal applied.');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. retraining_runs
--    Audit log for every retraining attempt (human-triggered only).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retraining_runs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    food_type               TEXT    NOT NULL DEFAULT 'tomato',
    base_version            TEXT,
    new_version             TEXT,
    training_samples        INTEGER,
    reference_samples       INTEGER,
    verified_samples        INTEGER,
    accuracy                REAL,
    precision               REAL,
    recall                  REAL,
    f1                      REAL,
    r2                      REAL,
    mae                     REAL,
    rmse                    REAL,
    training_duration_sec   REAL,
    status                  TEXT    DEFAULT 'RUNNING', -- 'RUNNING' | 'SUCCESS' | 'FAILED_PERFORMANCE_GATE' | 'ERROR'
    snapshot_path           TEXT,
    deployed                INTEGER DEFAULT 0,
    notes                   TEXT
);

