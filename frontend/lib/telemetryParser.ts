// lib/telemetryParser.ts
// Standardized parser for AS7341 / ESP32 multi-spectral sensor serial telemetry.
// Mirrors backend/services/sensor_service.py logic in TypeScript for direct browser execution.

export interface ParsedReading {
  Blue: number;
  Green: number;
  Yellow: number;
  Orange: number;
  Red: number;
  NIR: number;
  NDVI?: number;
  GNDVI?: number;
  RVI?: number;
  position?: number;
  tomato_id?: number;
  raw_line?: string;
  timestamp?: number;
}

export function parseTelemetryLine(rawLine: string): ParsedReading | null {
  const line = rawLine.trim();
  if (!line) return null;

  // ─── Strategy 1: JSON Parse ───────────────────────────────────────────────
  if (line.startsWith("{") && line.endsWith("}")) {
    try {
      const data = JSON.parse(line);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const normalized: Record<string, number> = {};
        for (const [k, v] of Object.entries(data)) {
          const kLower = k.toLowerCase();
          if (["blue", "green", "yellow", "orange", "red", "nir"].includes(kLower)) {
            const capKey = kLower === "nir" ? "NIR" : kLower.charAt(0).toUpperCase() + kLower.slice(1);
            const num = parseFloat(String(v));
            if (!isNaN(num)) normalized[capKey] = num;
          } else if (["tomato_id", "sample_id"].includes(kLower)) {
            const num = parseInt(String(v), 10);
            if (!isNaN(num)) normalized["tomato_id"] = num;
          } else if (["position", "pos", "sample", "sample_num"].includes(kLower)) {
            const num = parseInt(String(v), 10);
            if (!isNaN(num)) normalized["position"] = num;
          }
        }

        if (normalized["NIR"] !== undefined && normalized["Red"] !== undefined) {
          for (const b of ["Blue", "Green", "Yellow", "Orange", "Red", "NIR"]) {
            if (normalized[b] === undefined) normalized[b] = 0.0;
          }

          const nir = normalized["NIR"];
          const red = normalized["Red"];
          const green = normalized["Green"] || 0;

          const ndvi = (nir - red) / (nir + red + 1e-8);
          const gndvi = (nir - green) / (nir + green + 1e-8);
          const rvi = nir / (red + 1e-8);

          return {
            Blue: normalized["Blue"],
            Green: normalized["Green"],
            Yellow: normalized["Yellow"],
            Orange: normalized["Orange"],
            Red: normalized["Red"],
            NIR: normalized["NIR"],
            NDVI: parseFloat(ndvi.toFixed(4)),
            GNDVI: parseFloat(gndvi.toFixed(4)),
            RVI: parseFloat(rvi.toFixed(4)),
            position: normalized["position"],
            tomato_id: normalized["tomato_id"],
            raw_line: line,
            timestamp: Date.now(),
          };
        }
      }
    } catch {
      // Fall through to regex
    }
  }

  // ─── Strategy 2: Key-Value Regex Matching ─────────────────────────────────
  // Matches patterns like "BLUE=123 | GREEN=456" or "BLUE:123, GREEN:456"
  const pattern = /([a-zA-Z_]+)\s*[:=]\s*([+-]?(?:\d+\.?\d*|\.\d+))/g;
  const kv: Record<string, number> = {};
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    kv[match[1].toLowerCase()] = parseFloat(match[2]);
  }

  // Extract sample/position if present (e.g. "Sample 1 -> ...")
  const sampleMatch = /sample\s*(\d+)/i.exec(line);
  let pos: number | undefined;
  if (sampleMatch) {
    pos = parseInt(sampleMatch[1], 10);
  } else if (kv["position"] !== undefined) {
    pos = Math.floor(kv["position"]);
  } else if (kv["sample"] !== undefined) {
    pos = Math.floor(kv["sample"]);
  }

  if (kv["nir"] !== undefined && kv["red"] !== undefined) {
    const nir = kv["nir"] || 0.0;
    const red = kv["red"] || 0.0;
    const green = kv["green"] || 0.0;

    const ndvi = kv["ndvi"] !== undefined ? kv["ndvi"] : (nir - red) / (nir + red + 1e-8);
    const gndvi = kv["gndvi"] !== undefined ? kv["gndvi"] : (nir - green) / (nir + green + 1e-8);
    const rvi = kv["rvi"] !== undefined ? kv["rvi"] : nir / (red + 1e-8);

    return {
      Blue: kv["blue"] || 0.0,
      Green: green,
      Yellow: kv["yellow"] || 0.0,
      Orange: kv["orange"] || 0.0,
      Red: red,
      NIR: nir,
      NDVI: parseFloat(ndvi.toFixed(4)),
      GNDVI: parseFloat(gndvi.toFixed(4)),
      RVI: parseFloat(rvi.toFixed(4)),
      position: pos,
      tomato_id: kv["tomato_id"] !== undefined ? Math.floor(kv["tomato_id"]) : undefined,
      raw_line: line,
      timestamp: Date.now(),
    };
  }

  return null;
}
