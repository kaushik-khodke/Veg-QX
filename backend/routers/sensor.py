"""
routers/sensor.py
FastAPI router for USB sensor connection controls and real-time WebSocket data streaming.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
import asyncio
import json

from services.sensor_service import get_sensor_service, SensorService
from services.inference_service import get_inference_service
from services.database_service import save_prediction

router = APIRouter(tags=["Sensor"])


@router.get("/sensor_ports")
def get_sensor_ports(sensor_svc: SensorService = Depends(get_sensor_service)):
    """Returns real-time scan of all COM ports, detected ESP32, and connection state."""
    return {
        "success": True,
        "data": sensor_svc.get_status(),
    }


@router.post("/connect_usb")
def connect_sensor(
    port: str = Query(None, description="COM Port device name, e.g. 'COM8'"),
    sensor_svc: SensorService = Depends(get_sensor_service),
):
    """
    Connects to the ESP32 sensor on the specified COM port (default COM8).
    Starts reading incoming data in a background thread.
    """
    res = sensor_svc.connect(port)
    if not res["success"]:
        return {"success": False, "error": res["error"]}
    return {"success": True, "data": res}


@router.post("/disconnect_usb")
def disconnect_sensor(sensor_svc: SensorService = Depends(get_sensor_service)):
    """Disconnects the active USB COM port connection."""
    res = sensor_svc.disconnect()
    return {"success": True, "data": res}


@router.websocket("/live_sensor_data")
async def live_sensor_websocket(
    websocket: WebSocket,
    sensor_svc: SensorService = Depends(get_sensor_service),
):
    """
    WebSocket endpoint that streams real-time sensor readings from ESP32.
    Clients receive predictions dynamically as new hardware readings arrive.
    """
    await websocket.accept()
    commodity = websocket.query_params.get("commodity") or "tomato"
    print(f"[WebSocket] Client connected for live sensor data (commodity: {commodity}).")

    # Capture the running event loop in the async context so thread-safe callbacks can schedule items
    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()
    inference_svc = get_inference_service(commodity)

    def thread_safe_callback(data: dict):
        # Schedule queue insert in the running async event loop from background thread
        loop.call_soon_threadsafe(queue.put_nowait, data)

    # Register callback on the sensor service
    sensor_svc.register_callback(thread_safe_callback)

    try:
        # If there is already a recent valid reading, send it to the client immediately upon connection
        latest = sensor_svc.get_latest_reading()
        if latest:
            try:
                raw_bands = {
                    "Blue": float(latest.get("Blue", 0)),
                    "Green": float(latest.get("Green", 0)),
                    "Yellow": float(latest.get("Yellow", 0)),
                    "Orange": float(latest.get("Orange", 0)),
                    "Red": float(latest.get("Red", 0)),
                    "NIR": float(latest.get("NIR", 0)),
                }
                pred = inference_svc.predict_single(raw_bands)
                initial_payload = {**latest, **raw_bands, **pred}
                print(f"[FRONTEND TELEMETRY EMIT (INITIAL)]\n{initial_payload}")
                await websocket.send_json({
                    "status": "reading",
                    "data": initial_payload,
                })
            except Exception as initial_err:
                print(f"[WebSocket] Initial payload error: {initial_err}")

        while True:
            # Wait for new reading in queue
            reading = await queue.get()

            raw_bands = {
                "Blue": float(reading.get("Blue", 0)),
                "Green": float(reading.get("Green", 0)),
                "Yellow": float(reading.get("Yellow", 0)),
                "Orange": float(reading.get("Orange", 0)),
                "Red": float(reading.get("Red", 0)),
                "NIR": float(reading.get("NIR", 0)),
            }

            print(f"\n[TELEMETRY NORMALIZED]\n{raw_bands}")

            # Server-side inference & DB logging to minimize client-side HTTP overhead
            full_payload = {**reading, **raw_bands}
            try:
                pred = inference_svc.predict_single(raw_bands)
                
                print(f"[VEGETATION INDICES]\nNDVI: {pred['NDVI']:.6f} | GNDVI: {pred['GNDVI']:.6f} | RVI: {pred['RVI']:.6f}")
                print(f"[ML INPUT]\n{raw_bands} + Indices")
                print(f"[REGRESSION OUTPUT]\nFreshness Score: {pred['freshness_score']}")
                print(f"[CLASSIFICATION OUTPUT]\nCategory: {pred['category']} (Fresh: {pred['confidence_fresh']*100:.1f}%, Aging: {pred['confidence_aging']*100:.1f}%, Spoiling: {pred['confidence_spoiling']*100:.1f}%)")

                # Combine reading and prediction
                full_payload = {**reading, **raw_bands, **pred}

                spec_prefix = commodity[:3].upper()
                tomato_id = reading.get("tomato_id")
                specimen_id = reading.get("specimen_id") or f"{spec_prefix}-{tomato_id or 'LIVE'}"

                # Save record to SQLite + CSV dual-storage
                save_prediction({
                    **raw_bands,
                    **pred,
                    "commodity": commodity,
                    "food_type": commodity,
                    "specimen_id": specimen_id,
                    "tomato_id": tomato_id,
                    "position": reading.get("position", 1),
                    "input_source": "usb",
                })
            except Exception as pe:
                print(f"[WebSocket] Server-side prediction/DB log error: {pe}")

            # Broadcast combined data to the client
            print(f"[FRONTEND TELEMETRY EMIT]\n{full_payload}")
            await websocket.send_json({
                "status": "reading",
                "data": full_payload,
            })
    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected from live sensor data.")
    except Exception as e:
        print(f"[WebSocket] Error in websocket loop: {e}")
    finally:
        sensor_svc.unregister_callback(thread_safe_callback)
