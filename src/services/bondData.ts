import { fireantApi, fireantRequest, type BondRestFilterBody, type FireantBaseTarget } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { resolveEnterpriseIndustryFromCandidates } from '../constants/industries';
import { dashboardQueryClient } from '../query/client';
import { bondQueryKeys } from '../query/keys';

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
  bondType: string;
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

export interface LoadBondFilterRowsOptions {
  enrichWithDetails?: boolean;
  forceRefresh?: boolean;
}

export interface LoadSimpleBondRowsOptions {
  forceRefresh?: boolean;
}

const BOND_CATEGORY_CACHE_PREFIX = 'bond_category_v1_';
const BOND_FILTER_CACHE_PREFIX = 'bond_filter_v1_';
const BOND_DETAIL_CACHE_PREFIX = 'bond_detail_';
const ISSUER_PROFILE_CACHE_PREFIX = 'issuer_profile_';
const GOVERNMENT_BOND_CACHE_PREFIX = 'bond_government_v1_';
const UNLISTED_ENTERPRISE_BOND_CACHE_PREFIX = 'bond_unlisted_enterprise_v1_';
const GOVERNMENT_BOND_BASE_TARGET: FireantBaseTarget = 'beta';
const GOVERNMENT_BOND_TYPE_IDS = [2, 3, 6] as const;
const UNLISTED_ENTERPRISE_BOND_TYPE_IDS = [3, 4] as const;

const categoryPromises = new Map<string, Promise<BondCategoryItem[]>>();
const filterPromises = new Map<string, Promise<BondDataRow[]>>();
const detailPromises = new Map<string, Promise<any>>();
const detailBatchPromises = new Map<string, Promise<any[]>>();
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

const toIsoDateString = (value: unknown) => {
  const text = asString(value);
  if (!text) return null;
  if (text.includes('T')) return text;
  const timestamp = Date.parse(`${text}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return text;
  return new Date(timestamp).toISOString();
};

const buildQueryCacheKey = (prefix: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}${JSON.stringify(entries)}`;
};

const normalizeBondCode = (value: unknown) => asString(value).toUpperCase();

const resolveBondCodeFromListItem = (value: unknown) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeBondCode(value);
  }

  return normalizeBondCode(firstDefined(
    (value as any)?.bondCode,
    (value as any)?.BondCode,
    (value as any)?.code,
    (value as any)?.Code,
    (value as any)?.id,
    (value as any)?.ID,
  ));
};

const pruneEmptyQueryFields = <T extends Record<string, unknown>>(query: T) =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Partial<T>;

const toRestBondFilterBody = (query: BondFilterQuery): BondRestFilterBody =>
  pruneEmptyQueryFields({
    bondTypeID: query.BondTypeID,
    bondRateTypeID: query.BondRateTypeID,
    currencyID: query.CurrencyID,
    marketID: query.MarketID,
    icbCode: query.ICBCode,
    issueFormID: query.IssueFormID,
    issueMethodID: query.IssueMethodID,
    statusID: query.StatusID,
    issuerName: query.IssuerName,
    issuerInstitutionID: query.IssuerInstitutionID,
    issuerSymbol: query.IssuerSymbol,
    isListing: query.IsListing,
    issueDateFrom: toIsoDateString(query.IssueDateFrom),
    issueDateTo: toIsoDateString(query.IssueDateTo),
    maturityDateFrom: toIsoDateString(query.MaturityDateFrom),
    maturityDateTo: toIsoDateString(query.MaturityDateTo),
    minBondRate: query.MinBondRate,
    maxBondRate: query.MaxBondRate,
    minTenorMonths: query.MinTenorMonths,
    maxTenorMonths: query.MaxTenorMonths,
    top: query.Top,
    sortBy: query.SortBy,
  });

const extractRows = <T>(payload: ProcedureResult<T> | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const candidate = payload.rows || payload.data || payload.items || payload.result;
  return Array.isArray(candidate) ? candidate : [];
};

