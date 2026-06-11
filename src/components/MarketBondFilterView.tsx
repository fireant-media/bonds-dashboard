import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BadgePercent, CalendarRange, ListFilter, Loader2, RefreshCcw, Search, Sparkles } from 'lucide-react';
import { Bond } from '../types';
import { useLanguage } from '../LanguageContext';
import { BondDataRow, loadBondFilterRows } from '../services/bondData';
import {
  buildBondFilterQueryFromCriteria,
  extractBondFilterCriteria,
  filterBondRowsByCriteria,
  getAIBondRateTypeLabel,
  getBondFilterPresetSignature,
  hasAIBondFilterCriteria,
  normalizeAIBondRateType,
  sortBondRowsByCriteria,
  summarizeBondFilterCriteria,
  type AIBondSortBy,
  type AIBondFilterCriteria,
} from '../services/aiBondFilter';
import { MARKET_OVERVIEW_CACHE_KEY, type MarketOverviewPayload } from '../services/marketOverviewData';
import { useAIStore } from '../store/aiStore';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import { getCache } from '../utils/cache';
import { DataTable, DataTableColumn } from './ui/DataTable';

const MARKET_BOND_FETCH_FALLBACK_LIMIT = 10000;
const AI_PROMPT_SUGGESTION_LIMIT = 3;
const AI_FILTER_SUMMARY_LIMIT = 3;
const AI_SECONDARY_SORT_LIMIT = 2;

interface FilterState {
  tenorMin: string;
  tenorMax: string;
  issueDateFrom: string;
  issueDateTo: string;
  maturityDateFrom: string;
  maturityDateTo: string;
  bondRateMin: string;
  bondRateMax: string;
  bondRateType: string;
  sortBy?: AIBondSortBy;
  secondarySorts?: AIBondSortBy[];
}

interface MarketBondFilterViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

const DEFAULT_FILTERS: FilterState = {
  tenorMin: '',
  tenorMax: '',
  issueDateFrom: '',
  issueDateTo: '',
  maturityDateFrom: '',
  maturityDateTo: '',
  bondRateMin: '',
  bondRateMax: '',
  bondRateType: '',
  sortBy: undefined,
  secondarySorts: [],
};

const FALLBACK_AI_MODEL = 'gpt-5.4-mini';

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBondRateType = (row: BondDataRow) =>
  normalizeInterestType(
    row.bondRateType,
    row.raw?.interestPaymentMethod || row.raw?.paymentMethod || row.raw?.bondType || row.raw?.bondName || '',
    Array.isArray(row.raw?.cashFlows) ? row.raw.cashFlows : [],
  ) || row.bondRateType || '';

