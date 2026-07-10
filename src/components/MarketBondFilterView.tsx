import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { EyeOff, Filter, FilterX, ListOrdered, RefreshCcw, Search } from 'lucide-react';
import { Bond } from '../types';
import { useLanguage } from '../LanguageContext';
import {
  BondDataRow,
  loadBondDetailsMapByCodes,
  loadBondFilterRows,
  loadGovernmentBondRows,
  loadIssuerProfile,
  loadUnlistedEnterpriseBondRows,
} from '../services/bondData';
import {
  buildBondFilterQueryFromCriteria,
  filterBondRowsByCriteria,
  getBondFilterPresetSignature,
  sortBondRowsByCriteria,
  type AIBondSortBy,
  type AIBondFilterCriteria,
} from '../services/aiBondFilter';
import { MARKET_OVERVIEW_CACHE_KEY, type MarketOverviewPayload } from '../services/marketOverviewData';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import { getLocalizedBondType, getLocalizedInterestType } from '../utils/bondPresentation';
import { getCache, getCacheEntryAllowExpired, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import {
  buildIndustrySymbolLookup,
  resolveEnterpriseIndustryFromCandidates,
  resolveIndustryKeyFromSymbolGroups,
} from '../constants/industries';
import {
  BondFilterPanel,
  useBondFilterController,
} from './BondFilterPanel';
import { DataTable, DataTableColumn } from './ui/DataTable';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';
import { onWatchlistUpdated } from '../utils/watchlist';
import { clearViewChatContext, setViewChatContext } from '../utils/viewChatContext';

const MARKET_BOND_FETCH_FALLBACK_LIMIT = 10000;
const MARKET_BOND_VIEW_CACHE_PREFIX = 'market_bond_list_v2_';
const MARKET_BOND_BACKGROUND_REFRESH_MS = 5 * 60 * 1000;
type MarketRowSource = 'listed-market' | 'government-beta' | 'unlisted-enterprise-beta';

interface MarketBondFilterViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

const normalizeBondRateType = (row: BondDataRow) =>
  normalizeInterestType(
    row.bondRateType,
    row.raw?.interestPaymentMethod || row.raw?.paymentMethod || row.raw?.bondType || row.raw?.bondName || '',
    Array.isArray(row.raw?.cashFlows) ? row.raw.cashFlows : [],
  ) || row.bondRateType || '';

const getBondRateTypeTagClassName = (row: BondDataRow) => {
  const normalizedType = normalizeBondRateType(row).toLowerCase();

  if (normalizedType.includes('cố định') || normalizedType.includes('fixed')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (normalizedType.includes('thả nổi') || normalizedType.includes('floating')) {
    return 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300';
};

const getBondTypeTagClassName = (row: BondDataRow) => {
  const normalizedType = String(row.bondType || '').toLowerCase();

  if (normalizedType.includes('doanh nghiệp')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (normalizedType.includes('chính phủ')) {
    return 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300';
};

const getBondTypeToneClassName = (bondType: string) => {
  const normalizedType = String(bondType || '').toLowerCase();

  if (normalizedType.includes('doanh nghiệp riêng lẻ') || normalizedType.includes('private placement') || normalizedType.includes('riêng lẻ')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (normalizedType.includes('doanh nghiệp công chúng') || normalizedType.includes('public')) {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300';
  }

  if (normalizedType.includes('chính phủ')) {
    return 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300';
  }

  if (normalizedType.includes('chính quyền địa phương') || normalizedType.includes('local authority')) {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';
  }

  if (normalizedType.includes('được chính phủ bảo lãnh') || normalizedType.includes('government guaranteed')) {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300';
};

const resolveBondRateFromDetailPayload = (detailPayload: any, fallback = 0) => {
  const detail = detailPayload?.detail || detailPayload || {};
  const cashFlows = Array.isArray(detailPayload?.cashFlows)
    ? detailPayload.cashFlows
    : Array.isArray(detail?.cashFlows)
      ? detail.cashFlows
      : [];
  const cashFlowRate = cashFlows.find((cashFlow: any) => Number(cashFlow?.bondRate) > 0)?.bondRate;
  const candidates = [
    detail?.bondRate,
    detail?.BondRate,
    detail?.interestRate,
    detail?.InterestRate,
    detail?.couponRate,
    detail?.CouponRate,
    cashFlowRate,
    fallback,
  ];

  for (const candidate of candidates) {
    const rate = Number(candidate);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }

  return 0;
};

const resolveInitialMarketBondFetchLimit = () => {
  const cachedOverview = (getCache(MARKET_OVERVIEW_CACHE_KEY) || getCache('market_overview')) as MarketOverviewPayload | null;
  const marketBondCount = Array.isArray(cachedOverview?.industryData)
    ? cachedOverview.industryData.reduce((total, item) => total + Number(item?.bondCount || 0), 0)
    : 0;

  if (marketBondCount > 0) {
    return Math.max(marketBondCount + 100, MARKET_BOND_FETCH_FALLBACK_LIMIT);
  }

  return MARKET_BOND_FETCH_FALLBACK_LIMIT;
};

const buildViewCacheKey = (prefix: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));
  return `${prefix}${JSON.stringify(entries)}`;
};

const toBondModel = (row: BondDataRow): Bond => ({
  id: row.bondCode,
  code: row.bondCode,
  enterpriseId: row.issuerSymbol,
  term: String(row.tenorPeriod || ''),
  interestRate: row.bondRate || 0,
  listedVolume: row.currentListedVolume || 0,
  issuedValue: (row.totalIssuedValue || 0) / 1000000000,
  listedValue: (row.currentListedValue || 0) / 1000000000,
  issueDate: row.issueDate || '',
  maturityDate: row.maturityDate || '',
  interestType: normalizeBondRateType(row),
  status: row.status || '',
});

const mergeRowWithBondDetail = (row: BondDataRow, detailPayload: any): BondDataRow => {
  const detail = detailPayload?.detail || detailPayload || {};
  const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;
  const issuerName = String(detail?.issuerName || detail?.IssuerName || row.issuerName || row.issuerSymbol || '').trim();
  const issuerSymbol = String(detail?.issuerSymbol || detail?.IssuerSymbol || row.issuerSymbol || '').trim();
  const bondType = String(detail?.bondType || detail?.BondType || row.bondType || '').trim();
  const currentListedVolume = row.currentListedVolume > 0
    ? row.currentListedVolume
    : Number(detail?.currentListedVolume || detail?.CurrentListedVolume || historyItem?.volume || 0);
  const currentListedValue = row.currentListedValue > 0
    ? row.currentListedValue
    : Number(detail?.currentListedValue || detail?.CurrentListedValue || historyItem?.value || 0);
  const totalIssuedValue = row.totalIssuedValue > 0
    ? row.totalIssuedValue
    : Number(detail?.totalIssuedValue || detail?.TotalIssuedValue || historyItem?.value || 0);
  const bondRate = row.bondRate > 0 ? row.bondRate : resolveBondRateFromDetailPayload(detailPayload, row.bondRate);
  const bondRateType = String(
    detail?.bondRateType ||
    detail?.BondRateType ||
    detail?.interestRateType ||
    detail?.InterestRateType ||
    detail?.couponRateType ||
    detail?.CouponRateType ||
    detail?.interestType ||
    row.bondRateType ||
    '',
  ).trim();
  const industry = resolveEnterpriseIndustryFromCandidates(
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
    issuerName,
    issuerSymbol,
    row.industry,
  );

  return {
    ...row,
    issuerName,
    bondType,
    industry,
    bondRate,
    bondRateType,
    currentListedVolume,
    currentListedValue,
    totalIssuedValue,
    raw: {
      ...row.raw,
      ...detailPayload,
      ...detail,
      issuerName,
      bondType,
      industry,
      bondRate,
      bondRateType,
      cashFlows: Array.isArray(detailPayload?.cashFlows) ? detailPayload.cashFlows : row.raw?.cashFlows,
      interestPaymentMethod: detail?.interestPaymentMethod || detail?.paymentMethod || row.raw?.interestPaymentMethod,
      detail,
    },
  };
};

const mergeRowWithIssuerProfile = (row: BondDataRow, issuerProfile: any): BondDataRow => {
  const issuerName = String(
    issuerProfile?.name ||
    issuerProfile?.companyName ||
    issuerProfile?.internationalName ||
    row.issuerName ||
    row.issuerSymbol ||
    '',
  ).trim();
  const industry = resolveEnterpriseIndustryFromCandidates(
    issuerProfile?.icbNameLv2,
    issuerProfile?.ICBNameLv2,
    issuerProfile?.icbNameLv1,
    issuerProfile?.ICBNameLv1,
    issuerProfile?.industryName,
    issuerProfile?.IndustryName,
    issuerProfile?.industry,
    issuerProfile?.Industry,
    issuerProfile?.icbName,
    issuerProfile?.ICBName,
    issuerProfile?.icbCode,
    issuerProfile?.ICBCode,
    issuerName,
    row.issuerSymbol,
    row.industry,
  );

  return {
    ...row,
    issuerName,
    industry,
    raw: {
      ...row.raw,
      issuerName,
      industry,
      issuerProfile,
    },
  };
};

const getRowSource = (row: BondDataRow): MarketRowSource | undefined => {
  const value = row.raw?._marketSource;
  return value === 'listed-market' || value === 'government-beta' || value === 'unlisted-enterprise-beta'
    ? value
    : undefined;
};

const shouldHideIndustryDisplay = (row: BondDataRow) => {
  const source = getRowSource(row);
  return source === 'government-beta' || source === 'unlisted-enterprise-beta';
};

const withMarketSource = (rows: BondDataRow[], source: MarketRowSource) =>
  rows.map((row) => ({
    ...row,
    raw: {
      ...row.raw,
      _marketSource: source,
    },
  }));

const resolveTableSort = (
  sortBy?: AIBondSortBy,
  secondarySorts: AIBondSortBy[] = [],
): { columnId: string; direction: 'asc' | 'desc' } | null => {
  if (secondarySorts.length > 0) {
    return null;
  }

  if (sortBy === undefined) {
    return { columnId: 'maturityDate', direction: 'asc' };
  }

  switch (sortBy) {
    case 1:
      return { columnId: 'bondCode', direction: 'asc' };
    case 3:
      return { columnId: 'totalIssuedValue', direction: 'desc' };
    case 4:
      return { columnId: 'maturityDate', direction: 'asc' };
    case 5:
      return { columnId: 'issueDate', direction: 'desc' };
    case 6:
      return { columnId: 'bondRate', direction: 'desc' };
    case 7:
      return { columnId: 'currentListedVolume', direction: 'desc' };
    case 8:
      return { columnId: 'currentListedValue', direction: 'desc' };
    default:
      return null;
  }
};

export default function MarketBondFilterView({
  setSelectedBond,
  setBondEnterpriseName,
}: MarketBondFilterViewProps) {
  const { t, language } = useLanguage();
  const location = useLocation();
  const enterpriseList = useMemo(
    () => (getCache('enterprise_list') || []) as Array<{ ticker?: string; industry?: string }>,
    [],
  );
  const [rows, setRows] = useState<BondDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleBondCodes, setVisibleBondCodes] = useState<string[]>([]);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [columnVisibilityDraft, setColumnVisibilityDraft] = useState<string[]>([]);
  const [isColumnVisibilityOpen, setIsColumnVisibilityOpen] = useState(false);
  const [isFilterControlsVisible, setIsFilterControlsVisible] = useState(false);
  const [industrySymbolLookup, setIndustrySymbolLookup] = useState<Map<string, string>>(new Map());
  const [watchlistVersion, setWatchlistVersion] = useState(0);
  const initialFetchLimit = useMemo(() => resolveInitialMarketBondFetchLimit(), []);
  const presetSignatureRef = useRef('');
  const columnVisibilityRef = useRef<HTMLDivElement | null>(null);
  const enterpriseIndustryBySymbol = useMemo(
    () => new Map(
      enterpriseList
        .map((item) => {
          const ticker = String(item?.ticker || '').trim();
          const industry = resolveEnterpriseIndustryFromCandidates(item?.industry);
          return ticker && industry ? [ticker, industry] as const : null;
        })
        .filter((item): item is readonly [string, string] => Boolean(item)),
    ),
    [enterpriseList],
  );

  const resolveRowIndustry = (row: BondDataRow) => resolveEnterpriseIndustryFromCandidates(
    row.industry,
    row.issuerName,
    row.issuerSymbol,
    row.raw?.issuerProfile?.icbNameLv2,
    row.raw?.issuerProfile?.ICBNameLv2,
    row.raw?.issuerProfile?.icbNameLv1,
    row.raw?.issuerProfile?.ICBNameLv1,
    row.raw?.issuerProfile?.industryName,
    row.raw?.issuerProfile?.IndustryName,
    row.raw?.issuerProfile?.industry,
    row.raw?.issuerProfile?.Industry,
    row.raw?.issuerProfile?.icbName,
    row.raw?.issuerProfile?.ICBName,
    row.raw?.issuerProfile?.icbCode,
    row.raw?.issuerProfile?.ICBCode,
    row.raw?.infoObj?.icbNameLv2,
    row.raw?.infoObj?.icbNameLv1,
    row.raw?.infoObj?.icbCode,
    row.raw?.industryName,
    row.raw?.IndustryName,
    row.raw?.icbNameLv2,
    row.raw?.ICBNameLv2,
    row.raw?.icbNameLv1,
    row.raw?.ICBNameLv1,
  );

  const resolveMappedIndustry = (row: BondDataRow) => resolveEnterpriseIndustryFromCandidates(
    resolveIndustryKeyFromSymbolGroups(
      row.issuerSymbol,
      industrySymbolLookup,
      enterpriseIndustryBySymbol.get(String(row.issuerSymbol || '').trim()),
      row.issuerName,
      row.issuerSymbol,
      row.raw?.infoObj?.icbNameLv2,
      row.raw?.infoObj?.icbNameLv1,
      row.raw?.infoObj?.icbCode,
      row.raw?.industryName,
    ),
    enterpriseIndustryBySymbol.get(String(row.issuerSymbol || '').trim()),
  );

  const resolveDisplayedIndustry = (row: BondDataRow) => {
    if (shouldHideIndustryDisplay(row)) {
      return '';
    }

    const source = getRowSource(row);

    const directIndustry = resolveRowIndustry(row);

    if (source === 'listed-market') {
      return resolveMappedIndustry(row) || directIndustry;
    }

    return directIndustry || resolveMappedIndustry(row);
  };
  const getDisplayedIssuerName = (row: BondDataRow) => {
    const fallbackName = row.issuerName || row.issuerSymbol || t('none');
    const internationalName = String(row.raw?.issuerProfile?.internationalName || '').trim();
    if (language === 'en' && internationalName) return internationalName;
    return String(t(fallbackName as any, row.issuerSymbol) || fallbackName).trim();
  };

  const rateTypeOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => normalizeBondRateType(row)).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [rows]);

  const issuerOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.issuerName || row.issuerSymbol).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [rows]);

  const bondTypeOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.bondType).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [rows]);

  const industryOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.industry).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [rows]);

  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    appliedCriteria,
    aiPrompt,
    setAiPrompt,
    aiSummary,
    setAiSummary,
    aiError,
    setAiError,
    isApplyingAIFilter,
    isLoadingStatus,
    aiPromptSuggestions,
    showPromptSuggestions,
    applyDraftFilters,
    resetFilters,
    applyCriteriaPreset,
    applyAIFilter,
  } = useBondFilterController({
    rateTypeOptions,
    issuerOptions,
    bondTypeOptions,
    industryOptions,
  });
  const marketBondQuery = useMemo(
    () => buildBondFilterQueryFromCriteria({}, {
      statusID: 1,
      isListing: 1,
      top: initialFetchLimit,
    }),
    [initialFetchLimit],
  );
  const marketBondCacheKey = useMemo(
    () => buildViewCacheKey(MARKET_BOND_VIEW_CACHE_PREFIX, marketBondQuery as Record<string, unknown>),
    [marketBondQuery],
  );

  useEffect(() => {
    let cancelled = false;

    const loadIndustryLookup = async () => {
      try {
        const symbolGroups = await loadDedupedIndustrySymbols();
        if (cancelled) return;
        setIndustrySymbolLookup(buildIndustrySymbolLookup(symbolGroups));
      } catch (lookupError) {
        if (!cancelled) {
          console.warn('Failed to load industry symbol lookup for market bonds', lookupError);
        }
      }
    };

    void loadIndustryLookup();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      const cachedEntry = getCacheEntryAllowExpired<BondDataRow[]>(marketBondCacheKey);
      const cachedRows = Array.isArray(cachedEntry?.data) ? cachedEntry.data : [];
      const hasCachedRows = cachedRows.length > 0;
      const shouldRefresh = !cachedEntry || Date.now() - cachedEntry.timestamp > MARKET_BOND_BACKGROUND_REFRESH_MS;

      if (hasCachedRows) {
        setRows(cachedRows);
      }

      setLoading(!hasCachedRows);
      setError(null);

      if (!shouldRefresh) {
        return;
      }

      try {
        const [marketRows, governmentRows, unlistedEnterpriseRows] = await Promise.all([
          loadBondFilterRows(marketBondQuery, {
            enrichWithDetails: false,
            forceRefresh: hasCachedRows,
          }),
          loadGovernmentBondRows({ forceRefresh: hasCachedRows }),
          loadUnlistedEnterpriseBondRows({ forceRefresh: hasCachedRows }),
        ]);

        if (!cancelled) {
          const mergedRows = Array.from(
            new Map(
              [
                ...withMarketSource(marketRows, 'listed-market'),
                ...withMarketSource(governmentRows, 'government-beta'),
                ...withMarketSource(unlistedEnterpriseRows, 'unlisted-enterprise-beta'),
              ].map((row) => [row.bondCode, row]),
          ).values(),
          ).map((row) => ({
            ...row,
            industry: resolveDisplayedIndustry(row),
          }));
          setRows(mergedRows);
          setCache(marketBondCacheKey, mergedRows);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error('Failed to load market bond filter data', requestError);
          if (!hasCachedRows) {
            setRows([]);
            setError(requestError instanceof Error ? requestError.message : t('error'));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [enterpriseIndustryBySymbol, industrySymbolLookup, marketBondCacheKey, marketBondQuery, t]);

  useEffect(() => {
    const preset = (
      location.state as {
        aiBondFilterPreset?: {
          criteria?: AIBondFilterCriteria;
          prompt?: string;
          summary?: string[];
        };
      } | null
    )?.aiBondFilterPreset;
    if (!preset?.criteria) return;

    const signature = getBondFilterPresetSignature(preset.criteria);
    if (!signature || presetSignatureRef.current === signature) return;

    presetSignatureRef.current = signature;
    applyCriteriaPreset(preset.criteria, preset.prompt, preset.summary);
  }, [applyCriteriaPreset, location.state]);

  useEffect(() => {
    let cancelled = false;

    const hydrateVisibleRows = async () => {
      if (visibleBondCodes.length === 0) return;

      const candidateRows = visibleBondCodes
        .map((code) => rows.find((row) => row.bondCode === code))
        .filter((row): row is BondDataRow => Boolean(row));
      const codesNeedingDetails = candidateRows
        .filter((row) => !row.raw?.detail)
        .map((row) => row.bondCode);
      const symbolsNeedingProfiles = Array.from(
        new Set(
          candidateRows
            .filter((row) => row.issuerSymbol && !row.raw?.issuerProfile && !shouldHideIndustryDisplay(row) && !resolveDisplayedIndustry(row))
            .map((row) => String(row.issuerSymbol || '').trim())
            .filter(Boolean),
        ),
      );

      if (codesNeedingDetails.length === 0 && symbolsNeedingProfiles.length === 0) return;

      try {
        const [detailMap, profileEntries] = await Promise.all([
          codesNeedingDetails.length > 0
            ? loadBondDetailsMapByCodes(codesNeedingDetails, {
                concurrency: 6,
                forceRefresh: false,
              })
            : Promise.resolve({} as Record<string, any>),
          symbolsNeedingProfiles.length > 0
            ? mapWithConcurrency(symbolsNeedingProfiles, 5, async (symbol) => [symbol, await loadIssuerProfile(symbol)] as const)
            : Promise.resolve([] as PromiseSettledResult<readonly [string, any]>[]),
        ]);

        if (cancelled) return;

        const profileMap = new Map<string, any>(
          getFulfilledValues(profileEntries).filter((entry): entry is readonly [string, any] => Boolean(entry[1])),
        );

        setRows((currentRows) => {
          const nextRows = currentRows.map((row) => {
            let mergedRow = row;
            const detailPayload = detailMap[row.bondCode];
            if (detailPayload) {
              mergedRow = mergeRowWithBondDetail(mergedRow, detailPayload);
            }

            const issuerProfile = profileMap.get(String(mergedRow.issuerSymbol || '').trim());
            if (issuerProfile) {
              mergedRow = mergeRowWithIssuerProfile(mergedRow, issuerProfile);
            }

            return {
              ...mergedRow,
              industry: resolveDisplayedIndustry(mergedRow),
            };
          });
          setCache(marketBondCacheKey, nextRows);
          return nextRows;
        });
      } catch (detailError) {
        if (!cancelled) {
          console.warn('Failed to hydrate visible market bond rows', detailError);
        }
      }
    };

    void hydrateVisibleRows();

    return () => {
      cancelled = true;
    };
  }, [marketBondCacheKey, rows, visibleBondCodes]);

  const filteredRows = useMemo(() => {
      const manuallyFilteredRows = filterBondRowsByCriteria(rows, appliedCriteria).filter((row) => {
        const searchTerm = appliedFilters.searchTerm.trim().toLowerCase();
        if (searchTerm) {
          const haystack = [
            row.bondCode,
            getDisplayedIssuerName(row),
            row.issuerSymbol,
            getLocalizedBondType(row.bondType, language),
            getLocalizedInterestType(normalizeBondRateType(row), t),
            resolveDisplayedIndustry(row) ? (t(resolveDisplayedIndustry(row) as any) || resolveDisplayedIndustry(row)) : '',
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    return sortBondRowsByCriteria(manuallyFilteredRows, appliedCriteria);
  }, [
    appliedCriteria,
    appliedFilters.searchTerm,
    language,
    rows,
    t,
  ]);

  const tableInitialSort = useMemo(
    () => resolveTableSort(appliedCriteria.sortBy, appliedCriteria.secondarySorts || []),
    [appliedCriteria.secondarySorts, appliedCriteria.sortBy],
  );

  const marketBondChatContext = useMemo(() => {
    const highestRateRows = [...filteredRows]
      .sort((left, right) => Number(right.bondRate || 0) - Number(left.bondRate || 0))
      .slice(0, 10);
    const earliestMaturityRows = [...filteredRows]
      .sort((left, right) => {
        const leftTs = parseDateToTimestamp(left.maturityDate) ?? Number.MAX_SAFE_INTEGER;
        const rightTs = parseDateToTimestamp(right.maturityDate) ?? Number.MAX_SAFE_INTEGER;
        return leftTs - rightTs;
      })
      .slice(0, 10);
    const industryBreakdown = Array.from(
      filteredRows.reduce((accumulator, row) => {
        const key = String(resolveDisplayedIndustry(row) || 'Chưa phân loại').trim();
        accumulator.set(key, (accumulator.get(key) || 0) + 1);
        return accumulator;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([industry, count]) => ({ industry, bondCount: count }));
    const interestTypeBreakdown = Array.from(
      filteredRows.reduce((accumulator, row) => {
        const key = String(normalizeBondRateType(row) || 'Khác').trim();
        accumulator.set(key, (accumulator.get(key) || 0) + 1);
        return accumulator;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, bondCount: count }));

    return {
      label: 'Danh sách trái phiếu toàn thị trường',
      dataset: {
        route: location.pathname,
        page: 'market-bond-list',
        title: 'Danh sách trái phiếu toàn thị trường',
        filters: {
          ...appliedFilters,
          ...appliedCriteria,
          aiSummary,
          aiPrompt,
        },
        summary: {
          totalRows: rows.length,
          filteredRows: filteredRows.length,
          loading,
          error,
        },
        bonds: filteredRows.slice(0, 1000).map((row) => ({
          bondCode: row.bondCode,
          issuerName: row.issuerName || row.issuerSymbol,
          issuerSymbol: row.issuerSymbol,
          industry: resolveDisplayedIndustry(row),
          bondType: row.bondType || '',
          interestType: normalizeBondRateType(row),
          interestRate: Number(row.bondRate || 0),
          issueDate: row.issueDate,
          maturityDate: row.maturityDate,
          issuedValueBillion: Number(((row.totalIssuedValue || 0) / 1_000_000_000).toFixed(2)),
          listedValueBillion: Number(((row.currentListedValue || 0) / 1_000_000_000).toFixed(2)),
        })),
        highestInterestRates: highestRateRows.map((row) => ({
          bondCode: row.bondCode,
          issuerSymbol: row.issuerSymbol,
          interestRate: Number(Number(row.bondRate || 0).toFixed(2)),
        })),
        earliestMaturities: earliestMaturityRows.map((row) => ({
          bondCode: row.bondCode,
          issuerSymbol: row.issuerSymbol,
          maturityDate: row.maturityDate,
          listedValueBillion: Number(((row.currentListedValue || 0) / 1_000_000_000).toFixed(2)),
        })),
        industryBreakdown,
        interestTypeBreakdown,
      },
    };
  }, [aiPrompt, aiSummary, appliedCriteria, appliedFilters, error, filteredRows, loading, location.pathname, rows]);

  useEffect(() => {
    setViewChatContext({
      routePathname: location.pathname,
      label: marketBondChatContext.label,
      dataset: marketBondChatContext.dataset,
      updatedAt: new Date().toISOString(),
    });

    return () => {
      clearViewChatContext(location.pathname);
    };
  }, [location.pathname, marketBondChatContext]);

  const columns = useMemo<DataTableColumn<BondDataRow>[]>(() => ([
    {
      id: 'order',
      header: <ListOrdered className="h-4 w-4" aria-hidden="true" />,
      align: 'center',
      widthClassName: 'w-12',
      cell: (_row, index) => index + 1,
    },
    {
      id: 'bondCode',
      header: t('bondCode'),
      accessor: (row) => row.bondCode,
      sortable: true,
      widthClassName: 'w-36',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setBondEnterpriseName(row.issuerName || row.issuerSymbol || '');
              setSelectedBond(toBondModel(row));
            }}
            className="min-w-0 truncate font-bold text-text-highlight transition-colors hover:text-blue-600 group-hover:text-blue-600"
          >
            {row.bondCode}
          </button>
        </div>
      ),
    },
    {
      id: 'issuerName',
      header: t('issuer'),
      accessor: (row) => getDisplayedIssuerName(row),
      sortable: true,
      widthClassName: 'w-96',
      cell: (row) => {
        const issuerName = getDisplayedIssuerName(row);
        const industry = resolveDisplayedIndustry(row);
        const industryLabel = industry ? (t(industry as any) || industry) : '';

        return (
          <div className="min-w-0 whitespace-normal break-words leading-5 transition-colors group-hover:text-blue-600">
            <div>{issuerName}</div>
            {industryLabel ? (
              <div className="mt-1 text-xs font-semibold text-text-muted transition-colors group-hover:text-blue-600">
                {industryLabel}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'bondType',
      header: t('bondTypeLabel'),
      accessor: (row) => getLocalizedBondType(row.bondType, language),
      sortable: true,
      widthClassName: 'w-60',
      cell: (row) => (
        <div className="min-w-0 whitespace-normal break-words leading-5 transition-colors group-hover:text-blue-600">
          {getLocalizedBondType(row.bondType, language) || t('none')}
        </div>
      ),
    },
    {
      id: 'tenorPeriod',
      header: t('term'),
      unit: `(${t('monthUnit')})`,
      accessor: (row) => row.tenorPeriod || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-24',
      cell: (row) => formatNumber(row.tenorPeriod || 0, 0),
    },
    {
      id: 'issueDate',
      header: t('issueDate'),
      accessor: (row) => parseDateToTimestamp(row.issueDate) || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-36',
      cell: (row) => formatDate(row.issueDate),
    },
    {
      id: 'maturityDate',
      header: t('maturityDate'),
      accessor: (row) => parseDateToTimestamp(row.maturityDate) || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-36',
      cell: (row) => formatDate(row.maturityDate),
    },
    {
      id: 'bondRate',
      header: t('interestRate'),
      unit: `(${t('unitPercentLabel')})`,
      accessor: (row) => row.bondRate || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-24',
      cell: (row) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          {formatInterestRate(row.bondRate)}
        </span>
      ),
    },
    {
      id: 'bondRateType',
      header: t('interestType'),
      accessor: (row) => getLocalizedInterestType(normalizeBondRateType(row), t),
      sortable: true,
      align: 'center',
      widthClassName: 'w-32',
      cell: (row) => getLocalizedInterestType(normalizeBondRateType(row), t) || t('none'),
    },
    {
      id: 'currentListedVolume',
      header: t('listedVolume'),
      accessor: (row) => row.currentListedVolume || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber(row.currentListedVolume || 0, 0),
    },
    {
      id: 'totalIssuedValue',
      header: t('issuedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.totalIssuedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber((row.totalIssuedValue || 0) / 1000000000, 2),
    },
    {
      id: 'currentListedValue',
      header: t('listedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.currentListedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber((row.currentListedValue || 0) / 1000000000, 2),
    },
  ]), [language, setBondEnterpriseName, setSelectedBond, t, watchlistVersion]);

  const columnVisibilityOptions = useMemo(
    () => columns.filter((column) => column.id !== 'order').map((column) => ({
      id: column.id,
      label: typeof column.header === 'string' ? column.header : t(column.id as any),
    })),
    [columns, t],
  );

  useEffect(() => {
    if (!isColumnVisibilityOpen) return undefined;

    setColumnVisibilityDraft(hiddenColumnIds);

    const handlePointerDown = (event: MouseEvent) => {
      if (!columnVisibilityRef.current) return;
      if (columnVisibilityRef.current.contains(event.target as Node)) return;
      setIsColumnVisibilityOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsColumnVisibilityOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [hiddenColumnIds, isColumnVisibilityOpen]);

  useEffect(() => onWatchlistUpdated(() => {
    setWatchlistVersion((value) => value + 1);
  }), []);

  return (
    <div className="min-w-0 space-y-2 pt-2 transition-colors duration-300 md:pt-3">
      <BondFilterPanel
        title={t('marketBondList')}
        resultCount={filteredRows.length}
        totalCount={rows.length}
        draftFilters={draftFilters}
        setDraftFilters={setDraftFilters}
        rateTypeOptions={rateTypeOptions}
        aiPrompt={aiPrompt}
        setAiPrompt={setAiPrompt}
        aiSummary={aiSummary}
        setAiSummary={setAiSummary}
        aiError={aiError}
        setAiError={setAiError}
        isApplyingAIFilter={isApplyingAIFilter}
        isLoadingStatus={isLoadingStatus}
        aiPromptSuggestions={aiPromptSuggestions}
        showPromptSuggestions={showPromptSuggestions}
        onApply={applyDraftFilters}
        onReset={resetFilters}
        onApplyAI={applyAIFilter}
        variant="market"
        issuerOptions={issuerOptions}
        bondTypeOptions={bondTypeOptions}
        industryOptions={industryOptions}
        searchOptions={rows.map((row) => row.bondCode)}
        showFilterControls={isFilterControlsVisible}
        marketActionSlot={(
          <div ref={columnVisibilityRef} className={isColumnVisibilityOpen ? 'relative z-40 ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:gap-2' : 'relative ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:gap-2'}>
            <button
              type="button"
              onClick={applyDraftFilters}
              className="inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:px-2.5"
              aria-label={t('applyFilters')}
              title={t('applyFilters')}
            >
              <Search className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="hidden xl:inline">{t('applyFilters')}</span>
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:px-2.5"
              aria-label={t('reset')}
              title={t('reset')}
            >
              <RefreshCcw className="h-4 w-4 text-blue-600" />
              <span className="hidden xl:inline">{t('reset')}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFilterControlsVisible((current) => !current)}
              className="inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:px-2.5"
              aria-label={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
              title={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
            >
              {isFilterControlsVisible ? <FilterX className="h-4 w-4 text-blue-600" /> : <Filter className="h-4 w-4 text-blue-600" />}
              <span className="hidden xl:inline">{t('filterTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsColumnVisibilityOpen((current) => !current)}
              className="inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:px-2.5"
              aria-haspopup="dialog"
              aria-expanded={isColumnVisibilityOpen}
              aria-label={t('hideColumns')}
              title={t('hideColumns')}
            >
              <EyeOff className="h-4 w-4 text-blue-600" />
              <span className="hidden xl:inline">{t('hideColumns')}</span>
            </button>

            {isColumnVisibilityOpen ? (
              <div className="absolute right-0 top-full z-50 mt-3 w-96 max-w-none rounded-lg border border-border-base bg-bg-surface p-4 shadow-xl shadow-blue-950/10">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
                  <EyeOff className="h-4 w-4 text-blue-600" />
                  <span>{t('hideColumns')}</span>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {columnVisibilityOptions.map((column) => {
                    const checked = columnVisibilityDraft.includes(column.id);

                    return (
                      <label
                        key={column.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-base transition-colors hover:bg-surface-container-low"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setColumnVisibilityDraft((current) => (
                              current.includes(column.id)
                                ? current.filter((item) => item !== column.id)
                                : [...current, column.id]
                            ));
                          }}
                          className="h-4 w-4 rounded border-border-base text-blue-600 focus:ring-blue-400"
                        />
                        <span className="truncate">{column.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHiddenColumnIds(columnVisibilityDraft);
                      setIsColumnVisibilityOpen(false);
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    {t('hideColumns')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHiddenColumnIds([]);
                      setColumnVisibilityDraft([]);
                      setIsColumnVisibilityOpen(false);
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
                  >
                    {t('reset')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      />

      {loading ? (
        <div className="rounded-lg border border-border-base bg-bg-surface px-4 py-10 text-center text-sm font-medium text-text-muted shadow-md shadow-blue-950/5 dark:shadow-black/20">
          {t('loadingBondsMessage')}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center text-sm font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : (
      <DataTable
        rows={filteredRows}
        columns={columns}
        getRowKey={(row) => row.bondCode}
        persistKey="market-bond-list"
        pageSize={10}
        initialSort={tableInitialSort}
        emptyState={t('noData')}
        noColumnsState={t('noColumnsSelected')}
        hiddenColumnIds={hiddenColumnIds}
        onRowClick={(row) => {
          setBondEnterpriseName(row.issuerName || row.issuerSymbol || '');
          setSelectedBond(toBondModel(row));
        }}
        onVisibleRowsChange={(nextVisibleRows) => {
          const nextCodes = nextVisibleRows.map((row) => row.bondCode);
          setVisibleBondCodes((currentCodes) => (
            currentCodes.length === nextCodes.length
            && currentCodes.every((code, index) => code === nextCodes[index])
            ) ? currentCodes : nextCodes);
          }}
        />
      )}
    </div>
  );
}