const hasRestBondFilterCriteria = (query: BondFilterQuery) => Boolean(
  query.ICBCode
  || query.IssueDateFrom
  || query.IssueDateTo
  || query.MaturityDateFrom
  || query.MaturityDateTo
  || query.MinBondRate !== undefined
  || query.MaxBondRate !== undefined
  || query.MinTenorMonths !== undefined
  || query.MaxTenorMonths !== undefined
  || query.BondTypeID !== undefined
  || query.BondRateTypeID !== undefined
  || query.CurrencyID !== undefined
  || query.MarketID !== undefined
  || query.IssueFormID !== undefined
  || query.IssueMethodID !== undefined
  || query.IssuerName
  || query.IssuerInstitutionID !== undefined
  || query.IssuerSymbol
  || query.IsListing !== undefined
  || query.StatusID !== undefined
  || query.Top !== undefined
  || query.SortBy !== undefined
);

const isIssuerOnlyBondFilterQuery = (query: BondFilterQuery) => {
  const { IssuerSymbol, StatusID, IsListing, Top, SortBy, ...rest } = query;
  const hasOtherCriteria = Object.values(rest).some((value) => value !== undefined && value !== null && value !== '');
  return Boolean(IssuerSymbol) && !hasOtherCriteria;
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
  const bondInfos = row?.bondInfos || row?.BondInfos || row?.infoObj || row?.InfoObj || {};
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
    bondType: asString(firstDefined(
      row?.bondType,
      row?.BondType,
      bondInfos?.BondType,
      bondInfos?.bondType,
      row?.detail?.bondType,
      row?.Detail?.BondType,
    )),
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
      issuerName,
      issuerSymbol,
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

const shouldEnrichBondValueFields = (row: BondDataRow) =>
  row.totalIssuedValue <= 0 || row.currentListedValue <= 0;

const getBondDetailCacheKey = (code: string, baseTarget: FireantBaseTarget) =>
  `${BOND_DETAIL_CACHE_PREFIX}${baseTarget === 'beta' ? 'beta_' : ''}${code}`;

const getBondDetailInflightKey = (code: string, baseTarget: FireantBaseTarget) =>
  `${baseTarget}:${code}`;

const mergeBondRowWithDetail = (row: BondDataRow, detailPayload: any): BondDataRow => {
  const detail = detailPayload?.detail || detailPayload || {};
  const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;
  const nextIssuerName = asString(firstDefined(
    detail?.issuerName,
    detail?.IssuerName,
    row.issuerName,
    row.issuerSymbol,
  ));
  const nextBondType = asString(firstDefined(
    detail?.bondType,
    detail?.BondType,
    row.bondType,
    row.raw?.bondType,
  ));
  const nextIndustry = resolveEnterpriseIndustryFromCandidates(
    detail?.icbNameLv2,
    detail?.ICBNameLv2,
    detail?.icbNameLv1,
    detail?.ICBNameLv1,
    detail?.industryName,
    detail?.IndustryName,
    detail?.infoObj?.icbNameLv2,
    detail?.infoObj?.icbNameLv1,
    detail?.infoObj?.icbName,
    detail?.infoObj?.icbCode,
    detailPayload?.icbNameLv2,
    detailPayload?.ICBNameLv2,
    detailPayload?.industryName,
    detailPayload?.IndustryName,
    nextIssuerName,
    row.issuerSymbol,
    row.industry,
  );

  const nextCurrentListedValue = row.currentListedValue > 0
    ? row.currentListedValue
    : toNumber(firstDefined(detail?.currentListedValue, detail?.CurrentListedValue, historyItem?.value));
  const nextTotalIssuedValue = row.totalIssuedValue > 0
    ? row.totalIssuedValue
    : toNumber(firstDefined(detail?.totalIssuedValue, detail?.TotalIssuedValue, historyItem?.value));
  const nextCurrentListedVolume = row.currentListedVolume > 0
    ? row.currentListedVolume
    : toNumber(firstDefined(detail?.currentListedVolume, detail?.CurrentListedVolume, historyItem?.volume));

  return {
    ...row,
    issuerName: nextIssuerName,
    bondType: nextBondType,
    industry: nextIndustry,
    currentListedVolume: nextCurrentListedVolume,
    currentListedValue: nextCurrentListedValue,
    totalIssuedValue: nextTotalIssuedValue,
    raw: {
      ...row.raw,
      issuerName: nextIssuerName,
      bondType: nextBondType,
      detail,
    },
  };
};

const normalizeBondDetailPayloadToRow = (detailPayload: any): BondDataRow | null => {
  const detail = detailPayload?.detail || detailPayload || {};
  const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;

  const row = normalizeBondRow({
    ...detailPayload,
    ...detail,
    bondCode: firstDefined(detail?.bondCode, detail?.BondCode, detailPayload?.bondCode, detailPayload?.BondCode, detailPayload?.code),
    issuerSymbol: firstDefined(detail?.issuerSymbol, detail?.IssuerSymbol, detailPayload?.issuerSymbol, detailPayload?.IssuerSymbol),
    issuerName: firstDefined(detail?.issuerName, detail?.IssuerName, detailPayload?.issuerName, detailPayload?.IssuerName),
    bondType: firstDefined(detail?.bondType, detail?.BondType, detailPayload?.bondType, detailPayload?.BondType),
    issueDate: firstDefined(detail?.issueDate, detail?.IssueDate, detailPayload?.issueDate, detailPayload?.IssueDate),
    maturityDate: firstDefined(detail?.maturityDate, detail?.MaturityDate, detailPayload?.maturityDate, detailPayload?.MaturityDate),
    tenorPeriod: firstDefined(detail?.tenorPeriod, detail?.TenorPeriod, detailPayload?.tenorPeriod, detailPayload?.TenorPeriod),
    bondRate: firstDefined(detail?.bondRate, detail?.BondRate, detail?.interestRate, detail?.InterestRate, detail?.couponRate, detail?.CouponRate),
    bondRateType: firstDefined(
      detail?.bondRateType,
      detail?.BondRateType,
      detail?.interestRateType,
      detail?.InterestRateType,
      detail?.couponRateType,
      detail?.CouponRateType,
      detail?.interestType,
    ),
    currentListedVolume: firstDefined(detail?.currentListedVolume, detail?.CurrentListedVolume, historyItem?.volume),
    currentListedValue: firstDefined(detail?.currentListedValue, detail?.CurrentListedValue, historyItem?.value),
    totalIssuedValue: firstDefined(detail?.totalIssuedValue, detail?.TotalIssuedValue, historyItem?.value),
    totalRemainingDebt: firstDefined(detail?.totalRemainingDebt, detail?.TotalRemainingDebt),
    totalDebtFull: firstDefined(detail?.totalDebtFull, detail?.TotalDebtFull),
    status: firstDefined(detail?.status, detail?.Status, detailPayload?.status, detailPayload?.Status),
    bondInfos: firstDefined(detail?.bondInfos, detail?.BondInfos, detailPayload?.bondInfos, detailPayload?.BondInfos),
  });

  if (!row.bondCode) return null;
  return mergeBondRowWithDetail(row, detailPayload);
};

const enrichBondFilterRowsWithDetails = async (
  rows: BondDataRow[],
) => {
  const rowsNeedingDetails = rows.filter(shouldEnrichBondValueFields);
  if (rowsNeedingDetails.length === 0) return rows;

  const targetCodes = Array.from(
    new Set(
      rowsNeedingDetails
        .map((row) => normalizeBondCode(row.bondCode))
        .filter(Boolean),
    ),
  );

  if (targetCodes.length === 0) return rows;

  try {
    const detailMap = await loadBondDetailsMapByCodes(targetCodes, {
      concurrency: 6,
      forceRefresh: false,
    });

    return rows.map((row) => {
      const detailPayload = detailMap[normalizeBondCode(row.bondCode)];
      return detailPayload ? mergeBondRowWithDetail(row, detailPayload) : row;
    });
  } catch (error) {
    console.warn('[bond-data] Failed to enrich bond filter rows with detail values', error);
    return rows;
  }
};

const normalizeCategoryRow = (row: any): BondCategoryItem => ({
  institutionID: row?.institutionID !== undefined ? Number(row.institutionID) : row?.InstitutionID !== undefined ? Number(row.InstitutionID) : undefined,
  issuerName: asString(firstDefined(row?.issuerName, row?.IssuerName)),
  issuerSymbol: asString(firstDefined(row?.issuerSymbol, row?.IssuerSymbol)),
  issuerListingStatus: row?.issuerListingStatus !== undefined ? Number(row.issuerListingStatus) : row?.IssuerListingStatus !== undefined ? Number(row.IssuerListingStatus) : undefined,
  icbCode: asString(firstDefined(row?.icbCode, row?.ICBCode)),
  icbName: asString(firstDefined(row?.icbName, row?.ICBName)),
  icbLevel: row?.icbLevel !== undefined ? Number(row.icbLevel) : row?.ICBLevel !== undefined ? Number(row.ICBLevel) : undefined,
  id: asString(firstDefined(row?.id, row?.ID)),
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

export const loadBondFilterRows = async (
  query: BondFilterQuery,
  options: LoadBondFilterRowsOptions = {},
): Promise<BondDataRow[]> => {
  const enrichWithDetails = options.enrichWithDetails !== false;
  const forceRefresh = Boolean(options.forceRefresh);
  const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, {
    ...(query as Record<string, unknown>),
    enrichWithDetails: enrichWithDetails ? 1 : 0,
  });
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const inflight = filterPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    let payload: ProcedureResult<BondDataRow>;

    if (isIssuerOnlyBondFilterQuery(query)) {
      payload = await fallbackFilterBonds(query) as unknown as ProcedureResult<BondDataRow>;
    } else if (hasRestBondFilterCriteria(query)) {
      try {
        payload = await fireantApi.filterBonds(toRestBondFilterBody(query)) as unknown as ProcedureResult<BondDataRow>;
      } catch (error) {
        console.warn('[bond-data] REST bonds/filter failed, falling back to legacy procedure', error);
        payload = await tryProcedure<ProcedureResult<BondDataRow>>(
          'bond_Filter',
          query as Record<string, string | number | boolean | null | undefined>,
          async () => fallbackFilterBonds(query) as unknown as ProcedureResult<BondDataRow>,
        );
      }
    } else {
      payload = await tryProcedure<ProcedureResult<BondDataRow>>(
        'bond_Filter',
        query as Record<string, string | number | boolean | null | undefined>,
        async () => fallbackFilterBonds(query) as unknown as ProcedureResult<BondDataRow>,
      );
    }

    const normalizedRows = extractRows(payload).map(normalizeBondRow).filter((item) => Boolean(item.bondCode));
    const rows = enrichWithDetails
      ? await enrichBondFilterRowsWithDetails(normalizedRows)
      : normalizedRows;
    setCache(cacheKey, rows);
    return rows;
  })().finally(() => {
    filterPromises.delete(cacheKey);
  });

  filterPromises.set(cacheKey, promise);
  return promise;
};

