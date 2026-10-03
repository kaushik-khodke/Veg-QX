"""
services/inference_service.py
Loads the best XGBoost pipeline, computes vegetation indices,
runs regression (freshness score) and classification (category + confidence).
Supports any food type via the FOOD_CONFIGS dict in config.py.
"""
import glob
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional

from config import FOOD_CONFIGS, MODELS_DIR, PERFORMANCE_THRESHOLD_R2
from utils.index_calculator import compute_all_indices, compute_ripeness


class InferenceService:
    """
    Manages model loading and prediction for a specific food type.
    Auto-detects the best model by classification accuracy from available pkl files.
    """

    def __init__(self, food_type: str = "tomato"):
        self.food_type = food_type
        self.config    = FOOD_CONFIGS[food_type]
        self.pipeline  = None
        self.model_version: Optional[str] = None
        self.regressor  = None
        self.classifier = None
        self.label_encoder = None
        self.features   = None
        self.metadata: dict = {}

    def load_best_model(self) -> bool:
        """
        Loads the active production model version designated in SQLite model_versions table.
        Falls back to candidate scanning or active_model_path if not found.
        """
        return self.load_active_model()

    def load_active_model(self) -> bool:
        """
        Loads the active model version designated in the SQLite model_versions table.
        Falls back to commodity subdirectory active model, candidate scanning, or config path.
        """
        active_version_info = None
        try:
            from services.database_service import get_active_model_version
            active_version_info = get_active_model_version(self.food_type)
        except Exception as db_err:
            print(f"[InferenceService] Note: Could not query active version from DB: {db_err}")

        # Priority 1: Exact pkl_path recorded in SQLite model_versions
        if active_version_info and active_version_info.get("pkl_path"):
            raw_path = Path(active_version_info["pkl_path"])
            db_path = raw_path if raw_path.is_absolute() else (MODELS_DIR / raw_path.name)
            if not db_path.exists() and (MODELS_DIR / self.food_type / raw_path.name).exists():
                db_path = MODELS_DIR / self.food_type / raw_path.name

            if db_path.exists():
                try:
                    payload = joblib.load(str(db_path))
                    payload["_path"] = str(db_path)
                    self._apply_payload(payload)
                    self.model_version = active_version_info.get("version", self.model_version)
                    print(f"[InferenceService] Loaded SQLite ACTIVE model for '{self.food_type}' ({self.model_version}) from {db_path.name}")
                    return True
                except Exception as e:
                    import traceback
                    print(f"[InferenceService] Warning: Failed to load target active path '{db_path}': {e}")
                    traceback.print_exc()

        # Priority 2: Commodity folder active model link
        comm_active = MODELS_DIR / self.food_type / f"{self.food_type}_freshness_pipeline_active.pkl"
        if comm_active.exists():
            try:
                payload = joblib.load(str(comm_active))
                payload["_path"] = str(comm_active)
                self._apply_payload(payload)
                print(f"[InferenceService] Loaded active pipeline for '{self.food_type}' from {comm_active.name}")
                return True
            except Exception as e:
                print(f"[InferenceService] Warning: Failed to load {comm_active}: {e}")

        # Priority 3: Configured active_model_path in COMMODITY_CONFIGS
        fallback = self.config.get("active_model_path")
        if fallback and Path(fallback).exists():
            try:
                payload = joblib.load(fallback)
                payload["_path"] = fallback
                self._apply_payload(payload)
                print(f"[InferenceService] Loaded configured model for '{self.food_type}' from {Path(fallback).name}")
                return True
            except Exception as e:
                print(f"[InferenceService] Warning: Failed to load configured active model '{fallback}': {e}")

        # Priority 4: Legacy root models/ directory
        for legacy_name in [f"{self.food_type}_freshness_pipeline_v1.1.pkl", f"{self.food_type}_freshness_pipeline_v1.pkl", f"{self.food_type}_freshness_pipeline_v1.0.pkl"]:
            p = MODELS_DIR / legacy_name
            if p.exists():
                try:
                    payload = joblib.load(str(p))
                    payload["_path"] = str(p)
                    self._apply_payload(payload)
                    print(f"[InferenceService] Loaded legacy model for '{self.food_type}' from {p.name}")
                    return True
                except Exception:
                    continue

        return False

    def load_specific_version(self, version: str) -> bool:
        """Load a specific version by name, e.g. 'v1.0' or 'carrot_v1.0'."""
        clean_v = version.replace(f"{self.food_type}_", "")
        candidates = [
            MODELS_DIR / self.food_type / f"{self.food_type}_freshness_pipeline_{clean_v}.pkl",
            MODELS_DIR / f"{self.food_type}_freshness_pipeline_{clean_v}.pkl",
            MODELS_DIR / f"{self.food_type}_freshness_pipeline_{version}.pkl",
        ]
        for path in candidates:
            if path.exists():
                payload = joblib.load(str(path))
                payload["_path"] = str(path)
                self._apply_payload(payload)
                return True
        raise FileNotFoundError(f"Model file not found for {self.food_type} version {version}")

    def _apply_payload(self, payload: dict):
        self.pipeline      = payload
        self.regressor     = payload["regressor"]
        self.classifier    = payload["classifier"]
        self.label_encoder = payload["label_encoder"]
        self.features      = payload["features"]
        self.metadata      = payload.get("metadata", {})
        self.model_version = self.metadata.get("version", "unknown")

    def get_canonical_model_name(self) -> str:
        """
        Returns a clean, standardized canonical model name:
        e.g. XGB_bitter_gourd_v1.0, XGB_green_brinjal_v1.0, XGB_tomato_v1.1
        """
        meta = self.metadata or {}
        reg_algo = str(meta.get("regressor_algorithm", "XGBoost"))
        if "LightGBM" in reg_algo:
            algo_code = "LGBM"
        elif "HistGradient" in reg_algo:
            algo_code = "HGB"
        elif "XGB" in reg_algo:
            algo_code = "XGB"
        else:
            algo_code = "XGB"

        raw_ver = self.model_version or "v1.0"
        if raw_ver.startswith(f"{algo_code}_"):
            return raw_ver
        if raw_ver.startswith(f"{self.food_type}_"):
            return f"{algo_code}_{raw_ver}"
        if raw_ver.startswith("v"):
            return f"{algo_code}_{self.food_type}_{raw_ver}"
        return f"{algo_code}_{self.food_type}_v{raw_ver}"

    def is_loaded(self) -> bool:
        return self.regressor is not None

    # ─── Prediction ───────────────────────────────────────────────────────────

    def predict_single(self, raw_bands: dict) -> dict:
        """
        Run inference on a single spectral reading.

        Parameters
        ----------
        raw_bands : dict with keys: Blue, Green, Yellow, Orange, Red, NIR
                    (NDVI, GNDVI, RVI are computed automatically)

        Returns
        -------
        dict with: commodity, freshness_score, category, confidence_pct,
                   confidence_fresh, confidence_aging, confidence_spoiling,
                   NDVI, GNDVI, RVI, is_ood, ood_reasons
        """
        if not self.is_loaded():
            raise RuntimeError(f"Model not loaded for {self.food_type}. Call load_best_model() first.")

        # Compute vegetation indices
        indices = compute_all_indices(
            nir=raw_bands["NIR"],
            red=raw_bands["Red"],
            green=raw_bands["Green"],
        )
        full_input = {**raw_bands, **indices}

        # Build feature DataFrame in correct column order
        X = pd.DataFrame([full_input])[self.features]

        # Regression: freshness score
        freshness_score = float(self.regressor.predict(X)[0])
        freshness_score = round(max(0.0, min(100.0, freshness_score)), 4)

        # Classification: category + confidence
        class_probs = self.classifier.predict_proba(X)[0]
        class_idx   = int(np.argmax(class_probs))
        category    = self.label_encoder.inverse_transform([class_idx])[0]

        # Map probabilities to named categories
        classes        = list(self.label_encoder.classes_)
        prob_dict      = dict(zip(classes, [round(float(p), 4) for p in class_probs]))
        confidence     = round(float(class_probs[class_idx]) * 100, 2)

        # Out-of-Distribution (OOD) Envelope Check
        is_ood = False
        ood_reasons = []
        if raw_bands.get("Red", 0) > 350 or raw_bands.get("Red", 0) < 1:
            is_ood = True
            ood_reasons.append("Red reflectance outside physical sensor envelope")
        if raw_bands.get("NIR", 0) > 1000 or raw_bands.get("NIR", 0) < 5:
            is_ood = True
            ood_reasons.append("NIR reflectance outside physical sensor envelope")
        if indices["NDVI"] < -0.8 or indices["NDVI"] > 1.0:
            is_ood = True
            ood_reasons.append("NDVI outside natural physiological envelope")

        # If OOD, calibrate confidence score downward
        calibrated_confidence = round(confidence * 0.5, 2) if is_ood else confidence

        # Ripeness & Maturity Evaluation
        ripeness_info = compute_ripeness(
            commodity=self.food_type,
            raw_bands=raw_bands,
            indices=indices,
            raw_freshness_score=freshness_score,
        )
        final_freshness_score = ripeness_info["calibrated_freshness_score"]

        return {
            "commodity":            self.food_type,
            "food_type":            self.food_type,
            "freshness_score":      final_freshness_score,
            "raw_freshness_score":  freshness_score,
            "category":             category,
            "confidence_pct":       calibrated_confidence,
            "confidence_fresh":     prob_dict.get("Fresh", 0.0),
            "confidence_aging":     prob_dict.get("Aging", 0.0),
            "confidence_spoiling":  prob_dict.get("Spoiling", 0.0),
            "NDVI":                 indices["NDVI"],
            "GNDVI":                indices["GNDVI"],
            "RVI":                  indices["RVI"],
            "model_version":        self.get_canonical_model_name(),
            "is_ood":               is_ood,
            "ood_reasons":          ood_reasons,
            "is_unripe":            ripeness_info["is_unripe"],
            "ripeness_stage":       ripeness_info["ripeness_stage"],
            "ripeness_index":       ripeness_info["ripeness_index"],
        }

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Run inference on a DataFrame of spectral readings.
        Computes indices automatically if not already present.
        Returns the DataFrame with prediction columns appended.
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded.")

        df = df.copy()

        # Compute missing indices
        if "NDVI" not in df.columns:
            df["NDVI"]  = df.apply(lambda r: compute_all_indices(r["NIR"], r["Red"], r["Green"])["NDVI"],  axis=1)
            df["GNDVI"] = df.apply(lambda r: compute_all_indices(r["NIR"], r["Red"], r["Green"])["GNDVI"], axis=1)
            df["RVI"]   = df.apply(lambda r: compute_all_indices(r["NIR"], r["Red"], r["Green"])["RVI"],   axis=1)

        X = df[self.features]

        raw_scores = self.regressor.predict(X).clip(0, 100).round(4)
        df["raw_freshness_score"] = raw_scores

        probs = self.classifier.predict_proba(X)
        df["category"] = self.label_encoder.inverse_transform(np.argmax(probs, axis=1))

        classes = list(self.label_encoder.classes_)
        for i, cls in enumerate(classes):
            df[f"confidence_{cls.lower()}"] = probs[:, i].round(4)

        # Compute ripeness and calibrated freshness scores
        def _calc_row_ripeness(row):
            raw_b = {b: float(row[b]) for b in ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"]}
            idx_dict = {idx: float(row[idx]) for idx in ["NDVI", "GNDVI", "RVI"]}
            return compute_ripeness(self.food_type, raw_b, idx_dict, float(row["raw_freshness_score"]))

        ripeness_results = df.apply(_calc_row_ripeness, axis=1)
        df["is_unripe"] = [r["is_unripe"] for r in ripeness_results]
        df["ripeness_stage"] = [r["ripeness_stage"] for r in ripeness_results]
        df["ripeness_index"] = [r["ripeness_index"] for r in ripeness_results]
        df["freshness_score"] = [r["calibrated_freshness_score"] for r in ripeness_results]

        df["model_version"] = self.get_canonical_model_name()
        return df

    def get_model_info(self) -> dict:
        return {
            "food_type":                self.food_type,
            "model_version":            self.get_canonical_model_name(),
            "raw_version":              self.model_version,
            "classification_accuracy":  self.metadata.get("classification_accuracy"),
            "regression_r2":            self.metadata.get("regression_r2"),
            "training_samples":         self.metadata.get("dataset_shape", [None])[0],
            "features":                 self.features,
            "classes":                  self.metadata.get("classes", []),
        }


# ─── Singleton instances per food type ────────────────────────────────────────
_services: dict[str, InferenceService] = {}


def get_inference_service(food_type: str = "tomato") -> InferenceService:
    """Returns a cached InferenceService for the given food type, loading if needed."""
    if food_type not in _services or not _services[food_type].is_loaded():
        svc = InferenceService(food_type)
        svc.load_best_model()
        _services[food_type] = svc
    return _services[food_type]


def reload_inference_service(food_type: str = "tomato") -> InferenceService:
    """Forces a reload (used after retraining)."""
    svc = InferenceService(food_type)
    svc.load_best_model()
    _services[food_type] = svc
    return svc
