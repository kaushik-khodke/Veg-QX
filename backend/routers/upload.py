"""
routers/upload.py
Handles CSV and Excel file uploads for batch prediction.
Validates file columns, checks for missing data, and returns predicted results.
"""
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from typing import Optional
import pandas as pd
import io

from services.inference_service import get_inference_service, InferenceService
from services.database_service import save_prediction, save_verification

router = APIRouter(prefix="/upload_csv", tags=["Upload"])


@router.post("")
async def upload_and_predict_dataset(
    file: UploadFile = File(...),
    commodity: Optional[str] = None,
):
    """
    Accepts CSV or XLSX dataset, validates required spectral columns,
    runs batch predictions, saves all records to SQLite database,
    and automatically populates the verified retraining queue if ground truth labels exist.
    """
    target_commodity = commodity or "tomato"
    inference_svc = get_inference_service(target_commodity)
    filename = file.filename.lower()
    contents = await file.read()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Please upload a .csv, .xls, or .xlsx file."
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    # Column Validation
    required_cols = ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"]
    missing = [col for col in required_cols if col not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns in dataset: {missing}"
        )

    # Clean missing values in spectral features
    df = df.dropna(subset=required_cols)
    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file contains no valid rows (all target rows had null values)."
        )

    # Optional columns mapping
    if "Tomato_ID" not in df.columns and "specimen_id" not in df.columns and "Specimen_ID" not in df.columns:
        df["Tomato_ID"] = None
    if "Tomato_position" not in df.columns and "position" not in df.columns:
        df["Tomato_position"] = None
    if "input_source" not in df.columns:
        df["input_source"] = "csv_upload"

    try:
        # Run batch predictions
        pred_df = inference_svc.predict_batch(df)

        saved_count = 0
        verified_count = 0

        # Save every uploaded dataset row into SQLite (predictions + verified_predictions)
        for idx, row in pred_df.iterrows():
            tomato_id = int(row["Tomato_ID"]) if pd.notna(row.get("Tomato_ID")) else None
            position = int(row.get("Tomato_position", 1)) if pd.notna(row.get("Tomato_position")) else 1
            raw_spec = row.get("Specimen_ID") or row.get("specimen_id")
            specimen_id = str(raw_spec) if pd.notna(raw_spec) else f"{target_commodity[:3].upper()}-{tomato_id or idx+1}"

            record_data = {
                "commodity": target_commodity,
                "food_type": target_commodity,
                "specimen_id": specimen_id,
                "tomato_id": tomato_id,
                "position": position,
                "input_source": "csv_upload",
                "Blue": float(row["Blue"]),
                "Green": float(row["Green"]),
                "Yellow": float(row["Yellow"]),
                "Orange": float(row["Orange"]),
                "Red": float(row["Red"]),
                "NIR": float(row["NIR"]),
                "NDVI": float(row["NDVI"]),
                "GNDVI": float(row["GNDVI"]),
                "RVI": float(row["RVI"]),
                "freshness_score": float(row["freshness_score"]),
                "category": str(row["category"]),
                "confidence_fresh": float(row.get("confidence_fresh", 0.0)),
                "confidence_aging": float(row.get("confidence_aging", 0.0)),
                "confidence_spoiling": float(row.get("confidence_spoiling", 0.0)),
                "model_version": str(row.get("model_version", inference_svc.get_canonical_model_name())),
            }

            db_id = save_prediction(record_data)
            saved_count += 1

            # Check if ground truth label is present in original uploaded row
            actual_cat = None
            orig_row = df.iloc[idx] if idx < len(df) else {}
            for col_name in ["Category", "actual_category", "category"]:
                if col_name in orig_row and pd.notna(orig_row[col_name]):
                    actual_cat = str(orig_row[col_name]).strip()
                    break

            actual_fresh = None
            for col_name in ["Freshness_", "actual_freshness_score", "freshness_score"]:
                if col_name in orig_row and pd.notna(orig_row[col_name]):
                    try:
                        actual_fresh = float(orig_row[col_name])
                        break
                    except (ValueError, TypeError):
                        pass

            if actual_cat:
                actual_cat_cap = actual_cat.capitalize()
                if actual_cat_cap in ["Fresh", "Aging", "Spoiling"]:
                    save_verification(
                        prediction_id=db_id,
                        actual_category=actual_cat_cap,
                        actual_freshness=actual_fresh,
                        notes=f"Auto-verified from dataset file: {file.filename}",
                        verified_by="csv_upload"
                    )
                    verified_count += 1

        # Prepare summary stats
        summary = {
            "filename": file.filename,
            "total_samples": len(pred_df),
            "saved_records": saved_count,
            "auto_verified_records": verified_count,
            "fresh_count": int((pred_df["category"] == "Fresh").sum()),
            "aging_count": int((pred_df["category"] == "Aging").sum()),
            "spoiling_count": int((pred_df["category"] == "Spoiling").sum()),
            "average_freshness": float(pred_df["freshness_score"].mean()),
        }

        # Convert preview subset to list of dicts (first 100 rows)
        preview_cols = required_cols + ["Tomato_ID", "Tomato_position", "freshness_score", "category", "NDVI", "GNDVI", "RVI"]
        actual_preview_cols = [c for c in preview_cols if c in pred_df.columns]
        preview_data = pred_df[actual_preview_cols].head(100).replace({pd.NA: None, float('nan'): None}).to_dict(orient="records")

        return {
            "success": True,
            "summary": summary,
            "preview": preview_data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
