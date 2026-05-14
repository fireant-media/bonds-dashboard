import { getFireantToken, cleanTokenString } from "../utils/token";
import { readJsonResponse } from "../utils/http";

export const FIREANT_PROXY_BASE = "/api/fa";

type QueryValue = string | number | boolean | null | undefined;

export interface FireantRequestOptions extends RequestInit {
  query?: Record<string, QueryValue>;
}

export class FireantApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FireantApiError";
    this.status = status;
  }
}

export function buildFireantHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const token = getFireantToken();
  const cleanToken = token ? cleanTokenString(token) : undefined;
  if (cleanToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${cleanToken}`);
  }

  return headers;
}

export function buildFireantUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedPath = path.replace(/^\/+/, "");
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    params.set(key, String(value));
  });

  const qs = params.toString();
  return `${FIREANT_PROXY_BASE}/${normalizedPath}${qs ? `?${qs}` : ""}`;
}

export async function fireantRequest<T = unknown>(path: string, options: FireantRequestOptions = {}): Promise<T> {
  const { query, headers, ...requestOptions } = options;
  const response = await fetch(buildFireantUrl(path, query), {
    ...requestOptions,
    headers: buildFireantHeaders(headers),
  });

  if (!response.ok) {
    throw new FireantApiError(response.status, response.status === 401 ? "401" : `HTTP ${response.status}`);
  }

  try {
    return await readJsonResponse<T>(response, `FireAnt API ${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Invalid response from ${path}`;
    throw new FireantApiError(response.status, message);
  }
}

export const fireantApi = {
  getBond: (code: string) => fireantRequest<any>(`bonds/${encodeURIComponent(code)}`),
  getIssuerBonds: (issuerSymbol: string) => fireantRequest<any[]>(`bonds/issuer/${encodeURIComponent(issuerSymbol)}`),
  getBondsByIssuer: (issuerSymbol: string) =>
    fireantRequest<any[]>("bonds/get-bonds-by-issuer", { query: { issuerSymbol } }),
  getIssuerProfile: (symbol: string) => fireantRequest<any>(`symbols/${encodeURIComponent(symbol)}/profile`),
  getFinancialData: (symbol: string, type = "Q", count = 4) =>
    fireantRequest<any>(`symbols/${encodeURIComponent(symbol)}/financial-data`, { query: { type, count } }),
  searchSymbols: (q: string) => fireantRequest<any>("symbols/search", { query: { q } }),
  getTopDebtIssuers: (top = 200) => fireantRequest<any[]>("bonds/stats/issuers/top-debt", { query: { top } }),
  getMaturingSoon: (days: number) => fireantRequest<any[]>("bonds/stats/bonds/maturing-soon", { query: { days } }),
  getHighYieldBonds: (top = 10) => fireantRequest<any[]>("bonds/stats/bonds/high-yield", { query: { top } }),
  getIndustries: (top = 1000, level = 1) => fireantRequest<any[]>("bonds/stats/industries", { query: { top, level } }),
  getIcbSymbols: (code: string) => fireantRequest<any[]>(`icb/${encodeURIComponent(code)}/symbols`),
};
