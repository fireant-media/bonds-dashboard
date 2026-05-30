import { QueryClient, useQuery } from '@tanstack/react-query';
import { getCache } from '../utils/cache';
import {
  loadIndustryDashboardData,
  loadSidebarIndustryIssuedValues,
  SIDEBAR_INDUSTRY_ISSUED_VALUES_CACHE_KEY,
} from '../services/dashboardData';
import {
  loadMarketOverviewData,
  loadMarketOverviewIndustryData,
  loadMarketOverviewIssuerStats,
  loadMarketOverviewTopInterestData,
  MARKET_OVERVIEW_CACHE_KEY,
  MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY,
  MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY,
  MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY,
} from '../services/marketOverviewData';
import { loadMaturingBonds } from '../services/bondData';
import {
  loadDedupedIndustrySymbols,
  loadIndustryBaseBondGroupData,
  loadIndustryBondGroupData,
  loadIssuerStatsSummary,
} from '../services/industryBondData';
import { dashboardQueryStaleTime } from './client';
import { bondQueryKeys, dashboardQueryKeys, newsQueryKeys } from './keys';
import { fetchNewsData, getCachedNews } from '../services/newsService';
import { loadBondDetail, loadIssuerBondsByFilter, loadIssuerProfile } from '../services/bondData';
import { getWatchlistItems } from '../utils/watchlist';

const hasMeaningfulIndustryDashboardData = (value: unknown) => {
  const data = value as { bonds?: unknown[]; issuerSummaries?: unknown[]; symbols?: unknown[]; industryStats?: { bondCount?: number } } | null | undefined;
  if (!data || typeof data !== 'object') return false;

  return Boolean(
    (Array.isArray(data.bonds) && data.bonds.length > 0)
    || (Array.isArray(data.issuerSummaries) && data.issuerSummaries.length > 0)
    || (Array.isArray(data.symbols) && data.symbols.length > 0)
    || data.industryStats?.bondCount
  );
};

export const useMarketOverviewQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.marketOverview(),
    queryFn: () => loadMarketOverviewData(),
    initialData: getCache(MARKET_OVERVIEW_CACHE_KEY) || undefined,
  });

export const useMarketOverviewIssuerStatsQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.marketOverviewIssuerStats(),
    queryFn: () => loadMarketOverviewIssuerStats(),
    initialData: getCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY) || getCache('top_debt_200') || undefined,
    placeholderData: (previous) => previous,
  });

export const useMarketOverviewTopInterestQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.marketOverviewTopInterest(),
    queryFn: () => loadMarketOverviewTopInterestData(),
    initialData: getCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY) || getCache('market_top_interest_bonds') || undefined,
    placeholderData: (previous) => previous,
  });

export const useMarketOverviewIndustryDataQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.marketOverviewIndustryData(),
    queryFn: () => loadMarketOverviewIndustryData(),
    initialData: getCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY) || undefined,
    placeholderData: (previous) => previous,
  });

export const useMaturingBondsQuery = (days: number) =>
  useQuery({
    queryKey: dashboardQueryKeys.maturingBonds(days),
    queryFn: () => loadMaturingBonds(days),
    initialData: getCache(`maturity_list_${days}`) || undefined,
  });

export const useIndustryDashboardQuery = (industryId: string) =>
  useQuery({
    queryKey: dashboardQueryKeys.industryDashboard(industryId),
    queryFn: () => loadIndustryDashboardData(industryId),
    placeholderData: (previous) => previous,
    initialData: (() => {
      const groupData = getCache(`industry_bond_group_v10_${industryId}`);
      if (hasMeaningfulIndustryDashboardData(groupData)) return groupData;

      const baseData = getCache(`industry_bond_base_v9_${industryId}`);
      if (hasMeaningfulIndustryDashboardData(baseData)) return baseData;

      return undefined;
    })(),
  });

