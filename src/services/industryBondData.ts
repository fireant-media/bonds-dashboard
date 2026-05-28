import { fireantApi, fireantRequest } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import {
  getIndustryFilterCodes,
  INDUSTRY_NAV_ITEM_BY_ID,
  INDUSTRY_NAV_ITEMS,
  IndustryNavItem,
  resolveIndustryKeyFromCandidates,
} from '../constants/industries';
import { loadBondDetailsMapByCodes, loadBondsByIndustryFilter } from './bondData';

export interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

export interface IndustryIssuerSummary {
  issuerSymbol: string;
  issuerName: string;
  totalIssuedValue: number;
  totalRemainingDebt: number;
  totalDebtFull: number;
  totalIssuedVolume: number;
  totalCurrentListedValue: number;
  totalCurrentListedVolume: number;
  bondCount: number;
}

export interface IndustryBondGroupData {
  industryId: string;
  symbols: string[];
  bonds: any[];
  issuerSummaries: IndustryIssuerSummary[];
  industryStats: IndustryStats;
  projectedCashFlowBuckets: Record<string, ProjectedCashFlowBucket>;
}

export interface IndustryStats {
  icbCode?: string;
  icbName?: string;
  bondCount: number;
  totalIssuedVolume: number;
  totalIssuedValue: number;
  totalCurrentListedVolume: number;
  totalCurrentListedValue: number;
  totalDebtFull: number;
  totalRemainingDebt: number;
  avgRate: number;
  avgCouponRate: number;
  floatingRate: number;
}

export interface IssuerStatsSummary {
  issuerName: string;
  issuerSymbol: string;
  issuerInstitutionID?: number;
  bondCount: number;
  totalIssuedVolume: number;
  totalIssuedValue: number;
  totalCurrentListedVolume: number;
  totalCurrentListedValue: number;
  totalDebtFull: number;
  totalRemainingDebt: number;
  avgRate: number;
  avgCouponRate: number;
  avgFloatingRate: number;
}

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

const SYMBOL_GROUP_CACHE_KEY = 'icb_symbol_groups_v1';
const INDUSTRY_BOND_ROWS_CACHE_PREFIX = 'industry_bond_rows_v6_';
const INDUSTRY_BOND_BASE_CACHE_PREFIX = 'industry_bond_base_v9_';
const INDUSTRY_BOND_GROUP_CACHE_PREFIX = 'industry_bond_group_v10_';
const INDUSTRY_STATS_CACHE_PREFIX = 'industry_stats_api_v5_';
const INDUSTRY_STATS_ROWS_CACHE_PREFIX = 'industry_stats_rows_v2_';
const ISSUER_STATS_CACHE_PREFIX = 'issuer_stats_api_v1_';
let symbolGroupsPromise: Promise<Record<string, string[]>> | null = null;
const industryStatsPromises = new Map<string, Promise<IndustryStats>>();
const industryStatsRowsPromises = new Map<string, Promise<IndustryStats[]>>();
const industryBondRowsPromises = new Map<string, Promise<any[]>>();
const industryBondBasePromises = new Map<string, Promise<IndustryBondGroupData>>();
const industryBondGroupPromises = new Map<string, Promise<IndustryBondGroupData>>();
const issuerStatsPromises = new Map<string, Promise<IssuerStatsSummary[]>>();

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toBillionVnd = (value: unknown) => {
  const numberValue = toNumber(value);
  if (!numberValue) return 0;
  return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
};

const normalizeCode = (value: unknown) => String(value ?? '').trim();

const firstDefined = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
};

