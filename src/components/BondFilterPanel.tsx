import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { BadgePercent, Building2, CalendarRange, CheckCircle2, ChevronDown, Landmark, ListFilter, Loader2, RefreshCcw, Search, Sparkles, type LucideIcon } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useAIStore } from '../store/aiStore';
import {
  extractBondFilterCriteria,
  getAIBondRateTypeLabel,
  hasAIBondFilterCriteria,
  normalizeAIBondRateType,
  summarizeBondFilterCriteria,
  type AIBondFilterCriteria,
  type AIBondSortBy,
} from '../services/aiBondFilter';

const FALLBACK_AI_MODEL = 'gpt-5.4-mini';
const AI_PROMPT_SUGGESTION_LIMIT = 3;
const AI_FILTER_SUMMARY_LIMIT = 3;
const AI_SECONDARY_SORT_LIMIT = 2;

export interface BondFilterState {
  searchTerm: string;
  industry: string;
  remainingDaysMin: string;
  remainingDaysMax: string;
  tenorMin: string;
  tenorMax: string;
  issueDateFrom: string;
  issueDateTo: string;
  maturityDateFrom: string;
  maturityDateTo: string;
  bondRateMin: string;
  bondRateMax: string;
  bondRateType: string;
  issuer: string;
  bondType: string;
  listedVolumeMin: string;
  listedVolumeMax: string;
  issuedValueMin: string;
  issuedValueMax: string;
  listedValueMin: string;
  listedValueMax: string;
  maturityWindowDays: string;
  maturityStatus: string;
  sortBy?: AIBondSortBy;
  secondarySorts?: AIBondSortBy[];
}

export const DEFAULT_BOND_FILTERS: BondFilterState = {
  searchTerm: '',
  industry: '',
  remainingDaysMin: '',
  remainingDaysMax: '',
  tenorMin: '',
  tenorMax: '',
  issueDateFrom: '',
  issueDateTo: '',
  maturityDateFrom: '',
  maturityDateTo: '',
  bondRateMin: '',
  bondRateMax: '',
  bondRateType: '',
  issuer: '',
  bondType: '',
  listedVolumeMin: '',
  listedVolumeMax: '',
  issuedValueMin: '',
  issuedValueMax: '',
  listedValueMin: '',
  listedValueMax: '',
  maturityWindowDays: '365',
  maturityStatus: '',
  sortBy: undefined,
  secondarySorts: [],
};

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOptionKey = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const matchFilterOption = (value: string | undefined, options: string[]) => {
  const normalizedValue = normalizeOptionKey(value || '');
  if (!normalizedValue) return '';

  return options.find((option) => {
    const normalizedOption = normalizeOptionKey(option);
    return normalizedOption === normalizedValue || normalizedOption.includes(normalizedValue);
  }) || value || '';
};

const getDisplayOptionLabel = (t: (key: any, ticker?: string) => string, value: string) =>
  t(value as any) || value;

export const toCriteriaFromBondFilterState = (filters: BondFilterState): AIBondFilterCriteria => ({
  industry: filters.industry || undefined,
  issuer: filters.issuer || undefined,
  bondType: filters.bondType || undefined,
  remainingDaysMin: toOptionalNumber(filters.remainingDaysMin) ?? undefined,
  remainingDaysMax: toOptionalNumber(filters.remainingDaysMax) ?? undefined,
  minTenorMonths: toOptionalNumber(filters.tenorMin) ?? undefined,
  maxTenorMonths: toOptionalNumber(filters.tenorMax) ?? undefined,
  issueDateFrom: filters.issueDateFrom || undefined,
  issueDateTo: filters.issueDateTo || undefined,
  maturityDateFrom: filters.maturityDateFrom || undefined,
  maturityDateTo: filters.maturityDateTo || undefined,
  minBondRate: toOptionalNumber(filters.bondRateMin) ?? undefined,
  maxBondRate: toOptionalNumber(filters.bondRateMax) ?? undefined,
  bondRateType: normalizeAIBondRateType(filters.bondRateType),
  minListedVolume: toOptionalNumber(filters.listedVolumeMin) ?? undefined,
  maxListedVolume: toOptionalNumber(filters.listedVolumeMax) ?? undefined,
  minIssuedValueBillion: toOptionalNumber(filters.issuedValueMin) ?? undefined,
  maxIssuedValueBillion: toOptionalNumber(filters.issuedValueMax) ?? undefined,
  minListedValueBillion: toOptionalNumber(filters.listedValueMin) ?? undefined,
  maxListedValueBillion: toOptionalNumber(filters.listedValueMax) ?? undefined,
  sortBy: filters.sortBy,
  secondarySorts: filters.secondarySorts,
});