export const useIndustryBaseDashboardQuery = (industryId: string) =>
  useQuery({
    queryKey: dashboardQueryKeys.industryDashboardBase(industryId),
    queryFn: () => loadIndustryBaseBondGroupData(industryId),
    placeholderData: (previous) => previous,
    initialData: (() => {
      const baseData = getCache(`industry_bond_base_v9_${industryId}`);
      if (hasMeaningfulIndustryDashboardData(baseData)) return baseData;

      const groupData = getCache(`industry_bond_group_v10_${industryId}`);
      if (hasMeaningfulIndustryDashboardData(groupData)) return groupData;

      return undefined;
    })(),
  });

export const useIndustryFullDashboardQuery = (industryId: string, enabled = true) =>
  useQuery({
    queryKey: dashboardQueryKeys.industryDashboardFull(industryId),
    queryFn: () => loadIndustryBondGroupData(industryId),
    enabled,
    placeholderData: (previous) => previous,
    initialData: (() => {
      const groupData = getCache(`industry_bond_group_v10_${industryId}`);
      if (hasMeaningfulIndustryDashboardData(groupData)) return groupData;
      return undefined;
    })(),
  });

export const useSidebarIndustryIssuedValuesQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.sidebarIndustryIssuedValues(),
    queryFn: () => loadSidebarIndustryIssuedValues(),
    initialData: getCache(SIDEBAR_INDUSTRY_ISSUED_VALUES_CACHE_KEY) || undefined,
  });

export const useIndustrySymbolsQuery = () =>
  useQuery({
    queryKey: dashboardQueryKeys.industrySymbols(),
    queryFn: () => loadDedupedIndustrySymbols(),
    initialData: getCache('icb_symbol_groups_v1') || undefined,
  });

export const useBondDetailQuery = (code?: string | null, enabled = true) =>
  useQuery({
    queryKey: code ? bondQueryKeys.detail(code) : ['bond', 'detail', 'empty'],
    queryFn: () => loadBondDetail(String(code || '')),
    enabled: Boolean(code) && enabled,
    staleTime: dashboardQueryStaleTime,
  });

export const useIssuerProfileQuery = (symbol?: string | null, enabled = true) =>
  useQuery({
    queryKey: symbol ? bondQueryKeys.issuerProfile(symbol) : ['bond', 'issuer-profile', 'empty'],
    queryFn: () => loadIssuerProfile(String(symbol || '')),
    enabled: Boolean(symbol) && enabled,
    staleTime: dashboardQueryStaleTime,
  });

export const useNewsQuery = (symbol?: string | null, enabled = true) =>
  useQuery({
    queryKey: newsQueryKeys.list(symbol),
    queryFn: () => fetchNewsData(symbol),
    initialData: getCachedNews(symbol) || undefined,
    enabled,
    staleTime: 2 * 60 * 1000,
  });

interface DashboardRoutePrefetchTarget {
  activeTab?: string;
  activeIndustry?: string;
  ticker?: string | null;
  bondCode?: string | null;
}