export const loadMaturingBonds = async (
  days: number,
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> => {
  const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, {
    endpoint: 'bonds/stats/bonds/maturing-soon',
    days,
  });
  const cached = options.forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const inflight = filterPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const rows = (await fireantApi.getMaturingSoon(days))
      .map(normalizeBondRow)
      .filter((item) => Boolean(item.bondCode));
    setCache(cacheKey, rows);
    return rows;
  })().finally(() => {
    filterPromises.delete(cacheKey);
  });

  filterPromises.set(cacheKey, promise);
  return promise;
};

const toIsoDateOnly = (value: Date) => value.toISOString().split('T')[0];

const dedupeBondRows = (rows: BondDataRow[]) =>
  Array.from(
    new Map(
      rows
        .filter((row) => Boolean(row?.bondCode))
        .map((row) => [row.bondCode, row] as const),
    ).values(),
  );

export const loadMaturingBondUniverse = async (
  days: number,
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> => {
  const normalizedDays = Math.max(1, Math.floor(Number(days) || 0));
  const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, {
    endpoint: 'bonds/maturing-universe',
    days: normalizedDays,
  });
  const cached = options.forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const inflight = filterPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maturityEnd = new Date(today);
    maturityEnd.setDate(maturityEnd.getDate() + normalizedDays);

    const listedRangeQuery: BondFilterQuery = {
      StatusID: 1,
      IsListing: 1,
      MaturityDateFrom: toIsoDateOnly(today),
      MaturityDateTo: toIsoDateOnly(maturityEnd),
      Top: 10000,
    };

    const [listedRangeRows, maturingSoonRows, governmentRows, unlistedEnterpriseRows] = await Promise.allSettled([
      loadBondFilterRows(listedRangeQuery, {
        enrichWithDetails: false,
        forceRefresh: options.forceRefresh,
      }),
      loadMaturingBonds(normalizedDays, { forceRefresh: options.forceRefresh }),
      loadGovernmentBondRows(options),
      loadUnlistedEnterpriseBondRows(options),
    ]);

    const mergedRows = dedupeBondRows([
      ...(listedRangeRows.status === 'fulfilled' ? listedRangeRows.value : []),
      ...(maturingSoonRows.status === 'fulfilled' ? maturingSoonRows.value : []),
      ...(governmentRows.status === 'fulfilled' ? governmentRows.value : []),
      ...(unlistedEnterpriseRows.status === 'fulfilled' ? unlistedEnterpriseRows.value : []),
    ]);

    setCache(cacheKey, mergedRows);
    return mergedRows;
  })().finally(() => {
    filterPromises.delete(cacheKey);
  });

  filterPromises.set(cacheKey, promise);
  return promise;
};

