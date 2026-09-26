// api.ts
// Axios API wrapper to make calls to the FastAPI backend

import axios from "axios";
import { API_BASE_URL } from "./constants";
import {
  PredictionRecord,
  ModelInfo,
  ModelVersion,
  USBStatus,
  RetrainingLog,
  AnalyticsSummary,
  COMStatus,
} from "./types";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Fast in-flight request deduplication and short-lived cache (prevents duplicate simultaneous network hits)
const inFlightRequests = new Map<string, Promise<any>>();
const getCache = new Map<string, { data: any; expiry: number }>();

export const clearApiCache = () => {
  getCache.clear();
};

const cachedGet = async <T = any>(endpoint: string, ttlMs = 2000): Promise<T> => {
  const now = Date.now();
  const cached = getCache.get(endpoint);
  if (cached && cached.expiry > now) {
    return cached.data as T;
  }

  if (inFlightRequests.has(endpoint)) {
    return inFlightRequests.get(endpoint) as Promise<T>;
  }

  const promise = client
    .get(endpoint)
    .then((res) => {
      getCache.set(endpoint, { data: res.data, expiry: Date.now() + ttlMs });
      return res.data;
    })
    .finally(() => {
      inFlightRequests.delete(endpoint);
    });

  inFlightRequests.set(endpoint, promise);
  return promise;
};

