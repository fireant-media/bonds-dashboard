import { fireantApi, fireantRequest } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { resolveEnterpriseIndustryFromCandidates } from '../constants/industries';

type ProcedureResult<T> =
  | T[]
  | {
      columns?: unknown;
      rows?: T[];
      data?: T[];
      items?: T[];
      result?: T[];
      [key: string]: unknown;
    };

export interface BondFilterQuery {
  BondTypeID?: number | null;
  BondRateTypeID?: number | null;
  CurrencyID?: number | null;
  MarketID?: number | null;
  ICBCode?: string | null;
  IssueFormID?: number | null;
  IssueMethodID?: number | null;
  StatusID?: number | null;
  IssuerName?: string | null;
  IssuerInstitutionID?: number | null;
  IssuerSymbol?: string | null;
  IsListing?: number | null;
  IssueDateFrom?: string | null;
  IssueDateTo?: string | null;
  MaturityDateFrom?: string | null;
  MaturityDateTo?: string | null;
  MinBondRate?: number | null;
  MaxBondRate?: number | null;
  MinTenorMonths?: number | null;
  MaxTenorMonths?: number | null;
  Top?: number | null;
  SortBy?: number | null;
}

export interface BondCategoryItem {
  institutionID?: number;
  issuerName?: string;
  issuerSymbol?: string;
  issuerListingStatus?: number;
  icbCode?: string;
  icbName?: string;
  icbLevel?: number;
  id?: string | number;
  name?: string;
}

export interface BondDataRow {
  bondCode: string;
  issuerSymbol: string;
  issuerName: string;
  industry: string;
  issueDate: string;
  maturityDate: string;
  tenorPeriod: number;
  bondRate: number;
  bondRateType: string;
  currentListedVolume: number;
  currentListedValue: number;
  totalIssuedValue: number;
  totalRemainingDebt: number;
  totalDebtFull: number;
  status: string;
  bondInfos: Record<string, unknown>;
  raw: any;
}

const BOND_CATEGORY_CACHE_PREFIX = 'bond_category_v1_';
const BOND_FILTER_CACHE_PREFIX = 'bond_filter_v1_';
const BOND_DETAIL_CACHE_PREFIX = 'bond_detail_';
const ISSUER_PROFILE_CACHE_PREFIX = 'issuer_profile_';

const categoryPromises = new Map<string, Promise<BondCategoryItem[]>>();
const filterPromises = new Map<string, Promise<BondDataRow[]>>();
const detailPromises = new Map<string, Promise<any>>();
const issuerProfilePromises = new Map<string, Promise<any>>();

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const asString = (value: unknown) => String(value ?? '').trim();

const firstDefined = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
};

const normalizeDate = (value: unknown) => {
  const text = asString(value);
  return text ? text.split('T')[0] : '';
};