export const loadIssuerBondsByFilter = async (
  issuerSymbol: string,
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> =>
  {
    const normalizedIssuerSymbol = asString(issuerSymbol);
    const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, {
      endpoint: 'bonds/issuer',
      issuerSymbol: normalizedIssuerSymbol,
      statusID: 1,
      isListing: 1,
    });
    const cached = options.forceRefresh ? null : getCache(cacheKey);
    if (cached) return cached as BondDataRow[];

    const inflight = filterPromises.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
      const rows = (await fireantApi.getIssuerBonds(normalizedIssuerSymbol))
        .map(normalizeBondRow)
        .filter((item) => Boolean(item.bondCode));
      setCache(cacheKey, rows);
      return rows;
    })().finally(() => {
      filterPromises.delete(cacheKey);
    });

    filterPromises.set(cacheKey, promise);
    return promise;
  };

export const loadBondsByIndustryFilter = async (
  icbCode: string | number,
  statusID = 1,
): Promise<BondDataRow[]> => {
  const normalizedIcbCode = asString(icbCode);
  const normalizedStatus = Number(statusID);
  if (!normalizedIcbCode) return [];
  if (normalizedStatus !== 0 && normalizedStatus !== 1) return [];

  const cacheKey = buildQueryCacheKey(BOND_FILTER_CACHE_PREFIX, {
    endpoint: "bonds/filter",
    icbCode: normalizedIcbCode,
    statusID: normalizedStatus,
  });
  const cached = getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const loadLegacyIndustryFilterRows = async () => {
    const payload = await fireantRequest<ProcedureResult<BondDataRow>>('bond_Filter', {
      query: {
        ICBCode: normalizedIcbCode,
        StatusID: normalizedStatus,
        IsListing: 1,
      },
    });

    return extractRows(payload)
      .map(normalizeBondRow)
      .filter((item) => Boolean(item.bondCode));
  };

  let rows: BondDataRow[] = [];

  try {
    const payload = await fireantApi.getBondsByIndustryFilter({
      icbCode: normalizedIcbCode,
      statusID: normalizedStatus,
    });

    rows = extractRows(payload as ProcedureResult<BondDataRow>)
      .map(normalizeBondRow)
      .filter((item) => Boolean(item.bondCode));
  } catch (error) {
    console.warn(`[bond-data] Modern industry filter failed for ICB ${normalizedIcbCode}`, error);
  }

  if (rows.length === 0) {
    try {
      rows = await loadLegacyIndustryFilterRows();
    } catch (error) {
      console.warn(`[bond-data] Legacy industry filter fallback failed for ICB ${normalizedIcbCode}`, error);
    }
  }

  setCache(cacheKey, rows);
  return rows;
};

