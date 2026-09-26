"""
config.py — Central configuration for the Freshness Detection System.
Modular food-agnostic design: add new food types under FOOD_CONFIGS.
"""
import os
from pathlib import Path

# ─── Base Paths ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent                                          # backend/
ML_MODEL_DIR = BASE_DIR.parent                                            # ml model/

# Model storage — reads directly from ml model/models/
MODELS_DIR = ML_MODEL_DIR / "models"

# Data storage — lives inside datasets/ under ml model/
DATASETS_DIR = ML_MODEL_DIR / "datasets"
DATASETS_DIR.mkdir(parents=True, exist_ok=True)

PREDICTION_HISTORY_CSV = DATASETS_DIR / "prediction_history.csv"
PREDICTION_HISTORY_DB  = DATASETS_DIR / "prediction_history.db"
VERIFIED_DATASET_CSV   = DATASETS_DIR / "verified_dataset.csv"

REFERENCE_DATASET_CSV  = ML_MODEL_DIR / "Tomato_Multispectral_Realistic_100k.csv"
RETRAINING_DIR         = ML_MODEL_DIR / "retraining"
RETRAINING_DIR.mkdir(parents=True, exist_ok=True)

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://veg-qx.vercel.app",
]

# ─── Serial / USB ─────────────────────────────────────────────────────────────
SERIAL_BAUD_RATE      = 115200
SERIAL_TIMEOUT        = 2          # seconds
SERIAL_AUTO_SCAN      = True       # auto-scan all available COM ports
SERIAL_PREFERRED_PORT = "COM8"     # Forced COM Port as requested by user

# ─── Multi-Commodity Configuration ──────────────────────────────────────────
COMMODITY_CONFIGS: dict = {
    "tomato": {
        "display_name": "Tomato",
        "icon": "🍅",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "positions_per_tomato": 10,
        "active_model_path": str(MODELS_DIR / "tomato_freshness_pipeline_v1.1.pkl"),
        "reference_dataset": str(REFERENCE_DATASET_CSV),
    },
    "carrot": {
        "display_name": "Carrot",
        "icon": "🥕",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "active_model_path": str(MODELS_DIR / "carrot" / "carrot_freshness_pipeline_active.pkl"),
        "reference_dataset": str(ML_MODEL_DIR / "data" / "synthetic" / "carrot" / "carrot_sample_100k.csv"),
    },
    "brinjal": {
        "display_name": "Brinjal",
        "icon": "🍆",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "active_model_path": str(MODELS_DIR / "brinjal" / "brinjal_freshness_pipeline_active.pkl"),
        "reference_dataset": str(ML_MODEL_DIR / "data" / "synthetic" / "brinjal" / "brinjal_sample_100k.csv"),
    },
    "green_brinjal": {
        "display_name": "Green Brinjal",
        "icon": "🟢",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "active_model_path": str(MODELS_DIR / "green_brinjal" / "green_brinjal_freshness_pipeline_active.pkl"),
        "reference_dataset": str(ML_MODEL_DIR / "data" / "synthetic" / "green_brinjal" / "green_brinjal_sample_100k.csv"),
    },
    "beetroot": {
        "display_name": "Beetroot",
        "icon": "🟣",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "active_model_path": str(MODELS_DIR / "beetroot" / "beetroot_freshness_pipeline_active.pkl"),
        "reference_dataset": str(ML_MODEL_DIR / "data" / "synthetic" / "beetroot" / "beetroot_sample_100k.csv"),
    },
    "bitter_gourd": {
        "display_name": "Bitter Gourd",
        "icon": "🥒",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {
            "Fresh": "#39ff14",
            "Aging": "#ff9500",
            "Spoiling": "#ff3b30",
        },
        "freshness_thresholds": {
            "Spoiling_max": 40,
            "Aging_max": 60,
        },
        "fresh_threshold": 60.0,
        "aging_threshold": 40.0,
        "positions_per_specimen": 10,
        "active_model_path": str(MODELS_DIR / "bitter_gourd" / "bitter_gourd_freshness_pipeline_active.pkl"),
        "reference_dataset": str(ML_MODEL_DIR / "data" / "synthetic" / "bitter_gourd" / "bitter_gourd_sample_100k.csv"),
    },
    "green_chilli": {
        "display_name": "Green Chilli",
        "icon": "🌶️",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {"Fresh": "#39ff14", "Aging": "#ff9500", "Spoiling": "#ff3b30"},
        "freshness_thresholds": {"Spoiling_max": 40, "Aging_max": 60},
        "positions_per_specimen": 10,
    },
    "peas": {
        "display_name": "Peas",
        "icon": "🫛",
        "features": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"],
        "raw_bands": ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"],
        "computed_indices": ["NDVI", "GNDVI", "RVI"],
        "categories": ["Fresh", "Aging", "Spoiling"],
        "category_colors": {"Fresh": "#39ff14", "Aging": "#ff9500", "Spoiling": "#ff3b30"},
        "freshness_thresholds": {"Spoiling_max": 40, "Aging_max": 60},
        "positions_per_specimen": 10,
    }
}

# Backward compatibility alias
FOOD_CONFIGS = COMMODITY_CONFIGS

DEFAULT_FOOD_TYPE = "tomato"
DEFAULT_COMMODITY = "tomato"

# ─── Model Versioning ─────────────────────────────────────────────────────────
MODEL_VERSION_PATTERN  = "{food_type}_freshness_pipeline_v*.pkl"
PERFORMANCE_THRESHOLD_R2    = 0.85
PERFORMANCE_MAX_REGRESSION  = 0.03   # max allowed R² drop from baseline

# ─── Analytics ────────────────────────────────────────────────────────────────
ANALYTICS_DIR = ML_MODEL_DIR / "analytics"
ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)

