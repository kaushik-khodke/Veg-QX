"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { COMStatus } from "@/lib/types";
import { webSerial, WebSerialState } from "@/lib/webSerial";
import { ParsedReading } from "@/lib/telemetryParser";
import {
  Link2,
  Link2Off,
  RefreshCw,
  Cpu,
  AlertCircle,
  Usb,
  Sparkles,
  Server,
  Laptop,
} from "lucide-react";

interface USBStatusPanelProps {
  onStatusChange?: (isConnected: boolean) => void;
  onReading?: (reading: any) => void;
  commodity?: string;
}

export default function USBStatusPanel({
  onStatusChange,
  onReading,
  commodity = "tomato",
}: USBStatusPanelProps) {
  // Mode: "webserial" (browser-direct USB, works on Vercel/cloud) vs "backend" (local Python pyserial)
  const [connectionMode, setConnectionMode] = useState<"webserial" | "backend">("webserial");
  const [isClient, setIsClient] = useState(false);

  // Backend COM Status
  const [comStatus, setComStatus] = useState<COMStatus>({
    is_connected: false,
    port: null,
    baud_rate: null,
    serial_available: false,
    available_ports: [],
    esp32_detected: false,
  });
  const [selectedPort, setSelectedPort] = useState<string>("");

  // Web Serial Status
  const [webSerialState, setWebSerialState] = useState<WebSerialState>(webSerial.state);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Throttle predictions to avoid flooding backend (max 4 per second)
  const lastInferenceTimeRef = useRef<number>(0);
  const pendingReadingRef = useRef<ParsedReading | null>(null);

  // Determine if running on deployed link (e.g. veg-qx.vercel.app)
  const isCloudDeployment =
    isClient &&
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  useEffect(() => {
    setIsClient(true);
    // On deployed cloud environments, default directly to Web Serial
    if (typeof window !== "undefined") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if (!isLocal) {
        setConnectionMode("webserial");
      }
    }
  }, []);

  // ─── Handle Web Serial Reading & Prediction ────────────────────────────────
  const handleWebSerialReading = useCallback(
    async (reading: ParsedReading) => {
      pendingReadingRef.current = reading;

      const now = Date.now();
      // Throttle inference call to once per 250ms
      if (now - lastInferenceTimeRef.current < 250) {
        // Still notify UI of latest raw reading
        if (onReading) {
          onReading({
            ...reading,
            predicted_category: "Processing...",
            confidence: 0.99,
          });
        }
        return;
      }
      lastInferenceTimeRef.current = now;

      try {
        const predRes = await api.predictSingle({
          Blue: reading.Blue,
          Green: reading.Green,
          Yellow: reading.Yellow,
          Orange: reading.Orange,
          Red: reading.Red,
          NIR: reading.NIR,
          commodity: commodity || "tomato",
          food_type: commodity || "tomato",
        });

        const merged = {
          ...reading,
          ...predRes,
          source: "webserial",
        };

        if (onReading) {
          onReading(merged);
        }
      } catch (err) {
        // Even if prediction API fails or is slow, emit the raw spectral wave
        if (onReading) {
          onReading({
            ...reading,
            source: "webserial",
          });
        }
      }
    },
    [commodity, onReading]
  );

  // ─── Subscribe to Web Serial Controller ────────────────────────────────────
  useEffect(() => {
    const unsubscribe = webSerial.subscribe((state) => {
      setWebSerialState(state);
      if (connectionMode === "webserial") {
        if (onStatusChange) {
          onStatusChange(state.isConnected);
        }
      }
    }, handleWebSerialReading);

    return () => unsubscribe();
  }, [connectionMode, handleWebSerialReading, onStatusChange]);

  // ─── Backend COM Port Polling ──────────────────────────────────────────────
  const fetchPorts = useCallback(async () => {
    try {
      const res = await api.getSensorPorts();
      if (res.success && res.data) {
        const data = res.data;
        setComStatus(data);

        // Auto-select detected ESP32 port or first available port
        if (!data.is_connected && data.available_ports.length > 0) {
          const espPort =
            data.available_ports.find((p) => p.is_esp32)?.port ||
            data.available_ports[0].port;
          setSelectedPort((prev) => prev || espPort);
        } else if (data.is_connected && data.port) {
          setSelectedPort(data.port);
        }

        if (connectionMode === "backend" && onStatusChange) {
          onStatusChange(data.is_connected);
        }
      }
    } catch (e) {
      // Fallback to health endpoint if needed
      try {
        const health = await api.getHealth();
        setComStatus((prev) => ({
          ...prev,
          is_connected: health.usb_connected,
          port: health.usb_port,
          serial_available: true,
          esp32_detected: !!health.esp32_detected,
          available_ports: health.available_ports || [],
        }));
        if (health.usb_port) {
          setSelectedPort(health.usb_port);
        }
        if (connectionMode === "backend" && onStatusChange) {
          onStatusChange(health.usb_connected);
        }
      } catch (err) {
        // Silently ignore transient errors
      }
    }
  }, [connectionMode, onStatusChange]);

  useEffect(() => {
    fetchPorts();
    const interval = setInterval(fetchPorts, 8000);
    return () => clearInterval(interval);
  }, [fetchPorts]);

  // ─── Web Serial Connect / Disconnect Handlers ──────────────────────────────
  const handleWebSerialConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await webSerial.requestAndConnect(115200);
      if (res.success) {
        if (onStatusChange) onStatusChange(true);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err.message || "Failed to open Web Serial port.");
    } finally {
      setLoading(false);
    }
  };

  const handleWebSerialDisconnect = async () => {
    setLoading(true);
    try {
      await webSerial.disconnect();
      if (onStatusChange) onStatusChange(false);
    } finally {
      setLoading(false);
    }
  };

  // ─── Backend PySerial Connect / Disconnect Handlers ────────────────────────
  const handleBackendConnect = async (targetPort?: string) => {
    const portToConnect =
      targetPort || selectedPort || comStatus.available_ports[0]?.port;
    if (!portToConnect) {
      setError(
        "No COM port selected. If you are on the deployed link (Vercel), please switch to 'Direct Browser USB' above."
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.connectUSB(portToConnect);
      if (res.success) {
        setComStatus((prev) => ({
          ...prev,
          is_connected: true,
          port: portToConnect,
        }));
        setSelectedPort(portToConnect);
        if (onStatusChange) onStatusChange(true);
      } else {
        setError(res.error || "Failed to establish serial connection via backend.");
      }
    } catch (e: any) {
      setError(
        e.response?.data?.detail ||
          e.message ||
          "USB connection error on backend."
      );
    } finally {
      setLoading(false);
      fetchPorts();
    }
  };

  const handleBackendDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.disconnectUSB();
      if (res.success) {
        setComStatus((prev) => ({
          ...prev,
          is_connected: false,
          port: null,
        }));
        if (onStatusChange) onStatusChange(false);
      }
    } catch (e: any) {
      setError("Failed to disconnect serial connection.");
    } finally {
      setLoading(false);
      fetchPorts();
    }
  };

  // Determine current active connection parameters based on active mode
  const isWebSerialActive = connectionMode === "webserial";
  const isConnected = isWebSerialActive
    ? webSerialState.isConnected
    : comStatus.is_connected;
  const activePort = isWebSerialActive
    ? webSerialState.portName || "Web Serial (COM8)"
    : comStatus.port || selectedPort || "None";
  const isStreaming = isWebSerialActive
    ? webSerialState.isStreaming
    : !!comStatus.is_streaming;
  const packetsCount = isWebSerialActive
    ? webSerialState.packetsReceived
    : comStatus.packets_received || 0;

  const detectedEsp =
    comStatus.available_ports.find((p) => p.is_esp32) ||
    comStatus.available_ports[0];

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-2">
        <div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-0.5 font-semibold">
            Module 01
          </span>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Cpu size={16} className="text-emerald-600 dark:text-emerald-400" />
            ESP32 Serial Link Controller
          </h3>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => setConnectionMode("webserial")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              connectionMode === "webserial"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Laptop size={13} />
            <span>Direct Browser USB</span>
            <span className="text-[8px] bg-emerald-400/20 text-emerald-300 dark:text-emerald-200 px-1 py-0.2 rounded uppercase">
              Web Serial
            </span>
          </button>

          <button
            onClick={() => setConnectionMode("backend")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              connectionMode === "backend"
                ? "bg-slate-800 dark:bg-slate-700 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Server size={13} />
            <span>Backend PySerial</span>
            {comStatus.available_ports.length > 0 && (
              <span className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1 py-0.2 rounded font-bold">
                {comStatus.available_ports.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setLoading(true);
              fetchPorts().finally(() => setLoading(false));
            }}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors p-1.5 ml-1"
            title="Rescan Hardware Ports"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg font-mono font-medium flex items-center gap-2">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>⚠ {error}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODE 1: Direct Browser USB (Web Serial API) — Recommended for Vercel
          ───────────────────────────────────────────────────────────────────────── */}
      {connectionMode === "webserial" && (
        <div className="space-y-4">
          {/* Cloud Info Notice */}
          <div className="p-3 rounded-xl border font-mono text-xs transition-all flex flex-wrap items-center justify-between gap-3 bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-bold block">
                  {isCloudDeployment
                    ? "🌐 Deployed Cloud Environment (Vercel)"
                    : "⚡ Chrome Web Serial Hardware Link"}
                </span>
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300/80">
                  {isCloudDeployment
                    ? "Connects your computer's USB port (COM8) directly through Google Chrome without needing a local backend."
                    : "Direct USB bridge via browser Web Serial API. Works seamlessly across any secure host."}
                </span>
              </div>
            </div>

            {/* Direct Connect Button */}
            {!webSerialState.isConnected ? (
              <button
                onClick={handleWebSerialConnect}
                disabled={loading || !webSerialState.isSupported}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Usb size={14} />
                <span>{loading ? "OPENING PORT..." : "CONNECT ESP32 (COM8)"}</span>
              </button>
            ) : (
              <button
                onClick={handleWebSerialDisconnect}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Link2Off size={14} />
                <span>DISCONNECT USB</span>
              </button>
            )}
          </div>

          {!webSerialState.isSupported && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-mono">
              ⚠ Web Serial API is supported in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, and <strong>Opera</strong>. If you are using another browser, please open this link in Chrome.
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          MODE 2: Backend PySerial Link — For Local Development (python main.py)
          ───────────────────────────────────────────────────────────────────────── */}
      {connectionMode === "backend" && (
        <div className="space-y-4">
          {/* Cloud Warning if on Vercel with 0 COM ports */}
          {comStatus.available_ports.length === 0 && (
            <div className="p-3 rounded-xl border font-mono text-xs bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
              <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">No Physical USB Ports on Remote Server</span>
                <span className="text-[10px] text-amber-800 dark:text-amber-400">
                  The backend server on Render is hosted in the cloud and cannot physically access your laptop&apos;s USB cable. Switch to{" "}
                  <button
                    onClick={() => setConnectionMode("webserial")}
                    className="underline font-bold hover:text-amber-950 dark:hover:text-white"
                  >
                    Direct Browser USB (Web Serial)
                  </button>{" "}
                  above to connect to COM8 directly through Chrome!
                </span>
              </div>
            </div>
          )}

          {/* Dynamic Hardware Discovery Banner for Backend */}
          {!comStatus.is_connected && (
            <div className="p-3 rounded-xl border font-mono text-xs transition-all flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                {comStatus.available_ports.length > 0 ? (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]" />
                    <div>
                      <span className="text-slate-900 dark:text-white font-bold block">
                        Hardware Detected: {detectedEsp?.port}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {detectedEsp?.description || "ESP32 / USB-UART Serial Device"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                    <div>
                      <span className="text-slate-800 dark:text-slate-300 font-bold block">
                        Scanning USB Ports...
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Plug in your ESP32 + AS7341 board via USB cable to auto-detect.
                      </span>
                    </div>
                  </>
                )}
              </div>

              {comStatus.available_ports.length > 0 && (
                <button
                  onClick={() => handleBackendConnect(detectedEsp?.port)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Link2 size={12} />
                  <span>CONNECT {detectedEsp?.port}</span>
                </button>
              )}
            </div>
          )}

          {/* Main Connection Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono block mb-1.5 font-semibold">
                Target COM Interface (Auto-Scanned)
              </label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={comStatus.is_connected}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50 font-mono shadow-xs"
              >
                {comStatus.available_ports.length > 0 ? (
                  comStatus.available_ports.map((p) => (
                    <option key={p.port} value={p.port}>
                      {p.port} - {p.description || "Serial Device"} {p.is_esp32 ? "(ESP32)" : ""}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="">No COM Ports Detected</option>
                    <option value="COM8">COM8 (Default fallback)</option>
                    <option value="COM3">COM3</option>
                    <option value="COM4">COM4</option>
                    <option value="COM7">COM7</option>
                  </>
                )}
              </select>
            </div>

            <div>
              {comStatus.is_connected ? (
                <button
                  onClick={handleBackendDisconnect}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 transition-all font-semibold py-2.5 rounded-lg text-xs font-mono shadow-xs"
                >
                  <Link2Off size={14} />
                  <span>DISCONNECT SERIAL LINK ({comStatus.port})</span>
                </button>
              ) : (
                <button
                  onClick={() => handleBackendConnect()}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all font-semibold py-2.5 rounded-lg text-xs shadow-[0_4px_14px_rgba(16,185,129,0.3)] font-mono disabled:opacity-50"
                >
                  <Link2 size={14} />
                  <span>
                    {loading
                      ? "CONNECTING..."
                      : `ESTABLISH SERIAL LINK ${selectedPort ? `(${selectedPort})` : ""}`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          Unified Real-Time Live Status Strip (Shows for Both Modes)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 font-mono text-[12px] text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-850">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                : "bg-slate-400 dark:bg-slate-700"
            }`}
          />
          <span>
            USB:{" "}
            <strong
              className={
                isConnected
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-800 dark:text-slate-200"
              }
            >
              {isConnected
                ? `Connected (${isWebSerialActive ? "Web Serial" : "Backend"})`
                : "Disconnected"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              !isConnected
                ? "bg-slate-400 dark:bg-slate-700"
                : isStreaming
                ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_#10B981]"
                : packetsCount > 0
                ? "bg-amber-500"
                : "bg-blue-500 animate-ping"
            }`}
          />
          <span>
            Telemetry:{" "}
            <strong
              className={
                !isConnected
                  ? "text-slate-600 dark:text-slate-400"
                  : isStreaming
                  ? "text-emerald-600 dark:text-emerald-400 font-bold"
                  : packetsCount > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-blue-600 dark:text-blue-400 font-semibold"
              }
            >
              {!isConnected
                ? "Inactive"
                : isStreaming
                ? `Receiving (${packetsCount})`
                : packetsCount > 0
                ? `Idle (${packetsCount} pkts)`
                : "Waiting for Sensor"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                : "bg-slate-400 dark:bg-slate-700"
            }`}
          />
          <span>
            Port:{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {isConnected ? activePort : isWebSerialActive ? "COM8 (Browser)" : selectedPort || "None"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-emerald-500 shadow-[0_0_6px_#10B981]"
                : "bg-slate-400 dark:bg-slate-700"
            }`}
          />
          <span>
            Baud: <strong className="text-slate-800 dark:text-slate-200">115200</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
