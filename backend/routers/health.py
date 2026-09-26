"""
routers/health.py
System health checks. Renders active status of serial ports, ML models, and SQLite DB.
"""
from fastapi import APIRouter, Depends
import os

from services.sensor_service import get_sensor_service, SensorService
from services.inference_service import get_inference_service, InferenceService
from services.database_service import get_connection

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
@router.get("/")
def health_check(
    commodity: str = "tomato",
    sensor_svc: SensorService = Depends(get_sensor_service),
):
    # Database check
    db_ok = False
    try:
        conn = get_connection()
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception as e:
        print(f"[Health] DB check error: {e}")

    # Model status
    model_ok = False
    active_model_name = None
    model_ver = None
    try:
        inference_svc = get_inference_service(commodity)
        model_ok = inference_svc.is_loaded()
        if model_ok:
            active_model_name = inference_svc.get_canonical_model_name()
            model_ver = inference_svc.model_version
    except Exception as e:
        print(f"[Health] Inference service check error: {e}")

    # USB status
    usb_connected = False
    usb_port = None
    available_ports = []
    esp32_detected = False
    sensor_ready = False
    try:
        sensor_status = sensor_svc.get_status()
        available_ports = sensor_status.get("available_ports", [])
        detected_port = sensor_svc.find_esp32_port()
        usb_connected = bool(sensor_status.get("is_connected", False))
        usb_port = sensor_status.get("port") or detected_port
        esp32_detected = bool(sensor_status.get("esp32_detected", False) or len(available_ports) > 0)
        sensor_ready = usb_connected
    except Exception as e:
        print(f"[Health] Sensor status check error: {e}")

    # Overall health status
    overall = "healthy" if (db_ok and model_ok) else "degraded"

    return {
        "status": overall,
        "database_connected": db_ok,
        "model_loaded": model_ok,
        "model_version": model_ver,
        "active_model": active_model_name,
        "commodity": commodity,
        "usb_connected": usb_connected,
        "usb_port": usb_port,
        "available_ports": available_ports,
        "esp32_detected": esp32_detected,
        "sensor_ready": sensor_ready,
    }

