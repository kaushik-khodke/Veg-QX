"""
routers/prediction.py
Handles ML inference for single and batch predictions.
Stores every prediction in the database and CSV history.
"""
from fastapi import APIRouter, Depends, HTTPException
import pandas as pd
import numpy as np

from models.prediction import (
    PredictionRequest,
    PredictionResponse,
    BatchPredictionRequest,
    BatchPredictionResponse,
)
from config import COMMODITY_CONFIGS
from services.inference_service import get_inference_service, InferenceService
from services.database_service import save_prediction, get_next_tomato_id

router = APIRouter(prefix="", tags=["Predictions"])


@router.get("/tomato_id/next")
def get_next_available_tomato_id():
    """Returns the next unique database-managed Tomato ID."""
    try:
        next_id = get_next_tomato_id()
        return {"success": True, "next_tomato_id": next_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/predict", response_model=PredictionResponse)
def predict_single_reading(
    req: PredictionRequest,
):
    try:
        commodity = req.commodity or req.food_type or "tomato"
        inference_svc = get_inference_service(commodity)

        raw_bands = {
            "Blue": req.Blue,
            "Green": req.Green,
            "Yellow": req.Yellow,
            "Orange": req.Orange,
            "Red": req.Red,
            "NIR": req.NIR,
        }
        res = inference_svc.predict_single(raw_bands)

        # Merge in identifiers and metadata
        spec_prefix = commodity[:3].upper()
        specimen_id = req.specimen_id or f"{spec_prefix}-{req.tomato_id or get_next_tomato_id()}"
        res["commodity"] = commodity
        res["food_type"] = commodity
        res["specimen_id"] = specimen_id
        res["tomato_id"] = req.tomato_id
        res["position"] = req.position
        res["input_source"] = req.input_source or "manual"

        # Store prediction (SQLite + CSV)
        record_data = {**raw_bands, **res}
        db_id = save_prediction(record_data)

        # Construct response
        return PredictionResponse(
            id=db_id,
            commodity=commodity,
            food_type=commodity,
            specimen_id=specimen_id,
            Blue=req.Blue,
            Green=req.Green,
            Yellow=req.Yellow,
            Orange=req.Orange,
            Red=req.Red,
            NIR=req.NIR,
            NDVI=res["NDVI"],
            GNDVI=res["GNDVI"],
            RVI=res["RVI"],
            freshness_score=res["freshness_score"],
            category=res["category"],
            confidence_pct=res["confidence_pct"],
            confidence_fresh=res["confidence_fresh"],
            confidence_aging=res["confidence_aging"],
            confidence_spoiling=res["confidence_spoiling"],
            model_version=res["model_version"],
            tomato_id=req.tomato_id,
            position=req.position,
            is_ood=res.get("is_ood", False),
            ood_reasons=res.get("ood_reasons", []),
            ripeness_stage=res.get("ripeness_stage", "Ripe"),
            is_unripe=res.get("is_unripe", False),
            ripeness_index=res.get("ripeness_index", 0.0),
            raw_freshness_score=res.get("raw_freshness_score"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict_batch", response_model=BatchPredictionResponse)
def predict_batch_readings(
    req: BatchPredictionRequest,
):
    """
    Runs batch predictions for multiple positions (e.g. 10 positions of a specimen).
    Saves each prediction row to database history.
    Calculates overall aggregated metrics for the specimen.
    """
    if not req.readings:
        raise HTTPException(status_code=400, detail="Readings list is empty.")

    try:
        predictions = []
        scores = []
        categories = []
        primary_commodity = "tomato"

        for reading in req.readings:
            commodity = reading.commodity or reading.food_type or "tomato"
            primary_commodity = commodity
            inference_svc = get_inference_service(commodity)

            raw_bands = {
                "Blue": reading.Blue,
                "Green": reading.Green,
                "Yellow": reading.Yellow,
                "Orange": reading.Orange,
                "Red": reading.Red,
                "NIR": reading.NIR,
            }
            res = inference_svc.predict_single(raw_bands)
            spec_prefix = commodity[:3].upper()
            specimen_id = reading.specimen_id or f"{spec_prefix}-{reading.tomato_id or get_next_tomato_id()}"
            res["commodity"] = commodity
            res["food_type"] = commodity
            res["specimen_id"] = specimen_id
            res["tomato_id"] = reading.tomato_id
            res["position"] = reading.position
            res["input_source"] = reading.input_source or "manual"

            # Save row
            record_data = {**raw_bands, **res}
            db_id = save_prediction(record_data)

            scores.append(res["freshness_score"])
            categories.append(res["category"])

            predictions.append(
                PredictionResponse(
                    id=db_id,
                    commodity=commodity,
                    food_type=commodity,
                    specimen_id=specimen_id,
                    Blue=reading.Blue,
                    Green=reading.Green,
                    Yellow=reading.Yellow,
                    Orange=reading.Orange,
                    Red=reading.Red,
                    NIR=reading.NIR,
                    NDVI=res["NDVI"],
                    GNDVI=res["GNDVI"],
                    RVI=res["RVI"],
                    freshness_score=res["freshness_score"],
                    category=res["category"],
                    confidence_pct=res["confidence_pct"],
                    confidence_fresh=res["confidence_fresh"],
                    confidence_aging=res["confidence_aging"],
                    confidence_spoiling=res["confidence_spoiling"],
                    model_version=res["model_version"],
                    tomato_id=reading.tomato_id,
                    position=reading.position,
                    is_ood=res.get("is_ood", False),
                    ood_reasons=res.get("ood_reasons", []),
                    ripeness_stage=res.get("ripeness_stage", "Ripe"),
                    is_unripe=res.get("is_unripe", False),
                    ripeness_index=res.get("ripeness_index", 0.0),
                    raw_freshness_score=res.get("raw_freshness_score"),
                )
            )

        # Specimen-level overall aggregation (average of all positions)
        avg_score = float(np.mean(scores))

        # Dynamic commodity threshold lookup
        cfg = COMMODITY_CONFIGS.get(primary_commodity, {})
        fresh_thresh = cfg.get("fresh_threshold", 60.0)
        aging_thresh = cfg.get("aging_threshold", 40.0)

        # Map average score to overall category based on true thresholds
        if avg_score < aging_thresh:
            overall_category = "Spoiling"
        elif avg_score < fresh_thresh:
            overall_category = "Aging"
        else:
            overall_category = "Fresh"

        return BatchPredictionResponse(
            predictions=predictions,
            average_freshness_score=round(avg_score, 4),
            min_freshness_score=round(float(np.min(scores)), 4),
            max_freshness_score=round(float(np.max(scores)), 4),
            overall_category=overall_category,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_prediction")
def force_save_prediction(req: PredictionResponse):
    """Allows saving predictions directly (e.g. from manual offline tracking)."""
    try:
        commodity = req.commodity or req.food_type or "tomato"
        record_data = {
            "commodity": commodity,
            "food_type": commodity,
            "Blue": req.Blue,
            "Green": req.Green,
            "Yellow": req.Yellow,
            "Orange": req.Orange,
            "Red": req.Red,
            "NIR": req.NIR,
            "NDVI": req.NDVI,
            "GNDVI": req.GNDVI,
            "RVI": req.RVI,
            "freshness_score": req.freshness_score,
            "category": req.category,
            "confidence_fresh": req.confidence_fresh,
            "confidence_aging": req.confidence_aging,
            "confidence_spoiling": req.confidence_spoiling,
            "model_version": req.model_version,
            "tomato_id": req.tomato_id,
            "position": req.position,
            "input_source": "manual",
        }
        db_id = save_prediction(record_data)
        return {"success": True, "id": db_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