const normalizeIndustryStat = (stat: any): IndustryStats => ({
  icbCode: normalizeCode(firstDefined(stat?.icbCode, stat?.ICBCode, stat?.icbCodeLv1, stat?.ICBCodeLv1, stat?.icbCodeLv2, stat?.ICBCodeLv2, stat?.icbCodeLv3, stat?.ICBCodeLv3, stat?.icbCodeLv4, stat?.ICBCodeLv4)),
  icbName: normalizeCode(firstDefined(stat?.icbName, stat?.ICBName, stat?.icbNameLv1, stat?.ICBNameLv1, stat?.icbNameLv2, stat?.ICBNameLv2, stat?.icbNameLv3, stat?.ICBNameLv3, stat?.icbNameLv4, stat?.ICBNameLv4)),
  bondCount: toNumber(firstDefined(stat?.bondCount, stat?.BondCount)),
  totalIssuedVolume: toNumber(firstDefined(stat?.totalIssuedVolume, stat?.TotalIssuedVolume)),
  totalIssuedValue: toNumber(firstDefined(stat?.totalIssuedValue, stat?.TotalIssuedValue)),
  totalCurrentListedVolume: toNumber(firstDefined(stat?.totalCurrentListedVolume, stat?.TotalCurrentListedVolume)),
  totalCurrentListedValue: toNumber(firstDefined(stat?.totalCurrentListedValue, stat?.TotalCurrentListedValue)),
  totalDebtFull: toNumber(firstDefined(stat?.totalDebtFull, stat?.TotalDebtFull)),
  totalRemainingDebt: toNumber(firstDefined(stat?.totalRemainingDebt, stat?.TotalRemainingDebt)),
  avgRate: toNumber(firstDefined(stat?.avgRate, stat?.AvgRate)),
  avgCouponRate: toNumber(firstDefined(stat?.avgCouponRate, stat?.AvgCouponRate)),
  floatingRate: toNumber(firstDefined(stat?.floatingRate, stat?.avgFloatingRate, stat?.FloatingRate, stat?.AvgFloatingRate)),
});

const getIndustryStatsRows = <T>(payload: ProcedureResult<T> | null | undefined): T[] => extractRows(payload);

