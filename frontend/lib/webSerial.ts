// lib/webSerial.ts
// Direct in-browser Web Serial API controller for ESP32 AS7341 sensor.
// Enables hardware connectivity directly from Google Chrome / Microsoft Edge
// on deployed websites (like veg-qx.vercel.app) without needing a local backend!

import { parseTelemetryLine, ParsedReading } from "./telemetryParser";

export interface WebSerialState {
  isSupported: boolean;
  isConnected: boolean;
  portName: string | null;
  baudRate: number;
  packetsReceived: number;
  lastPacketTime: number | null;
  isStreaming: boolean;
  error: string | null;
}

type ReadingCallback = (reading: ParsedReading) => void;
type StatusCallback = (state: WebSerialState) => void;

class WebSerialController {
  private port: any = null;
  private reader: any = null;
  private readableStreamClosed: any = null;
  private isReading = false;
  private readingCallbacks: Set<ReadingCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();

  public state: WebSerialState = {
    isSupported: typeof navigator !== "undefined" && "serial" in navigator,
    isConnected: false,
    portName: null,
    baudRate: 115200,
    packetsReceived: 0,
    lastPacketTime: null,
    isStreaming: false,
    error: null,
  };

  constructor() {
    if (typeof window !== "undefined" && "serial" in navigator) {
      (navigator as any).serial?.addEventListener("disconnect", () => {
        this.disconnect();
      });
    }
  }

  public isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  public subscribe(onStatus: StatusCallback, onReading?: ReadingCallback): () => void {
    this.statusCallbacks.add(onStatus);
    if (onReading) this.readingCallbacks.add(onReading);
    onStatus(this.state);

    return () => {
      this.statusCallbacks.delete(onStatus);
      if (onReading) this.readingCallbacks.delete(onReading);
    };
  }

  private notifyStatus() {
    this.statusCallbacks.forEach((cb) => cb(this.state));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("vegqx_usb_status_changed", {
          detail: {
            connected: this.state.isConnected,
            port: this.state.portName,
            isWebSerial: true,
          },
        })
      );
    }
  }

  public async getPairedPorts(): Promise<any[]> {
    if (!this.isSupported()) return [];
    try {
      return await (navigator as any).serial.getPorts();
    } catch {
      return [];
    }
  }

  /**
   * Prompts the browser's native USB port picker dialog (Chrome / Edge)
   * and opens the serial connection at 115200 baud.
   */
  public async requestAndConnect(baudRate: number = 115200): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) {
      const err = "Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.";
      this.state.error = err;
      this.notifyStatus();
      return { success: false, error: err };
    }

    try {
      this.state.error = null;
      // Triggers native browser COM port picker modal
      const port = await (navigator as any).serial.requestPort();
      return await this.openPort(port, baudRate);
    } catch (err: any) {
      const errorMsg = err.name === "NotFoundError" ? "No COM port was selected." : err.message || "Failed to access USB port.";
      this.state.error = errorMsg;
      this.notifyStatus();
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Connects to an already paired port (without opening the modal if already authorized)
   */
  public async connectExisting(baudRate: number = 115200): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) return { success: false, error: "Web Serial not supported." };
    const ports = await this.getPairedPorts();
    if (ports.length === 0) {
      return this.requestAndConnect(baudRate);
    }
    return this.openPort(ports[0], baudRate);
  }

  private async openPort(port: any, baudRate: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.port) {
        await this.disconnect();
      }

      await port.open({ baudRate });
      this.port = port;

      // Extract device info if available
      const info = port.getInfo ? port.getInfo() : {};
      const usbVendor = info.usbVendorId ? `VID:${info.usbVendorId.toString(16).toUpperCase()}` : "";
      const usbProduct = info.usbProductId ? `PID:${info.usbProductId.toString(16).toUpperCase()}` : "";
      const portDesc = [usbVendor, usbProduct].filter(Boolean).join(" ") || "USB Serial (ESP32)";

      this.state = {
        ...this.state,
        isConnected: true,
        portName: `COM8 (${portDesc})`,
        baudRate,
        error: null,
      };
      this.notifyStatus();

      // Start the reading stream loop
      this.startReadingLoop();

      return { success: true };
    } catch (err: any) {
      const msg = err.message || "Could not open USB serial port.";
      this.state = {
        ...this.state,
        isConnected: false,
        error: msg,
      };
      this.notifyStatus();
      return { success: false, error: msg };
    }
  }

  private async startReadingLoop() {
    if (!this.port || !this.port.readable) return;
    this.isReading = true;

    try {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      let lineBuffer = "";

      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          lineBuffer += value;
          const lines = lineBuffer.split(/\r?\n/);
          // Keep incomplete tail
          lineBuffer = lines.pop() || "";

          for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            const reading = parseTelemetryLine(trimmed);
            if (reading) {
              this.state.packetsReceived += 1;
              this.state.lastPacketTime = Date.now();
              this.state.isStreaming = true;

              // Emit to registered listeners
              this.readingCallbacks.forEach((cb) => cb(reading));
              this.notifyStatus();
            }
          }
        }
      }
    } catch (err: any) {
      if (this.isReading) {
        console.warn("[WebSerial] Read loop error:", err);
      }
    } finally {
      this.state.isStreaming = false;
      this.notifyStatus();
    }
  }

  public async disconnect(): Promise<void> {
    this.isReading = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => {});
        this.readableStreamClosed = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("[WebSerial] Error closing port:", err);
    }

    this.state = {
      ...this.state,
      isConnected: false,
      isStreaming: false,
      portName: null,
      error: null,
    };
    this.notifyStatus();
  }
}

export const webSerial = new WebSerialController();