export const loadBondsByIndustryStatus = loadBondsByIndustryFilter;

export const loadBondDetail = async (
  code: string,
  forceRefresh = false,
  baseTarget: FireantBaseTarget = 'default',
) => {
  const normalizedCode = normalizeBondCode(code);
  if (!normalizedCode) return null;

  const queryKey = bondQueryKeys.detail(normalizedCode);
  if (!forceRefresh) {
    const queryCached = dashboardQueryClient.getQueryData<any>(queryKey);
    if (queryCached) return queryCached;
  }

  const cacheKey = getBondDetailCacheKey(normalizedCode, baseTarget);
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached;

  const inflightKey = getBondDetailInflightKey(normalizedCode, baseTarget);
  const inflight = detailPromises.get(inflightKey);
  if (inflight) return inflight;

  const promise = fireantApi.getBond(normalizedCode, baseTarget)
    .then((detail) => {
      setCache(cacheKey, detail);
      dashboardQueryClient.setQueryData(queryKey, detail);
      return detail;
    })
    .finally(() => {
      detailPromises.delete(inflightKey);
    });

  detailPromises.set(inflightKey, promise);
  return promise;
};

export interface LoadBondDetailsOptions {
  concurrency?: number;
  forceRefresh?: boolean;
  baseTarget?: FireantBaseTarget;
}

