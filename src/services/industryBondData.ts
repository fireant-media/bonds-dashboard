import { fireantApi } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { findIndustryStats, INDUSTRY_NAV_ITEM_BY_ID, INDUSTRY_NAV_ITEMS, IndustryNavItem } from '../constants/industries';

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

const SYMBOL_GROUP_CACHE_KEY = 'icb_symbol_groups_v1';
const INDUSTRY_BOND_GROUP_CACHE_PREFIX = 'industry_bond_group_v2_';
const INDUSTRY_STATS_CACHE_PREFIX = 'industry_stats_api_v1_';

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toBillionVnd = (value: unknown) => {
  const numberValue = toNumber(value);
  if (!numberValue) return 0;
  return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
};

const normalizeIndustryStats = (stats: any): IndustryStats => ({
  icbCode: stats?.icbCode ? String(stats.icbCode) : undefined,
  icbName: stats?.icbName ? String(stats.icbName) : undefined,
  bondCount: toNumber(stats?.bondCount),
  totalIssuedVolume: toNumber(stats?.totalIssuedVolume),
  totalIssuedValue: toNumber(stats?.totalIssuedValue),
  totalCurrentListedVolume: toNumber(stats?.totalCurrentListedVolume),
  totalCurrentListedValue: toNumber(stats?.totalCurrentListedValue),
  totalDebtFull: toNumber(stats?.totalDebtFull),
  totalRemainingDebt: toNumber(stats?.totalRemainingDebt),
  avgRate: toNumber(stats?.avgRate),
  avgCouponRate: toNumber(stats?.avgCouponRate),
  floatingRate: toNumber(stats?.floatingRate),
});

const subtractMetric = (base: IndustryStats, ...deductions: IndustryStats[]) =>
  Math.max(0, deductions.reduce((value, deduction) => value - deduction.totalIssuedValue, base.totalIssuedValue));

const subtractVolumeMetric = (
  key: keyof Pick<
    IndustryStats,
    'bondCount' | 'totalIssuedVolume' | 'totalCurrentListedVolume' | 'totalCurrentListedValue' | 'totalDebtFull' | 'totalRemainingDebt'
  >,
  base: IndustryStats,
  ...deductions: IndustryStats[]
) => Math.max(0, deductions.reduce((value, deduction) => value - toNumber(deduction[key]), toNumber(base[key])));

const residualRate = (
  key: keyof Pick<IndustryStats, 'avgRate' | 'avgCouponRate' | 'floatingRate'>,
  base: IndustryStats,
  ...deductions: IndustryStats[]
) => {
  const residualIssuedValue = subtractMetric(base, ...deductions);
  if (residualIssuedValue <= 0) return 0;

  const residualWeightedRate = deductions.reduce(
    (value, deduction) => value - toNumber(deduction[key]) * deduction.totalIssuedValue,
    toNumber(base[key]) * base.totalIssuedValue
  );

  return Math.max(0, residualWeightedRate / residualIssuedValue);
};

const buildFinancialsOtherStats = (financials: IndustryStats, banking: IndustryStats, securities: IndustryStats): IndustryStats => ({
  icbCode: financials.icbCode,
  icbName: financials.icbName,
  bondCount: subtractVolumeMetric('bondCount', financials, banking, securities),
  totalIssuedVolume: subtractVolumeMetric('totalIssuedVolume', financials, banking, securities),
  totalIssuedValue: subtractMetric(financials, banking, securities),
  totalCurrentListedVolume: subtractVolumeMetric('totalCurrentListedVolume', financials, banking, securities),
  totalCurrentListedValue: subtractVolumeMetric('totalCurrentListedValue', financials, banking, securities),
  totalDebtFull: subtractVolumeMetric('totalDebtFull', financials, banking, securities),
  totalRemainingDebt: subtractVolumeMetric('totalRemainingDebt', financials, banking, securities),
  avgRate: residualRate('avgRate', financials, banking, securities),
  avgCouponRate: residualRate('avgCouponRate', financials, banking, securities),
  floatingRate: residualRate('floatingRate', financials, banking, securities),
});

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

const getBondCode = (bond: any) => String(bond?.bondCode || bond?.code || '');

const getIssuerSymbol = (bond: any, fallbackSymbol: string) =>
  String(bond?.infoObj?.issuerSymbol || bond?.issuerSymbol || fallbackSymbol || '');

const getIssuerName = (bond: any, fallbackSymbol: string) =>
  String(bond?.issuerName || bond?.infoObj?.issuerName || fallbackSymbol || '');

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

