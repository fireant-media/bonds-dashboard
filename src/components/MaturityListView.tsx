import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, EyeOff, Filter, FilterX, ListOrdered } from 'lucide-react';
import { Bond } from '../types';
import { useLanguage } from '../LanguageContext';
import {
  BondDataRow,
  loadBondDetailsMapByCodes,
  loadMaturingBondUniverse,
  loadIssuerProfile,
} from '../services/bondData';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';
import { getCache, getCacheEntryAllowExpired, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import {
  buildIndustrySymbolLookup,
  resolveIndustryKeyFromCandidates,
  resolveIndustryKeyFromSymbolGroups,
} from '../constants/industries';
import BondSectionNav from './BondSectionNav';
import {
  BondFilterPanel,
  useBondFilterController,
} from './BondFilterPanel';
import { DataTable, type DataTableColumn } from './ui/DataTable';
import { filterBondRowsByCriteria, sortBondRowsByCriteria } from '../services/aiBondFilter';

interface MaturityRow extends BondDataRow {
  daysLeft: number;
}

interface MaturityListViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

const MATURITY_WINDOW_DAYS = 365;
const MATURITY_LIST_BACKGROUND_REFRESH_MS = 5 * 60 * 1000;

const getMaturityIndustryKey = (bond: any, enterpriseIndustry?: string) =>
  resolveIndustryKeyFromCandidates(
    bond?.industry,
    bond?.industryLabel,
    bond?.infoObj?.icbNameLv2,
    bond?.infoObj?.icbNameLv1,
    bond?.infoObj?.icbCodeLv2,
    bond?.infoObj?.icbCodeLv1,
    bond?.infoObj?.industryName,
    bond?.infoObj?.industryCode,
    bond?.icbNameLv2,
    bond?.icbNameLv1,
    bond?.icbCodeLv2,
    bond?.icbCodeLv1,
    bond?.industryName,
    bond?.industryCode,
    enterpriseIndustry,
  );

const mergeRowWithBondDetail = (row: BondDataRow, detailPayload: any): BondDataRow => {
  const detail = detailPayload?.detail || detailPayload || {};
  const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;
  const issuerName = String(detail?.issuerName || detail?.IssuerName || row.issuerName || row.issuerSymbol || '').trim();
  const bondType = String(detail?.bondType || detail?.BondType || row.bondType || '').trim();
  const industry = resolveIndustryKeyFromCandidates(
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
    issuerName,
    row.issuerSymbol,
    row.industry,
  );

  const currentListedValue = row.currentListedValue > 0
    ? row.currentListedValue
    : Number(detail?.currentListedValue || detail?.CurrentListedValue || historyItem?.value || 0);
  const totalIssuedValue = row.totalIssuedValue > 0
    ? row.totalIssuedValue
    : Number(detail?.totalIssuedValue || detail?.TotalIssuedValue || historyItem?.value || 0);
  const currentListedVolume = row.currentListedVolume > 0
    ? row.currentListedVolume
    : Number(detail?.currentListedVolume || detail?.CurrentListedVolume || historyItem?.volume || 0);

  return {
    ...row,
    issuerName,
    bondType,
    industry,
    currentListedVolume,
    currentListedValue,
    totalIssuedValue,
    raw: {
      ...row.raw,
      issuerName,
      bondType,
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
  const industry = resolveIndustryKeyFromCandidates(
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

const toBondModel = (row: MaturityRow): Bond => ({
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
  interestType: row.bondRateType || '',
  status: row.status || '',
});

const getMaturitySituationMeta = (
  daysLeft: number,
  t: (key: any) => string,
) => {
  if (daysLeft < 30) {
    return {
      label: t('statusVeryNear'),
      className: 'border border-red-100 bg-red-50 text-red-600',
    };
  }

  if (daysLeft <= 90) {
    return {
      label: t('statusNear'),
      className: 'border border-orange-100 bg-orange-50 text-orange-600',
    };
  }

  if (daysLeft <= 180) {
    return {
      label: t('statusMonitor'),
      className: 'border border-yellow-100 bg-yellow-50 text-yellow-700',
    };
  }

  if (daysLeft <= 270) {
    return {
      label: t('statusMediumTerm'),
      className: 'border border-blue-100 bg-blue-50 text-blue-600',
    };
  }

  return {
    label: t('statusLongTerm'),
    className: 'border border-green-100 bg-green-50 text-green-600',
  };
};

const resolveTableSort = (
  sortBy?: number,
  secondarySorts: number[] = [],
): { columnId: string; direction: 'asc' | 'desc' } | null => {
  if (secondarySorts.length > 0) return null;
  if (sortBy === undefined) return { columnId: 'maturityDate', direction: 'asc' };

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

export default function MaturityListView({ setSelectedBond, setBondEnterpriseName }: MaturityListViewProps) {
  const { t, language } = useLanguage();
  const cacheKey = `maturity_list_${MATURITY_WINDOW_DAYS}`;
  const cachedData = getCacheEntryAllowExpired<MaturityRow[]>(cacheKey)?.data;
  const [rows, setRows] = useState<MaturityRow[]>(() =>
    Array.isArray(cachedData) ? cachedData : [],
  );
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [columnVisibilityDraft, setColumnVisibilityDraft] = useState<string[]>([]);
  const [isColumnVisibilityOpen, setIsColumnVisibilityOpen] = useState(false);
  const [isFilterControlsVisible, setIsFilterControlsVisible] = useState(false);
  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(() => {
    return getCache('enterprise_names_en') || {};
  });
  const enterpriseNamesENRef = useRef<Record<string, string>>(enterpriseNamesEN);
  const enterpriseList = (getCache('enterprise_list') || []) as Array<{ ticker?: string; industry?: string }>;
  const columnVisibilityRef = useRef<HTMLDivElement | null>(null);
  const enterpriseIndustryBySymbol = useMemo(
    () => new Map(
      enterpriseList
        .map((item) => {
          const ticker = String(item?.ticker || '').trim();
          const industry = String(item?.industry || '').trim();
          return ticker && industry ? [ticker, industry] as const : null;
        })
        .filter((item): item is readonly [string, string] => Boolean(item)),
    ),
    [enterpriseList],
  );

  useEffect(() => {
    enterpriseNamesENRef.current = enterpriseNamesEN;
  }, [enterpriseNamesEN]);

  const rateTypeOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => String(row.bondRateType || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const issuerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.issuerName || row.issuerSymbol).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const bondTypeOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.bondType).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const industryOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.industry).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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
    applyAIFilter,
  } = useBondFilterController({
    rateTypeOptions,
    issuerOptions,
    bondTypeOptions,
    industryOptions,
  });

  useEffect(() => {
    let isMounted = true;

    const hydrateBonds = async () => {
      const cachedEntry = getCacheEntryAllowExpired<MaturityRow[]>(cacheKey);
      const cachedRows = Array.isArray(cachedEntry?.data) ? cachedEntry.data : [];
      const hasCachedRows = cachedRows.length > 0;
      const shouldRefresh = !cachedEntry || Date.now() - cachedEntry.timestamp > MATURITY_LIST_BACKGROUND_REFRESH_MS;

      if (hasCachedRows) {
        setRows(cachedRows);
      }

      setLoading(!hasCachedRows);
      setError(null);

      if (!shouldRefresh) {
        return;
      }

      try {
        const data = await loadMaturingBondUniverse(MATURITY_WINDOW_DAYS, {
          forceRefresh: hasCachedRows,
        });
        if (!isMounted) return;

        if (!Array.isArray(data) || data.length === 0) {
          setRows([]);
          setCache(cacheKey, []);
          return;
        }

        const symbolGroups = await loadDedupedIndustrySymbols();
        if (!isMounted) return;

        const symbolToIndustryKey = buildIndustrySymbolLookup(symbolGroups);
        const fallbackTickerByCode = new Map<string, string>();
        const detailMap = await loadBondDetailsMapByCodes(
          data.map((row: any) => row.bondCode),
          {
            concurrency: 8,
            forceRefresh: false,
          },
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: MaturityRow[] = data
          .map((row: any) => {
            const detailPayload = detailMap[row.bondCode];
            const mergedRow = detailPayload
              ? mergeRowWithBondDetail(row, detailMap[row.bondCode])
              : row;
            const resolvedTicker = String(
              mergedRow.issuerSymbol
              || detailPayload?.detail?.issuerSymbol
              || detailPayload?.issuerSymbol
              || row.issuerSymbol
              || '',
            ).trim();
            if (resolvedTicker) {
              fallbackTickerByCode.set(mergedRow.bondCode, resolvedTicker);
            }
            const enterpriseIndustry = enterpriseIndustryBySymbol.get(resolvedTicker);
            const maturity = new Date(mergedRow.maturityDate);
            maturity.setHours(0, 0, 0, 0);
            const diffTime = maturity.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
              ...mergedRow,
              issuerName:
                language === 'en' && enterpriseNamesENRef.current[mergedRow.issuerSymbol || '']
                  ? enterpriseNamesENRef.current[mergedRow.issuerSymbol || '']
                  : mergedRow.issuerName,
              bondType: mergedRow.bondType || '',
              bondRateType: normalizeInterestType(
                mergedRow.bondRateType || mergedRow.raw?.interestRateType || mergedRow.raw?.interestType || '',
                mergedRow.raw?.interestPaymentMethod || mergedRow.raw?.paymentMethod || mergedRow.raw?.bondType || mergedRow.raw?.bondName || '',
                [],
              ) || mergedRow.bondRateType || 'N/A',
              industry: resolveIndustryKeyFromSymbolGroups(
                resolvedTicker,
                symbolToIndustryKey,
                getMaturityIndustryKey(mergedRow, enterpriseIndustry),
              ),
              daysLeft: diffDays > 0 ? diffDays : 0,
            };
          })
          .filter((row) => row.daysLeft <= MATURITY_WINDOW_DAYS);

        setRows(mapped);
        setCache(cacheKey, mapped);

        const tickersToFetch = Array.from(new Set(
          mapped.flatMap((row) => {
            const ticker = String(row.issuerSymbol || fallbackTickerByCode.get(row.bondCode) || '').trim();
            if (!ticker) return [];

            const needsIndustry = !row.industry;
            const needsEnglishName = language === 'en' && !enterpriseNamesENRef.current[ticker];
            return needsIndustry || needsEnglishName ? [ticker] : [];
          }),
        ));

        if (tickersToFetch.length > 0) {
          const profileResults = await mapWithConcurrency(tickersToFetch, 5, async (ticker) => (
            [ticker, await loadIssuerProfile(ticker)] as const
          ));

          if (!isMounted) return;

          const profileMap = new Map<string, any>(
            getFulfilledValues(profileResults).filter((entry): entry is readonly [string, any] => Boolean(entry[1])),
          );

          if (profileMap.size > 0) {
            const currentENNames = { ...enterpriseNamesENRef.current };
            let hasNameUpdates = false;

            if (language === 'en') {
              profileMap.forEach((profile, ticker) => {
                const nextName = String(profile?.internationalName || '').trim();
                if (nextName && currentENNames[ticker] !== nextName) {
                  currentENNames[ticker] = nextName;
                  hasNameUpdates = true;
                }
              });
            }

            if (hasNameUpdates) {
              setEnterpriseNamesEN({ ...currentENNames });
              setCache('enterprise_names_en', { ...currentENNames });
            }

            setRows((prev) => {
              const next = prev.map((row) => {
                const ticker = String(row.issuerSymbol || fallbackTickerByCode.get(row.bondCode) || '').trim();
                const profile = profileMap.get(ticker);
                const industry = row.industry || !profile
                  ? row.industry
                  : resolveIndustryKeyFromSymbolGroups(
                      ticker,
                      symbolToIndustryKey,
                      getMaturityIndustryKey(profile, enterpriseIndustryBySymbol.get(ticker)),
                    );
                const issuerName = language === 'en' && ticker && currentENNames[ticker]
                  ? currentENNames[ticker]
                  : row.issuerName;

                if (
                  ticker === row.issuerSymbol
                  && issuerName === row.issuerName
                  && industry === row.industry
                ) {
                  return row;
                }

                return {
                  ...row,
                  issuerSymbol: ticker || row.issuerSymbol,
                  issuerName,
                  industry,
                };
              });
              setCache(cacheKey, next);
              return next;
            });
          }
        }
      } catch (fetchError) {
        if (!isMounted) return;
        console.error('Error fetching maturity bonds:', fetchError);
        if (!hasCachedRows) {
          if (fetchError instanceof Error && fetchError.message.includes('401')) {
            setError(t('tokenError401'));
          } else {
            setError(fetchError instanceof Error ? fetchError.message : t('dataError'));
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void hydrateBonds();
    return () => {
      isMounted = false;
    };
  }, [cacheKey, enterpriseIndustryBySymbol, language, t]);

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

  const filteredRows = useMemo(() => {
    const searchTerm = appliedFilters.searchTerm.trim().toLowerCase();
    const maturityWindowDays = Math.max(1, Number(appliedFilters.maturityWindowDays) || MATURITY_WINDOW_DAYS);
    const remainingDaysMin = appliedFilters.remainingDaysMin.trim() ? Number(appliedFilters.remainingDaysMin) : null;
    const remainingDaysMax = appliedFilters.remainingDaysMax.trim() ? Number(appliedFilters.remainingDaysMax) : null;

    const filtered = filterBondRowsByCriteria(rows, appliedCriteria).filter((row) => {
      if (row.daysLeft > maturityWindowDays) {
        return false;
      }

      if (remainingDaysMin !== null && row.daysLeft < remainingDaysMin) {
        return false;
      }

      if (remainingDaysMax !== null && row.daysLeft > remainingDaysMax) {
        return false;
      }

      if (!searchTerm) return true;
      const haystack = [
        row.bondCode,
        row.issuerName,
        row.issuerSymbol,
        row.bondType,
        row.industry,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchTerm);
    });

    return sortBondRowsByCriteria(filtered, appliedCriteria) as MaturityRow[];
  }, [
    appliedCriteria,
    appliedFilters.searchTerm,
    appliedFilters.maturityWindowDays,
    appliedFilters.remainingDaysMax,
    appliedFilters.remainingDaysMin,
    rows,
  ]);

  const tableInitialSort = useMemo(
    () => resolveTableSort(appliedCriteria.sortBy, appliedCriteria.secondarySorts || []),
    [appliedCriteria.secondarySorts, appliedCriteria.sortBy],
  );

  const columns = useMemo<DataTableColumn<MaturityRow>[]>(() => ([
    {
      id: 'order',
      header: <ListOrdered className="h-4 w-4" aria-hidden="true" />,
      align: 'center',
      widthClassName: 'w-14',
      cell: (_row, index) => index + 1,
    },
    {
      id: 'bondCode',
      header: t('bondCode'),
      accessor: (row) => row.bondCode,
      sortable: true,
      widthClassName: 'w-32',
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setBondEnterpriseName(row.issuerName || row.issuerSymbol || '');
            setSelectedBond(toBondModel(row));
          }}
          className="font-bold text-text-highlight transition-colors hover:text-blue-600"
        >
          {row.bondCode}
        </button>
      ),
    },
    {
      id: 'issuerName',
      header: t('enterprise'),
      accessor: (row) => row.issuerName || row.issuerSymbol || '',
      sortable: true,
      widthClassName: 'w-60',
      cell: (row) => {
        const issuerName = row.issuerName || row.issuerSymbol || t('none');
        const industry = row.industry ? (t(row.industry as any) || row.industry) : '';

        return (
          <div className="min-w-0 max-w-xs">
            <div className="truncate">{issuerName}</div>
            {industry ? (
              <div className="mt-1 text-xs font-semibold text-text-muted">
                {industry}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'bondType',
      header: t('bondTypeLabel'),
      accessor: (row) => row.bondType || '',
      sortable: true,
      widthClassName: 'w-40',
      cell: (row) => row.bondType || t('none'),
    },
    {
      id: 'tenorPeriod',
      header: t('term'),
      unit: `(${t('monthUnit')})`,
      accessor: (row) => row.tenorPeriod || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-24',
      cell: (row) => formatNumber(row.tenorPeriod || 0, 0),
    },
    {
      id: 'daysLeft',
      header: t('remainingTermLabel'),
      unit: `(${t('daysUnit')})`,
      accessor: (row) => row.daysLeft || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-28',
      cell: (row) => row.daysLeft,
    },
    {
      id: 'issueDate',
      header: t('issueDate'),
      accessor: (row) => parseDateToTimestamp(row.issueDate) || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-28',
      cell: (row) => formatDate(row.issueDate),
    },
    {
      id: 'maturityDate',
      header: t('maturityDate'),
      accessor: (row) => parseDateToTimestamp(row.maturityDate) || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-28',
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
      cell: (row) => formatInterestRate(row.bondRate),
    },
    {
      id: 'bondRateType',
      header: t('interestType'),
      accessor: (row) => row.bondRateType || '',
      sortable: true,
      align: 'center',
      widthClassName: 'w-32',
      cell: (row) => row.bondRateType || t('none'),
    },
    {
      id: 'currentListedVolume',
      header: t('listedVolume'),
      accessor: (row) => row.currentListedVolume || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-32',
      cell: (row) => formatNumber(row.currentListedVolume || 0, 0),
    },
    {
      id: 'totalIssuedValue',
      header: t('issuedValue'),
      unit: `(${t('unitBillionVND')})`,
      accessor: (row) => row.totalIssuedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-36',
      cell: (row) => formatNumber((row.totalIssuedValue || 0) / 1000000000, 2),
    },
    {
      id: 'currentListedValue',
      header: t('listedValue'),
      unit: `(${t('unitBillionVND')})`,
      accessor: (row) => row.currentListedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-36',
      cell: (row) => formatNumber((row.currentListedValue || 0) / 1000000000, 2),
    },
    {
      id: 'situation',
      header: t('situation'),
      accessor: (row) => row.daysLeft || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-40',
      cell: (row) => {
        const situation = getMaturitySituationMeta(row.daysLeft, t);

        return (
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${situation.className}`}>
            {situation.label}
          </span>
        );
      },
    },
  ]), [setBondEnterpriseName, setSelectedBond, t]);

  const columnVisibilityOptions = useMemo(
    () => columns
      .filter((column) => column.id !== 'order')
      .map((column) => ({
        id: column.id,
        label: typeof column.header === 'string' ? column.header : t(column.id as any),
      })),
    [columns, t],
  );

  if (error) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center p-4 text-center transition-colors">
        <div className="mb-4 rounded-full bg-red-50 p-4 dark:bg-red-900/20">
          <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400" />
        </div>
        <h3 className="mb-2 text-xl font-bold text-text-base transition-colors">{t('failedToLoadData')}</h3>
        <p className="mb-4 max-w-sm text-text-muted transition-colors">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-blue-600 px-6 py-2 font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
        >
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 transition-colors duration-300">
      <BondSectionNav activeSection="maturity" />

      <BondFilterPanel
        title={t('maturityTitle')}
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
        variant="maturity"
        issuerOptions={issuerOptions}
        bondTypeOptions={bondTypeOptions}
        industryOptions={industryOptions}
        searchOptions={rows.map((row) => row.bondCode)}
        showFilterControls={isFilterControlsVisible}
        marketActionSlot={(
          <div ref={columnVisibilityRef} className="relative flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsFilterControlsVisible((current) => !current)}
              className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:gap-2 sm:px-3"
              aria-label={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
              title={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
            >
              {isFilterControlsVisible ? <FilterX className="h-4 w-4 text-blue-600" /> : <Filter className="h-4 w-4 text-blue-600" />}
              <span className="hidden sm:inline">{t('filterTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsColumnVisibilityOpen((current) => !current)}
              className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:gap-2 sm:px-3"
              aria-haspopup="dialog"
              aria-expanded={isColumnVisibilityOpen}
              aria-label={t('hideColumns')}
              title={t('hideColumns')}
            >
              <EyeOff className="h-4 w-4 text-blue-600" />
              <span className="hidden sm:inline">{t('hideColumns')}</span>
            </button>

          {isColumnVisibilityOpen ? (
            <div className="absolute right-0 top-full z-30 mt-3 w-96 max-w-none rounded-lg border border-border-base bg-bg-surface p-4 shadow-xl shadow-blue-950/10">
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
        <div className="rounded-lg border border-border-base bg-bg-surface px-4 py-10 text-center text-sm font-medium text-text-muted shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
          {t('loading')}
        </div>
      ) : (
        <DataTable
          rows={filteredRows}
          columns={columns}
          getRowKey={(row) => row.bondCode}
          pageSize={15}
          initialSort={tableInitialSort}
          emptyState={t('noBondsFound')}
          noColumnsState={t('noColumnsSelected')}
          hiddenColumnIds={hiddenColumnIds}
        />
      )}
    </div>
  );
}