const resolveInitialMarketBondFetchLimit = () => {
  const cachedOverview = (getCache(MARKET_OVERVIEW_CACHE_KEY) || getCache('market_overview')) as MarketOverviewPayload | null;
  const marketBondCount = Array.isArray(cachedOverview?.industryData)
    ? cachedOverview.industryData.reduce((total, item) => total + Number(item?.bondCount || 0), 0)
    : 0;

  if (marketBondCount > 0) {
    return marketBondCount + 100;
  }

  return MARKET_BOND_FETCH_FALLBACK_LIMIT;
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

const toCriteriaFromFilterState = (filters: FilterState): AIBondFilterCriteria => ({
  minTenorMonths: toOptionalNumber(filters.tenorMin) ?? undefined,
  maxTenorMonths: toOptionalNumber(filters.tenorMax) ?? undefined,
  issueDateFrom: filters.issueDateFrom || undefined,
  issueDateTo: filters.issueDateTo || undefined,
  maturityDateFrom: filters.maturityDateFrom || undefined,
  maturityDateTo: filters.maturityDateTo || undefined,
  minBondRate: toOptionalNumber(filters.bondRateMin) ?? undefined,
  maxBondRate: toOptionalNumber(filters.bondRateMax) ?? undefined,
  bondRateType: normalizeAIBondRateType(filters.bondRateType),
  sortBy: filters.sortBy,
  secondarySorts: filters.secondarySorts,
});

const toFilterStateFromCriteria = (criteria: AIBondFilterCriteria): FilterState => ({
  ...DEFAULT_FILTERS,
  tenorMin: criteria.minTenorMonths !== undefined ? String(criteria.minTenorMonths) : '',
  tenorMax: criteria.maxTenorMonths !== undefined ? String(criteria.maxTenorMonths) : '',
  issueDateFrom: criteria.issueDateFrom || '',
  issueDateTo: criteria.issueDateTo || '',
  maturityDateFrom: criteria.maturityDateFrom || '',
  maturityDateTo: criteria.maturityDateTo || '',
  bondRateMin: criteria.minBondRate !== undefined ? String(criteria.minBondRate) : '',
  bondRateMax: criteria.maxBondRate !== undefined ? String(criteria.maxBondRate) : '',
  bondRateType: criteria.bondRateType ? getAIBondRateTypeLabel(criteria.bondRateType, 'en') : '',
  sortBy: criteria.sortBy,
  secondarySorts: criteria.secondarySorts || [],
});

const normalizeSecondarySorts = (
  values: Array<AIBondSortBy | undefined>,
  primarySort?: AIBondSortBy,
) => Array.from(new Set(values.filter((value): value is AIBondSortBy => value !== undefined)))
  .filter((value) => value !== primarySort)
  .slice(0, AI_SECONDARY_SORT_LIMIT);

const createFilterStateFromCriteria = (
  criteria: AIBondFilterCriteria,
  rateTypeOptions: string[],
  language: 'vi' | 'en',
): FilterState => {
  const nextFilters = toFilterStateFromCriteria(criteria);

  if (criteria.bondRateType) {
    const matchedRateType = rateTypeOptions.find((option) => normalizeAIBondRateType(option) === criteria.bondRateType);
    nextFilters.bondRateType = matchedRateType || getAIBondRateTypeLabel(criteria.bondRateType, language);
  }

  nextFilters.secondarySorts = normalizeSecondarySorts(criteria.secondarySorts || [], criteria.sortBy);
  return nextFilters;
};

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
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<BondDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isApplyingAIFilter, setIsApplyingAIFilter] = useState(false);
  const initialFetchLimit = useMemo(() => resolveInitialMarketBondFetchLimit(), []);
  const appliedCriteria = useMemo(() => toCriteriaFromFilterState(appliedFilters), [appliedFilters]);
  const presetSignatureRef = useRef('');

  const { isLoadingStatus } = useAIStore();

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      setLoading(true);
      setError(null);

      try {
        const nextRows = await loadBondFilterRows(
          buildBondFilterQueryFromCriteria(appliedCriteria, {
            statusID: 1,
            isListing: 1,
            top: initialFetchLimit,
          }),
        );

        if (!cancelled) {
          setRows(nextRows);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error('Failed to load market bond filter data', requestError);
          setRows([]);
          setError(requestError instanceof Error ? requestError.message : t('error'));
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
  }, [appliedCriteria, initialFetchLimit, t]);

  const rateTypeOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => normalizeBondRateType(row)).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [rows]);
  const aiPromptSuggestions = useMemo(() => {
    const suggestions = language === 'en'
      ? [
          'Find bonds with the highest coupon rate.',
          'Find bonds maturing soonest.',
          'Find high-coupon bonds with early maturity and larger listed value.',
        ]
      : [
          'Tìm các trái phiếu có lãi suất cao nhất.',
          'Tìm các trái phiếu đáo hạn sớm nhất.',
          'Tìm các trái phiếu lãi suất cao, đáo hạn sớm và giá trị niêm yết lớn.',
        ];

    const normalizePromptKey = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return Array.from(new Map(suggestions.map((item) => [normalizePromptKey(item), item])).values()).slice(0, AI_PROMPT_SUGGESTION_LIMIT);
  }, [language]);

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
    const nextFilters = createFilterStateFromCriteria(
      preset.criteria,
      rateTypeOptions,
      language === 'en' ? 'en' : 'vi',
    );
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setAiPrompt(preset.prompt || '');
    setAiSummary(
      preset.summary && preset.summary.length > 0
        ? preset.summary.slice(0, AI_FILTER_SUMMARY_LIMIT)
        : summarizeBondFilterCriteria(preset.criteria, 'vi').slice(0, AI_FILTER_SUMMARY_LIMIT),
    );
    setAiError(null);
  }, [language, location.state, rateTypeOptions]);

  const filteredRows = useMemo(() => {
    const nextRows = filterBondRowsByCriteria(rows, appliedCriteria).filter((row) => {
      if (!appliedFilters.bondRateType) return true;
      return normalizeBondRateType(row) === appliedFilters.bondRateType;
    });
    return sortBondRowsByCriteria(nextRows, appliedCriteria);
  }, [appliedCriteria, appliedFilters.bondRateType, rows]);
  const tableInitialSort = useMemo(
    () => resolveTableSort(appliedCriteria.sortBy, appliedCriteria.secondarySorts || []),
    [appliedCriteria.secondarySorts, appliedCriteria.sortBy],
  );
  const showPromptSuggestions = aiSummary.length === 0 && !aiError && !aiPrompt.trim();

  const applyNextFilters = (nextFilters: FilterState) => {
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const handleApplyAIFilter = async () => {
    if (!aiPrompt.trim() || isApplyingAIFilter) return;

    setAiError(null);
    setIsApplyingAIFilter(true);

    try {
      let aiState = useAIStore.getState();
      if (!aiState.configured && !aiState.isLoadingStatus) {
        await aiState.refreshStatus();
        aiState = useAIStore.getState();
      }

      if (!aiState.configured) {
        throw new Error(t('aiNotConfigured'));
      }

      const extraction = await extractBondFilterCriteria({
        message: aiPrompt.trim(),
        model: aiState.selectedModel || aiState.defaultModel || FALLBACK_AI_MODEL,
      });

      if (!extraction.isFilterRequest || !hasAIBondFilterCriteria(extraction.criteria)) {
        throw new Error(t('aiFilterNoCriteria'));
      }

      applyNextFilters(
        createFilterStateFromCriteria(
          extraction.criteria,
          rateTypeOptions,
          language === 'en' ? 'en' : 'vi',
        ),
      );
      setAiSummary(
        extraction.summary.length > 0
          ? extraction.summary.slice(0, AI_FILTER_SUMMARY_LIMIT)
          : summarizeBondFilterCriteria(extraction.criteria, 'vi').slice(0, AI_FILTER_SUMMARY_LIMIT),
      );
    } catch (requestError) {
      console.error('Failed to apply AI bond filter', requestError);
      setAiError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : t('aiFilterInvalidResponse'),
      );
    } finally {
      setIsApplyingAIFilter(false);
    }
  };

  const columns = useMemo<DataTableColumn<BondDataRow>[]>(() => ([
    {
      id: 'bondCode',
      header: t('bondCode'),
      accessor: (row) => row.bondCode,
      sortable: true,
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
      id: 'tenorPeriod',
      header: t('term'),
      unit: `(${t('monthUnit')})`,
      accessor: (row) => row.tenorPeriod || 0,
      sortable: true,
      align: 'right',
      cell: (row) => formatNumber(row.tenorPeriod || 0, 0),
    },
    {
      id: 'issueDate',
      header: t('issueDate'),
      accessor: (row) => parseDateToTimestamp(row.issueDate) || 0,
      sortable: true,
      align: 'center',
      cell: (row) => formatDate(row.issueDate),
    },
    {
      id: 'maturityDate',
      header: t('maturityDate'),
      accessor: (row) => parseDateToTimestamp(row.maturityDate) || 0,
      sortable: true,
      align: 'center',
      cell: (row) => formatDate(row.maturityDate),
    },
    {
      id: 'bondRate',
      header: t('interestRate'),
      unit: `(${t('unitPercentLabel')})`,
      accessor: (row) => row.bondRate || 0,
      sortable: true,
      align: 'right',
      cell: (row) => formatInterestRate(row.bondRate),
    },
    {
      id: 'bondRateType',
      header: t('interestType'),
      accessor: (row) => normalizeBondRateType(row),
      sortable: true,
      cell: (row) => normalizeBondRateType(row) || t('none'),
    },
    {
      id: 'currentListedVolume',
      header: t('listedVolume'),
      accessor: (row) => row.currentListedVolume || 0,
      sortable: true,
      align: 'right',
      cell: (row) => formatNumber(row.currentListedVolume || 0, 0),
    },
    {
      id: 'totalIssuedValue',
      header: t('issuedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.totalIssuedValue || 0,
      sortable: true,
      align: 'right',
      cell: (row) => formatNumber((row.totalIssuedValue || 0) / 1000000000, 2),
    },
    {
      id: 'currentListedValue',
      header: t('listedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.currentListedValue || 0,
      sortable: true,
      align: 'right',
      cell: (row) => formatNumber((row.currentListedValue || 0) / 1000000000, 2),
    },
  ]), [setBondEnterpriseName, setSelectedBond, t]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
                <ListFilter className="h-4 w-4 text-blue-600" />
                <span>{t('filterTab')}</span>
              </div>
              <h2 className="text-xl font-bold text-text-base">{t('marketBondList')}</h2>
              <p className="text-sm font-medium text-text-muted">
                {t('filterResults')}: {formatNumber(filteredRows.length, 0)} / {formatNumber(rows.length, 0)}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setAiError(null);
                  setAppliedFilters({ ...draftFilters });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Search className="h-4 w-4" />
                <span>{t('applyFilters')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  applyNextFilters(DEFAULT_FILTERS);
                  setAiSummary([]);
                  setAiError(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-base bg-bg-base px-4 py-2.5 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
              >
                <RefreshCcw className="h-4 w-4" />
                <span>{t('resetFilters')}</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <label className="flex-1 space-y-2">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-700">
                    <Sparkles className="h-4 w-4" />
                    <span>{t('applyAIFilter')}</span>
                  </span>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(event) => {
                      const nextPrompt = event.target.value;
                      setAiPrompt(nextPrompt);

                      if (aiSummary.length > 0) {
                        setAiSummary([]);
                      }

                      if (aiError) {
                        setAiError(null);
                      }
                    }}
                    placeholder={t('aiFilterPlaceholder')}
                    className="w-full resize-none rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors placeholder:text-text-muted/80 focus:border-blue-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleApplyAIFilter()}
                  disabled={!aiPrompt.trim() || isApplyingAIFilter || isLoadingStatus}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isApplyingAIFilter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span>{t('applyAIFilter')}</span>
                </button>
              </div>

              {showPromptSuggestions && (
                <div className="flex flex-wrap gap-2">
                  {aiPromptSuggestions.slice(0, AI_PROMPT_SUGGESTION_LIMIT).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setAiPrompt(suggestion);
                        setAiSummary([]);
                        setAiError(null);
                      }}
                      className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-left text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {(aiSummary.length > 0 || aiError) && (
                <div className="space-y-2">
                  {aiSummary.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {aiSummary.slice(0, AI_FILTER_SUMMARY_LIMIT).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setAiPrompt(item);
                            setAiError(null);
                          }}
                          className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                  {aiError && <p className="text-sm font-medium text-red-600">{aiError}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <RangeField
              icon={ListFilter}
              label={t('term')}
              unit={t('monthUnit')}
              minValue={draftFilters.tenorMin}
              maxValue={draftFilters.tenorMax}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, tenorMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, tenorMax: value }))}
            />
            <RangeField
              icon={BadgePercent}
              label={t('interestRate')}
              unit={t('unitPercentLabel')}
              minValue={draftFilters.bondRateMin}
              maxValue={draftFilters.bondRateMax}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMax: value }))}
            />
            <FilterSelect
              icon={BadgePercent}
              label={t('interestType')}
              value={draftFilters.bondRateType}
              options={rateTypeOptions}
              onChange={(value) => setDraftFilters((current) => ({ ...current, bondRateType: value }))}
            />
            <RangeField
              icon={CalendarRange}
              label={t('issueDate')}
              minValue={draftFilters.issueDateFrom}
              maxValue={draftFilters.issueDateTo}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, issueDateFrom: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, issueDateTo: value }))}
              inputType="date"
            />
            <RangeField
              icon={CalendarRange}
              label={t('maturityDate')}
              minValue={draftFilters.maturityDateFrom}
              maxValue={draftFilters.maturityDateTo}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateFrom: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateTo: value }))}
              inputType="date"
            />
          </div>
        </div>
      </section>

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
          pageSize={15}
          initialSort={tableInitialSort}
          emptyState={t('noData')}
        />
      )}
    </div>
  );
}

