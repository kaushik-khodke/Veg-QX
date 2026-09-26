"""
routers/history.py
Endpoint to fetch prediction history with pagination.
"""
from fastapi import APIRouter, Query
from typing import Optional

from services.database_service import get_prediction_history, get_prediction_count

router = APIRouter(prefix="/prediction_history", tags=["History"])


@router.get("")
@router.get("/")
def fetch_history(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    category: Optional[str] = Query(None, description="Filter by Category"),
    commodity: Optional[str] = Query(None, description="Filter by Commodity"),
    food_type: Optional[str] = Query(None, description="Filter by Food Type"),
):
    """
    Returns a paginated list of predictions saved in SQLite database.
    Supports filtering by specific specimen/commodity or viewing all specimens.
    """
    try:
        # Determine target specimen/commodity. If None or "all", query across all specimens.
        target = commodity if commodity is not None else food_type
        if target and target.strip().lower() in ("all", "all specimens", "none", ""):
            target = None

        cat = category
        if cat and cat.strip().lower() in ("all", "all categories", "none", ""):
            cat = None

        history = get_prediction_history(
            food_type=target,
            limit=limit,
            offset=offset,
            category=cat,
        )
        total_count = get_prediction_count(food_type=target, category=cat)
        return {
            "success": True,
            "commodity": target or "all",
            "category": cat or "all",
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "data": history,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