export const prefetchDashboardRouteData = async (
  queryClient: QueryClient,
  target: DashboardRoutePrefetchTarget,
) => {
  const tasks: Array<Promise<unknown>> = [];

  if (target.bondCode) {
    const code = target.bondCode;
    tasks.push(queryClient.prefetchQuery({
      queryKey: bondQueryKeys.detail(code),
      queryFn: () => loadBondDetail(code),
    }));
  }

  switch (target.activeTab) {
    case 'industry': {
      const industryId = target.activeIndustry || 'Banking';
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.industryDashboardBase(industryId),
        queryFn: () => loadIndustryBaseBondGroupData(industryId),
      }));
      break;
    }
    case 'enterprise': {
      const symbol = String(target.ticker || '').trim();
      if (symbol) {
        tasks.push(queryClient.prefetchQuery({
          queryKey: bondQueryKeys.issuerProfile(symbol),
          queryFn: () => loadIssuerProfile(symbol),
        }));
        tasks.push(loadIssuerBondsByFilter(symbol));
      } else {
        tasks.push(loadIssuerStatsSummary(200));
        tasks.push(queryClient.prefetchQuery({
          queryKey: dashboardQueryKeys.industrySymbols(),
          queryFn: () => loadDedupedIndustrySymbols(),
        }));
      }
      break;
    }
    case 'maturity-list':
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.maturingBonds(30),
        queryFn: () => loadMaturingBonds(30),
      }));
      break;
    case 'news-list':
      tasks.push(queryClient.prefetchQuery({
        queryKey: newsQueryKeys.list(),
        queryFn: () => fetchNewsData(),
      }));
      break;
    case 'watchlist':
      tasks.push(prefetchWatchlistDetails(queryClient, getWatchlistItems()));
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.industrySymbols(),
        queryFn: () => loadDedupedIndustrySymbols(),
      }));
      break;
    case 'overview':
    default:
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.marketOverviewIssuerStats(),
        queryFn: () => loadMarketOverviewIssuerStats(),
      }));
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.marketOverviewTopInterest(),
        queryFn: () => loadMarketOverviewTopInterestData(),
      }));
      tasks.push(queryClient.prefetchQuery({
        queryKey: dashboardQueryKeys.marketOverviewIndustryData(),
        queryFn: () => loadMarketOverviewIndustryData(),
      }));
      break;
  }

  await Promise.all(tasks.map((task) => task.catch((error) => {
    console.warn('Current route prefetch failed', error);
  })));
};

export const prefetchDashboardCoreData = async (queryClient: QueryClient) => {
  const tasks = [
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.marketOverviewIssuerStats(),
      queryFn: () => loadMarketOverviewIssuerStats(),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.marketOverviewTopInterest(),
      queryFn: () => loadMarketOverviewTopInterestData(),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.marketOverviewIndustryData(),
      queryFn: () => loadMarketOverviewIndustryData(),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.maturingBonds(30),
      queryFn: () => loadMaturingBonds(30),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.maturingBonds(90),
      queryFn: () => loadMaturingBonds(90),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.maturingBonds(180),
      queryFn: () => loadMaturingBonds(180),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.maturingBonds(3650),
      queryFn: () => loadMaturingBonds(3650),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.sidebarIndustryIssuedValues(),
      queryFn: () => loadSidebarIndustryIssuedValues(),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.industrySymbols(),
      queryFn: () => loadDedupedIndustrySymbols(),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardQueryKeys.industryDashboardBase('Banking'),
      queryFn: () => loadIndustryBaseBondGroupData('Banking'),
    }),
    queryClient.prefetchQuery({
      queryKey: newsQueryKeys.list(),
      queryFn: () => fetchNewsData(),
    }),
  ];

  await Promise.all(tasks.map((task) => task.catch((error) => {
    console.warn('Dashboard prefetch failed', error);
  })));
};

export const prefetchWatchlistDetails = async (
  queryClient: QueryClient,
  items: Array<{ code?: string; ticker?: string | null; enterpriseId?: string | null }>,
) => {
  const codes = Array.from(
    new Set(items.map((item) => String(item.code || '').trim()).filter(Boolean)),
  );
  const symbols = Array.from(
    new Set(items.map((item) => String(item.ticker || item.enterpriseId || '').trim()).filter(Boolean)),
  );

  const tasks = [
    ...codes.map((code) => queryClient.prefetchQuery({
      queryKey: bondQueryKeys.detail(code),
      queryFn: () => loadBondDetail(code),
    })),
    ...symbols.map((symbol) => queryClient.prefetchQuery({
      queryKey: bondQueryKeys.issuerProfile(symbol),
      queryFn: () => loadIssuerProfile(symbol),
    })),
  ];

  await Promise.all(tasks.map((task) => task.catch((error) => {
    console.warn('Watchlist prefetch failed', error);
  })));
};