interface RangeFieldProps {
  icon: typeof Search;
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  unit?: string;
  inputType?: 'number' | 'date';
}

function RangeField({
  icon: Icon,
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  unit,
  inputType = 'number',
}: RangeFieldProps) {
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
        <Icon className="h-4 w-4 text-blue-600" />
        <span>{unit ? `${label} (${unit})` : label}</span>
      </span>
      <div className="grid grid-cols-2 gap-2">
        <input
          type={inputType}
          inputMode={inputType === 'number' ? 'decimal' : undefined}
          value={minValue}
          placeholder={inputType === 'date' ? undefined : 'Min'}
          onChange={(event) => onMinChange(event.target.value)}
          className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors focus:border-blue-400"
        />
        <input
          type={inputType}
          inputMode={inputType === 'number' ? 'decimal' : undefined}
          value={maxValue}
          placeholder={inputType === 'date' ? undefined : 'Max'}
          onChange={(event) => onMaxChange(event.target.value)}
          className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors focus:border-blue-400"
        />
      </div>
    </div>
  );
}

interface FilterSelectProps {
  icon: typeof Search;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterSelect({ icon: Icon, label, value, options, onChange }: FilterSelectProps) {
  const { t } = useLanguage();

  return (
    <label className="space-y-2">
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
        <Icon className="h-4 w-4 text-blue-600" />
        <span>{label}</span>
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors focus:border-blue-400"
      >
        <option value="">{t('all')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
