import dotenv from "dotenv";

dotenv.config();

export const FIREANT_BASE_URL = (process.env.FIREANT_BASE_URL || "https://restv2.fireant.vn").replace(/\/$/, "");

export const TRADESTATION_BASE_URL = (process.env.TRADESTATION_BASE_URL || "https://tradestation.fireant.vn").replace(/\/$/, "");

export const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL ||
  process.env.FIREANT_AI_BASE_URL ||
  "https://openai.fireant.vn/v1"
).replace(/\/$/, "");

export const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  process.env.VITE_FIREANT_ACCESS_TOKEN ||
  process.env.FIREANT_ACCESS_TOKEN ||
  "";

export const FIREANT_ACCESS_TOKEN = process.env.VITE_FIREANT_ACCESS_TOKEN || process.env.FIREANT_ACCESS_TOKEN || "";

export const DEFAULT_AI_MODEL = (process.env.OPENAI_DEFAULT_MODEL || process.env.FIREANT_AI_DEFAULT_MODEL || "").trim();

export const FIREANT_WEB_URL = "https://fireant.vn";

export const STATIC_FIREANT_URL = "https://static.fireant.vn";