export const loadBondDetailsByCodes = async (
  codes: Array<string | number | null | undefined>,
  options: LoadBondDetailsOptions = {},
) => {
  const normalizedCodes = Array.from(
    new Set(codes.map((code) => normalizeBondCode(code)).filter(Boolean)),
  );
  if (normalizedCodes.length === 0) return [];

  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 8), 10));
  const forceRefresh = Boolean(options.forceRefresh);
  const baseTarget = options.baseTarget ?? 'default';
  const batchKey = buildQueryCacheKey('bond_detail_batch_v1_', {
    codes: normalizedCodes.join(','),
    concurrency,
    forceRefresh,
    baseTarget,
  });

  const inflight = detailBatchPromises.get(batchKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const cachedDetails = new Map<string, any>();
    const missingCodes: string[] = [];

    normalizedCodes.forEach((code) => {
      if (!forceRefresh) {
        const cached = getCache(getBondDetailCacheKey(code, baseTarget));
        if (cached) {
          cachedDetails.set(code, cached);
          return;
        }
      }

      missingCodes.push(code);
    });

    const fetchedDetails = getFulfilledValues(
      await mapWithConcurrency(missingCodes, concurrency, async (code) => loadBondDetail(code, forceRefresh, baseTarget)),
    );

    fetchedDetails.forEach((detail: any) => {
      const detailCode = normalizeBondCode(detail?.detail?.bondCode || detail?.bondCode || detail?.code);
      if (detailCode) cachedDetails.set(detailCode, detail);
    });

    return normalizedCodes
      .map((code) => cachedDetails.get(code))
      .filter(Boolean);
  })().finally(() => {
    detailBatchPromises.delete(batchKey);
  });

  detailBatchPromises.set(batchKey, promise);
  return promise;
};

export const loadBondDetailsMapByCodes = async (
  codes: Array<string | number | null | undefined>,
  options: LoadBondDetailsOptions = {},
) => {
  const details = await loadBondDetailsByCodes(codes, options);
  return details.reduce<Record<string, any>>((acc, detail: any) => {
    const code = normalizeBondCode(detail?.detail?.bondCode || detail?.bondCode || detail?.code);
    if (code) acc[code] = detail;
    return acc;
  }, {});
};

