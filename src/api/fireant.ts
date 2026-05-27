import { getFireantToken, cleanTokenString } from "../utils/token";
import { readJsonResponse } from "../utils/http";

export const FIREANT_PROXY_BASE = "/api/fireant";

type QueryValue = string | number | boolean | null | undefined;

export interface FireantRequestOptions extends RequestInit {
  query?: Record<string, QueryValue>;
}

export interface IndustryBondsFilterQuery {
  icbCode?: string | number | null;
  statusID?: number | null;
}

const inflightRequests = new Map<string, Promise<unknown>>();

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

  const queryString = params.toString();
  return `${FIREANT_PROXY_BASE}/${normalizedPath}${queryString ? `?${queryString}` : ""}`;
}

export async function fireantRequest<T = unknown>(path: string, options: FireantRequestOptions = {}): Promise<T> {
  const { query, headers, ...requestOptions } = options;
  const url = buildFireantUrl(path, query);
  const method = String(requestOptions.method || "GET").toUpperCase();
  const canDedupe = method === "GET" && !requestOptions.body;
  const dedupeKey = `${method}:${url}`;

  if (canDedupe) {
    const existing = inflightRequests.get(dedupeKey);
    if (existing) return existing as Promise<T>;
  }

  const requestPromise = (async () => {
    const response = await fetch(url, {
      ...requestOptions,
      cache: "no-store",
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
  })();

  if (canDedupe) {
    inflightRequests.set(dedupeKey, requestPromise);
    requestPromise.then(
      () => inflightRequests.delete(dedupeKey),
      () => inflightRequests.delete(dedupeKey),
    );
  }

  return requestPromise;
}

export const fireantApi = {
  getBond: (code: string) => fireantRequest<any>(`bonds/${encodeURIComponent(code)}`),
  getIssuerBonds: (issuerSymbol: string) => fireantRequest<any[]>(`bonds/issuer/${encodeURIComponent(issuerSymbol)}`),
  getBondsByIssuer: (issuerSymbol: string) =>
    fireantRequest<any[]>("bonds/get-bonds-by-issuer", { query: { issuerSymbol } }),
  getBondCategoryList: (option = 0, icbLevel?: number, isListing = 1, statusId = 1) =>
    fireantRequest<any[]>("bond_GetCategoryList", {
      query: {
        Option: option,
        ICBLevel: icbLevel,
        IsListing: isListing,
        StatusID: statusId,
      },
    }),
  getBondsByIndustryFilter: (query: IndustryBondsFilterQuery = {}) =>
    fireantRequest<any[]>("bonds/filter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        icbCode: query.icbCode,
        statusID: query.statusID,
      }),
    }),
  getBondsFilter: (query: IndustryBondsFilterQuery = {}) =>
    fireantApi.getBondsByIndustryFilter(query),
  filterBonds: (query: Record<string, string | number | boolean | null | undefined> = {}) =>
    fireantRequest<any[]>("bond_Filter", { query }),
  getBondStatisticsByIssuer: (top = 200, sortBy = 2, statusId = 1, isListing = 1) =>
    fireantRequest<any[]>("bond_StatisticsByIssuer", {
      query: {
        Top: top,
        SortBy: sortBy,
        StatusID: statusId,
        IsListing: isListing,
      },
    }),
  getBondStatisticsByIssuerICB: (icbLevel?: number, top?: number, sortBy?: number, statusId = 1, isListing?: number) =>
    fireantRequest<any[]>("bond_StatisticsByIssuerICB", {
      query: {
        ICBLevel: icbLevel,
        Top: top,
        SortBy: sortBy,
        StatusID: statusId,
        IsListing: isListing,
      },
    }),
  getIssuerProfile: (symbol: string) => fireantRequest<any>(`symbols/${encodeURIComponent(symbol)}/profile`),
  getFinancialData: (symbol: string, type = "Q", count = 4) =>
    fireantRequest<any>(`symbols/${encodeURIComponent(symbol)}/financial-data`, { query: { type, count } }),
  searchSymbols: (q: string) => fireantRequest<any>("symbols/search", { query: { q } }),
  getTopDebtIssuers: (top = 1000) => fireantRequest<any[]>("bonds/stats/issuers/top-debt", { query: { top } }),
  getMaturingSoon: (days: number) => fireantRequest<any[]>("bonds/stats/bonds/maturing-soon", { query: { days } }),
  getHighYieldBonds: (top = 10) => fireantRequest<any[]>("bonds/stats/bonds/high-yield", { query: { top } }),
  getIndustries: (top = 1000, level = 1) => fireantRequest<any[]>("bonds/stats/industries", { query: { top, level } }),
  getIcbSymbols: (code: string) => fireantRequest<any[]>(`icb/${encodeURIComponent(code)}/symbols`),
};
