const readViteEnv = (key: keyof ImportMetaEnv, fallback = "") => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const getDefaultAppUrl = () => {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  return "http://localhost:3000";
};

export const FIREANT_BASE_URL = readViteEnv("VITE_FIREANT_BASE_URL", "https://restv2.fireant.vn");
export const TRADESTATION_BASE_URL = readViteEnv("VITE_TRADESTATION_BASE_URL", "https://tradestation.fireant.vn");
export const FIREANT_AI_BASE_URL = readViteEnv("VITE_FIREANT_AI_BASE_URL", "https://openai.fireant.vn/v1");
export const STATIC_FIREANT_URL = readViteEnv("VITE_STATIC_FIREANT_URL", "https://static.fireant.vn");
export const APP_URL = readViteEnv("VITE_APP_BASE_URL", getDefaultAppUrl());