export const loadDedupedIndustrySymbols = async () => {
  const cached = getCache(SYMBOL_GROUP_CACHE_KEY);
  if (cached) return cached as Record<string, string[]>;

  const rawSymbolsByIndustry = new Map<string, string[]>();

  await Promise.all(INDUSTRY_NAV_ITEMS.map(async (industry) => {
    const symbols = await fireantApi.getIcbSymbols(industry.code);
    rawSymbolsByIndustry.set(
      industry.id,
      Array.from(new Set((Array.isArray(symbols) ? symbols : []).map(String).filter(Boolean)))
    );
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
};

const loadStatsForIndustry = async (industry: IndustryNavItem) => {
  const stats = await fireantApi.getIndustries(industry.statsTop, industry.statsLevel);
  return normalizeIndustryStats(findIndustryStats(stats, industry));
};

export const loadIndustryStats = async (industryId: string): Promise<IndustryStats> => {
  const industry = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_STATS_CACHE_PREFIX}${industry.id}`;
  const cached = getCache(cacheKey);
  if (cached) return cached as IndustryStats;

  let stats: IndustryStats;

  if (industry.id === 'Financials') {
    const financials = await loadStatsForIndustry(industry);
    const banking = await loadStatsForIndustry(INDUSTRY_NAV_ITEM_BY_ID.Banking);
    const securities = await loadStatsForIndustry(INDUSTRY_NAV_ITEM_BY_ID.Securities);
    stats = buildFinancialsOtherStats(financials, banking, securities);
  } else {
    stats = await loadStatsForIndustry(industry);
  }

  setCache(cacheKey, stats);
  return stats;
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

const buildIssuerSummaries = (bonds: any[]) => {
  const issuers = new Map<string, IndustryIssuerSummary>();

  bonds.forEach((bond) => {
    const issuerSymbol = String(bond.issuerSymbol || bond.infoObj?.issuerSymbol || '');
    if (!issuerSymbol) return;

    const current = issuers.get(issuerSymbol) || {
      issuerSymbol,
      issuerName: getIssuerName(bond, issuerSymbol),
      totalIssuedValue: 0,
      totalRemainingDebt: 0,
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
    current.totalRemainingDebt += currentListedValue;
    current.totalDebtFull += issuedValue;
    current.totalIssuedVolume += currentListedVolume;
    current.totalCurrentListedValue += currentListedValue;
    current.totalCurrentListedVolume += currentListedVolume;
    current.bondCount += 1;

    issuers.set(issuerSymbol, current);
  });

  return Array.from(issuers.values()).sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
};

const buildIndustryStats = (issuerSummaries: IndustryIssuerSummary[], bonds: any[]) => {
  const totals = issuerSummaries.reduce(
    (acc, issuer) => ({
      totalIssuedVolume: acc.totalIssuedVolume + issuer.totalIssuedVolume,
      totalIssuedValue: acc.totalIssuedValue + issuer.totalIssuedValue,
      totalDebtFull: acc.totalDebtFull + issuer.totalDebtFull,
      totalCurrentListedVolume: acc.totalCurrentListedVolume + issuer.totalCurrentListedVolume,
      totalCurrentListedValue: acc.totalCurrentListedValue + issuer.totalCurrentListedValue,
      totalRemainingDebt: acc.totalRemainingDebt + issuer.totalRemainingDebt,
    }),
    {
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

export const loadIndustryBondGroupData = async (industryId: string): Promise<IndustryBondGroupData> => {
  const industry: IndustryNavItem = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const cacheKey = `${INDUSTRY_BOND_GROUP_CACHE_PREFIX}${industry.id}`;
  const cached = getCache(cacheKey);
  if (cached) return cached as IndustryBondGroupData;

  const symbolGroups = await loadDedupedIndustrySymbols();
  const symbols = symbolGroups[industry.id] || [];

  const issuerBondBatches = await fetchWithLimit(symbols, 6, async (symbol) => {
    const bonds = await fireantApi.getIssuerBonds(symbol);
    return (Array.isArray(bonds) ? bonds : []).map((bond) => ({
      ...bond,
      issuerSymbol: getIssuerSymbol(bond, symbol),
      issuerName: getIssuerName(bond, symbol),
    }));
  });

  const bondsByCode = new Map<string, any>();
  issuerBondBatches.flat().forEach((bond) => {
    const code = getBondCode(bond);
    if (code) bondsByCode.set(code, bond);
  });

  const baseBonds = Array.from(bondsByCode.values());
  const detailedBonds = await fetchWithLimit(baseBonds, 8, async (bond) => {
    const code = getBondCode(bond);
    if (!code) return bond;

    const bondCacheKey = `bond_detail_${code}`;
    const cachedDetail = getCache(bondCacheKey);
    const detailData = cachedDetail || await fireantApi.getBond(code);
    if (!cachedDetail) setCache(bondCacheKey, detailData);

    return mergeBondDetail(bond, detailData);
  });

  const issuerSummaries = buildIssuerSummaries(detailedBonds);
  const industryStats = await loadIndustryStats(industry.id);
  const groupedData: IndustryBondGroupData = {
    industryId: industry.id,
    symbols,
    bonds: detailedBonds,
    issuerSummaries,
    industryStats,
    projectedCashFlowBuckets: buildProjectedCashFlowBuckets(detailedBonds),
  };

  setCache(cacheKey, groupedData);
  return groupedData;
};
