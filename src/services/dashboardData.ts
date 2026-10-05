import { fireantApi } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { loadIndustryBaseBondGroupData, loadIndustryBondGroupData } from './industryBondData';

export const SIDEBAR_INDUSTRY_ISSUED_VALUES_CACHE_KEY = 'sidebar_industry_issued_values_v2';

const loadRawIndustryIssuedValues = async (): Promise<Record<string, number>> => {
  const [level1Rows, level2Rows, level4Rows] = await Promise.all([
    fireantApi.getIndustries(1000, 1).catch(() => []),
    fireantApi.getBankingIndustries(1000).catch(() => []),
    fireantApi.getSecuritiesIndustries(1000).catch(() => []),
  ]);

  const statsByCode = new Map<string, any>();

  [...level1Rows, ...level2Rows, ...level4Rows].forEach((row: any) => {
    const code = String(row?.icbCode || '').trim();
    if (code && !statsByCode.has(code)) statsByCode.set(code, row);
  });

  return INDUSTRY_NAV_ITEMS.reduce<Record<string, number>>((acc, item) => {
    const stats = statsByCode.get(item.code);
    let issuedValue = Number(stats?.totalIssuedValue || 0);

    if (item.id === 'Financials') {
      issuedValue = Math.max(
        0,
        issuedValue
          - Number(statsByCode.get('3010')?.totalIssuedValue || 0)
          - Number(statsByCode.get('30202005')?.totalIssuedValue || 0),
      );
    }

    const bondCount = Number(stats?.bondCount || 0);

    if (bondCount > 0 && issuedValue > 0) {
      acc[item.id] = issuedValue;
    }

    return acc;
  }, {});
};

export const loadSidebarIndustryIssuedValues = async (forceRefresh = false): Promise<Record<string, number>> => {
  const cached = forceRefresh ? null : getCache(SIDEBAR_INDUSTRY_ISSUED_VALUES_CACHE_KEY);
  if (cached) return cached as Record<string, number>;

  const values = await loadRawIndustryIssuedValues();
  if (Object.keys(values).length > 0) {
    setCache(SIDEBAR_INDUSTRY_ISSUED_VALUES_CACHE_KEY, values);
  }
  return values;
};

export const loadIndustryDashboardData = async (industryId: string, forceRefresh = false) => {
  const [baseData, groupData] = await Promise.all([
    loadIndustryBaseBondGroupData(industryId, forceRefresh).catch(() => null),
    loadIndustryBondGroupData(industryId, forceRefresh).catch(() => null),
  ]);

  return groupData || baseData || null;
};
