"""
services/sensor_service.py
PySerial-based USB COM port reader for the ESP32 + AS7341 sensor.
Parses multi-format serial telemetry and broadcasts via WebSocket.

Supported ESP32 Telemetry Formats:
1. Pipe-separated key=value lines (from NDVI_System_code_New.ino):
   BLUE=123 | GREEN=456 | YELLOW=789 | ORANGE=321 | RED=654 | NIR=987 | NDVI=0.1234
2. Sample Summary lines:
   Sample 1 -> BLUE=123, GREEN=456, YELLOW=789, ORANGE=321, RED=654, NIR=987, NDVI=0.1234
3. JSON object lines:
   {"type": "telemetry", "Blue": 123, "Green": 456, "Yellow": 789, "Orange": 321, "Red": 654, "NIR": 987}
"""
import json
import time
import re
import threading
from typing import Optional, Callable

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

from config import SERIAL_BAUD_RATE, SERIAL_TIMEOUT, SERIAL_PREFERRED_PORT


def parse_telemetry_line(raw_line: str) -> Optional[dict]:
    """
    Parses a serial line from the ESP32 AS7341 sensor into a standardized dictionary.
    Returns None for non-telemetry/debug lines.
    """
    line = raw_line.strip()
    if not line:
        return None

    # ─── Strategy 1: JSON Parse ───────────────────────────────────────────────
    if line.startswith("{") and line.endswith("}"):
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                normalized = {}
                for k, v in data.items():
                    k_lower = k.lower()
                    if k_lower in ("blue", "green", "yellow", "orange", "red", "nir"):
                        cap_key = "NIR" if k_lower == "nir" else k_lower.capitalize()
                        try:
                            normalized[cap_key] = float(v)
                        except (ValueError, TypeError):
                            pass
                    elif k_lower in ("tomato_id", "sample_id"):
                        try:
                            normalized["tomato_id"] = int(v)
                        except (ValueError, TypeError):
                            pass
                    elif k_lower in ("position", "pos", "sample", "sample_num"):
                        try:
                            normalized["position"] = int(v)
                        except (ValueError, TypeError):
                            pass

                if "NIR" in normalized and "Red" in normalized:
                    for b in ("Blue", "Green", "Yellow", "Orange", "Red", "NIR"):
                        normalized.setdefault(b, 0.0)
                    return normalized
        except Exception:
            pass

    # ─── Strategy 2: Key-Value Regex Matching ─────────────────────────────────
    # Matches key=val or key:val patterns across pipe, comma, or space delimiters
    pattern = r'([a-zA-Z_]+)\s*[:=]\s*([+-]?(?:\d+\.?\d*|\.\d+))'
    matches = re.findall(pattern, line)
    if not matches:
        return None

    kv = {k.lower(): float(v) for k, v in matches}

    # Extract sample/position number if present (e.g., "Sample 1 -> ...")
    sample_match = re.search(r'sample\s*(\d+)', line, re.IGNORECASE)
    pos = int(sample_match.group(1)) if sample_match else None
    if pos is None and "position" in kv:
        pos = int(kv["position"])
    elif pos is None and "sample" in kv:
        pos = int(kv["sample"])

    # Requires NIR and Red spectral bands at minimum to constitute valid spectral telemetry
    if "nir" in kv and "red" in kv:
        normalized = {
            "Blue": float(kv.get("blue", 0.0)),
            "Green": float(kv.get("green", 0.0)),
            "Yellow": float(kv.get("yellow", 0.0)),
            "Orange": float(kv.get("orange", 0.0)),
            "Red": float(kv.get("red", 0.0)),
            "NIR": float(kv.get("nir", 0.0)),
        }
        if pos is not None:
            normalized["position"] = pos
        if "tomato_id" in kv:
            normalized["tomato_id"] = int(kv["tomato_id"])
        
        return normalized

    return None