const getIndustryStatsRowsByLevel = async (level: number, forceRefresh = false): Promise<IndustryStats[]> => {
  const cacheKey = `${INDUSTRY_STATS_ROWS_CACHE_PREFIX}${level}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IndustryStats[];

  const inflightKey = String(level);
  const inflight = industryStatsRowsPromises.get(inflightKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const fetchRows = level === 2
      ? fireantApi.getBankingIndustries(1000)
      : level === 4
        ? fireantApi.getSecuritiesIndustries(1000)
        : fireantApi.getIndustries(1000, level);
    const rows = getIndustryStatsRows<any>(await fetchRows);
    const normalized = rows.map(normalizeIndustryStat).filter((stat) => Boolean(stat.icbCode));
    setCache(cacheKey, normalized);
    return normalized;
  })().finally(() => {
    industryStatsRowsPromises.delete(inflightKey);
  });

  industryStatsRowsPromises.set(inflightKey, promise);
  return promise;
};

const findIndustryStatsRow = (rows: IndustryStats[], industry: IndustryNavItem) => {
  const candidates = new Set([
    industry.code,
    industry.icbCode || '',
    industry.id,
  ].map(normalizeCode).filter(Boolean));

  return rows.find((row) => candidates.has(normalizeCode(row.icbCode)))
    || rows.find((row) => normalizeCode(row.icbName).toLowerCase() === normalizeCode(industry.id).toLowerCase())
    || rows[0]
    || normalizeIndustryStat({});
};

const buildResidualIndustryStats = (
  financials: IndustryStats,
  banking: IndustryStats,
  securities: IndustryStats,
): IndustryStats => {
  const totalIssuedValue = Math.max(0, financials.totalIssuedValue - banking.totalIssuedValue - securities.totalIssuedValue);
  const weightedRate = (field: 'avgRate' | 'avgCouponRate' | 'floatingRate') => {
    if (!totalIssuedValue) return 0;

    return (
      financials[field] * financials.totalIssuedValue -
      banking[field] * banking.totalIssuedValue -
      securities[field] * securities.totalIssuedValue
    ) / totalIssuedValue;
  };

  return {
    ...financials,
    bondCount: Math.max(0, financials.bondCount - banking.bondCount - securities.bondCount),
    totalIssuedVolume: Math.max(0, financials.totalIssuedVolume - banking.totalIssuedVolume - securities.totalIssuedVolume),
    totalIssuedValue,
    totalCurrentListedVolume: Math.max(0, financials.totalCurrentListedVolume - banking.totalCurrentListedVolume - securities.totalCurrentListedVolume),
    totalCurrentListedValue: Math.max(0, financials.totalCurrentListedValue - banking.totalCurrentListedValue - securities.totalCurrentListedValue),
    totalDebtFull: Math.max(0, financials.totalDebtFull - banking.totalDebtFull - securities.totalDebtFull),
    totalRemainingDebt: Math.max(0, financials.totalRemainingDebt - banking.totalRemainingDebt - securities.totalRemainingDebt),
    avgRate: weightedRate('avgRate'),
    avgCouponRate: weightedRate('avgCouponRate'),
    floatingRate: weightedRate('floatingRate'),
  };
};

const getBondIndustryCodes = (bond: any) => {
  const candidates = [
    bond?.icbCode,
    bond?.ICBCode,
    bond?.icbCodeLv4,
    bond?.ICBCodeLv4,
    bond?.icbCodeLv3,
    bond?.ICBCodeLv3,
    bond?.icbCodeLv2,
    bond?.ICBCodeLv2,
    bond?.icbCodeLv1,
    bond?.ICBCodeLv1,
    bond?.industryCode,
    bond?.bondInfos?.ICBCode,
    bond?.bondInfos?.icbCode,
    bond?.bondInfos?.ICBCodeLv4,
    bond?.bondInfos?.icbCodeLv4,
    bond?.bondInfos?.ICBCodeLv3,
    bond?.bondInfos?.icbCodeLv3,
    bond?.bondInfos?.ICBCodeLv2,
    bond?.bondInfos?.icbCodeLv2,
    bond?.bondInfos?.ICBCodeLv1,
    bond?.bondInfos?.icbCodeLv1,
    bond?.raw?.icbCode,
    bond?.raw?.ICBCode,
    bond?.raw?.icbCodeLv4,
    bond?.raw?.ICBCodeLv4,
    bond?.raw?.icbCodeLv3,
    bond?.raw?.ICBCodeLv3,
    bond?.raw?.icbCodeLv2,
    bond?.raw?.ICBCodeLv2,
    bond?.raw?.icbCodeLv1,
    bond?.raw?.ICBCodeLv1,
    bond?.raw?.industryCode,
    bond?.raw?.bondInfos?.ICBCode,
    bond?.raw?.bondInfos?.icbCode,
    bond?.raw?.bondInfos?.ICBCodeLv4,
    bond?.raw?.bondInfos?.icbCodeLv4,
    bond?.raw?.bondInfos?.ICBCodeLv3,
    bond?.raw?.bondInfos?.icbCodeLv3,
    bond?.raw?.bondInfos?.ICBCodeLv2,
    bond?.raw?.bondInfos?.icbCodeLv2,
    bond?.raw?.bondInfos?.ICBCodeLv1,
    bond?.raw?.bondInfos?.icbCodeLv1,
    bond?.infoObj?.icbCode,
    bond?.infoObj?.ICBCode,
    bond?.infoObj?.icbCodeLv4,
    bond?.infoObj?.ICBCodeLv4,
    bond?.infoObj?.icbCodeLv3,
    bond?.infoObj?.ICBCodeLv3,
    bond?.infoObj?.icbCodeLv2,
    bond?.infoObj?.ICBCodeLv2,
    bond?.infoObj?.icbCodeLv1,
    bond?.infoObj?.ICBCodeLv1,
  ];

  return Array.from(new Set(candidates.map(normalizeCode).filter(Boolean)));
};

const getBondIssuerSymbol = (bond: any, fallbackSymbol = '') =>
  normalizeCode(
    bond?.issuerSymbol ??
    bond?.infoObj?.issuerSymbol ??
    bond?.bondInfos?.IssuerSymbol ??
    bond?.bondInfos?.Symbol ??
    bond?.raw?.issuerSymbol ??
    bond?.raw?.IssuerSymbol ??
    fallbackSymbol
  );

const getBondIssuerName = (bond: any, fallbackSymbol = '') =>
  normalizeCode(
    bond?.issuerName ??
    bond?.infoObj?.issuerName ??
    bond?.bondInfos?.IssuerName ??
    bond?.bondInfos?.Name ??
    bond?.raw?.issuerName ??
    bond?.raw?.IssuerName ??
    fallbackSymbol
  );

const getBondCode = (bond: any) => normalizeCode(bond?.bondCode || bond?.code || bond?.id);

const isExcludedBond = (bond: any, excludedCodes: Set<string>) => {
  const bondIndustryCodes = getBondIndustryCodes(bond);
  if (bondIndustryCodes.some((code) => excludedCodes.has(code))) return true;

  const resolvedIndustry = resolveIndustryKeyFromCandidates(
    bond?.industry,
    bond?.industryName,
    bond?.IndustryName,
    bond?.icbNameLv2,
    bond?.ICBNameLv2,
    bond?.icbNameLv1,
    bond?.ICBNameLv1,
    bond?.bondInfos?.ICBNameLv2,
    bond?.bondInfos?.ICBNameLv1,
    bond?.raw?.industry,
    bond?.raw?.industryName,
    bond?.raw?.IndustryName,
    bond?.raw?.icbNameLv2,
    bond?.raw?.ICBNameLv2,
    bond?.raw?.icbNameLv1,
    bond?.raw?.ICBNameLv1,
    bond?.infoObj?.industry,
    bond?.infoObj?.industryName,
    bond?.infoObj?.icbNameLv2,
    bond?.infoObj?.ICBNameLv2,
    bond?.infoObj?.icbNameLv1,
    bond?.infoObj?.ICBNameLv1,
  );

  return resolvedIndustry === 'Banking' || resolvedIndustry === 'Securities';
};

const extractRows = <T>(payload: ProcedureResult<T> | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const candidate = payload.rows || payload.data || payload.items || payload.result;
  return Array.isArray(candidate) ? candidate : [];
};

const normalizeIssuerStats = (issuer: any): IssuerStatsSummary => ({
  issuerName: String(issuer?.issuerName || issuer?.name || issuer?.issuerSymbol || ''),
  issuerSymbol: String(issuer?.issuerSymbol || issuer?.symbol || ''),
  issuerInstitutionID: issuer?.issuerInstitutionID !== undefined ? Number(issuer.issuerInstitutionID) : undefined,
  bondCount: toNumber(issuer?.bondCount),
  totalIssuedVolume: toNumber(issuer?.totalIssuedVolume),
  totalIssuedValue: toNumber(issuer?.totalIssuedValue),
  totalCurrentListedVolume: toNumber(issuer?.totalCurrentListedVolume),
  totalCurrentListedValue: toNumber(issuer?.totalCurrentListedValue),
  totalDebtFull: toNumber(issuer?.totalDebtFull),
  totalRemainingDebt: toNumber(issuer?.totalRemainingDebt),
  avgRate: toNumber(issuer?.avgRate),
  avgCouponRate: toNumber(issuer?.avgCouponRate),
  avgFloatingRate: toNumber(issuer?.avgFloatingRate || issuer?.floatingRate),
});

const buildRemainingDebtMap = (issuerStats: IssuerStatsSummary[]) => {
  return new Map(
    issuerStats.map((issuer) => [
      String(issuer.issuerSymbol || '').toUpperCase(),
      toNumber(issuer.totalRemainingDebt),
    ] as const)
  );
};

export const loadIssuerStatsSummary = async (top = 200, forceRefresh = false): Promise<IssuerStatsSummary[]> => {
  const cacheKey = `${ISSUER_STATS_CACHE_PREFIX}${top}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IssuerStatsSummary[];

  const inflightKey = String(top);
  const inflight = issuerStatsPromises.get(inflightKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const sources = [
      () => fireantApi.getTopDebtIssuers(top),
      () => fireantRequest<ProcedureResult<IssuerStatsSummary>>('bond_StatisticsByIssuer', {
        query: { Top: top, SortBy: 2, StatusID: 1, IsListing: 1 },
      }),
    ];

    let procedurePayload: ProcedureResult<IssuerStatsSummary> | null = null;
    for (const source of sources) {
      try {
        procedurePayload = await source();
        if (extractRows<IssuerStatsSummary>(procedurePayload).length > 0) {
          break;
        }
      } catch (error) {
        console.warn('[bond-data] Issuer stats source failed', error);
      }
    }

    const rows = extractRows<IssuerStatsSummary>(procedurePayload)
      .map(normalizeIssuerStats)
      .filter((issuer) => Boolean(issuer.issuerSymbol || issuer.issuerName));

    if (rows.length > 0) {
      setCache(cacheKey, rows);
      return rows;
    }

    const fallbackRows = Array.isArray(procedurePayload)
      ? procedurePayload
      : [];
    const normalizedFallback = fallbackRows.map(normalizeIssuerStats);
    setCache(cacheKey, normalizedFallback);
    return normalizedFallback;
  })().finally(() => {
    issuerStatsPromises.delete(inflightKey);
  });

  issuerStatsPromises.set(inflightKey, promise);
  return promise;
};

