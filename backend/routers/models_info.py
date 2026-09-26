import os
import joblib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from config import MODELS_DIR, DATASETS_DIR, FOOD_CONFIGS, COMMODITY_CONFIGS
from services.inference_service import get_inference_service, reload_inference_service, InferenceService
from services.database_service import (
    get_all_model_versions,
    set_active_model_version,
    delete_model_version_record,
)

router = APIRouter(tags=["Model Info"])


@router.get("/commodities")
def list_commodities():
    """
    Returns list of supported commodities with metadata, icons, and freshness thresholds.
    """
    res = []
    for key, cfg in COMMODITY_CONFIGS.items():
        res.append({
            "key": key,
            "display_name": cfg.get("display_name", key.replace("_", " ").title()),
            "icon": cfg.get("icon", "🌱"),
            "family": cfg.get("family", "Unknown"),
            "fresh_threshold": cfg.get("fresh_threshold", 60.0),
            "aging_threshold": cfg.get("aging_threshold", 40.0),
            "model_version": cfg.get("model_version", "v1.0"),
        })
    return {"success": True, "data": res}


@router.get("/model_information")
def get_model_information(
    commodity: Optional[str] = Query(None, description="Commodity to inspect"),
    food_type: str = Query("tomato", description="Alias for commodity"),
):
    """
    Returns metadata about the active ML pipeline, features, classes,
    and performance scores for the selected commodity.
    """
    target = commodity or food_type or "tomato"
    inference_svc = get_inference_service(target)
    if not inference_svc.is_loaded():
        raise HTTPException(status_code=404, detail=f"No active model loaded for '{target}'.")
    return {
        "success": True,
        "data": inference_svc.get_model_info(),
    }


@router.get("/model_versions")
def get_model_versions(
    commodity: Optional[str] = Query(None, description="Filter by commodity"),
    food_type: Optional[str] = Query(None, description="Filter by food_type"),
):
    """
    Returns a list of all model versions saved in the database,
    sorted by training date, optionally filtered by commodity.
    """
    try:
        target = commodity or food_type
        versions = get_all_model_versions(food_type=target)
        return {
            "success": True,
            "data": versions,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/model_versions/activate/{version}")
def activate_model_version(
    version: str,
    commodity: Optional[str] = Query(None),
    food_type: str = Query("tomato"),
):
    """
    Activates the specified model version.
    1. Updates SQLite model_versions table scoped to the commodity.
    2. Synchronizes active model binary.
    3. Reloads active production inference service.
    """
    target = commodity or food_type or "tomato"
    try:
        version_data = set_active_model_version(version, food_type=target)

        # Locate pipeline pkl file
        if target == "tomato":
            pkl_path = MODELS_DIR / f"tomato_freshness_pipeline_{version}.pkl"
            if not pkl_path.exists():
                if version == "v1.0":
                    pkl_path = MODELS_DIR / "tomato_freshness_pipeline_v1.pkl"
                elif version == "v1.1":
                    pkl_path = MODELS_DIR / "tomato_freshness_pipeline_v1.1.pkl"
            if pkl_path.exists():
                try:
                    payload = joblib.load(str(pkl_path))
                    if isinstance(payload, dict):
                        if "regressor" in payload:
                            joblib.dump(payload["regressor"], str(MODELS_DIR / "xgboost_regressor.pkl"))
                        if "classifier" in payload:
                            joblib.dump(payload["classifier"], str(MODELS_DIR / "xgboost_classifier.pkl"))
                except Exception as load_err:
                    print(f"Notice during binary sync: {load_err}")
                if target in FOOD_CONFIGS:
                    FOOD_CONFIGS[target]["active_model_path"] = str(pkl_path)
        else:
            comm_dir = MODELS_DIR / target
            pkl_path = comm_dir / f"{target}_freshness_pipeline_{version}.pkl"
            if pkl_path.exists():
                active_link = comm_dir / f"{target}_freshness_pipeline_active.pkl"
                try:
                    import shutil
                    shutil.copyfile(str(pkl_path), str(active_link))
                except Exception as sync_err:
                    print(f"Notice syncing active commodity model: {sync_err}")
                if target in FOOD_CONFIGS:
                    FOOD_CONFIGS[target]["active_model_path"] = str(pkl_path)

        reload_inference_service(target)

        return {
            "success": True,
            "message": f"Model version {version} for '{target}' successfully activated.",
            "data": version_data,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/model_versions/{version}")
def delete_model_version(
    version: str,
    commodity: Optional[str] = Query(None),
    food_type: str = Query("tomato"),
):
    """
    Permanently deletes a retrained model version record and its file binaries.
    Tomato baseline versions v1.0 and v1.1 cannot be deleted.
    Baseline versions v1.0 of commodities cannot be deleted.
    Currently active models CANNOT be deleted.
    """
    target = commodity or food_type or "tomato"

    # Determine if this version is a permanent baseline
    # Baselines can be stored as "v1.0" or "{commodity}_v1.0" depending on the commodity
    is_tomato_baseline = (target == "tomato" and version in ["v1.0", "v1.1"])
    plain_baseline = (version == "v1.0" or version == f"{target}_v1.0" or version.endswith("_v1.0"))
    is_commodity_baseline = (target != "tomato" and plain_baseline)

    if is_tomato_baseline:
        raise HTTPException(
            status_code=400,
            detail=f"Model version {version} is a permanent system baseline and cannot be deleted."
        )
    if is_commodity_baseline:
        raise HTTPException(
            status_code=400,
            detail=f"Model version {version} for '{target}' is the baseline model and cannot be deleted."
        )

    try:
        deleted_record = delete_model_version_record(version, food_type=target)

        # Delete versioned pkl file
        if target == "tomato":
            pkl_path = MODELS_DIR / f"tomato_freshness_pipeline_{version}.pkl"
        else:
            pkl_path = MODELS_DIR / target / f"{target}_freshness_pipeline_{version}.pkl"

        if pkl_path.exists():
            try:
                os.remove(pkl_path)
            except Exception:
                pass

        # Delete immutable dataset snapshot file if exists
        snapshot_filename = f"training_snapshot_{target}_{version.replace('.', '_')}.csv"
        snapshot_path = DATASETS_DIR / "snapshots" / snapshot_filename
        if snapshot_path.exists():
            try:
                os.remove(snapshot_path)
            except Exception:
                pass

        return {
            "success": True,
            "message": f"Model version {version} for '{target}' deleted successfully.",
            "deleted": version,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