const buildQueryCacheKey = (prefix: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}${JSON.stringify(entries)}`;
};

const extractRows = <T>(payload: ProcedureResult<T> | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const candidate = payload.rows || payload.data || payload.items || payload.result;
  return Array.isArray(candidate) ? candidate : [];
};

const tryProcedure = async <T>(
  path: string,
  query: Record<string, string | number | boolean | null | undefined>,
  fallback: () => Promise<T>,
) => {
  try {
    return await fireantRequest<T>(path, { query });
  } catch (error) {
    console.warn(`[bond-data] Falling back from ${path}`, error);
    return fallback();
  }
};

const normalizeBondRow = (row: any): BondDataRow => {
  const bondInfos = row?.bondInfos || row?.BondInfos || {};
  const issuerSymbol = asString(firstDefined(
    row?.issuerSymbol,
    row?.IssuerSymbol,
    bondInfos?.Symbol,
    bondInfos?.IssuerSymbol,
    row?.symbol,
  ));
  const issuerName = asString(firstDefined(
    row?.issuerName,
    row?.IssuerName,
    bondInfos?.IssuerName,
    bondInfos?.Name,
    issuerSymbol,
  ));

  return {
    bondCode: asString(firstDefined(row?.bondCode, row?.BondCode, row?.code, row?.Code)),
    issuerSymbol,
    issuerName,
    industry: resolveEnterpriseIndustryFromCandidates(
      row?.icbNameLv2,
      row?.ICBNameLv2,
      row?.icbNameLv1,
      row?.ICBNameLv1,
      row?.industryName,
      row?.IndustryName,
      bondInfos?.ICBNameLv2,
      bondInfos?.ICBNameLv1,
      bondInfos?.ICBName,
      bondInfos?.ICBCode,
    ),
    issueDate: normalizeDate(firstDefined(row?.issueDate, row?.IssueDate, row?.releaseDate, row?.ReleaseDate)),
    maturityDate: normalizeDate(firstDefined(row?.maturityDate, row?.MaturityDate, row?.dueDate, row?.DueDate)),
    tenorPeriod: toNumber(firstDefined(row?.tenorPeriod, row?.TenorPeriod, row?.term, row?.Term)),
    bondRate: toNumber(firstDefined(row?.bondRate, row?.BondRate, row?.interestRate, row?.InterestRate, row?.couponRate, row?.CouponRate)),
    bondRateType: asString(firstDefined(row?.bondRateType, row?.BondRateType, row?.interestRateType, row?.InterestRateType, row?.couponRateType, row?.CouponRateType)),
    currentListedVolume: toNumber(firstDefined(row?.currentListedVolume, row?.CurrentListedVolume, row?.listedVolume, row?.ListedVolume)),
    currentListedValue: toNumber(firstDefined(row?.currentListedValue, row?.CurrentListedValue, row?.listedValue, row?.ListedValue)),
    totalIssuedValue: toNumber(firstDefined(row?.totalIssuedValue, row?.TotalIssuedValue, row?.issuedValue, row?.IssuedValue)),
    totalRemainingDebt: toNumber(firstDefined(row?.totalRemainingDebt, row?.TotalRemainingDebt)),
    totalDebtFull: toNumber(firstDefined(row?.totalDebtFull, row?.TotalDebtFull)),
    status: asString(firstDefined(row?.status, row?.Status, row?.bondStatus, row?.BondStatus)),
    bondInfos,
    raw: row,
  };
};

const normalizeCategoryRow = (row: any): BondCategoryItem => ({
  institutionID: row?.institutionID !== undefined ? Number(row.institutionID) : row?.InstitutionID !== undefined ? Number(row.InstitutionID) : undefined,
  issuerName: asString(firstDefined(row?.issuerName, row?.IssuerName)),
  issuerSymbol: asString(firstDefined(row?.issuerSymbol, row?.IssuerSymbol)),
  issuerListingStatus: row?.issuerListingStatus !== undefined ? Number(row.issuerListingStatus) : row?.IssuerListingStatus !== undefined ? Number(row.IssuerListingStatus) : undefined,
  icbCode: asString(firstDefined(row?.icbCode, row?.ICBCode)),
  icbName: asString(firstDefined(row?.icbName, row?.ICBName)),
  icbLevel: row?.icbLevel !== undefined ? Number(row.icbLevel) : row?.ICBLevel !== undefined ? Number(row.ICBLevel) : undefined,
  id: firstDefined(row?.id, row?.ID),
  name: asString(firstDefined(row?.name, row?.Name)),
});

export const loadBondCategoryList = async (
  option = 0,
  icbLevel?: number,
  isListing = 1,
  statusId = 1,
): Promise<BondCategoryItem[]> => {
  const cacheKey = buildQueryCacheKey(BOND_CATEGORY_CACHE_PREFIX, {
    option,
    icbLevel,
    isListing,
    statusId,
  });

  const cached = getCache(cacheKey);
  if (cached) return cached as BondCategoryItem[];

  const inflightKey = cacheKey;
  const inflight = categoryPromises.get(inflightKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const payload = await tryProcedure<ProcedureResult<BondCategoryItem>>(
      'bond_GetCategoryList',
      {
        Option: option,
        ICBLevel: icbLevel,
        IsListing: isListing,
        StatusID: statusId,
      },
      async () => {
        if (option === 5) return fireantApi.getIndustries(1000, icbLevel || 1) as unknown as ProcedureResult<BondCategoryItem>;
        if (option === 0) return fireantApi.getTopDebtIssuers(200) as unknown as ProcedureResult<BondCategoryItem>;
        return [];
      },
    );

    const rows = extractRows(payload).map(normalizeCategoryRow);
    setCache(cacheKey, rows);
    return rows;
  })().finally(() => {
    categoryPromises.delete(inflightKey);
  });

  categoryPromises.set(inflightKey, promise);
  return promise;
};

const fallbackFilterBonds = async (query: BondFilterQuery) => {
  if (query.IssuerSymbol) {
    const bonds = await fireantApi.getIssuerBonds(query.IssuerSymbol);
    return Array.isArray(bonds) ? bonds : [];
  }

  const fromDate = asString(query.MaturityDateFrom);
  const toDate = asString(query.MaturityDateTo);
  if (fromDate && toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
      const bonds = await fireantApi.getMaturingSoon(days);
      return Array.isArray(bonds) ? bonds : [];
    }
  }

  return [];
};

export const loadBondFilterRows = async (query: BondFilterQuery): Promise<BondDataRow[]> => {
  const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, query as Record<string, unknown>);
  const cached = getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const inflight = filterPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const payload = await tryProcedure<ProcedureResult<BondDataRow>>(
      'bond_Filter',
      query as Record<string, string | number | boolean | null | undefined>,
      async () => fallbackFilterBonds(query) as unknown as ProcedureResult<BondDataRow>,
    );

    const rows = extractRows(payload).map(normalizeBondRow).filter((item) => Boolean(item.bondCode));
    setCache(cacheKey, rows);
    return rows;
  })().finally(() => {
    filterPromises.delete(cacheKey);
  });

  filterPromises.set(cacheKey, promise);
  return promise;
};

export const loadMaturingBonds = async (days: number): Promise<BondDataRow[]> => {
  const now = new Date();
  const fromDate = now.toISOString().split('T')[0];
  const to = new Date(now);
  to.setDate(to.getDate() + Math.max(0, days));
  const toDate = to.toISOString().split('T')[0];

  return loadBondFilterRows({
    StatusID: 1,
    IsListing: 1,
    MaturityDateFrom: fromDate,
    MaturityDateTo: toDate,
  });
};

export const loadIssuerBondsByFilter = async (issuerSymbol: string): Promise<BondDataRow[]> =>
  loadBondFilterRows({
    StatusID: 1,
    IsListing: 1,
    IssuerSymbol: issuerSymbol,
  });

export const loadBondDetail = async (code: string) => {
  const normalizedCode = asString(code);
  if (!normalizedCode) return null;

  const cacheKey = `${BOND_DETAIL_CACHE_PREFIX}${normalizedCode}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const inflight = detailPromises.get(normalizedCode);
  if (inflight) return inflight;

  const promise = fireantApi.getBond(normalizedCode)
    .then((detail) => {
      setCache(cacheKey, detail);
      return detail;
    })
    .finally(() => {
      detailPromises.delete(normalizedCode);
    });

  detailPromises.set(normalizedCode, promise);
  return promise;
};

export const loadIssuerProfile = async (symbol: string) => {
  const normalizedSymbol = asString(symbol);
  if (!normalizedSymbol) return null;

  const cacheKey = `${ISSUER_PROFILE_CACHE_PREFIX}${normalizedSymbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const inflight = issuerProfilePromises.get(normalizedSymbol);
  if (inflight) return inflight;

  const promise = fireantApi.getIssuerProfile(normalizedSymbol)
    .then((profile) => {
      setCache(cacheKey, profile);
      return profile;
    })
    .finally(() => {
      issuerProfilePromises.delete(normalizedSymbol);
    });

  issuerProfilePromises.set(normalizedSymbol, promise);
  return promise;
};
