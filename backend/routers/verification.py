"""
routers/verification.py
Handles prediction verification by a human.
Saves complete ML prediction feature vectors into SQLite verified_predictions table
and provides dynamic statistics and CSV download endpoints.
"""
from fastapi import APIRouter, HTTPException, Response
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from models.retraining import VerificationRequest
from services.database_service import (
    save_verification,
    get_prediction_by_id,
    get_verification_stats,
    get_verified_predictions_active,
    generate_verified_dataset_csv,
)

router = APIRouter(prefix="/verify_prediction", tags=["Verification"])


class BulkVerificationItem(BaseModel):
    prediction_id: int
    actual_category: str
    actual_freshness_score: Optional[float] = None
    notes: Optional[str] = None


class BulkVerificationRequest(BaseModel):
    items: List[BulkVerificationItem]


@router.get("/stats")
def fetch_verification_stats(commodity: Optional[str] = None):
    """Returns dynamic verification metrics directly calculated from SQLite active records, optionally filtered by specimen."""
    try:
        clean_comm = commodity.strip().lower() if commodity and commodity.strip().lower() not in ("all", "all specimens", "none", "") else None
        stats = get_verification_stats(food_type=clean_comm)
        return {"success": True, "data": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
def fetch_verified_history(
    commodity: Optional[str] = None,
    category: Optional[str] = None,
):
    """Returns active human-verified prediction records for audit in Verification Center, filtered by specimen or category."""
    try:
        clean_comm = commodity.strip().lower() if commodity and commodity.strip().lower() not in ("all", "all specimens", "none", "") else None
        clean_cat = category.strip() if category and category.strip().lower() not in ("all", "all categories", "none", "") else None
        verified_records = get_verified_predictions_active(food_type=clean_comm, category=clean_cat)
        return {"success": True, "total": len(verified_records), "data": verified_records}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download_csv")
def download_verified_dataset_csv(commodity: Optional[str] = None):
    """
    Dynamically generates the verified training dataset CSV from SQLite
    filtered by specimen type or all specimens, streaming it with a timestamped filename.
    """
    try:
        clean_comm = commodity.strip().lower() if commodity and commodity.strip().lower() not in ("all", "all specimens", "none", "") else None
        csv_content = generate_verified_dataset_csv(food_type=clean_comm)
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        if clean_comm:
            filename = f"verified_dataset_{clean_comm}_{timestamp_str}.csv"
        else:
            filename = f"verified_dataset_all_specimens_{timestamp_str}.csv"
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk")
def verify_predictions_bulk(req: BulkVerificationRequest):
    """
    Submits multiple user-verified category/score records at once inside atomic SQLite transactions.
    """
    success_count = 0
    errors = []
    for item in req.items:
        try:
            pred = get_prediction_by_id(item.prediction_id)
            if not pred:
                errors.append(f"ID {item.prediction_id}: Prediction ID not found.")
                continue

            save_verification(
                prediction_id=item.prediction_id,
                actual_category=item.actual_category,
                actual_freshness=item.actual_freshness_score,
                notes=item.notes,
            )
            success_count += 1
        except ValueError as ve:
            errors.append(f"ID {item.prediction_id}: {str(ve)}")
        except Exception as e:
            errors.append(f"ID {item.prediction_id}: {str(e)}")

    if errors:
        return {
            "success": False,
            "success_count": success_count,
            "errors": errors,
            "message": f"Bulk verification completed with some errors. Verified {success_count} records.",
        }
    return {
        "success": True,
        "success_count": success_count,
        "message": f"Successfully bulk-verified {success_count} records.",
    }


@router.post("/{prediction_id}")
def verify_prediction_record(prediction_id: int, req: VerificationRequest):
    """
    Submits a user-verified category/score for a specific historical prediction ID.
    Saves complete feature vector to SQLite and marks prediction status as VERIFIED.
    """
    pred = get_prediction_by_id(prediction_id)
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction ID not found.")

    try:
        v_id = save_verification(
            prediction_id=prediction_id,
            actual_category=req.actual_category,
            actual_freshness=req.actual_freshness_score,
            notes=req.notes,
        )
        return {
            "success": True,
            "verification_id": v_id,
            "message": "Verification record saved successfully.",
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