const getDateKey = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const sortKey = `${year}-${String(month).padStart(2, '0')}`;

  return {
    bucketKey: sortKey,
    label: `T${month}/${year}`,
  };
};

const mergeBondDetail = (bond: any, detailData: any) => {
  const detail = detailData?.detail || {};
  const historyItem = Array.isArray(detailData?.history) ? detailData.history[0] : undefined;
  const cashFlows = Array.isArray(detailData?.cashFlows) ? detailData.cashFlows : [];

  return {
    ...bond,
    ...detail,
    bondCode: detail.bondCode || bond.bondCode || bond.code,
    issuerName: detail.issuerName || bond.issuerName,
    issuerSymbol: detail.issuerSymbol || bond.infoObj?.issuerSymbol,
    totalIssuedValue: toNumber(detail.totalIssuedValue || bond.totalIssuedValue || historyItem?.value),
    currentListedValue: toNumber(detail.currentListedValue || bond.currentListedValue || historyItem?.value),
    totalRemainingDebt: toNumber(detail.totalRemainingDebt || bond.totalRemainingDebt),
    currentListedVolume: toNumber(detail.currentListedVolume || bond.currentListedVolume || historyItem?.volume),
    bondRate: toNumber(detail.bondRate || detail.interestRate || detail.couponRate || bond.bondRate),
    bondRateType: detail.bondRateType || detail.interestRateType || detail.couponRateType || bond.bondRateType,
    cashFlows,
  };
};

