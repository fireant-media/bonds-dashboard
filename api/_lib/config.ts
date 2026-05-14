const readEnv = (...keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== "string") continue;

    const normalized = value.trim().replace(/^"(.*)"$/, "$1").trim();
    if (normalized) return normalized;
  }

  return "";
};

export const FIREANT_BASE_URL = readEnv("FIREANT_BASE_URL") || "https://restv2.fireant.vn";

export const TRADESTATION_BASE_URL = readEnv("TRADESTATION_BASE_URL") || "https://tradestation.fireant.vn";

export const OPENAI_BASE_URL = readEnv("OPENAI_BASE_URL", "FIREANT_AI_BASE_URL") || "https://openai.fireant.vn/v1";

export const OPENAI_API_KEY = readEnv(
  "OPENAI_API_KEY",
  "VITE_FIREANT_ACCESS_TOKEN",
  "FIREANT_ACCESS_TOKEN",
);

export const FIREANT_ACCESS_TOKEN = readEnv("VITE_FIREANT_ACCESS_TOKEN", "FIREANT_ACCESS_TOKEN");

export const DEFAULT_AI_MODEL = readEnv("OPENAI_DEFAULT_MODEL", "FIREANT_AI_DEFAULT_MODEL");

export const FIREANT_WEB_URL = "https://fireant.vn";

export const STATIC_FIREANT_URL = "https://static.fireant.vn";