const toBondFilterStateFromCriteria = (criteria: AIBondFilterCriteria): BondFilterState => ({
  ...DEFAULT_BOND_FILTERS,
  industry: criteria.industry || '',
  remainingDaysMin: criteria.remainingDaysMin !== undefined ? String(criteria.remainingDaysMin) : '',
  remainingDaysMax: criteria.remainingDaysMax !== undefined ? String(criteria.remainingDaysMax) : '',
  tenorMin: criteria.minTenorMonths !== undefined ? String(criteria.minTenorMonths) : '',
  tenorMax: criteria.maxTenorMonths !== undefined ? String(criteria.maxTenorMonths) : '',
  issueDateFrom: criteria.issueDateFrom || '',
  issueDateTo: criteria.issueDateTo || '',
  maturityDateFrom: criteria.maturityDateFrom || '',
  maturityDateTo: criteria.maturityDateTo || '',
  bondRateMin: criteria.minBondRate !== undefined ? String(criteria.minBondRate) : '',
  bondRateMax: criteria.maxBondRate !== undefined ? String(criteria.maxBondRate) : '',
  bondRateType: criteria.bondRateType ? getAIBondRateTypeLabel(criteria.bondRateType, 'en') : '',
  issuer: criteria.issuer || '',
  bondType: criteria.bondType || '',
  listedVolumeMin: criteria.minListedVolume !== undefined ? String(criteria.minListedVolume) : '',
  listedVolumeMax: criteria.maxListedVolume !== undefined ? String(criteria.maxListedVolume) : '',
  issuedValueMin: criteria.minIssuedValueBillion !== undefined ? String(criteria.minIssuedValueBillion) : '',
  issuedValueMax: criteria.maxIssuedValueBillion !== undefined ? String(criteria.maxIssuedValueBillion) : '',
  listedValueMin: criteria.minListedValueBillion !== undefined ? String(criteria.minListedValueBillion) : '',
  listedValueMax: criteria.maxListedValueBillion !== undefined ? String(criteria.maxListedValueBillion) : '',
  sortBy: criteria.sortBy,
  secondarySorts: criteria.secondarySorts || [],
});

const normalizeSecondarySorts = (
  values: Array<AIBondSortBy | undefined>,
  primarySort?: AIBondSortBy,
) => Array.from(new Set(values.filter((value): value is AIBondSortBy => value !== undefined)))
  .filter((value) => value !== primarySort)
  .slice(0, AI_SECONDARY_SORT_LIMIT);

export const createBondFilterStateFromCriteria = (
  criteria: AIBondFilterCriteria,
  rateTypeOptions: string[],
  issuerOptions: string[],
  bondTypeOptions: string[],
  industryOptions: string[],
  language: 'vi' | 'en',
): BondFilterState => {
  const nextFilters = toBondFilterStateFromCriteria(criteria);

  nextFilters.industry = matchFilterOption(criteria.industry, industryOptions);
  nextFilters.issuer = matchFilterOption(criteria.issuer, issuerOptions);
  nextFilters.bondType = matchFilterOption(criteria.bondType, bondTypeOptions);

  if (criteria.bondRateType) {
    const matchedRateType = rateTypeOptions.find((option) => normalizeAIBondRateType(option) === criteria.bondRateType);
    nextFilters.bondRateType = matchedRateType || getAIBondRateTypeLabel(criteria.bondRateType, language);
  }

  nextFilters.secondarySorts = normalizeSecondarySorts(criteria.secondarySorts || [], criteria.sortBy);
  return nextFilters;
};

const buildPromptSuggestions = (language: 'vi' | 'en') => {
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
};