export const api = {
  // Health
  getHealth: async (commodity?: string): Promise<USBStatus> => {
    const endpoint = commodity ? `/health?commodity=${encodeURIComponent(commodity)}` : "/health";
    return cachedGet<USBStatus>(endpoint, 2500);
  },

  // Tomato ID Generator
  getNextTomatoId: async (): Promise<{ success: boolean; next_tomato_id: number }> => {
    const res = await client.get("/tomato_id/next");
    return res.data;
  },

  // USB / Sensor controls
  getSensorPorts: async (): Promise<{ success: boolean; data: COMStatus }> => {
    const res = await client.get("/sensor_ports");
    return res.data;
  },

  connectUSB: async (port?: string): Promise<{ success: boolean; data: any; error?: string }> => {
    const res = await client.post(`/connect_usb${port ? `?port=${port}` : ""}`);
    return res.data;
  },

  disconnectUSB: async (): Promise<{ success: boolean; data: any }> => {
    const res = await client.post("/disconnect_usb");
    return res.data;
  },

  // Commodities
  getCommodities: async (): Promise<{ success: boolean; data: any[] }> => {
    return cachedGet("/commodities", 5000);
  },

  // Predictions
  predictSingle: async (reading: {
    Blue: number;
    Green: number;
    Yellow: number;
    Orange: number;
    Red: number;
    NIR: number;
    commodity?: string;
    food_type?: string;
    specimen_id?: string;
    tomato_id?: number;
    position?: number;
    input_source?: string;
  }): Promise<PredictionRecord> => {
    clearApiCache();
    const res = await client.post("/predict", reading);
    return res.data;
  },

  predictBatch: async (readings: Array<{
    Blue: number;
    Green: number;
    Yellow: number;
    Orange: number;
    Red: number;
    NIR: number;
    commodity?: string;
    food_type?: string;
    specimen_id?: string;
    tomato_id?: number;
    position?: number;
    input_source?: string;
  }>): Promise<{
    predictions: PredictionRecord[];
    average_freshness_score: number;
    min_freshness_score: number;
    max_freshness_score: number;
    overall_category: "Fresh" | "Aging" | "Spoiling";
  }> => {
    clearApiCache();
    const res = await client.post("/predict_batch", { readings });
    return res.data;
  },

  // CSV Upload
  uploadCSV: async (file: File, commodity?: string): Promise<{
    success: boolean;
    summary: {
      auto_verified_records: number;
      saved_records: any;
      filename: string;
      total_samples: number;
      columns: string[];
      fresh_count: number;
      aging_count: number;
      spoiling_count: number;
      average_freshness: number;
    };
    preview: any[];
  }> => {
    clearApiCache();
    const formData = new FormData();
    formData.append("file", file);
    const endpoint = commodity ? `/upload_csv?commodity=${encodeURIComponent(commodity)}` : "/upload_csv";
    const res = await client.post(endpoint, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },

  // History & Verification
  getHistory: async (
    limit = 50,
    offset = 0,
    category?: string,
    commodity?: string
  ): Promise<{ success: boolean; total: number; data: PredictionRecord[] }> => {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());
    if (category) params.append("category", category);
    if (commodity) params.append("commodity", commodity);
    return cachedGet(`/prediction_history?${params.toString()}`, 2500);
  },

  verifyPrediction: async (
    id: number,
    actualCategory: string,
    actualScore?: number,
    notes?: string
  ): Promise<{ success: boolean; message: string }> => {
    clearApiCache();
    const res = await client.post(`/verify_prediction/${id}`, {
      actual_category: actualCategory,
      actual_freshness_score: actualScore,
      notes,
    });
    return res.data;
  },

  verifyPredictionsBulk: async (
    items: Array<{
      prediction_id: number;
      actual_category: string;
      actual_freshness_score: number;
      notes?: string;
    }>
  ): Promise<{ success: boolean; success_count: number; message: string; errors?: string[] }> => {
    clearApiCache();
    const res = await client.post("/verify_prediction/bulk", { items });
    return res.data;
  },

  getVerificationStats: async (commodity?: string): Promise<{
    success: boolean;
    data: {
      total_audited_samples: number;
      fresh_count: number;
      aging_count: number;
      spoiling_count: number;
      commodity_distribution?: Record<string, number>;
      retraining_readiness: boolean;
      remaining_samples_required: number;
    };
  }> => {
    const params = new URLSearchParams();
    if (commodity && commodity !== "all") params.append("commodity", commodity);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return cachedGet(`/verify_prediction/stats${qs}`, 2500);
  },

  getVerificationHistory: async (commodity?: string, category?: string): Promise<{
    success: boolean;
    total: number;
    data: any[];
  }> => {
    const params = new URLSearchParams();
    if (commodity && commodity !== "all") params.append("commodity", commodity);
    if (category && category !== "all") params.append("category", category);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return cachedGet(`/verify_prediction/history${qs}`, 2500);
  },

  getDownloadVerifiedCsvUrl: (commodity?: string): string => {
    if (commodity && commodity !== "all") {
      return `${API_BASE_URL}/verify_prediction/download_csv?commodity=${encodeURIComponent(commodity)}`;
    }
    return `${API_BASE_URL}/verify_prediction/download_csv`;
  },

  // Model Retraining & Info
  getmodelInfo: async (commodity?: string): Promise<{ success: boolean; data: ModelInfo }> => {
    const endpoint = commodity ? `/model_information?commodity=${commodity}` : "/model_information";
    return cachedGet(endpoint, 2500);
  },

  getModelVersions: async (commodity?: string): Promise<{ success: boolean; data: ModelVersion[] }> => {
    const endpoint = commodity ? `/model_versions?commodity=${commodity}` : "/model_versions";
    return cachedGet(endpoint, 2000);
  },

  activateModelVersion: async (version: string, commodity?: string): Promise<{ success: boolean; message: string }> => {
    clearApiCache();
    const endpoint = commodity ? `/model_versions/activate/${version}?commodity=${commodity}` : `/model_versions/activate/${version}`;
    const res = await client.post(endpoint);
    return res.data;
  },

  deleteModelVersion: async (version: string, commodity?: string): Promise<{ success: boolean; message: string }> => {
    clearApiCache();
    const endpoint = commodity ? `/model_versions/delete/${version}?commodity=${commodity}` : `/model_versions/${version}`;
    const res = await client.delete(endpoint);
    return res.data;
  },

  getRetrainingPreview: async (commodity?: string): Promise<{
    success: boolean;
    data: {
      reference_samples: number;
      verified_samples: number;
      merged_samples: number;
      fresh_count: number;
      aging_count: number;
      spoiling_count: number;
      retraining_readiness: boolean;
      remaining_required: number;
    };
  }> => {
    const endpoint = commodity ? `/retrain_model/preview?commodity=${commodity}` : "/retrain_model/preview";
    return cachedGet(endpoint, 2000);
  },

  getRetrainingProgress: async (): Promise<{
    success: boolean;
    data: {
      is_running: boolean;
      step_name: string;
      percentage: number;
      error: string | null;
    };
  }> => {
    const res = await client.get("/retrain_model/progress");
    return res.data;
  },

  retrainModel: async (notes = "", commodity?: string): Promise<RetrainingLog> => {
    clearApiCache();
    const res = await client.post("/retrain_model", { notes, commodity });
    return res.data;
  },

  // Analytics
  getAnalytics: async (commodity?: string): Promise<AnalyticsSummary> => {
    const endpoint = commodity ? `/analytics_dashboard?commodity=${commodity}` : "/analytics_dashboard";
    return cachedGet(endpoint, 2000);
  },
};


