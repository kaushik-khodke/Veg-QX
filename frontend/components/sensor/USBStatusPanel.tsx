"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { COMStatus } from "@/lib/types";
import { Link2, Link2Off, RefreshCw, Cpu, CheckCircle2, AlertCircle } from "lucide-react";

interface USBStatusPanelProps {
  onStatusChange?: (isConnected: boolean) => void;
}

export default function USBStatusPanel({ onStatusChange }: USBStatusPanelProps) {
  const [comStatus, setComStatus] = useState<COMStatus>({
    is_connected: false,
    port: null,
    baud_rate: null,
    serial_available: false,
    available_ports: [],
    esp32_detected: false,
  });
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoConnect, setAutoConnect] = useState<boolean>(true);

  const fetchPorts = useCallback(async () => {
    try {
      const res = await api.getSensorPorts();
      if (res.success && res.data) {
        const data = res.data;
        setComStatus(data);

        // Auto-select detected ESP32 port or first available port
        if (!data.is_connected && data.available_ports.length > 0) {
          const espPort = data.available_ports.find(p => p.is_esp32)?.port || data.available_ports[0].port;
          setSelectedPort(prev => prev || espPort);
        } else if (data.is_connected && data.port) {
          setSelectedPort(data.port);
        }

        if (onStatusChange) {
          onStatusChange(data.is_connected);
        }
      }
    } catch (e) {
      // Fallback to health endpoint if needed
      try {
        const health = await api.getHealth();
        setComStatus(prev => ({
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
        if (onStatusChange) {
          onStatusChange(health.usb_connected);
        }
      } catch (err) {
        // Silently ignore during transient polling
      }
    }
  }, [onStatusChange]);

  const handleConnect = async (targetPort?: string) => {
    const portToConnect = targetPort || selectedPort || comStatus.available_ports[0]?.port;
    if (!portToConnect) {
      setError("No COM port selected or detected. Please plug in the ESP32 sensor via USB.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.connectUSB(portToConnect);
      if (res.success) {
        setComStatus(prev => ({
          ...prev,
          is_connected: true,
          port: portToConnect,
        }));
        setSelectedPort(portToConnect);
        if (onStatusChange) onStatusChange(true);
      } else {
        setError(res.error || "Failed to establish serial connection.");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "USB connection error.");
    } finally {
      setLoading(false);
      fetchPorts();
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.disconnectUSB();
      if (res.success) {
        setComStatus(prev => ({
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

  // Poll available ports dynamically every 7.5 seconds
  useEffect(() => {
    fetchPorts();
    const interval = setInterval(fetchPorts, 7500);
    return () => clearInterval(interval);
  }, [fetchPorts]);

  const detectedEsp = comStatus.available_ports.find(p => p.is_esp32) || comStatus.available_ports[0];

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-200 dark:border-slate-800/50 space-y-4 shadow-sm dark:shadow-md transition-colors duration-200">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-0.5 font-semibold">
            Module 01
          </span>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Cpu size={16} className="text-emerald-600 dark:text-emerald-400" />
            ESP32 Serial Link Controller
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {comStatus.available_ports.length > 0 && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">
              {comStatus.available_ports.length} Port{comStatus.available_ports.length > 1 ? "s" : ""} Scanned
            </span>
          )}
          <button
            onClick={() => {
              setLoading(true);
              fetchPorts().finally(() => setLoading(false));
            }}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors p-1"
            title="Rescan USB Hardware Ports"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg font-mono font-medium flex items-center gap-2">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>⚠ {error}</span>
        </div>
      )}

      {/* Dynamic Hardware Discovery Banner */}
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
              onClick={() => handleConnect(detectedEsp?.port)}
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
        {/* COM Port selection */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono block mb-1.5 font-semibold">
            Target COM Interface (Auto-Scanned)
          </label>
          <div className="flex gap-2">
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={comStatus.is_connected}
              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50 font-mono shadow-xs"
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
        </div>

        {/* Action Button */}
        <div>
          {comStatus.is_connected ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 dark:hover:bg-red-500/30 transition-all font-semibold py-2.5 rounded-lg text-xs font-mono shadow-xs"
            >
              <Link2Off size={14} />
              <span>DISCONNECT SERIAL LINK ({comStatus.port})</span>
            </button>
          ) : (
            <button
              onClick={() => handleConnect()}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all font-semibold py-2.5 rounded-lg text-xs shadow-[0_4px_14px_rgba(16,185,129,0.3)] font-mono disabled:opacity-50"
            >
              <Link2 size={14} />
              <span>{loading ? "CONNECTING..." : `ESTABLISH SERIAL LINK ${selectedPort ? `(${selectedPort})` : ""}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-Time Live Status Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 font-mono text-[12px] text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-850">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${comStatus.is_connected ? "bg-emerald-500 shadow-[0_0_6px_#10B981]" : "bg-slate-400 dark:bg-slate-700"}`} />
          <span>USB: <strong className={comStatus.is_connected ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200"}>{comStatus.is_connected ? "Connected" : "Disconnected"}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            !comStatus.is_connected
              ? "bg-slate-400 dark:bg-slate-700"
              : comStatus.is_streaming
              ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_#10B981]"
              : (comStatus.packets_received && comStatus.packets_received > 0)
              ? "bg-amber-500"
              : "bg-blue-500 animate-ping"
          }`} />
          <span>Telemetry: <strong className={
            !comStatus.is_connected
              ? "text-slate-600 dark:text-slate-400"
              : comStatus.is_streaming
              ? "text-emerald-600 dark:text-emerald-400 font-bold"
              : (comStatus.packets_received && comStatus.packets_received > 0)
              ? "text-amber-600 dark:text-amber-400"
              : "text-blue-600 dark:text-blue-400 font-semibold"
          }>
            {!comStatus.is_connected
              ? "Inactive"
              : comStatus.is_streaming
              ? `Receiving (${comStatus.packets_received || 1})`
              : (comStatus.packets_received && comStatus.packets_received > 0)
              ? "Idle / Stale"
              : "Waiting for Trigger"}
          </strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${comStatus.is_connected ? "bg-emerald-500 shadow-[0_0_6px_#10B981]" : "bg-slate-400 dark:bg-slate-700"}`} />
          <span>Port: <strong className="text-slate-800 dark:text-slate-200">{comStatus.port || selectedPort || "None"}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${comStatus.is_connected ? "bg-emerald-500 shadow-[0_0_6px_#10B981]" : "bg-slate-400 dark:bg-slate-700"}`} />
          <span>Baud: <strong className="text-slate-800 dark:text-slate-200">115200</strong></span>
        </div>
      </div>
    </div>
  );
}