export function useBondFilterController(
  options:
    | string[]
    | {
        rateTypeOptions: string[];
        issuerOptions?: string[];
        bondTypeOptions?: string[];
        industryOptions?: string[];
      },
) {
  const { t, language } = useLanguage();
  const { isLoadingStatus } = useAIStore();
  const rateTypeOptions = Array.isArray(options) ? options : options.rateTypeOptions;
  const issuerOptions = Array.isArray(options) ? [] : (options.issuerOptions || []);
  const bondTypeOptions = Array.isArray(options) ? [] : (options.bondTypeOptions || []);
  const industryOptions = Array.isArray(options) ? [] : (options.industryOptions || []);
  const [draftFilters, setDraftFilters] = useState<BondFilterState>(DEFAULT_BOND_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<BondFilterState>(DEFAULT_BOND_FILTERS);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isApplyingAIFilter, setIsApplyingAIFilter] = useState(false);

  const appliedCriteria = useMemo(() => toCriteriaFromBondFilterState(appliedFilters), [appliedFilters]);
  const hasActiveCriteria = hasAIBondFilterCriteria(appliedCriteria);
  const aiPromptSuggestions = useMemo(
    () => buildPromptSuggestions(language === 'en' ? 'en' : 'vi'),
    [language],
  );
  const showPromptSuggestions = aiSummary.length === 0 && !aiError && !aiPrompt.trim();

  const applyNextFilters = (nextFilters: BondFilterState) => {
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const applyDraftFilters = () => {
    setAiError(null);
    setAppliedFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    applyNextFilters(DEFAULT_BOND_FILTERS);
    setAiPrompt('');
    setAiSummary([]);
    setAiError(null);
  };

  const applyCriteriaPreset = (
    criteria: AIBondFilterCriteria,
    prompt?: string,
    summary?: string[],
  ) => {
    const nextFilters = createBondFilterStateFromCriteria(
      criteria,
      rateTypeOptions,
      issuerOptions,
      bondTypeOptions,
      industryOptions,
      language === 'en' ? 'en' : 'vi',
    );
    applyNextFilters(nextFilters);
    setAiPrompt(prompt || '');
    setAiSummary(
      summary && summary.length > 0
        ? summary.slice(0, AI_FILTER_SUMMARY_LIMIT)
        : summarizeBondFilterCriteria(criteria, language === 'en' ? 'en' : 'vi').slice(0, AI_FILTER_SUMMARY_LIMIT),
    );
    setAiError(null);
  };

  const applyAIFilter = async () => {
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
        createBondFilterStateFromCriteria(
          extraction.criteria,
          rateTypeOptions,
          issuerOptions,
          bondTypeOptions,
          industryOptions,
          language === 'en' ? 'en' : 'vi',
        ),
      );
      setAiSummary(
        extraction.summary.length > 0
          ? extraction.summary.slice(0, AI_FILTER_SUMMARY_LIMIT)
          : summarizeBondFilterCriteria(extraction.criteria, language === 'en' ? 'en' : 'vi').slice(0, AI_FILTER_SUMMARY_LIMIT),
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

  return {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    appliedCriteria,
    hasActiveCriteria,
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
    applyNextFilters,
    applyDraftFilters,
    resetFilters,
    applyCriteriaPreset,
    applyAIFilter,
  };
}

interface BondFilterPanelProps {
  title: string;
  resultCount: number;
  totalCount: number;
  draftFilters: BondFilterState;
  setDraftFilters: Dispatch<SetStateAction<BondFilterState>>;
  rateTypeOptions: string[];
  aiPrompt: string;
  setAiPrompt: (value: string) => void;
  aiSummary: string[];
  setAiSummary: (value: string[]) => void;
  aiError: string | null;
  setAiError: (value: string | null) => void;
  isApplyingAIFilter: boolean;
  isLoadingStatus: boolean;
  aiPromptSuggestions: string[];
  showPromptSuggestions: boolean;
  onApply: () => void;
  onReset: () => void;
  onApplyAI: () => Promise<void> | void;
  variant?: 'default' | 'market' | 'maturity';
  issuerOptions?: string[];
  bondTypeOptions?: string[];
  industryOptions?: string[];
  searchOptions?: string[];
  marketActionSlot?: ReactNode;
  showFilterControls?: boolean;
}

export function BondFilterPanel({
  title,
  resultCount,
  totalCount,
  draftFilters,
  setDraftFilters,
  rateTypeOptions,
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
  onApply,
  onReset,
  onApplyAI,
  variant = 'default',
  issuerOptions = [],
  bondTypeOptions = [],
  industryOptions = [],
  searchOptions = [],
  marketActionSlot,
  showFilterControls = true,
}: BondFilterPanelProps) {
  const { t, language } = useLanguage();
  const isMarketVariant = variant === 'market';
  const isMaturityVariant = variant === 'maturity';
  const showStandardToolbar = showFilterControls;
  const quickPromptSuggestions = useMemo(() => (
    language === 'en'
      ? [
          'High coupon bonds',
          'Bonds maturing soonest',
          'High listed value bonds',
        ]
      : [
          'Lãi suất trên 8%',
          'Ngân hàng dư nợ cao',
          'Giá trị phát hành trên 1.000 tỷ',
        ]
  ), [language]);

  return (
    <section className="rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
      <div className="flex flex-col gap-2">
        {isMarketVariant || isMaturityVariant ? null : (
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
              <ListFilter className="h-4 w-4 text-blue-600" />
              <span>{t('filterTab')}</span>
            </div>
            <h2 className="text-xl font-bold text-text-base">{title}</h2>
            <p className="text-sm font-medium text-text-muted">
              {t('filterResults')}: {resultCount.toLocaleString()} / {totalCount.toLocaleString()}
            </p>
          </div>
        )}

        <div className={`flex flex-col gap-2 sm:flex-row ${isMarketVariant || isMaturityVariant || !showStandardToolbar ? 'hidden' : 'justify-end'}`}>
          <div className={isMarketVariant || isMaturityVariant ? 'hidden' : 'flex-1'} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Search className="h-4 w-4" />
              <span>{t('applyFilters')}</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-base bg-bg-base px-4 py-2.5 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
            >
              <RefreshCcw className="h-4 w-4" />
              <span>{t('resetFilters')}</span>
            </button>
          </div>
        </div>

        <div className="py-0.5">
          <div className="flex flex-col gap-1.5 rounded-lg border border-blue-100/80 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-2.5 transition-colors dark:border-blue-400/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20">
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-700">
                <Sparkles className="h-4 w-4" />
                <span>{t('applyAIFilter')}</span>
              </span>
              <div className="flex flex-col gap-2 xl:flex-row xl:items-stretch">
                <div className="min-w-0 flex-1">
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => {
                      const nextPrompt = event.target.value;

                      if (!nextPrompt.trim()) {
                        onReset();
                        return;
                      }

                      setAiPrompt(nextPrompt);

                      if (aiSummary.length > 0) {
                        setAiSummary([]);
                      }

                      if (aiError) {
                        setAiError(null);
                      }
                    }}
                    placeholder={t('aiFilterPlaceholder')}
                    className="h-11 w-full resize-none rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors placeholder:text-text-muted/80 focus:border-blue-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void onApplyAI()}
                  disabled={!aiPrompt.trim() || isApplyingAIFilter || isLoadingStatus}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isApplyingAIFilter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span>{t('applyAIFilter')}</span>
                </button>
              </div>
            </div>

            {showPromptSuggestions && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-700">
                  Gợi ý nhanh:
                </span>
                {quickPromptSuggestions.slice(0, AI_PROMPT_SUGGESTION_LIMIT).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setAiPrompt(suggestion);
                      setAiSummary([]);
                      setAiError(null);
                    }}
                    className="inline-flex h-7 items-center rounded-full border border-blue-100 bg-bg-surface px-3 text-left text-xs font-semibold whitespace-nowrap text-blue-700 transition-colors hover:border-blue-200 hover:text-blue-900"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {(aiSummary.length > 0 || aiError) && (
              <div className="space-y-1.5">
                {aiSummary.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {aiSummary.slice(0, AI_FILTER_SUMMARY_LIMIT).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setAiPrompt(item);
                          setAiError(null);
                        }}
                        className="rounded-full px-3 py-0.5 text-xs font-semibold leading-tight text-blue-700 transition-colors hover:text-blue-900"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
                {aiError ? <p className="text-sm font-medium text-red-600">{aiError}</p> : null}
              </div>
            )}
          </div>
        </div>

        {isMarketVariant ? (
          <MarketFilterToolbar
            draftFilters={draftFilters}
            setDraftFilters={setDraftFilters}
            rateTypeOptions={rateTypeOptions}
            issuerOptions={issuerOptions}
            bondTypeOptions={bondTypeOptions}
            industryOptions={industryOptions}
            searchOptions={searchOptions}
          resultCount={resultCount}
          totalCount={totalCount}
          marketActionSlot={marketActionSlot}
          showFilterControls={showFilterControls}
        />
        ) : isMaturityVariant ? (
          <MaturityFilterToolbar
            draftFilters={draftFilters}
            setDraftFilters={setDraftFilters}
            rateTypeOptions={rateTypeOptions}
            issuerOptions={issuerOptions}
            bondTypeOptions={bondTypeOptions}
            industryOptions={industryOptions}
            resultCount={resultCount}
            totalCount={totalCount}
            onApply={onApply}
            onReset={onReset}
            marketActionSlot={marketActionSlot}
            showFilterControls={showFilterControls}
          />
        ) : !isMarketVariant && !isMaturityVariant && showStandardToolbar ? (
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
        ) : null}
      </div>
    </section>
  );
}

interface MaturityFilterToolbarProps {
  draftFilters: BondFilterState;
  setDraftFilters: Dispatch<SetStateAction<BondFilterState>>;
  rateTypeOptions: string[];
  issuerOptions: string[];
  bondTypeOptions: string[];
  industryOptions: string[];
  searchOptions: string[];
  resultCount: number;
  totalCount: number;
  onApply: () => void;
  onReset: () => void;
  marketActionSlot?: ReactNode;
  showFilterControls?: boolean;
}

function MaturityFilterToolbar({
  draftFilters,
  setDraftFilters,
  rateTypeOptions,
  issuerOptions,
  bondTypeOptions,
  industryOptions,
  searchOptions,
  resultCount,
  totalCount,
  onApply,
  onReset,
  marketActionSlot,
  showFilterControls = true,
}: MaturityFilterToolbarProps) {
  const { t } = useLanguage();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpenMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="space-y-3">
      {showFilterControls ? (
        <>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
        <div className="grid min-w-0 flex-1 gap-2 xl:grid-cols-6">
          <SearchFilterField
            value={draftFilters.searchTerm}
            onChange={(value) => setDraftFilters((current) => ({ ...current, searchTerm: value }))}
            suggestions={searchOptions}
          />
          <SelectFilterChip
            icon={ListFilter}
            label={t('industryLabel')}
            value={draftFilters.industry}
            options={industryOptions}
            open={openMenu === 'industry'}
            onToggle={() => setOpenMenu((current) => (current === 'industry' ? null : 'industry'))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, industry: value }))}
            onClose={() => setOpenMenu(null)}
            fullWidth
          />
          <SelectFilterChip
            icon={Building2}
            label={t('issuer')}
            value={draftFilters.issuer}
            options={issuerOptions}
            open={openMenu === 'issuer'}
            onToggle={() => setOpenMenu((current) => (current === 'issuer' ? null : 'issuer'))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, issuer: value }))}
            onClose={() => setOpenMenu(null)}
            fullWidth
          />
          <SelectFilterChip
            icon={BadgePercent}
            label={t('interestType')}
            value={draftFilters.bondRateType}
            options={rateTypeOptions}
            open={openMenu === 'bondRateType'}
            onToggle={() => setOpenMenu((current) => (current === 'bondRateType' ? null : 'bondRateType'))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, bondRateType: value }))}
            onClose={() => setOpenMenu(null)}
            fullWidth
          />
          <RangeFilterChip
            icon={BadgePercent}
            label={t('interestRate')}
            minValue={draftFilters.bondRateMin}
            maxValue={draftFilters.bondRateMax}
            unit={t('unitPercentLabel')}
            open={openMenu === 'bondRate'}
            onToggle={() => setOpenMenu((current) => (current === 'bondRate' ? null : 'bondRate'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMax: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={ListFilter}
            label={t('term')}
            minValue={draftFilters.tenorMin}
            maxValue={draftFilters.tenorMax}
            unit={t('monthUnit')}
            open={openMenu === 'tenorPeriod'}
            onToggle={() => setOpenMenu((current) => (current === 'tenorPeriod' ? null : 'tenorPeriod'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, tenorMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, tenorMax: value }))}
            fullWidth
          />
        </div>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
        <div className="grid min-w-0 flex-1 gap-2 xl:grid-cols-6">
          <RangeFilterChip
            icon={CalendarRange}
            label={t('issueDate')}
            minValue={draftFilters.issueDateFrom}
            maxValue={draftFilters.issueDateTo}
            open={openMenu === 'issueDate'}
            onToggle={() => setOpenMenu((current) => (current === 'issueDate' ? null : 'issueDate'))}
            onClose={() => setOpenMenu(null)}
            inputType="date"
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, issueDateFrom: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, issueDateTo: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={CalendarRange}
            label={t('maturityDate')}
            minValue={draftFilters.maturityDateFrom}
            maxValue={draftFilters.maturityDateTo}
            open={openMenu === 'maturityDate'}
            onToggle={() => setOpenMenu((current) => (current === 'maturityDate' ? null : 'maturityDate'))}
            onClose={() => setOpenMenu(null)}
            inputType="date"
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateFrom: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateTo: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={CalendarRange}
            label={t('remainingTermLabel')}
            minValue={draftFilters.remainingDaysMin}
            maxValue={draftFilters.remainingDaysMax}
            unit={t('daysUnit')}
            open={openMenu === 'remainingDays'}
            onToggle={() => setOpenMenu((current) => (current === 'remainingDays' ? null : 'remainingDays'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, remainingDaysMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, remainingDaysMax: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={CalendarRange}
            label={t('listedVolume')}
            minValue={draftFilters.listedVolumeMin}
            maxValue={draftFilters.listedVolumeMax}
            open={openMenu === 'listedVolume'}
            onToggle={() => setOpenMenu((current) => (current === 'listedVolume' ? null : 'listedVolume'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, listedVolumeMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, listedVolumeMax: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={Landmark}
            label={t('issuedValue')}
            unit={t('unitBillionVND')}
            minValue={draftFilters.issuedValueMin}
            maxValue={draftFilters.issuedValueMax}
            open={openMenu === 'issuedValue'}
            onToggle={() => setOpenMenu((current) => (current === 'issuedValue' ? null : 'issuedValue'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, issuedValueMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, issuedValueMax: value }))}
            fullWidth
          />
          <RangeFilterChip
            icon={Landmark}
            label={t('listedValue')}
            unit={t('unitBillionVND')}
            minValue={draftFilters.listedValueMin}
            maxValue={draftFilters.listedValueMax}
            open={openMenu === 'listedValue'}
            onToggle={() => setOpenMenu((current) => (current === 'listedValue' ? null : 'listedValue'))}
            onClose={() => setOpenMenu(null)}
            onMinChange={(value) => setDraftFilters((current) => ({ ...current, listedValueMin: value }))}
            onMaxChange={(value) => setDraftFilters((current) => ({ ...current, listedValueMax: value }))}
            fullWidth
          />
        </div>

        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex w-fit shrink-0 items-center rounded-full border border-blue-100/80 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:border-blue-400/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20 dark:text-blue-300 sm:px-3 sm:py-1.5 sm:text-sm">
          {t('filterResults')}: {resultCount.toLocaleString()} / {totalCount.toLocaleString()}
        </div>

        {marketActionSlot}
      </div>
        </>
      ) : null}
    </div>
  );
}

interface OptionFilterChipProps {
  icon: LucideIcon;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  fullWidth?: boolean;
}

function OptionFilterChip({
  icon,
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
  onClose,
  fullWidth = false,
}: OptionFilterChipProps) {
  const { t } = useLanguage();
  const activeOption = options.find((option) => option.value === value);

  return (
    <FilterPopoverShell
      open={open}
      widthClass="w-64"
      onClose={onClose}
      button={(
        <FilterChipButton
          icon={icon}
          label={label}
          active={Boolean(value)}
          open={open}
          valueText={activeOption ? `${label}: ${activeOption.label}` : label}
          onClick={onToggle}
          fullWidth={fullWidth}
        />
      )}
    >
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClose();
          }}
          className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${
            !value
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
              : 'text-text-base hover:bg-surface-container-low'
          }`}
        >
          {t('all')}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                onClose();
              }}
              className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${
                value === option.value
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-text-base hover:bg-surface-container-low'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </FilterPopoverShell>
  );
}

interface MarketFilterToolbarProps {
  draftFilters: BondFilterState;
  setDraftFilters: Dispatch<SetStateAction<BondFilterState>>;
  rateTypeOptions: string[];
  issuerOptions: string[];
  bondTypeOptions: string[];
  industryOptions: string[];
  searchOptions: string[];
  resultCount: number;
  totalCount: number;
  marketActionSlot?: ReactNode;
  showFilterControls?: boolean;
}

function MarketFilterToolbar({
  draftFilters,
  setDraftFilters,
  rateTypeOptions,
  issuerOptions,
  bondTypeOptions,
  industryOptions,
  searchOptions,
  resultCount,
  totalCount,
  marketActionSlot,
  showFilterControls = true,
}: MarketFilterToolbarProps) {
  const { t } = useLanguage();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpenMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="space-y-3">
      {showFilterControls ? (
        <>
          <div className="grid gap-2 xl:grid-cols-6">
            <SearchFilterField
              value={draftFilters.searchTerm}
              onChange={(value) => setDraftFilters((current) => ({ ...current, searchTerm: value }))}
              suggestions={searchOptions}
            />
            <SelectFilterChip
              icon={ListFilter}
              label={t('industryLabel')}
              value={draftFilters.industry}
              options={industryOptions}
              open={openMenu === 'industry'}
              onToggle={() => setOpenMenu((current) => (current === 'industry' ? null : 'industry'))}
              onChange={(value) => setDraftFilters((current) => ({ ...current, industry: value }))}
              onClose={() => setOpenMenu(null)}
              fullWidth
            />
            <SelectFilterChip
              icon={Building2}
              label={t('issuer')}
              value={draftFilters.issuer}
              options={issuerOptions}
              open={openMenu === 'issuer'}
              onToggle={() => setOpenMenu((current) => (current === 'issuer' ? null : 'issuer'))}
              onChange={(value) => setDraftFilters((current) => ({ ...current, issuer: value }))}
              onClose={() => setOpenMenu(null)}
              fullWidth
            />
            <SelectFilterChip
              icon={ListFilter}
              label={t('bondTypeLabel')}
              value={draftFilters.bondType}
              options={bondTypeOptions}
              open={openMenu === 'bondType'}
              onToggle={() => setOpenMenu((current) => (current === 'bondType' ? null : 'bondType'))}
              onChange={(value) => setDraftFilters((current) => ({ ...current, bondType: value }))}
              onClose={() => setOpenMenu(null)}
              fullWidth
            />
            <SelectFilterChip
              icon={BadgePercent}
              label={t('interestType')}
              value={draftFilters.bondRateType}
              options={rateTypeOptions}
              open={openMenu === 'bondRateType'}
              onToggle={() => setOpenMenu((current) => (current === 'bondRateType' ? null : 'bondRateType'))}
              onChange={(value) => setDraftFilters((current) => ({ ...current, bondRateType: value }))}
              onClose={() => setOpenMenu(null)}
              fullWidth
            />
            <RangeFilterChip
              icon={BadgePercent}
              label={t('interestRate')}
              minValue={draftFilters.bondRateMin}
              maxValue={draftFilters.bondRateMax}
              unit={t('unitPercentLabel')}
              open={openMenu === 'bondRate'}
              onToggle={() => setOpenMenu((current) => (current === 'bondRate' ? null : 'bondRate'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, bondRateMax: value }))}
              fullWidth
            />
          </div>

          <div className="grid gap-2 xl:grid-cols-6">
            <RangeFilterChip
              icon={ListFilter}
              label={t('term')}
              minValue={draftFilters.tenorMin}
              maxValue={draftFilters.tenorMax}
              unit={t('monthUnit')}
              open={openMenu === 'tenor'}
              onToggle={() => setOpenMenu((current) => (current === 'tenor' ? null : 'tenor'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, tenorMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, tenorMax: value }))}
              fullWidth
            />
            <RangeFilterChip
              icon={CalendarRange}
              label={t('issueDate')}
              minValue={draftFilters.issueDateFrom}
              maxValue={draftFilters.issueDateTo}
              inputType="date"
              open={openMenu === 'issueDate'}
              onToggle={() => setOpenMenu((current) => (current === 'issueDate' ? null : 'issueDate'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, issueDateFrom: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, issueDateTo: value }))}
              fullWidth
            />
            <RangeFilterChip
              icon={CalendarRange}
              label={t('maturityDate')}
              minValue={draftFilters.maturityDateFrom}
              maxValue={draftFilters.maturityDateTo}
              inputType="date"
              open={openMenu === 'maturityDate'}
              onToggle={() => setOpenMenu((current) => (current === 'maturityDate' ? null : 'maturityDate'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateFrom: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, maturityDateTo: value }))}
              fullWidth
            />
            <RangeFilterChip
              icon={ListFilter}
              label={t('listedVolume')}
              minValue={draftFilters.listedVolumeMin}
              maxValue={draftFilters.listedVolumeMax}
              open={openMenu === 'listedVolume'}
              onToggle={() => setOpenMenu((current) => (current === 'listedVolume' ? null : 'listedVolume'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, listedVolumeMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, listedVolumeMax: value }))}
              fullWidth
            />
            <RangeFilterChip
              icon={Landmark}
              label={t('issuedValue')}
              minValue={draftFilters.issuedValueMin}
              maxValue={draftFilters.issuedValueMax}
              unit={t('unitBillionVND')}
              open={openMenu === 'issuedValue'}
              onToggle={() => setOpenMenu((current) => (current === 'issuedValue' ? null : 'issuedValue'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, issuedValueMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, issuedValueMax: value }))}
              fullWidth
            />
            <RangeFilterChip
              icon={Landmark}
              label={t('listedValue')}
              minValue={draftFilters.listedValueMin}
              maxValue={draftFilters.listedValueMax}
              unit={t('unitBillionVND')}
              open={openMenu === 'listedValue'}
              onToggle={() => setOpenMenu((current) => (current === 'listedValue' ? null : 'listedValue'))}
              onClose={() => setOpenMenu(null)}
              onMinChange={(value) => setDraftFilters((current) => ({ ...current, listedValueMin: value }))}
              onMaxChange={(value) => setDraftFilters((current) => ({ ...current, listedValueMax: value }))}
              fullWidth
            />
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full border border-blue-100/80 bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:border-blue-400/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20 dark:text-blue-300 sm:px-3 sm:py-1.5 sm:text-sm">
          {t('filterResults')}: {resultCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>

        {marketActionSlot}
      </div>
    </div>
  );
}

export function SearchFilterField({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const { t } = useLanguage();
  const [isFocused, setIsFocused] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const visibleSuggestions = normalizedValue
    ? suggestions
        .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        .filter((option) => option.toLowerCase().includes(normalizedValue))
        .slice(0, 8)
    : [];

  return (
    <div className={open ? 'relative z-40' : 'relative'}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
          placeholder={t('searchBondPlaceholder')}
          className="h-11 w-full rounded-lg border border-border-base bg-bg-base pl-10 pr-4 text-sm font-semibold text-text-base outline-none transition-colors placeholder:text-text-muted/80 focus:border-blue-400"
        />
      </label>
      {isFocused && visibleSuggestions.length > 0 ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-full rounded-lg border border-border-base bg-bg-surface p-2 shadow-xl shadow-blue-950/10">
          <div className="max-h-64 overflow-y-auto">
            {visibleSuggestions.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setIsFocused(false);
                }}
                className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-text-base transition-colors hover:bg-surface-container-low"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ActionFilterButton({
  icon: Icon,
  label,
  onClick,
  variant,
  className = '',
  iconClassName = '',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary';
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${className} ${
        variant === 'primary'
          ? 'bg-blue-600 text-white hover:bg-blue-500'
          : 'border border-border-base bg-bg-base text-text-base hover:border-blue-200 hover:text-text-highlight'
        }`}
    >
      <Icon className={`h-4 w-4 ${iconClassName}`} />
      <span>{label}</span>
    </button>
  );
}

