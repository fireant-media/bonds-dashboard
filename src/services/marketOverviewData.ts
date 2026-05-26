import { fireantApi } from '../api/fireant';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { loadIndustryBaseBondGroupData, loadIssuerStatsSummary } from './industryBondData';

export interface TopDebtIssuer {
  issuerName: string;
  issuerSymbol: string;
  totalIssuedValue: number;
  totalRemainingDebt: number;
  bondCount: number;
}

export interface IndustryData {
  icbName: string;
  totalCurrentListedValue: number;
  totalRemainingDebt: number;
  bondCount: number;
  totalIssuedVolume: number;
  totalCurrentListedVolume: number;
}

export interface MarketOverviewPayload {
  topDebtData: TopDebtIssuer[];
  issuerStatsData: TopDebtIssuer[];
  topInterestData: any[];
  industryData: IndustryData[];
}

export const MARKET_OVERVIEW_CACHE_KEY = 'market_overview';
export const MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY = 'market_overview_issuer_stats';
export const MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY = 'market_overview_top_interest';
export const MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY = 'market_overview_industry_data';

let marketOverviewPromise: Promise<MarketOverviewPayload> | null = null;
let marketIssuerStatsPromise: Promise<TopDebtIssuer[]> | null = null;
let marketTopInterestPromise: Promise<any[]> | null = null;
let marketIndustryDataPromise: Promise<IndustryData[]> | null = null;

const normalizeIndustryData = (industry: any): IndustryData => ({
  icbName: String(industry?.icbName || ''),
  totalCurrentListedValue: Number(industry?.totalCurrentListedValue || 0),
  totalRemainingDebt: Number(industry?.totalRemainingDebt || 0),
  bondCount: Number(industry?.bondCount || 0),
  totalIssuedVolume: Number(industry?.totalIssuedVolume || 0),
  totalCurrentListedVolume: Number(industry?.totalCurrentListedVolume || 0),
});

export const loadMarketOverviewIssuerStats = async (forceRefresh = false): Promise<TopDebtIssuer[]> => {
  const cached = forceRefresh ? null : getCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY);
  if (cached) return cached as TopDebtIssuer[];
  if (marketIssuerStatsPromise) return marketIssuerStatsPromise;

  marketIssuerStatsPromise = loadIssuerStatsSummary(200, forceRefresh)
    .then((rows) => {
      const data = Array.isArray(rows) ? rows : [];
      setCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY, data);
      return data;
    })
    .finally(() => {
      marketIssuerStatsPromise = null;
    });

  return marketIssuerStatsPromise;
};

export const loadMarketOverviewTopInterestData = async (forceRefresh = false): Promise<any[]> => {
  const cached = forceRefresh ? null : getCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY);
  if (cached) return cached as any[];
  if (marketTopInterestPromise) return marketTopInterestPromise;

  marketTopInterestPromise = fireantApi.getHighYieldBonds(10)
    .then((rows) => {
      const data = Array.isArray(rows) ? rows : [];
      setCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY, data);
      return data;
    })
    .finally(() => {
      marketTopInterestPromise = null;
    });

  return marketTopInterestPromise;
};

export const loadMarketOverviewIndustryData = async (forceRefresh = false): Promise<IndustryData[]> => {
  const cached = forceRefresh ? null : getCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY);
  if (cached) return cached as IndustryData[];
  if (marketIndustryDataPromise) return marketIndustryDataPromise;

  marketIndustryDataPromise = mapWithConcurrency(
    INDUSTRY_NAV_ITEMS.filter((item) => item.statsLevel === 1),
    3,
    async (item) => {
      const data = await loadIndustryBaseBondGroupData(item.id, forceRefresh);
      return normalizeIndustryData(data.industryStats);
    },
  )
    .then((settled) => getFulfilledValues(settled))
    .then((data) => {
      setCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY, data);
      return data;
    })
    .finally(() => {
      marketIndustryDataPromise = null;
    });

  return marketIndustryDataPromise;
};

export const loadMarketOverviewData = async (forceRefresh = false): Promise<MarketOverviewPayload> => {
  const cachedOverview = forceRefresh ? null : getCache(MARKET_OVERVIEW_CACHE_KEY);
  if (cachedOverview) return cachedOverview;

  if (!marketOverviewPromise) {
    marketOverviewPromise = (async () => {
      const [issuerStatsRaw, highYieldRaw, industriesRaw] = await Promise.all([
        loadMarketOverviewIssuerStats(forceRefresh).catch((error) => {
          console.error('Issuer stats fetch error', error);
          return [];
        }),
        loadMarketOverviewTopInterestData(forceRefresh).catch((error) => {
          console.error('Interest fetch error', error);
          return [];
        }),
        loadMarketOverviewIndustryData(forceRefresh).catch((error) => {
          console.error('Industry fetch error', error);
          return [];
        }),
      ]);

      const issuerStatsData = Array.isArray(issuerStatsRaw) ? issuerStatsRaw : [];
      const payload: MarketOverviewPayload = {
        topDebtData: issuerStatsData.slice(0, 10),
        issuerStatsData,
        topInterestData: Array.isArray(highYieldRaw) ? highYieldRaw : [],
        industryData: Array.isArray(industriesRaw) ? industriesRaw : [],
      };

      setCache(MARKET_OVERVIEW_CACHE_KEY, payload);
      return payload;
    })().finally(() => {
      marketOverviewPromise = null;
    });
  }

  return marketOverviewPromise;
};