export const loadIssuerProfile = async (symbol: string, forceRefresh = false) => {
  const normalizedSymbol = asString(symbol);
  if (!normalizedSymbol) return null;

  const queryKey = bondQueryKeys.issuerProfile(normalizedSymbol);
  if (!forceRefresh) {
    const queryCached = dashboardQueryClient.getQueryData<any>(queryKey);
    if (queryCached) return queryCached;
  }

  const cacheKey = `${ISSUER_PROFILE_CACHE_PREFIX}${normalizedSymbol}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached;

  const inflight = issuerProfilePromises.get(normalizedSymbol);
  if (inflight) return inflight;

  const promise = fireantApi.getIssuerProfile(normalizedSymbol)
    .then((profile) => {
      setCache(cacheKey, profile);
      dashboardQueryClient.setQueryData(queryKey, profile);
      return profile;
    })
    .finally(() => {
      issuerProfilePromises.delete(normalizedSymbol);
    });

  issuerProfilePromises.set(normalizedSymbol, promise);
  return promise;
};

const loadBetaBondRowsByTypeIds = async (
  cachePrefix: string,
  bondTypeIDs: readonly number[],
  logLabel: string,
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> => {
  const cacheKey = buildQueryCacheKey(cachePrefix, {
    bondTypeIDs: bondTypeIDs.join(','),
    isListing: 0,
    baseTarget: GOVERNMENT_BOND_BASE_TARGET,
  });
  const cached = options.forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as BondDataRow[];

  const inflight = filterPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const listResults = await Promise.allSettled(
      bondTypeIDs.map((bondTypeID) =>
        fireantApi.filterBonds(
          {
            bondTypeID,
            isListing: 0,
          },
          GOVERNMENT_BOND_BASE_TARGET,
        )),
    );

    const seedRows = new Map<string, BondDataRow>();

    listResults.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        console.warn(`[bond-data] Failed to load ${logLabel} bond list for bondTypeID=${bondTypeIDs[index]}`, result.reason);
        return;
      }

      extractRows(result.value as ProcedureResult<BondDataRow>)
        .forEach((item) => {
          const code = resolveBondCodeFromListItem(item);
          if (code && !seedRows.has(code)) {
            seedRows.set(
              code,
              normalizeBondRow(
                typeof item === 'string' || typeof item === 'number'
                  ? { bondCode: code, code }
                  : item,
              ),
            );
          }
        });
    });

    const codes = Array.from(seedRows.keys());
    if (codes.length === 0) {
      setCache(cacheKey, []);
      return [];
    }

    let detailMap: Record<string, any> = {};
    try {
      detailMap = await loadBondDetailsMapByCodes(codes, {
        concurrency: 6,
        forceRefresh: false,
        baseTarget: GOVERNMENT_BOND_BASE_TARGET,
      });
    } catch (error) {
      console.warn(`[bond-data] Failed to load ${logLabel} bond details from beta API`, error);
    }

    const rows = codes
      .map((code) => {
        const seedRow = seedRows.get(code);
        const detailPayload = detailMap[code];
        if (detailPayload) {
          if (seedRow) {
            return mergeBondRowWithDetail(seedRow, detailPayload);
          }

          return normalizeBondDetailPayloadToRow(detailPayload);
        }
        return seedRow || null;
      })
      .filter((row): row is BondDataRow => Boolean(row));

    setCache(cacheKey, rows);
    return rows;
  })().finally(() => {
    filterPromises.delete(cacheKey);
  });

  filterPromises.set(cacheKey, promise);
  return promise;
};

export const loadGovernmentBondRows = async (
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> =>
  loadBetaBondRowsByTypeIds(
    GOVERNMENT_BOND_CACHE_PREFIX,
    GOVERNMENT_BOND_TYPE_IDS,
    'government',
    options,
  );

export const loadUnlistedEnterpriseBondRows = async (
  options: LoadSimpleBondRowsOptions = {},
): Promise<BondDataRow[]> =>
  loadBetaBondRowsByTypeIds(
    UNLISTED_ENTERPRISE_BOND_CACHE_PREFIX,
    UNLISTED_ENTERPRISE_BOND_TYPE_IDS,
    'unlisted enterprise',
    options,
  );
