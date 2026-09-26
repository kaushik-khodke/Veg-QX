"""
main.py — FastAPI Application Entrypoint.
Initializes SQLite database and preloads the best ML model on startup.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from pathlib import Path

from config import CORS_ORIGINS
from services.database_service import init_database
from services.inference_service import get_inference_service
from routers import (
    health,
    prediction,
    upload,
    history,
    verification,
    sensor,
    models_info,
    analytics,
    retraining,
)

from contextlib import asynccontextmanager

import shutil
from fastapi.staticfiles import StaticFiles
from config import BASE_DIR

def ensure_logo_copied():
    logo_sources = [
        str(BASE_DIR / "static" / "voyage_robotics_logo.png"),
        r"D:\voyage robotics VEG QX\ml model\voyage_robotics_logo.png",
        r"C:\Users\ASUS\.gemini\antigravity-ide\brain\9b9c335d-171d-4c70-8004-2ebc829920c2\media__1785308917848.png"
    ]
    for src in logo_sources:
        if os.path.exists(src):
            try:
                public_dir = BASE_DIR.parent / "frontend" / "public"
                public_dir.mkdir(parents=True, exist_ok=True)
                target_public = public_dir / "voyage_robotics_logo.png"
                if Path(src).resolve() != target_public.resolve():
                    shutil.copy(src, target_public)

                static_dir = BASE_DIR / "static"
                static_dir.mkdir(parents=True, exist_ok=True)
                target_static = static_dir / "voyage_robotics_logo.png"
                if Path(src).resolve() != target_static.resolve():
                    shutil.copy(src, target_static)
                print(f"  [OK] Logo copied from {src} to frontend/public and backend/static.")
                break
            except Exception as e:
                print(f"  Note copying logo: {e}")

    # Ensure hologram_tomato.png exists without overwriting user-provided files
    public_dir = BASE_DIR.parent / "frontend" / "public"
    target_tomato = public_dir / "hologram_tomato.png"
    if not target_tomato.exists():
        tomato_sources = [
            r"C:\Users\ASUS\.gemini\antigravity-ide\brain\9b9c335d-171d-4c70-8004-2ebc829920c2\hologram_tomato_1785314410202.png",
        ]
        for src in tomato_sources:
            if os.path.exists(src):
                try:
                    public_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy(src, target_tomato)
                    print(f"  [OK] Initial hologram tomato initialized at {target_tomato}")
                    break
                except Exception as e:
                    print(f"  Note initializing tomato: {e}")

ensure_logo_copied()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(">>> VEG QX — Voyage Robotics API starting up...")
    ensure_logo_copied()

    # 1. Initialize DB and directories
    print("  Initializing SQLite database & CSV files...")
    init_database()

    # 2. Preload active models for all commodities
    print("  Preloading best active ML pipelines...")
    from config import COMMODITY_CONFIGS
    for comm in COMMODITY_CONFIGS.keys():
        try:
            svc = get_inference_service(comm)
            if svc.is_loaded():
                print(f"  [OK] Model version '{svc.model_version}' for '{comm}' loaded successfully.")
            else:
                print(f"  [INFO] Model for '{comm}' not yet loaded or placeholder.")
        except Exception as e:
            print(f"  [WARNING] Could not preload model for '{comm}': {e}")

    print(">>> Startup complete. API is ready.")
    yield


# Initialize FastAPI App
app = FastAPI(
    title="VEG QX — Voyage Robotics API",
    description="Scientific API endpoints for real-time sensor connection, batch prediction, and model retraining under Voyage Robotics.",
    version="1.1",
    lifespan=lifespan,
)

# Serve static files for assets
static_path = BASE_DIR / "static"
static_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Configure CORS for Next.js communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API Routers
app.include_router(health.router)
app.include_router(prediction.router)
app.include_router(upload.router)
app.include_router(history.router)
app.include_router(verification.router)
app.include_router(sensor.router)
app.include_router(models_info.router)
app.include_router(analytics.router)
app.include_router(retraining.router)


@app.get("/")
def read_root():
    return {
        "title": "VEG QX Freshness Detection API",
        "version": "1.1",
        "documentation": "/docs",
        "status": "online",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