interface FilterChipButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  open: boolean;
  valueText?: string;
  onClick: () => void;
  fullWidth?: boolean;
}

export function FilterChipButton({ icon: Icon, label, active, open, valueText, onClick, fullWidth = false }: FilterChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${fullWidth ? 'w-full' : ''} ${
        active || open
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300'
          : 'border-border-base bg-bg-base text-text-base hover:border-blue-200 hover:text-text-highlight'
      }`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Icon className="h-4 w-4 shrink-0 text-blue-600" />
      <span className="max-w-xs truncate">{valueText || label}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

interface FilterPopoverShellProps {
  button: ReactNode;
  open: boolean;
  children: ReactNode;
  widthClass?: string;
  onClose?: () => void;
}

export function FilterPopoverShell({ button, open, children, widthClass = 'w-72', onClose }: FilterPopoverShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !onClose) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      {button}
      {open ? (
        <div className={`absolute left-0 top-full z-50 mt-2 ${widthClass} max-w-screen-sm rounded-lg border border-border-base bg-bg-surface p-3 shadow-xl shadow-blue-950/10`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface SelectFilterChipProps {
  icon: LucideIcon;
  label: string;
  value: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  fullWidth?: boolean;
}

export function SelectFilterChip({ icon, label, value, options, open, onToggle, onChange, onClose, fullWidth = false }: SelectFilterChipProps) {
  const { t } = useLanguage();
  const active = Boolean(value);

  return (
    <FilterPopoverShell
      open={open}
      widthClass="w-64"
      onClose={onClose}
      button={(
        <FilterChipButton
          icon={icon}
          label={label}
          active={active}
          open={open}
          valueText={active ? `${label}: ${getDisplayOptionLabel(t, value)}` : undefined}
          onClick={onToggle}
          fullWidth={fullWidth}
        />
      )}
    >
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClose();
          }}
          className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${
            !active
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
              : 'text-text-base hover:bg-surface-container-low'
          }`}
        >
          {t('all')}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {options
            .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
            .map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                onClose();
              }}
              className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${
                value === option
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-text-base hover:bg-surface-container-low'
              }`}
            >
              {getDisplayOptionLabel(t, option)}
            </button>
          ))}
        </div>
      </div>
    </FilterPopoverShell>
  );
}

interface RangeFilterChipProps {
  icon: LucideIcon;
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  unit?: string;
  inputType?: 'number' | 'date';
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  fullWidth?: boolean;
}

export function RangeFilterChip({
  icon,
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  unit,
  inputType = 'number',
  open,
  onToggle,
  onClose,
  fullWidth = false,
}: RangeFilterChipProps) {
  const { t } = useLanguage();
  const active = Boolean(minValue || maxValue);
  const summary = buildRangeSummary(label, minValue, maxValue, unit);
  const buttonLabel = unit ? `${label} (${unit})` : label;
  const [tempMin, setTempMin] = useState(minValue);
  const [tempMax, setTempMax] = useState(maxValue);

  useEffect(() => {
    if (open) {
      setTempMin(minValue);
      setTempMax(maxValue);
    }
  }, [maxValue, minValue, open]);

  const handleChoose = () => {
    onMinChange(tempMin);
    onMaxChange(tempMax);
    onClose();
  };

  const handleReset = () => {
    setTempMin('');
    setTempMax('');
    onMinChange('');
    onMaxChange('');
    onClose();
  };

  return (
    <FilterPopoverShell
      open={open}
      onClose={onClose}
      button={(
        <FilterChipButton
          icon={icon}
          label={label}
          active={active}
          open={open}
          valueText={active ? summary : buttonLabel}
          onClick={onToggle}
          fullWidth={fullWidth}
        />
      )}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted/80">{t('minLabel')}</span>
            <input
              type={inputType}
              inputMode={inputType === 'number' ? 'decimal' : undefined}
              value={tempMin}
              placeholder={inputType === 'date' ? undefined : t('minLabel')}
              onChange={(event) => setTempMin(event.target.value)}
              className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors focus:border-blue-400"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted/80">{t('maxLabel')}</span>
            <input
              type={inputType}
              inputMode={inputType === 'number' ? 'decimal' : undefined}
              value={tempMax}
              placeholder={inputType === 'date' ? undefined : t('maxLabel')}
              onChange={(event) => setTempMax(event.target.value)}
              className="w-full rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors focus:border-blue-400"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleChoose}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            {t('choose')}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
          >
            {t('reset')}
          </button>
        </div>
      </div>
    </FilterPopoverShell>
  );
}

function buildRangeSummary(
  label: string,
  minValue: string,
  maxValue: string,
  unit: string | undefined,
) {
  if (minValue && maxValue) {
    return `${label}: ${minValue} - ${maxValue}${unit ? ` (${unit})` : ''}`;
  }

  if (minValue) {
    return `${label}: ${minValue}${unit ? ` (${unit})` : ''}`;
  }

  if (maxValue) {
    return `${label}: ${maxValue}${unit ? ` (${unit})` : ''}`;
  }

  return unit ? `${label} (${unit})` : label;
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
            {getDisplayOptionLabel(t, option)}
          </option>
        ))}
      </select>
    </label>
  );
}
