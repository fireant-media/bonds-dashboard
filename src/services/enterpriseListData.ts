import type { Enterprise } from '../types';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import {
  buildIndustrySymbolLookup,
  resolveIndustryKeyFromSymbolGroups,
} from '../constants/industries';
import { loadDedupedIndustrySymbols, loadIssuerStatsSummary } from './industryBondData';
import { loadIssuerProfile } from './bondData';

export const ENTERPRISE_LIST_CACHE_KEY = 'enterprise_list';
export const ENTERPRISE_LIST_DATA_CACHE_KEY = 'enterprise_list_by_symbol_v6';
const ENTERPRISE_LIST_FETCH_LIMIT = 2000;

const inflightRequests = new Map<string, Promise<Enterprise[]>>();

const toBillion = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric / 1_000_000_000 : 0;
};

const readEnterpriseListCache = (key: string) => {
  const cached = getCache(key);
  return Array.isArray(cached) && cached.length > 0 ? cached as Enterprise[] : null;
};

export const loadEnterpriseListByIssuerSymbol = async (forceRefresh = false): Promise<Enterprise[]> => {
  const cacheKey = forceRefresh ? `${ENTERPRISE_LIST_DATA_CACHE_KEY}_refresh` : ENTERPRISE_LIST_DATA_CACHE_KEY;
  const cached = forceRefresh ? null : readEnterpriseListCache(ENTERPRISE_LIST_DATA_CACHE_KEY);
  if (cached) return cached as Enterprise[];

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const [issuers, symbolGroups] = await Promise.all([
      loadIssuerStatsSummary(ENTERPRISE_LIST_FETCH_LIMIT, forceRefresh).catch(() => []),
      loadDedupedIndustrySymbols(forceRefresh).catch(() => ({} as Record<string, string[]>)),
    ]);

    const symbolToIndustryKey = buildIndustrySymbolLookup(symbolGroups);

    const baseEnterprises = issuers
      .map((issuer) => ({
        id: issuer.issuerSymbol,
        ticker: issuer.issuerSymbol,
        name: issuer.issuerName,
        industry: resolveIndustryKeyFromSymbolGroups(
          issuer.issuerSymbol,
          symbolToIndustryKey,
          issuer?.icbNameLv4,
          issuer?.icbNameLv3,
          issuer?.icbNameLv2,
          issuer?.icbNameLv1,
          issuer?.icbCodeLv4,
          issuer?.icbCodeLv3,
          issuer?.icbCodeLv2,
          issuer?.icbCodeLv1,
          issuer?.industryName,
          issuer?.industryId,
          issuer?.industry,
          issuer?.icbName,
          issuer?.icbCode,
        ),
        bondCount: Number(issuer.bondCount || 0),
        issuedValue: toBillion(issuer.totalIssuedValue),
        initialDebt: toBillion(issuer.totalDebtFull || issuer.totalIssuedValue),
        remainingDebt: toBillion(issuer.totalRemainingDebt),
      }))
      .filter((enterprise) => Boolean(enterprise.ticker));

    const unresolvedTickers = baseEnterprises
      .filter((enterprise) => !enterprise.industry)
      .map((enterprise) => enterprise.ticker);

    const profileIndustryByTicker = new Map<string, string>();
    if (unresolvedTickers.length > 0) {
      const profileResults = await mapWithConcurrency(
        Array.from(new Set(unresolvedTickers)),
        5,
        async (ticker) => {
          const profile = await loadIssuerProfile(ticker).catch(() => null);
          const industry = resolveIndustryKeyFromSymbolGroups(
            ticker,
            symbolToIndustryKey,
            profile?.icbNameLv4,
            profile?.icbNameLv3,
            profile?.icbNameLv2,
            profile?.icbNameLv1,
            profile?.icbCodeLv4,
            profile?.icbCodeLv3,
            profile?.icbCodeLv2,
            profile?.icbCodeLv1,
            profile?.industryName,
            profile?.industryId,
            profile?.industry,
            profile?.icbName,
            profile?.icbCode,
          );

          return industry ? [ticker, industry] as const : null;
        },
      );

      getFulfilledValues(profileResults).forEach((entry) => {
        if (!entry) return;
        profileIndustryByTicker.set(entry[0], entry[1]);
      });
    }

    const enterprises = baseEnterprises
      .map((enterprise) => ({
        ...enterprise,
        industry: enterprise.industry || profileIndustryByTicker.get(enterprise.ticker) || '',
      }))
      .sort((left, right) => {
        const remainingDiff = right.remainingDebt - left.remainingDebt;
        if (remainingDiff !== 0) return remainingDiff;
        return left.ticker.localeCompare(right.ticker);
      });

    if (enterprises.length > 0) {
      setCache(ENTERPRISE_LIST_DATA_CACHE_KEY, enterprises);
      setCache(ENTERPRISE_LIST_CACHE_KEY, enterprises);
    }
    return enterprises;
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, promise);
  return promise;
};
