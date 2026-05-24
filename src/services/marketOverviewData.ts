import { fireantApi } from '../api/fireant';
import { getCache, setCache } from '../utils/cache';
import { loadIndustryStatsByLevel, loadIssuerStatsSummary } from './industryBondData';

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

let marketOverviewPromise: Promise<MarketOverviewPayload> | null = null;

export const loadMarketOverviewData = async (forceRefresh = false): Promise<MarketOverviewPayload> => {
  const cachedOverview = forceRefresh ? null : getCache('market_overview');
  if (cachedOverview) return cachedOverview;

  if (!marketOverviewPromise) {
    marketOverviewPromise = (async () => {
      const [issuerStatsRaw, highYieldRaw, industriesRaw] = await Promise.all([
        loadIssuerStatsSummary(200, forceRefresh).catch((error) => {
          console.error('Issuer stats fetch error', error);
          return [];
        }),
        fireantApi.getHighYieldBonds(10).catch((error) => {
          console.error('Interest fetch error', error);
          return [];
        }),
        loadIndustryStatsByLevel(1, forceRefresh).catch((error) => {
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

      setCache('market_overview', payload);
      return payload;
    })().finally(() => {
      marketOverviewPromise = null;
    });
  }

  return marketOverviewPromise;
};
