import { buildAppApiUrl } from "./config";
import { getFireantToken, cleanTokenString } from "../utils/token";
import { readJsonResponse } from "../utils/http";

const FIREANT_PROXY_PATH = "/api/fireant";
export const FIREANT_PROXY_BASE = buildAppApiUrl(FIREANT_PROXY_PATH);
export type FireantBaseTarget = "default" | "beta";

type QueryValue = string | number | boolean | null | undefined;

export interface FireantRequestOptions extends RequestInit {
  query?: Record<string, QueryValue>;
  baseTarget?: FireantBaseTarget;
}

export interface IndustryBondsFilterQuery {
  icbCode?: string | number | null;
  statusID?: number | null;
}

export interface BondRestFilterBody {
  bondTypeID?: number | null;
  bondRateTypeID?: number | null;
  currencyID?: number | null;
  marketID?: number | null;
  icbCode?: string | null;
  issueFormID?: number | null;
  issueMethodID?: number | null;
  statusID?: number | null;
  issuerName?: string | null;
  issuerInstitutionID?: number | null;
  issuerSymbol?: string | null;
  isListing?: number | null;
  issueDateFrom?: string | null;
  issueDateTo?: string | null;
  maturityDateFrom?: string | null;
  maturityDateTo?: string | null;
  minBondRate?: number | null;
  maxBondRate?: number | null;
  minTenorMonths?: number | null;
  maxTenorMonths?: number | null;
  top?: number | null;
  sortBy?: number | null;
}

const pruneEmptyBody = <T extends object>(body: T) =>
  Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Partial<T>;

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

export function buildFireantUrl(path: string, query?: Record<string, QueryValue>, baseTarget: FireantBaseTarget = "default") {
  const normalizedPath = path.replace(/^\/+/, "");
  const params = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    params.set(key, String(value));
  });

  if (baseTarget === "beta") {
    params.set("__base", "beta");
  }

  const queryString = params.toString();
  return `${FIREANT_PROXY_BASE}/${normalizedPath}${queryString ? `?${queryString}` : ""}`;
}

export async function fireantRequest<T = unknown>(path: string, options: FireantRequestOptions = {}): Promise<T> {
  const { query, headers, baseTarget = "default", ...requestOptions } = options;
  const url = buildFireantUrl(path, query, baseTarget);
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
  getBond: (code: string, baseTarget: FireantBaseTarget = "default") =>
    fireantRequest<any>(`bonds/${encodeURIComponent(code)}`, { baseTarget }),
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
    fireantApi.filterBonds({
      icbCode: query.icbCode ? String(query.icbCode) : null,
      statusID: query.statusID ?? 1,
    }),
  getBondsFilter: (query: IndustryBondsFilterQuery = {}) =>
    fireantApi.getBondsByIndustryFilter(query),
  filterBonds: (body: BondRestFilterBody = {}, baseTarget: FireantBaseTarget = "default") =>
    fireantRequest<any[]>("bonds/filter", {
      method: "POST",
      baseTarget,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pruneEmptyBody(body)),
    }),
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
  getBankingIndustries: (top = 1000) => fireantRequest<any[]>("bonds/stats/industries", { query: { top, level: 2 } }),
  getSecuritiesIndustries: (top = 1000) => fireantRequest<any[]>("bonds/stats/industries", { query: { top, level: 4 } }),
  getIcbSymbols: (code: string) => fireantRequest<any[]>(`icb/${encodeURIComponent(code)}/symbols`),
};