const fetchWithLimit = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) => getFulfilledValues(await mapWithConcurrency(items, concurrency, worker));

const loadIndustryBondRows = async (industryId: string, forceRefresh = false) => {
  const industry = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_BOND_ROWS_CACHE_PREFIX}${industry.id}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as any[];

  const inflight = industryBondRowsPromises.get(industry.id);
  if (inflight) return inflight;

  const promise = (async () => {
    const { include, exclude } = getIndustryFilterCodes(industry.id);
    const excludedCodes = new Set(exclude);
    const symbolGroups = industry.id === 'Financials'
      ? await loadDedupedIndustrySymbols(forceRefresh).catch(() => null)
      : null;
    const childIndustrySymbols = industry.id === 'Financials' && symbolGroups
      ? new Set([
          ...(symbolGroups.Banking || []),
          ...(symbolGroups.Securities || []),
        ].map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))
      : null;
    const batches = await fetchWithLimit(include, 4, async (icbCode) => {
      const rows = await loadBondsByIndustryFilter(icbCode, 1);
      return Array.isArray(rows) ? rows : [];
    });

    const deduped = new Map<string, any>();
    batches.flat().forEach((bond) => {
      if (!bond || isExcludedBond(bond, excludedCodes)) return;
      if (childIndustrySymbols) {
        const issuerSymbol = getBondIssuerSymbol(bond).toUpperCase();
        if (issuerSymbol && childIndustrySymbols.has(issuerSymbol)) return;
      }
      const code = getBondCode(bond);
      if (!code || deduped.has(code)) return;
      deduped.set(code, {
        ...bond,
        issuerSymbol: getBondIssuerSymbol(bond, industry.id),
        issuerName: getBondIssuerName(bond, industry.id),
      });
    });

    const bonds = Array.from(deduped.values());
    setCache(cacheKey, bonds);
    return bonds;
  })().finally(() => {
    industryBondRowsPromises.delete(industry.id);
  });

  industryBondRowsPromises.set(industry.id, promise);
  return promise;
};

