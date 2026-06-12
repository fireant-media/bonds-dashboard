const readViteEnv = (key: keyof ImportMetaEnv, fallback = "") => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const getBrowserOrigin = () => {
  if (typeof window !== "undefined" && window.location.origin && window.location.origin !== "null") {
    return window.location.origin;
  }

  return "";
};

const isLocalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const getAppUrl = () => {
  const configuredUrl = readViteEnv("VITE_APP_BASE_URL").replace(/\/+$/, "");
  const browserOrigin = getBrowserOrigin().replace(/\/+$/, "");

  if (configuredUrl) {
    if (browserOrigin && isLocalUrl(configuredUrl) && !isLocalUrl(browserOrigin)) {
      return browserOrigin;
    }

    return configuredUrl;
  }

  return browserOrigin || "http://localhost:3000";
};

export const FIREANT_BASE_URL = readViteEnv("VITE_FIREANT_BASE_URL", "https://restv2.fireant.vn");
export const FIREANT_BETA_BASE_URL = readViteEnv("VITE_FIREANT_BETA_BASE_URL", "https://betarest.fireant.vn");
export const TRADESTATION_BASE_URL = readViteEnv("VITE_TRADESTATION_BASE_URL", "https://tradestation.fireant.vn");
export const FIREANT_AI_BASE_URL = readViteEnv("VITE_FIREANT_AI_BASE_URL", "https://openai.fireant.vn/v1");
export const STATIC_FIREANT_URL = readViteEnv("VITE_STATIC_FIREANT_URL", "https://static.fireant.vn");
export const APP_URL = getAppUrl();

export const buildAppApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const browserOrigin = getBrowserOrigin().replace(/\/+$/, "");

  if (!APP_URL || (browserOrigin && APP_URL === browserOrigin)) {
    return normalizedPath;
  }

  return `${APP_URL}${normalizedPath}`;
};