class SensorService:
    def __init__(self):
        self.port: Optional[str] = None
        self.connection: Optional["serial.Serial"] = None
        self.is_connected: bool = False
        self._read_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._latest_reading: Optional[dict] = None
        self._callbacks: list[Callable] = []

        # Real-time Telemetry Diagnostics
        self.packet_count: int = 0
        self.last_packet_time: Optional[float] = None
        self.last_raw_line: Optional[str] = None
        self.parser_error_count: int = 0

        # Port Cache to eliminate Windows Hardware Registry polling latency
        self._cached_ports: list[dict] = []
        self._cached_ports_time: float = 0.0
        self._cached_raw_ports: list = []

    # ─── COM Port Discovery ────────────────────────────────────────────────────

    def list_available_ports(self, force_refresh: bool = False) -> list[dict]:
        """Returns all available COM ports with caching to avoid repetitive Windows registry queries."""
        if not SERIAL_AVAILABLE:
            return []
        now = time.time()
        if not force_refresh and (now - self._cached_ports_time < 3.0) and self._cached_ports:
            return self._cached_ports

        ports = []
        raw_ports = list(serial.tools.list_ports.comports())
        self._cached_raw_ports = raw_ports
        for p in raw_ports:
            ports.append({
                "port":        p.device,
                "description": p.description,
                "hwid":        p.hwid,
                "is_esp32":    self._is_likely_esp32(p),
            })
        self._cached_ports = ports
        self._cached_ports_time = now
        return ports

    def _is_likely_esp32(self, port_info) -> bool:
        """Heuristic: CP210x, CH340, FTDI, CDC ACM chips common on ESP32/ESP8266/Arduino boards."""
        keywords = ["cp210", "ch340", "ch341", "usb-serial", "esp32", "silicon labs", "wch", "ftdi", "uart", "serial", "usb to uart"]
        desc = f"{port_info.description or ''} {port_info.hwid or ''} {port_info.device or ''}".lower()
        return any(k in desc for k in keywords)

    def find_esp32_port(self) -> Optional[str]:
        """Auto-detect the most likely ESP32 COM port dynamically using cached ports."""
        if not SERIAL_AVAILABLE:
            return None
        now = time.time()
        if (now - self._cached_ports_time < 3.0) and self._cached_raw_ports:
            ports = self._cached_raw_ports
        else:
            self.list_available_ports()
            ports = self._cached_raw_ports

        if not ports:
            return None

        # 1. If preferred port is configured and actually connected, use it
        if SERIAL_PREFERRED_PORT:
            for p in ports:
                if p.device.upper() == SERIAL_PREFERRED_PORT.upper():
                    return p.device

        # 2. Check for ESP32 hardware keywords (CP210x, CH340, etc.)
        for p in ports:
            if self._is_likely_esp32(p):
                return p.device

        # 3. Fallback: return the first available COM port
        return ports[0].device

    # ─── Connect / Disconnect ─────────────────────────────────────────────────

    def connect(self, port: Optional[str] = None) -> dict:
        """Open serial connection and start background reader thread."""
        if not SERIAL_AVAILABLE:
            return {"success": False, "error": "PySerial not installed"}

        if self.is_connected:
            return {"success": True, "port": self.port, "message": "Already connected"}

        target_port = port or self.find_esp32_port()
        if not target_port:
            return {"success": False, "error": "No COM ports detected. Check USB connection."}

        try:
            self.connection = serial.Serial(
                port=target_port,
                baudrate=SERIAL_BAUD_RATE,
                timeout=SERIAL_TIMEOUT,
            )
            self.port = target_port
            self.is_connected = True
            self._stop_event.clear()
            self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._read_thread.start()
            print(f"[SensorService] Successfully connected to {self.port} at {SERIAL_BAUD_RATE} baud.")
            return {
                "success": True,
                "port": self.port,
                "baud_rate": SERIAL_BAUD_RATE,
                "message": f"Connected to ESP32 on {self.port}",
            }
        except Exception as e:
            err_str = str(e)
            if "PermissionError" in err_str or "Access is denied" in err_str or "ClearCommError" in err_str or "5" in err_str:
                friendly_msg = f"COM port {target_port} is currently locked by another program (e.g. Arduino Serial Monitor). Please close Arduino IDE Serial Monitor tab and click Connect again."
            else:
                friendly_msg = f"Failed to connect to {target_port}: {err_str}"
            print(f"[SensorService] {friendly_msg}")
            return {"success": False, "error": friendly_msg}

    def disconnect(self) -> dict:
        """Stop reader thread and close serial port."""
        self._stop_event.set()
        if self.connection and self.connection.is_open:
            self.connection.close()
        self.is_connected = False
        self.port = None
        self.connection = None
        self._latest_reading = None
        print("[SensorService] Sensor disconnected.")
        return {"success": True, "message": "Sensor disconnected"}

    # ─── Background Reader & Multi-Format Parser ──────────────────────────────

    def _read_loop(self):
        """Continuously reads and parses serial lines from the ESP32."""
        print(f"[SensorService] Started background serial reader loop on {self.port}...")
        while not self._stop_event.is_set():
            try:
                if not self.connection or not self.connection.is_open:
                    break
                raw_bytes = self.connection.readline()
                if not raw_bytes:
                    continue
                
                raw = raw_bytes.decode("utf-8", errors="ignore").strip()
                if not raw:
                    continue

                print(f"\n[ESP32 RAW]\n{raw}")

                # Parse multi-format telemetry line
                data = parse_telemetry_line(raw)
                if data is not None:
                    self.packet_count += 1
                    self.last_packet_time = time.time()
                    self.last_raw_line = raw
                    self._latest_reading = data

                    print(f"[ESP32 PARSED]\nblue: {data.get('Blue')}\ngreen: {data.get('Green')}\nyellow: {data.get('Yellow')}\norange: {data.get('Orange')}\nred: {data.get('Red')}\nnir: {data.get('NIR')}")

                    # Fire all registered callbacks (for WebSocket broadcasting and ML inference)
                    for cb in self._callbacks:
                        try:
                            cb(data)
                        except Exception as cb_err:
                            print(f"[SensorService] Callback error: {cb_err}")
                else:
                    # Check if line had telemetry keywords but failed parsing
                    if any(k in raw.lower() for k in ("blue", "green", "nir", "red")):
                        print(f"[ESP32 PARSE ERROR]\n{raw}")

            except Exception as read_err:
                time.sleep(0.05)

    # ─── Callbacks (for WebSocket broadcasting) ───────────────────────────────

    def register_callback(self, cb: Callable):
        if cb not in self._callbacks:
            self._callbacks.append(cb)

    def unregister_callback(self, cb: Callable):
        if cb in self._callbacks:
            self._callbacks.remove(cb)

    def get_latest_reading(self) -> Optional[dict]:
        return self._latest_reading

    def get_status(self) -> dict:
        ports = self.list_available_ports()
        now = time.time()
        is_streaming = self.is_connected and (self.last_packet_time is not None) and (now - self.last_packet_time < 15.0)

        return {
            "is_connected":        self.is_connected,
            "port":                self.port,
            "baud_rate":           SERIAL_BAUD_RATE if self.is_connected else None,
            "serial_available":    SERIAL_AVAILABLE,
            "available_ports":     ports,
            "esp32_detected":      any(p["is_esp32"] for p in ports) or len(ports) > 0,
            "packets_received":    self.packet_count,
            "last_packet_time":    self.last_packet_time,
            "is_streaming":        is_streaming,
            "latest_reading":      self._latest_reading,
        }


# Singleton
_sensor_service = SensorService()


def get_sensor_service() -> SensorService:
    return _sensor_service