export const loadDedupedIndustrySymbols = async (forceRefresh = false) => {
  const cached = forceRefresh ? null : getCache(SYMBOL_GROUP_CACHE_KEY);
  if (cached) return cached as Record<string, string[]>;
  if (symbolGroupsPromise) return symbolGroupsPromise;

  symbolGroupsPromise = (async () => {
    const rawSymbolsByIndustry = new Map<string, string[]>();

    await Promise.all(INDUSTRY_NAV_ITEMS.map(async (industry) => {
      try {
        const symbols = await fireantApi.getIcbSymbols(industry.code);
        rawSymbolsByIndustry.set(
          industry.id,
          Array.from(new Set((Array.isArray(symbols) ? symbols : []).map(String).filter(Boolean)))
        );
      } catch (error) {
        console.warn(`[industry-bond-data] Failed to load ICB symbols for ${industry.id}`, error);
        rawSymbolsByIndustry.set(industry.id, []);
      }
    }));

    const assignedSymbols = new Map<string, string>();
    const groupedSymbols: Record<string, string[]> = {};

    [...INDUSTRY_NAV_ITEMS]
      .sort((a, b) => a.priority - b.priority)
      .forEach((industry) => {
        const uniqueSymbols: string[] = [];

        (rawSymbolsByIndustry.get(industry.id) || []).forEach((symbol) => {
          if (assignedSymbols.has(symbol)) return;
          assignedSymbols.set(symbol, industry.id);
          uniqueSymbols.push(symbol);
        });

        groupedSymbols[industry.id] = uniqueSymbols;
      });

    setCache(SYMBOL_GROUP_CACHE_KEY, groupedSymbols);
    return groupedSymbols;
  })().finally(() => {
    symbolGroupsPromise = null;
  });

  return symbolGroupsPromise;
};

