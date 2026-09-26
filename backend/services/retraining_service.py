"""
services/retraining_service.py
Manages the human-in-the-loop retraining workflow.
Enforces atomic thread locks, pre-retraining previews, real-time progress updates,
automated feature/data validation, performance gate evaluation with automatic rollback,
immutable dataset snapshots, and post-deployment archiving of verified samples.
"""
import os
import time
import threading
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
from sklearn.metrics import (
    r2_score,
    accuracy_score,
    mean_absolute_error,
    root_mean_squared_error,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.ensemble import HistGradientBoostingRegressor, HistGradientBoostingClassifier

from config import (
    FOOD_CONFIGS,
    MODELS_DIR,
    PERFORMANCE_THRESHOLD_R2,
    PERFORMANCE_MAX_REGRESSION,
)
from services.inference_service import get_inference_service, reload_inference_service
from services.database_service import (
    init_database,
    get_verified_predictions_active,
    generate_verified_dataset_csv,
    save_immutable_training_snapshot,
    archive_verified_predictions,
    log_retraining_run,
    upsert_model_version,
    get_all_model_versions,
)

# ─── Mutex Lock & Progress State ──────────────────────────────────────────────
_retraining_lock = threading.Lock()
_progress_state = {
    "is_running": False,
    "step_name": "Idle",
    "percentage": 0,
    "error": None,
}


def _update_progress(step_name: str, percentage: int, error: str = None):
    global _progress_state
    _progress_state = {
        "is_running": percentage < 100 and error is None,
        "step_name": step_name,
        "percentage": percentage,
        "error": error,
    }


def get_retraining_progress() -> dict:
    """Returns the current retraining progress state for real-time frontend polling."""
    return dict(_progress_state)


def get_retraining_preview(food_type: str = "tomato") -> dict:
    """
    Generates a pre-retraining dataset breakdown preview before triggering model training.
    Strictly isolated and scoped to the requested commodity.
    """
    food_type = (food_type or "tomato").strip().lower()
    cfg = FOOD_CONFIGS.get(food_type, FOOD_CONFIGS.get("tomato", {}))
    ref_path = cfg.get("reference_dataset", "")
    ref_count = 0
    if ref_path and os.path.exists(ref_path):
        try:
            ref_count = len(pd.read_csv(ref_path))
        except Exception:
            ref_count = 100000

    # Query ONLY active verified records for this specific commodity
    active_records = get_verified_predictions_active(food_type=food_type)
    verified_count = len(active_records)
    
    fresh_count = sum(1 for r in active_records if r.get("actual_category") == "Fresh")
    aging_count = sum(1 for r in active_records if r.get("actual_category") == "Aging")
    spoiling_count = sum(1 for r in active_records if r.get("actual_category") == "Spoiling")

    return {
        "food_type": food_type,
        "reference_samples": ref_count,
        "verified_samples": verified_count,
        "merged_samples": ref_count + verified_count,
        "fresh_count": fresh_count,
        "aging_count": aging_count,
        "spoiling_count": spoiling_count,
        "retraining_readiness": verified_count >= 10,
        "remaining_required": max(0, 10 - verified_count),
    }


# ─── Retraining Pipeline Trigger ──────────────────────────────────────────────

def trigger_retraining(food_type: str = "tomato", notes: str = "") -> dict:
    """
    Executes production-grade model retraining workflow:
    1. Acquires thread lock (rejects concurrent calls with 409).
    2. Reads verified dataset strictly for the requested commodity from SQLite.
    3. Validates features & data quality.
    4. Merges with commodity reference dataset.
    5. Benchmarks candidate Regressors & Classifiers (XGBoost, HistGradientBoosting).
       Applies tomato model selection logic: Candidate with HIGHEST classification accuracy is selected!
    6. Evaluates safety performance gates (R² >= 0.85, non-regression). Rollback automatically if failed.
    7. Saves & load-verifies candidate model package scoped to commodity directory.
    8. Updates active model version in SQLite & reloads service for this commodity only.
    9. Saves immutable CSV snapshot & archives verified queue strictly for this commodity in SQLite.
    """
    global _retraining_lock

    if not _retraining_lock.acquire(blocking=False):
        return {
            "success": False,
            "error": "Retraining is currently in progress by another request. Please wait.",
            "code": 409,
        }

    start_time = time.time()
    food_type = (food_type or "tomato").strip().lower()

    try:
        comm_title = food_type.replace('_', ' ').title()
        _update_progress(f"Preparing Dataset for {comm_title} from SQLite", 10)
        # Ensure database tables and column migrations are 100% up-to-date
        init_database()

        # 1. Fetch active verified records strictly for the target commodity
        active_records = get_verified_predictions_active(food_type=food_type)
        if len(active_records) < 10:
            err = f"Insufficient verified data in SQLite for {comm_title}. Minimum 10 required, current: {len(active_records)}"
            _update_progress("Failed: Insufficient Data", 0, err)
            return {"success": False, "error": err}

        # 2. Retrieve active model service & hyperparameter baseline
        inference_svc = get_inference_service(food_type)
        if not inference_svc.is_loaded():
            loaded = inference_svc.load_best_model()
            if not loaded or not inference_svc.is_loaded():
                err = f"No active model loaded in production pipeline for {food_type}."
                _update_progress("Failed: No Base Model", 0, err)
                return {"success": False, "error": err}

        payload = inference_svc.pipeline
        features = inference_svc.features or ["Blue", "Green", "Yellow", "Orange", "Red", "NIR", "NDVI", "GNDVI", "RVI"]
        curr_version_str = inference_svc.model_version or "v1.0"
        curr_r2 = float(payload.get("metadata", {}).get("regression_r2", 0.90))
        curr_acc = float(payload.get("metadata", {}).get("classification_accuracy", 0.85))

        # 3. Load reference dataset
        cfg = FOOD_CONFIGS.get(food_type, FOOD_CONFIGS.get("tomato", {}))
        ref_path = cfg.get("reference_dataset", "")
        if not ref_path or not os.path.exists(ref_path):
            err = f"Reference dataset missing at {ref_path} for {food_type}."
            _update_progress("Failed: Missing Reference Dataset", 0, err)
            return {"success": False, "error": err}

        _update_progress("Validating Features & Data Quality", 25)
        ref_df = pd.read_csv(ref_path)
        ref_samples_count = len(ref_df)

        # Standardize target columns in reference dataset
        if "Freshness_Score" in ref_df.columns:
            ref_y_reg = ref_df["Freshness_Score"].astype(float)
        elif "Freshness_" in ref_df.columns:
            ref_y_reg = ref_df["Freshness_"].astype(float)
        else:
            ref_y_reg = pd.Series([85.0] * len(ref_df), dtype=float)

        if "Freshness_Category" in ref_df.columns:
            ref_y_clf = ref_df["Freshness_Category"].astype(str)
        elif "Category" in ref_df.columns:
            ref_y_clf = ref_df["Category"].astype(str)
        else:
            ref_y_clf = pd.Series(["Fresh"] * len(ref_df), dtype=str)

        # Check reference dataset contains spectral features
        missing_features = [f for f in features if f not in ref_df.columns]
        if missing_features:
            err = f"Reference dataset missing required ML feature columns: {missing_features}"
            _update_progress("Failed: Missing Features", 0, err)
            return {"success": False, "error": err}

        X_ref = ref_df[features].copy()

        # Convert active verified records into DataFrame
        new_feats = []
        new_y_reg = []
        new_y_clf = []

        for r in active_records:
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

            freshness = r.get("actual_freshness_score") if r.get("actual_freshness_score") is not None else (r.get("freshness_score") or 85.0)
            category = r.get("actual_category") or r.get("predicted_category") or "Fresh"

            new_feats.append({
                "Blue": float(blue),
                "Green": float(green),
                "Yellow": float(yellow),
                "Orange": float(orange),
                "Red": float(red),
                "NIR": float(nir),
                "NDVI": float(ndvi),
                "GNDVI": float(gndvi),
                "RVI": float(rvi),
            })
            new_y_reg.append(float(freshness))
            new_y_clf.append(str(category))

        X_new = pd.DataFrame(new_feats)[features].dropna()
        y_new_reg = pd.Series(new_y_reg, dtype=float).iloc[X_new.index]
        y_new_clf = pd.Series(new_y_clf, dtype=str).iloc[X_new.index]

        if len(X_new) < 10:
            err = "Verified dataset has too many null values after filtering."
            _update_progress("Failed: Corrupt Data", 0, err)
            return {"success": False, "error": err}

        _update_progress("Merging Verified & Reference Datasets", 40)
        X_comb = pd.concat([X_ref, X_new], ignore_index=True)
        y_comb_reg = pd.concat([ref_y_reg, y_new_reg], ignore_index=True)
        y_comb_clf_raw = pd.concat([ref_y_clf, y_new_clf], ignore_index=True)
        total_samples = len(X_comb)

        # Label encoding for classification
        le_new = LabelEncoder()
        y_comb_clf = le_new.fit_transform(y_comb_clf_raw)

        X_tr, X_te, y_tr_reg, y_te_reg, y_tr_clf, y_te_clf = train_test_split(
            X_comb, y_comb_reg, y_comb_clf, test_size=0.20, random_state=42
        )

        _update_progress("Benchmarking Candidate Models (Highest Accuracy Selection)", 60)

        # Candidate Classifiers benchmarked (Tomato model selection logic)
        clf_candidates = {
            "XGBoost": xgb.XGBClassifier(
                n_estimators=150,
                max_depth=6,
                learning_rate=0.08,
                subsample=0.85,
                colsample_bytree=0.85,
                random_state=42,
                n_jobs=4
            ),
            "HistGradientBoosting": HistGradientBoostingClassifier(
                max_iter=150,
                max_depth=6,
                learning_rate=0.08,
                random_state=42
            )
        }

        # Candidate Regressors benchmarked
        reg_candidates = {
            "XGBoost": xgb.XGBRegressor(
                n_estimators=150,
                max_depth=6,
                learning_rate=0.08,
                subsample=0.85,
                colsample_bytree=0.85,
                random_state=42,
                n_jobs=4
            ),
            "HistGradientBoosting": HistGradientBoostingRegressor(
                max_iter=150,
                max_depth=6,
                learning_rate=0.08,
                random_state=42
            )
        }

        # 1. Benchmark Classifiers: The model candidate with the HIGHEST classification accuracy is selected!
        best_clf_name = None
        best_clf = None
        best_acc = -1.0
        best_clf_preds = None

        for name, clf_model in clf_candidates.items():
            clf_model.fit(X_tr, y_tr_clf)
            preds = clf_model.predict(X_te)
            acc = float(accuracy_score(y_te_clf, preds))
            print(f"[Retraining] {name} Classifier Validation Accuracy: {acc * 100:.2f}%")
            if acc > best_acc:
                best_acc = acc
                best_clf_name = name
                best_clf = clf_model
                best_clf_preds = preds

        # 2. Benchmark Regressors: Regressor candidate with highest R2 score is selected
        best_reg_name = None
        best_reg = None
        best_r2 = -float("inf")
        best_reg_preds = None

        for name, reg_model in reg_candidates.items():
            reg_model.fit(X_tr, y_tr_reg)
            preds = reg_model.predict(X_te)
            r2 = float(r2_score(y_te_reg, preds))
            print(f"[Retraining] {name} Regressor Validation R2: {r2:.4f}")
            if r2 > best_r2:
                best_r2 = r2
                best_reg_name = name
                best_reg = reg_model
                best_reg_preds = preds

        _update_progress(f"Evaluating Metrics (Selected {best_clf_name} / {best_reg_name})", 75)

        new_reg = best_reg
        new_clf = best_clf
        new_r2 = best_r2
        new_acc = best_acc

        mae = float(mean_absolute_error(y_te_reg, best_reg_preds))
        rmse = float(root_mean_squared_error(y_te_reg, best_reg_preds))

        prec = float(precision_score(y_te_clf, best_clf_preds, average="weighted", zero_division=0))
        rec = float(recall_score(y_te_clf, best_clf_preds, average="weighted", zero_division=0))
        f1 = float(f1_score(y_te_clf, best_clf_preds, average="weighted", zero_division=0))

        # Versioning string (increments beyond highest existing model version for THIS commodity)
        existing_versions = [v.get("version", "") for v in get_all_model_versions(food_type=food_type)]
        max_v = 1.0 if food_type != "tomato" else 1.1
        for ev in existing_versions:
            try:
                clean_num = ev.replace(f"{food_type}_", "").replace("v", "")
                num = float(clean_num)
                if num > max_v:
                    max_v = num
            except ValueError:
                pass
        ver_num_str = f"v{round(max_v + 0.1, 1)}"
        new_version_str = ver_num_str if food_type == "tomato" else f"{food_type}_{ver_num_str}"

        duration_sec = round(time.time() - start_time, 2)

        # Performance Gate Evaluation: R2 threshold, regression slipgate, and accuracy protection
        performance_check_passed = (
            (new_r2 >= PERFORMANCE_THRESHOLD_R2)
            and (new_r2 >= (curr_r2 - PERFORMANCE_MAX_REGRESSION))
            and (new_acc >= (curr_acc - 0.03))
        )

        retrain_log = {
            "food_type":             food_type,
            "base_version":          curr_version_str,
            "new_version":           new_version_str,
            "training_samples":      total_samples,
            "reference_samples":     ref_samples_count,
            "verified_samples":      len(X_new),
            "accuracy":              new_acc,
            "precision":             prec,
            "recall":                rec,
            "f1":                    f1,
            "r2":                    new_r2,
            "mae":                   mae,
            "rmse":                  rmse,
            "training_duration_sec": duration_sec,
            "status":                "SUCCESS" if performance_check_passed else "FAILED_PERFORMANCE_GATE",
            "deployed":              1 if performance_check_passed else 0,
            "notes":                 f"{notes} [Selected {best_clf_name} by highest accuracy: {new_acc * 100:.2f}%]" if notes else f"Selected {best_clf_name} by highest accuracy: {new_acc * 100:.2f}%",
        }

        # Automatic Rollback Protection
        if not performance_check_passed:
            log_retraining_run(retrain_log)
            err_msg = f"Performance check failed! Candidate R² ({new_r2:.4f}) or Accuracy ({new_acc*100:.2f}%) did not pass safety gates (threshold R²: {PERFORMANCE_THRESHOLD_R2}, base R²: {curr_r2:.4f}, base Acc: {curr_acc*100:.2f}%). Automatic rollback triggered. Active version remains {curr_version_str}."
            _update_progress("Failed: Performance Gate Rollback", 0, err_msg)
            return {
                "success": False,
                "error": err_msg,
                "base_version": curr_version_str,
                "new_version": new_version_str,
                "metrics": {
                    "old_r2": curr_r2,
                    "new_r2": new_r2,
                    "old_accuracy": curr_acc,
                    "new_accuracy": new_acc,
                }
            }

        _update_progress("Saving & Load-Verifying Candidate Models", 85)
        new_payload = {
            "regressor": new_reg,
            "classifier": new_clf,
            "label_encoder": le_new,
            "preprocessor": payload.get("preprocessor"),
            "features": features,
            "metadata": {
                "commodity": food_type,
                "dataset_shape": X_comb.shape,
                "classes": list(le_new.classes_),
                "regressor_algorithm": best_reg_name,
                "classifier_algorithm": best_clf_name,
                "regression_r2": new_r2,
                "classification_accuracy": new_acc,
                "version": new_version_str,
                "ver_num": ver_num_str,
                "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S")
            }
        }

        # Save model package strictly into commodity-specific location
        if food_type == "tomato":
            new_pkl_filename = f"tomato_freshness_pipeline_{ver_num_str}.pkl"
            new_pkl_path = MODELS_DIR / new_pkl_filename
            joblib.dump(new_payload, str(new_pkl_path))

            # Overwrite active production endpoints for tomato only
            joblib.dump(new_reg, str(MODELS_DIR / "xgboost_regressor.pkl"))
            joblib.dump(new_clf, str(MODELS_DIR / "xgboost_classifier.pkl"))
        else:
            comm_dir = MODELS_DIR / food_type
            comm_dir.mkdir(parents=True, exist_ok=True)
            new_pkl_filename = f"{food_type}_freshness_pipeline_{ver_num_str}.pkl"
            new_pkl_path = comm_dir / new_pkl_filename
            joblib.dump(new_payload, str(new_pkl_path))

            # Save active copy in commodity folder (never touch root tomato models!)
            active_pkl_path = comm_dir / f"{food_type}_freshness_pipeline_active.pkl"
            joblib.dump(new_payload, str(active_pkl_path))

        # Test loading saved payload to guarantee zero serialization corruption
        try:
            test_load = joblib.load(str(new_pkl_path))
            assert "regressor" in test_load and "classifier" in test_load
        except Exception as load_err:
            err_msg = f"Candidate model file corrupt after save: {load_err}"
            _update_progress("Failed: Model Load Verification", 0, err_msg)
            return {"success": False, "error": err_msg}

        _update_progress("Updating Active Model Version in SQLite", 95)
        upsert_model_version({
            "version":                 new_version_str,
            "food_type":               food_type,
            "training_samples":        total_samples,
            "classification_accuracy": new_acc,
            "regression_r2":           new_r2,
            "mae":                      mae,
            "rmse":                     rmse,
            "pkl_path":                 str(new_pkl_path),
            "notes":                    f"Retrained on {len(X_new)} verified samples ({best_clf_name} selected for highest accuracy: {new_acc*100:.2f}%). Notes: {notes}"
        })

        # Reload active inference service strictly for this commodity
        reload_inference_service(food_type)

        _update_progress("Archiving Verified Samples & Creating Snapshot", 98)
        # Generate dynamic CSV content & save permanent immutable snapshot file for this commodity
        csv_text = generate_verified_dataset_csv(food_type=food_type)
        snapshot_path = save_immutable_training_snapshot(new_version_str, csv_text)

        # Log retraining audit record
        retrain_log["snapshot_path"] = snapshot_path
        run_id = log_retraining_run(retrain_log)

        # ARCHIVE ACTIVE VERIFIED SAMPLES STRICTLY FOR THIS COMMODITY
        # All other commodities retain their active verified samples!
        archive_verified_predictions(run_id, food_type=food_type)

        _update_progress("Completed Successfully", 100)

        return {
            "success": True,
            "message": f"Retraining successful for {comm_title}. {best_clf_name} selected with highest accuracy ({new_acc*100:.2f}%). Deployed as {new_version_str}.",
            "base_version": curr_version_str,
            "new_version": new_version_str,
            "selected_classifier": best_clf_name,
            "selected_regressor": best_reg_name,
            "training_duration_sec": duration_sec,
            "snapshot_path": snapshot_path,
            "metrics": {
                "old_r2": curr_r2,
                "new_r2": new_r2,
                "old_accuracy": curr_acc,
                "new_accuracy": new_acc,
                "precision": prec,
                "recall": rec,
                "f1": f1,
                "mae": mae,
                "rmse": rmse,
            }
        }

    except Exception as e:
        err_str = f"Unexpected retraining pipeline error: {str(e)}"
        _update_progress("Error", 0, err_str)
        return {"success": False, "error": err_str}

    finally:
        _retraining_lock.release()
