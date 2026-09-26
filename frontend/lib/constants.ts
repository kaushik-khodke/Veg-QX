// constants.ts
// Central API and configuration constants for the Tomato Freshness Detection System

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const WS_BASE_URL  = process.env.NEXT_PUBLIC_WS_URL  || "ws://127.0.0.1:8000";

export const CATEGORY_COLORS = {
  Fresh: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.2)]",
  },
  Aging: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    glow: "shadow-[0_0_15px_rgba(245,158,11,0.2)]",
  },
  Spoiling: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-400",
    glow: "shadow-[0_0_15px_rgba(239,68,68,0.2)]",
  },
};

export const SENSOR_BAND_COLORS = {
  Blue: "#3b82f6",
  Green: "#10b981",
  Yellow: "#eab308",
  Orange: "#f97316",
  Red: "#ef4444",
  NIR: "#8b5cf6",
};

export const FOOD_TYPES = [
  { value: "tomato", label: "Tomato", icon: "🍅", status: "active", family: "Solanaceae" },
  { value: "carrot", label: "Carrot", icon: "🥕", status: "active", family: "Apiaceae" },
  { value: "brinjal", label: "Brinjal (Eggplant)", icon: "🍆", status: "active", family: "Solanaceae" },
  { value: "green_brinjal", label: "Green Brinjal", icon: "🟢", sticker: "/sticker_green_brinjal.png", status: "active", family: "Solanaceae" },
  { value: "beetroot", label: "Beetroot", icon: "🟣", sticker: "/sticker_beetroot.png", status: "active", family: "Amaranthaceae" },
  { value: "bitter_gourd", label: "Bitter Gourd", icon: "🥒", status: "active", family: "Cucurbitaceae" },
  { value: "green_chilli", label: "Green Chilli (Future)", icon: "🌶️", disabled: true, family: "Solanaceae" },
  { value: "peas", label: "Peas (Future)", icon: "🫛", disabled: true, family: "Fabaceae" },
];

export const COMMODITY_HOLOGRAM_IMAGES: Record<string, string> = {
  tomato: "/hologram_tomato.png",
  carrot: "/Hologram_carrot.png",
  brinjal: "/Hologram_Brinjal.png",
  green_brinjal: "/Hologram_Green_Brinjal.png",
  beetroot: "/Hologram_beetroot.png",
  bitter_gourd: "/Hologram_Bitter_ground.png",
};