export const loadIndustryStats = async (industryId: string, forceRefresh = false): Promise<IndustryStats> => {
  const industry = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_STATS_CACHE_PREFIX}${industry.id}`;

  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IndustryStats;
  const inflight = industryStatsPromises.get(industry.id);
  if (inflight) return inflight;

  const promise = (async () => {
    if (industry.id === 'Financials') {
      const [financialsRows, bankingRows, securitiesRows] = await Promise.all([
        getIndustryStatsRowsByLevel(1, forceRefresh),
        getIndustryStatsRowsByLevel(2, forceRefresh),
        getIndustryStatsRowsByLevel(4, forceRefresh),
      ]);

      const stats = buildResidualIndustryStats(
        findIndustryStatsRow(financialsRows, industry),
        findIndustryStatsRow(bankingRows, INDUSTRY_NAV_ITEM_BY_ID.Banking),
        findIndustryStatsRow(securitiesRows, INDUSTRY_NAV_ITEM_BY_ID.Securities),
      );
      setCache(cacheKey, stats);
      return stats;
    }

    const rows = await getIndustryStatsRowsByLevel(industry.statsLevel || 1, forceRefresh);
    const stats = findIndustryStatsRow(rows, industry);
    setCache(cacheKey, stats);
    return stats;
  })().finally(() => {
    industryStatsPromises.delete(industry.id);
  });

  industryStatsPromises.set(industry.id, promise);
  return promise;
};

export const loadResidualFinancialIndustryStats = async (forceRefresh = false): Promise<IndustryStats> => {
  const cacheKey = `${INDUSTRY_STATS_CACHE_PREFIX}Financials`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IndustryStats;

  const inflightKey = 'Financials';
  const inflight = industryStatsPromises.get(inflightKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const [financialsRows, bankingRows, securitiesRows] = await Promise.all([
      getIndustryStatsRowsByLevel(1, forceRefresh),
      getIndustryStatsRowsByLevel(2, forceRefresh),
      getIndustryStatsRowsByLevel(4, forceRefresh),
    ]);

    const stats = buildResidualIndustryStats(
      findIndustryStatsRow(financialsRows, INDUSTRY_NAV_ITEM_BY_ID.Financials),
      findIndustryStatsRow(bankingRows, INDUSTRY_NAV_ITEM_BY_ID.Banking),
      findIndustryStatsRow(securitiesRows, INDUSTRY_NAV_ITEM_BY_ID.Securities),
    );

    setCache(cacheKey, stats);
    return stats;
  })().finally(() => {
    industryStatsPromises.delete(inflightKey);
  });

  industryStatsPromises.set(inflightKey, promise);
  return promise;
};

export const loadIndustryBaseBondGroupData = async (industryId: string, forceRefresh = false): Promise<IndustryBondGroupData> => {
  const industry: IndustryNavItem = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_BOND_BASE_CACHE_PREFIX}${industry.id}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IndustryBondGroupData;
  const inflight = industryBondBasePromises.get(industry.id);
  if (inflight) return inflight;

  const promise = (async () => {
    const [bonds, issuerStats, industryStats] = await Promise.all([
      loadIndustryBondRows(industry.id, forceRefresh),
      loadIssuerStatsSummary(1000, forceRefresh).catch(() => []),
      loadIndustryStats(industry.id, forceRefresh).catch(() => null),
    ]);
    const symbols = Array.from(new Set(bonds.map((bond) => getBondIssuerSymbol(bond)).filter(Boolean)));
    const remainingDebtByIssuer = buildRemainingDebtMap(issuerStats);
    const issuerSummaries = buildIssuerSummaries(bonds, remainingDebtByIssuer);
    const groupedData: IndustryBondGroupData = {
      industryId: industry.id,
      symbols,
      bonds,
      issuerSummaries,
      industryStats: industryStats || buildIndustryStats(issuerSummaries, bonds),
      projectedCashFlowBuckets: {},
    };

    setCache(cacheKey, groupedData);
    return groupedData;
  })().finally(() => {
    industryBondBasePromises.delete(industry.id);
  });

  industryBondBasePromises.set(industry.id, promise);
  return promise;
};

const buildProjectedCashFlowBuckets = (bonds: any[]) => {
  const buckets = new Map<string, ProjectedCashFlowBucket>();

  const ensureBucket = (dateString: string) => {
    const keyInfo = getDateKey(dateString);
    if (!keyInfo) return null;

    if (!buckets.has(keyInfo.bucketKey)) {
      buckets.set(keyInfo.bucketKey, { label: keyInfo.label, interest: 0, principal: 0 });
    }

    return buckets.get(keyInfo.bucketKey)!;
  };

  bonds.forEach((bond) => {
    if (Array.isArray(bond.cashFlows) && bond.cashFlows.length > 0) {
      bond.cashFlows.forEach((cashFlow: any) => {
        if (!cashFlow?.paymentDate) return;

        const bucket = ensureBucket(cashFlow.paymentDate);
        if (!bucket) return;

        bucket.interest += toBillionVnd(cashFlow.interestAmount);
        bucket.principal += toBillionVnd(cashFlow.principalAmount);
      });
      return;
    }

    const fallbackDate = bond.maturityDate || bond.paymentDate;
    const fallbackPrincipal = bond.currentListedValue || bond.totalRemainingDebt || bond.totalIssuedValue;
    if (!fallbackDate || !fallbackPrincipal) return;

    const bucket = ensureBucket(fallbackDate);
    if (bucket) bucket.principal += toBillionVnd(fallbackPrincipal);
  });

  return Object.fromEntries(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
};

const buildIssuerSummaries = (bonds: any[], remainingDebtByIssuer = new Map<string, number>()) => {
  const issuers = new Map<string, IndustryIssuerSummary>();

  bonds.forEach((bond) => {
    const issuerSymbol = String(bond.issuerSymbol || bond.infoObj?.issuerSymbol || '');
    if (!issuerSymbol) return;
    const normalizedIssuerSymbol = issuerSymbol.toUpperCase();
    const remainingDebt = remainingDebtByIssuer.get(normalizedIssuerSymbol) ?? 0;

    const current = issuers.get(issuerSymbol) || {
      issuerSymbol,
      issuerName: getBondIssuerName(bond, issuerSymbol),
      totalIssuedValue: 0,
      totalRemainingDebt: remainingDebt,
      totalDebtFull: 0,
      totalIssuedVolume: 0,
      totalCurrentListedValue: 0,
      totalCurrentListedVolume: 0,
      bondCount: 0,
    };

    const issuedValue = toNumber(bond.totalIssuedValue);
    const currentListedValue = toNumber(bond.currentListedValue);
    const currentListedVolume = toNumber(bond.currentListedVolume);

    current.totalIssuedValue += issuedValue;
    current.totalDebtFull += issuedValue;
    current.totalIssuedVolume += currentListedVolume;
    current.totalCurrentListedValue += currentListedValue;
    current.totalCurrentListedVolume += currentListedVolume;
    current.bondCount += 1;

    if (current.totalRemainingDebt === 0 && remainingDebt > 0) {
      current.totalRemainingDebt = remainingDebt;
    }

    issuers.set(issuerSymbol, current);
  });

  return Array.from(issuers.values()).sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
};

const buildIndustryStats = (issuerSummaries: IndustryIssuerSummary[], bonds: any[]) => {
  const totals = issuerSummaries.reduce(
    (acc, issuer) => ({
      bondCount: acc.bondCount + issuer.bondCount,
      totalIssuedVolume: acc.totalIssuedVolume + issuer.totalIssuedVolume,
      totalIssuedValue: acc.totalIssuedValue + issuer.totalIssuedValue,
      totalDebtFull: acc.totalDebtFull + issuer.totalDebtFull,
      totalCurrentListedVolume: acc.totalCurrentListedVolume + issuer.totalCurrentListedVolume,
      totalCurrentListedValue: acc.totalCurrentListedValue + issuer.totalCurrentListedValue,
      totalRemainingDebt: acc.totalRemainingDebt + issuer.totalRemainingDebt,
    }),
    {
      bondCount: 0,
      totalIssuedVolume: 0,
      totalIssuedValue: 0,
      totalDebtFull: 0,
      totalCurrentListedVolume: 0,
      totalCurrentListedValue: 0,
      totalRemainingDebt: 0,
    }
  );

  const rates = bonds.map((bond) => toNumber(bond.bondRate || bond.couponRate)).filter((value) => value > 0);
  const floatingRates = bonds
    .filter((bond) => String(bond.bondRateType || '').toLowerCase().includes('thả nổi'))
    .map((bond) => toNumber(bond.bondRate || bond.couponRate))
    .filter((value) => value > 0);

  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

  return {
    ...totals,
    avgRate: average(rates),
    avgCouponRate: average(rates),
    floatingRate: average(floatingRates),
  };
};

export const loadIndustryBondGroupData = async (industryId: string, forceRefresh = false): Promise<IndustryBondGroupData> => {
  const industry: IndustryNavItem = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_BOND_GROUP_CACHE_PREFIX}${industry.id}`;
  const cached = forceRefresh ? null : getCache(cacheKey);
  if (cached) return cached as IndustryBondGroupData;
  const inflight = industryBondGroupPromises.get(industry.id);
  if (inflight) return inflight;

  const promise = (async () => {
    const baseData = await loadIndustryBaseBondGroupData(industry.id, forceRefresh);
    const issuerStatsPromise = loadIssuerStatsSummary(1000, forceRefresh).catch(() => []);
    const detailMapPromise = loadBondDetailsMapByCodes(
      baseData.bonds.map((bond) => getBondCode(bond)),
      { concurrency: 8, forceRefresh },
    );
    const [issuerStats, detailMap] = await Promise.all([issuerStatsPromise, detailMapPromise]);
    const detailedBonds = baseData.bonds.map((bond) => {
      const code = getBondCode(bond);
      const detailData = code ? detailMap[code.toUpperCase()] : null;
      return detailData ? mergeBondDetail(bond, detailData) : bond;
    });
    const remainingDebtByIssuer = buildRemainingDebtMap(issuerStats);
    const issuerSummaries = buildIssuerSummaries(detailedBonds, remainingDebtByIssuer);
    const groupedData: IndustryBondGroupData = {
      industryId: industry.id,
      symbols: baseData.symbols,
      bonds: detailedBonds,
      issuerSummaries,
      industryStats: baseData.industryStats || buildIndustryStats(issuerSummaries, detailedBonds),
      projectedCashFlowBuckets: buildProjectedCashFlowBuckets(detailedBonds),
    };

    setCache(cacheKey, groupedData);
    return groupedData;
  })().finally(() => {
    industryBondGroupPromises.delete(industry.id);
  });

  industryBondGroupPromises.set(industry.id, promise);
  return promise;
};
