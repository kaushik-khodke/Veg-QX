"""
models/prediction.py
Pydantic schemas for prediction requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class PredictionRequest(BaseModel):
    Blue: float = Field(..., description="Blue band reflectance (AS7341)")
    Green: float = Field(..., description="Green band reflectance (AS7341)")
    Yellow: float = Field(..., description="Yellow band reflectance (AS7341)")
    Orange: float = Field(..., description="Orange band reflectance (AS7341)")
    Red: float = Field(..., description="Red band reflectance (AS7341)")
    NIR: float = Field(..., description="Near-Infrared reflectance (AS7341)")
    commodity: Optional[str] = Field("tomato", description="Target commodity (tomato, carrot, brinjal, etc.)")
    food_type: Optional[str] = Field("tomato", description="Alias for commodity")
    specimen_id: Optional[str] = Field(None, description="Optional specimen identifier")
    tomato_id: Optional[int] = Field(None, description="Legacy Tomato identification ID")
    position: Optional[int] = Field(None, description="Optional reading position (1-10)")
    input_source: Optional[str] = Field("manual", description="Source of reading: 'manual', 'usb', 'csv_upload'")


class PredictionResponse(BaseModel):
    id: Optional[int] = Field(None, description="Database record ID")
    commodity: Optional[str] = "tomato"
    food_type: Optional[str] = "tomato"
    Blue: float
    Green: float
    Yellow: float
    Orange: float
    Red: float
    NIR: float
    NDVI: float
    GNDVI: float
    RVI: float
    freshness_score: float
    category: str
    confidence_pct: float
    confidence_fresh: float
    confidence_aging: float
    confidence_spoiling: float
    model_version: str
    specimen_id: Optional[str] = None
    tomato_id: Optional[int] = None
    position: Optional[int] = None
    is_ood: Optional[bool] = False
    ood_reasons: Optional[List[str]] = []
    ripeness_stage: Optional[str] = "Ripe"
    is_unripe: Optional[bool] = False
    ripeness_index: Optional[float] = 0.0
    raw_freshness_score: Optional[float] = None


class BatchPredictionRequest(BaseModel):
    readings: List[PredictionRequest]


class BatchPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]
    average_freshness_score: float
    min_freshness_score: float
    max_freshness_score: float
    overall_category: str
