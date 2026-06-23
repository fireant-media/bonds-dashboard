import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpDown, ChevronRight, ChevronLeft, Download, Hash, BadgeDollarSign, Landmark, Wallet, CheckCircle2, RotateCcw, Filter, FilterX, ListFilter, ListOrdered, EyeOff } from 'lucide-react';
import { Enterprise } from '../types';
import { Bond } from "../types";
import BondDetailPopup from './BondDetailPopup';
import ChartWithToolbar from './ChartWithToolbar';
import AIInsightPanel from './AIInsightPanel';
import { formatInterestRate, formatNumber, formatDate, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface EnterpriseViewProps {
  selectedEnterprise: Enterprise | null;
  setSelectedEnterprise: (enterprise: Enterprise | null) => void;
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
  listTitle?: string;
  breadcrumbTitle?: string;
}

import { getFireantToken, cleanTokenString } from '../utils/token';
import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { CHART_PALETTE, getComparisonAreaSeriesStyle, getChartTheme, getChartTooltip, highlightChartTooltipValue, splitLegendItems } from '../utils/chart';
import { readJsonResponse } from '../utils/http';
import { sendChat } from '../api/ai';
import { buildFireantUrl } from '../api/fireant';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { MetricCard } from './ui/Card';
import { exportRowsToExcel } from '../utils/excel';
import { fireantApi } from '../api/fireant';
import {
  buildEnterpriseIndustryOptions,
  resolveIndustryKeyFromCandidates,
  resolveIndustryKeyFromCandidates as resolveIndustryFromShared,
} from '../constants/industries';
import { ENTERPRISE_LIST_DATA_CACHE_KEY, loadEnterpriseListByIssuerSymbol } from '../services/enterpriseListData';
import { loadBondDetail, loadIssuerBondsByFilter, loadIssuerProfile, type BondDataRow } from '../services/bondData';
import { useAIStore } from '../store/aiStore';
import { clearViewChatContext, setViewChatContext } from '../utils/viewChatContext';
import {
  ActionFilterButton,
  RangeFilterChip,
  SearchFilterField,
  SelectFilterChip,
} from './BondFilterPanel';

const readEnterpriseCache = (primaryKey: string) => {
  const primary = getCache(primaryKey);
  return Array.isArray(primary) && primary.length > 0 ? primary : null;
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const roundMetric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeTermBase = (value: unknown, monthUnit: string) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const normalizedMonthUnit = String(monthUnit || '').trim();
  if (!normalizedMonthUnit) return raw;

  const monthUnitPattern = escapeRegExp(normalizedMonthUnit);
  return raw.replace(new RegExp(`(?:\\s*${monthUnitPattern})+$`, 'i'), '').trim();
};

const formatTermWithMonthUnit = (value: unknown, monthUnit: string) => {
  const base = normalizeTermBase(value, monthUnit);
  if (!base) return '';
  return `${base} ${monthUnit}`.trim();
};

const ENTERPRISE_AI_FALLBACK_MODEL = 'gpt-5.4-mini';

const normalizeAIJsonText = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const normalizeTextKey = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const toEnterpriseBondRow = (bond: Bond, issuerName = '', issuerSymbol = ''): BondDataRow => ({
  bondCode: bond.code,
  issuerSymbol: issuerSymbol || bond.enterpriseId || '',
  issuerName,
  bondType: '',
  industry: '',
  issueDate: bond.issueDate || '',
  maturityDate: bond.maturityDate || '',
  tenorPeriod: Number.parseFloat(String(bond.term || '')) || 0,
  bondRate: Number(bond.interestRate || 0),
  bondRateType: bond.interestType || '',
  currentListedVolume: Number(bond.listedVolume || 0),
  currentListedValue: Number(bond.listedValue || 0) * 1000000000,
  totalIssuedValue: Number(bond.issuedValue || 0) * 1000000000,
  totalRemainingDebt: 0,
  totalDebtFull: 0,
  status: bond.status || '',
  bondInfos: {},
  raw: bond,
});

const toBondValueBillion = (value: unknown) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? numericValue / 1_000_000_000 : 0;
};

const mapIssuerBondRowToBond = (row: BondDataRow, enterpriseId: string): Bond => ({
  id: row.bondCode,
  code: row.bondCode,
  enterpriseId,
  term: row.tenorPeriod ? String(row.tenorPeriod) : 'N/A',
  interestRate: Number(row.bondRate || 0),
  listedVolume: Number(row.currentListedVolume || 0),
  issuedValue: toBondValueBillion(row.totalIssuedValue),
  listedValue: toBondValueBillion(row.currentListedValue || row.totalRemainingDebt || row.totalIssuedValue),
  issueDate: row.issueDate?.split('T')[0] || '',
  maturityDate: row.maturityDate?.split('T')[0] || '',
  interestType: normalizeInterestType(
    row.bondRateType || '',
    row.bondInfos?.interestPaymentMethod || row.bondInfos?.paymentMethod || row.bondType || '',
    [],
  ) || 'N/A',
  bondType: row.bondType || '',
  status: row.status || '',
});

const enrichIssuerBondWithDetail = (bond: Bond, detailData: any): Bond => {
  const detail = detailData?.detail || detailData || {};
  const historyItem = Array.isArray(detailData?.history) ? detailData.history[0] : undefined;
  const rawCashFlows = Array.isArray(detailData?.cashFlows) ? detailData.cashFlows : [];
  const rawInterestType =
    detail?.bondRateType ||
    detail?.BondRateType ||
    detail?.interestRateType ||
    detail?.InterestRateType ||
    detail?.couponRateType ||
    detail?.CouponRateType ||
    detail?.interestType ||
    bond.interestType ||
    '';
  const paymentMethod =
    detail?.interestPaymentMethod ||
    detail?.paymentMethod ||
    detail?.bondType ||
    detail?.BondType ||
    detail?.bondName ||
    bond.bondType ||
    '';
  const listedVolume = Number(
    detail?.currentListedVolume ||
    detail?.CurrentListedVolume ||
    historyItem?.volume ||
    bond.listedVolume ||
    0,
  );
  const issuedValueRaw = Number(
    detail?.totalIssuedValue ||
    detail?.TotalIssuedValue ||
    historyItem?.value ||
    0,
  );
  const listedValueRaw = Number(
    detail?.currentListedValue ||
    detail?.CurrentListedValue ||
    detail?.totalRemainingDebt ||
    detail?.TotalRemainingDebt ||
    historyItem?.value ||
    issuedValueRaw ||
    0,
  );

  return {
    ...bond,
    enterpriseId: detail?.issuerSymbol || detail?.IssuerSymbol || bond.enterpriseId,
    term: detail?.tenorPeriod ? String(detail.tenorPeriod) : detail?.TenorPeriod ? String(detail.TenorPeriod) : bond.term,
    interestRate: Number(
      detail?.bondRate ||
      detail?.BondRate ||
      detail?.interestRate ||
      detail?.InterestRate ||
      detail?.couponRate ||
      detail?.CouponRate ||
      rawCashFlows[0]?.bondRate ||
      bond.interestRate ||
      0,
    ),
    listedVolume,
    issuedValue: issuedValueRaw > 0 ? issuedValueRaw / 1_000_000_000 : bond.issuedValue,
    listedValue: listedValueRaw > 0 ? listedValueRaw / 1_000_000_000 : bond.listedValue,
    issueDate: detail?.issueDate ? String(detail.issueDate).split('T')[0] : detail?.IssueDate ? String(detail.IssueDate).split('T')[0] : bond.issueDate,
    maturityDate: detail?.maturityDate ? String(detail.maturityDate).split('T')[0] : detail?.MaturityDate ? String(detail.MaturityDate).split('T')[0] : bond.maturityDate,
    interestType: normalizeInterestType(rawInterestType, paymentMethod, rawCashFlows) || bond.interestType,
    bondType: detail?.bondType || detail?.BondType || bond.bondType,
    status: detail?.status || detail?.Status || bond.status,
    cashFlows: rawCashFlows.map((cf: any) => ({
      paymentDate: cf.paymentDate,
      interestAmount: (cf.interestAmount || 0) / 1_000_000_000,
      principalAmount: (cf.principalAmount || 0) / 1_000_000_000,
      totalCashflow: (cf.totalCashflow || 0) / 1_000_000_000,
      bondRate: cf.bondRate || 0,
    })),
  };
};

export default function EnterpriseView({ 
  selectedEnterprise, 
  setSelectedEnterprise,
  setSelectedBond,
  setBondEnterpriseName,
  listTitle,
  breadcrumbTitle,
}: EnterpriseViewProps) {
  const location = useLocation();
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const { isLoadingStatus } = useAIStore();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const cachedData = readEnterpriseCache(ENTERPRISE_LIST_DATA_CACHE_KEY);
  const [industryFilter, setIndustryFilter] = useState('All');
  const [enterpriseSearchTerm, setEnterpriseSearchTerm] = useState('');
  const [enterpriseIssuedValueMin, setEnterpriseIssuedValueMin] = useState('');
  const [enterpriseIssuedValueMax, setEnterpriseIssuedValueMax] = useState('');
  const [enterpriseRemainingDebtMin, setEnterpriseRemainingDebtMin] = useState('');
  const [enterpriseRemainingDebtMax, setEnterpriseRemainingDebtMax] = useState('');
  const [appliedIndustryFilter, setAppliedIndustryFilter] = useState('All');
  const [appliedEnterpriseSearchTerm, setAppliedEnterpriseSearchTerm] = useState('');
  const [appliedEnterpriseIssuedValueMin, setAppliedEnterpriseIssuedValueMin] = useState('');
  const [appliedEnterpriseIssuedValueMax, setAppliedEnterpriseIssuedValueMax] = useState('');
  const [appliedEnterpriseRemainingDebtMin, setAppliedEnterpriseRemainingDebtMin] = useState('');
  const [appliedEnterpriseRemainingDebtMax, setAppliedEnterpriseRemainingDebtMax] = useState('');
  const [enterpriseAIPrompt, setEnterpriseAIPrompt] = useState('');
  const [enterpriseAISummary, setEnterpriseAISummary] = useState<string[]>([]);
  const [enterpriseAIError, setEnterpriseAIError] = useState<string | null>(null);
  const [isApplyingEnterpriseAIFilter, setIsApplyingEnterpriseAIFilter] = useState(false);
  const [isFilterControlsVisible, setIsFilterControlsVisible] = useState(false);
  const [enterpriseAppliedSortField, setEnterpriseAppliedSortField] = useState<'ticker' | 'bondCount' | 'issuedValue' | 'remainingDebt' | null>(null);
  const [enterpriseAppliedSortDirection, setEnterpriseAppliedSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [enterprises, setEnterprises] = useState<Enterprise[]>(
    Array.isArray(cachedData)
      ? cachedData.map((enterprise: Enterprise) => ({
          ...enterprise,
          industry: resolveIndustryFromShared(enterprise.industry),
        }))
      : []
  );
  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(getCache('enterprise_names_en') || {});
  const [issuerBonds, setIssuerBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [loadingBonds, setLoadingBonds] = useState(false);
  const [bondError, setBondError] = useState<string | null>(null);
  const [enterprisePage, setEnterprisePage] = useState(1);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [financialData, setFinancialData] = useState<any>(null);
  const [enterpriseProfile, setEnterpriseProfile] = useState<any>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [enterpriseFilterMenu, setEnterpriseFilterMenu] = useState<string | null>(null);
  const [enterpriseHiddenColumnIds, setEnterpriseHiddenColumnIds] = useState<string[]>([]);
  const [enterpriseColumnVisibilityDraft, setEnterpriseColumnVisibilityDraft] = useState<string[]>([]);
  const [enterpriseColumnVisibilityOpen, setEnterpriseColumnVisibilityOpen] = useState(false);
  const enterpriseColumnVisibilityRef = useRef<HTMLDivElement | null>(null);
  const enterprisesPerPage = 10;

  const chartColors = CHART_PALETTE;

  const legendStyle = {
    fontSize: 10,
    color: chartTheme.subText,
    fontFamily: 'Manrope',
  };

  const axisLabelStyle = {
    fontSize: 10,
    color: chartTheme.subText,
    fontFamily: 'Manrope',
  };

  const tooltipTextStyle = { ...getChartTooltip(isDark).textStyle, fontSize: 10 };
  const chartTooltip = getChartTooltip(isDark);

  const chartTitleStyle = {
    fontSize: 10,
    color: chartTheme.text,
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };

  const chartPalette = CHART_PALETTE;
  const normalizeEnterpriseSearch = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const enterpriseIndustryOptions = useMemo(() => {
    return buildEnterpriseIndustryOptions(enterprises).map((item) => ({
      ...item,
      label: t(item.label as any),
    }));
  }, [enterprises, t]);
  const enterpriseSearchSuggestions = useMemo(() => {
    const normalizedTerm = normalizeEnterpriseSearch(enterpriseSearchTerm);
    if (!normalizedTerm) return [];

    return enterprises
      .map((enterprise) => {
        const ticker = String(enterprise.ticker || '').trim();
        const displayName = String(t(enterprise.name as any, enterprise.ticker) || '').trim();
        const rawName = String(enterprise.name || '').trim();
        const englishName = String(enterpriseNamesEN[enterprise.ticker] || '').trim();
        const haystack = normalizeEnterpriseSearch([ticker, displayName, rawName, englishName].filter(Boolean).join(' '));

        if (!haystack.includes(normalizedTerm)) return null;

        return {
          ticker,
          label: displayName || englishName || rawName || ticker,
        };
      })
      .filter((item): item is { ticker: string; label: string } => Boolean(item))
      .slice(0, 8);
  }, [enterpriseNamesEN, enterpriseSearchTerm, enterprises, t]);
  const enterpriseAIPromptPlaceholder = language === 'en'
    ? 'Example: Show listed companies in real estate with issued value above 1.000 and remaining debt above 500.'
    : 'Ví dụ: Lọc các doanh nghiệp niêm yết ngành bất động sản có giá trị phát hành trên 1.000 và dư nợ còn lại trên 500.';
  const enterpriseAISuggestions = useMemo(() => (
    language === 'en'
      ? [
          'Find listed companies in banking with the highest remaining debt.',
          'Show real estate issuers with issued value above 1.000.',
          'Filter industrial companies with remaining debt below 500.',
        ]
      : [
          'Lọc doanh nghiệp niêm yết ngành ngân hàng có dư nợ còn lại cao.',
          'Hiển thị doanh nghiệp bất động sản có giá trị phát hành trên 1.000.',
          'Lọc doanh nghiệp công nghiệp có dư nợ còn lại dưới 500.',
        ]
  ), [language]);
  const showEnterpriseAISuggestions = enterpriseAISummary.length === 0 && !enterpriseAIError && !enterpriseAIPrompt.trim();
  const safeEnterpriseSearchSuggestions = useMemo(
    () => enterpriseSearchSuggestions.filter((item) => Boolean(item?.label && item?.ticker)),
    [enterpriseSearchSuggestions],
  );

  const bondSortOptions = useMemo(() => ([
    { value: '__default__', label: t('sortBy'), isDefault: true },
    { value: 'issueDate', label: t('issueDate') },
    { value: 'maturityDate', label: t('maturityDate') },
    { value: 'interestRate', label: t('interestRate') },
    { value: 'listedVolume', label: t('listedVolume') },
    { value: 'issuedValue', label: t('issuedValue') },
    { value: 'listedValue', label: t('listedValueTitle') },
  ]), [t]);

  const handleResetEnterpriseFilters = () => {
    setEnterpriseSearchTerm('');
    setEnterpriseIssuedValueMin('');
    setEnterpriseIssuedValueMax('');
    setEnterpriseRemainingDebtMin('');
    setEnterpriseRemainingDebtMax('');
    setIndustryFilter('All');
    setAppliedEnterpriseSearchTerm('');
    setAppliedEnterpriseIssuedValueMin('');
    setAppliedEnterpriseIssuedValueMax('');
    setAppliedEnterpriseRemainingDebtMin('');
    setAppliedEnterpriseRemainingDebtMax('');
    setAppliedIndustryFilter('All');
    setEnterpriseFilterMenu(null);
    setEnterpriseAIPrompt('');
    setEnterpriseAISummary([]);
    setEnterpriseAIError(null);
    setEnterpriseAppliedSortField(null);
    setEnterpriseAppliedSortDirection(null);
    setEnterprisePage(1);
  };

  const applyEnterpriseFilterState = (nextState?: {
    searchTerm?: string;
    industry?: string;
    issuedValueMin?: string;
    issuedValueMax?: string;
    remainingDebtMin?: string;
    remainingDebtMax?: string;
  }) => {
    const nextSearchTerm = nextState?.searchTerm ?? enterpriseSearchTerm;
    const nextIndustry = nextState?.industry ?? industryFilter;
    const nextIssuedValueMin = nextState?.issuedValueMin ?? enterpriseIssuedValueMin;
    const nextIssuedValueMax = nextState?.issuedValueMax ?? enterpriseIssuedValueMax;
    const nextRemainingDebtMin = nextState?.remainingDebtMin ?? enterpriseRemainingDebtMin;
    const nextRemainingDebtMax = nextState?.remainingDebtMax ?? enterpriseRemainingDebtMax;

    setAppliedEnterpriseSearchTerm(nextSearchTerm);
    setAppliedEnterpriseIssuedValueMin(nextIssuedValueMin);
    setAppliedEnterpriseIssuedValueMax(nextIssuedValueMax);
    setAppliedEnterpriseRemainingDebtMin(nextRemainingDebtMin);
    setAppliedEnterpriseRemainingDebtMax(nextRemainingDebtMax);
    setAppliedIndustryFilter(nextIndustry);
    setEnterpriseFilterMenu(null);
    setEnterprisePage(1);
  };

  const handleApplyEnterpriseFilters = () => {
    setAppliedEnterpriseSearchTerm(enterpriseSearchTerm);
    setAppliedEnterpriseIssuedValueMin(enterpriseIssuedValueMin);
    setAppliedEnterpriseIssuedValueMax(enterpriseIssuedValueMax);
    setAppliedEnterpriseRemainingDebtMin(enterpriseRemainingDebtMin);
    setAppliedEnterpriseRemainingDebtMax(enterpriseRemainingDebtMax);
    setAppliedIndustryFilter(industryFilter);
    setEnterpriseFilterMenu(null);
    setEnterprisePage(1);
  };

  const handleApplyEnterpriseAIFilter = async () => {
    const promptToApply = String(enterpriseAIPrompt).trim();
    if (!promptToApply || isApplyingEnterpriseAIFilter) return;

    setEnterpriseAIPrompt(promptToApply);
    setEnterpriseAISummary([]);
    setEnterpriseAIError(null);
    setIsApplyingEnterpriseAIFilter(true);

    try {
      let aiState = useAIStore.getState();
      if (!aiState.configured && !aiState.isLoadingStatus) {
        await aiState.refreshStatus();
        aiState = useAIStore.getState();
      }

      if (!aiState.configured) {
        throw new Error(t('aiNotConfigured'));
      }

      const response = await sendChat({
        userMessage: promptToApply,
        model: aiState.selectedModel || aiState.defaultModel || ENTERPRISE_AI_FALLBACK_MODEL,
        systemPrompt: [
          'You convert enterprise filter requests into compact JSON.',
          'Return JSON only, with no markdown fence.',
          'Number formatting rule: "." is the thousands separator and "," is the decimal separator.',
          'Examples: 1.000 ty = 1000 ty = 1 thousand billion VND. 1000 ty = 1 thousand billion VND. 1,000 = 1 billion VND.',
          'Supported keys:',
          '{"industry":"","minIssuedValueBillion":null,"maxIssuedValueBillion":null,"minRemainingDebtBillion":null,"maxRemainingDebtBillion":null,"summary":[]}',
          'industry should be a Vietnamese or English industry name if present, otherwise empty string.',
          'summary should be a short array of up to 3 human-readable Vietnamese summaries.',
        ].join(' '),
      });

      const parsed = JSON.parse(normalizeAIJsonText(response.text || '{}')) as {
        industry?: string;
        minIssuedValueBillion?: number | string | null;
        maxIssuedValueBillion?: number | string | null;
        minRemainingDebtBillion?: number | string | null;
        maxRemainingDebtBillion?: number | string | null;
        summary?: string[];
      };

      const toOptionalStringNumber = (value: unknown) => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'number') {
          return Number.isFinite(value) ? String(value) : '';
        }

        const normalizedText = String(value)
          .trim()
          .replace(/\s+/g, '')
          .replace(/[^\d,.-]/g, '')
          .replace(/\./g, '')
          .replace(/,/g, '.');

        if (!normalizedText) return '';

        const parsedNumber = Number(normalizedText);
        return Number.isFinite(parsedNumber) ? String(parsedNumber) : '';
      };

      const resolvedIndustry = parsed.industry
        ? (
            enterpriseIndustryOptions.find((item) => {
              const normalizedCandidate = normalizeTextKey(parsed.industry || '');
              return normalizedCandidate === normalizeTextKey(item.value)
                || normalizedCandidate === normalizeTextKey(item.label)
                || normalizedCandidate === normalizeTextKey(t(item.value as any));
            })?.value
            || resolveIndustryKeyFromCandidates(parsed.industry)
          )
        : '';

      const nextIssuedValueMin = toOptionalStringNumber(parsed.minIssuedValueBillion);
      const nextIssuedValueMax = toOptionalStringNumber(parsed.maxIssuedValueBillion);
      const nextRemainingDebtMin = toOptionalStringNumber(parsed.minRemainingDebtBillion);
      const nextRemainingDebtMax = toOptionalStringNumber(parsed.maxRemainingDebtBillion);
      const nextIndustry = resolvedIndustry || 'All';
      const nextFilters = {
        issuedValueMin: nextIssuedValueMin,
        issuedValueMax: nextIssuedValueMax,
        remainingDebtMin: nextRemainingDebtMin,
        remainingDebtMax: nextRemainingDebtMax,
        industry: nextIndustry,
      };

      setEnterpriseIssuedValueMin(nextIssuedValueMin);
      setEnterpriseIssuedValueMax(nextIssuedValueMax);
      setEnterpriseRemainingDebtMin(nextRemainingDebtMin);
      setEnterpriseRemainingDebtMax(nextRemainingDebtMax);
      setIndustryFilter(nextIndustry);
      applyEnterpriseFilterState(nextFilters);
      setEnterpriseAISummary(
        Array.isArray(parsed.summary) ? parsed.summary.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3) : [],
      );
    } catch (requestError) {
      console.error('Failed to apply enterprise AI filter', requestError);
      setEnterpriseAIError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : t('error'),
      );
    } finally {
      setIsApplyingEnterpriseAIFilter(false);
    }
  };

  const handleEnterpriseSuggestionClick = (suggestion: string) => {
    setEnterpriseAIPrompt(suggestion);
    setEnterpriseAISummary([]);
    setEnterpriseAIError(null);
  };

  const handleEnterpriseTableSort = (field: 'ticker' | 'bondCount' | 'issuedValue' | 'remainingDebt') => {
    if (enterpriseAppliedSortField === field) {
      setEnterpriseAppliedSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }

    setEnterpriseAppliedSortField(field);
    setEnterpriseAppliedSortDirection('asc');
  };

  const renderEnterpriseSortHeader = (
    field: 'ticker' | 'bondCount' | 'issuedValue' | 'remainingDebt',
    label: string,
    unit?: string,
    labelClassName = '',
  ) => {
    const isActive = enterpriseAppliedSortField === field;

    return (
      <button
        type="button"
        onClick={() => handleEnterpriseTableSort(field)}
        className={cn(
          "w-full text-center transition-opacity hover:opacity-90",
          unit
            ? "grid grid-cols-[minmax(0,1fr)_auto] grid-rows-2 items-center justify-center gap-x-1"
            : "inline-flex items-center justify-center gap-1",
        )}
      >
        <span className={cn(
          "leading-none",
          unit ? "col-start-1 row-start-1" : "whitespace-nowrap",
          labelClassName,
        )}>
          {label}
        </span>
        {unit ? (
          <span className="col-start-1 row-start-2 whitespace-nowrap leading-none normal-case">
            ({unit})
          </span>
        ) : null}
        <span className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center",
          unit ? "col-start-2 row-span-2 self-center" : "",
        )}>
          <ArrowUpDown className={`h-3.5 w-3.5 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
        </span>
      </button>
    );
  };

  const enterpriseColumnOptions = useMemo(() => ([
    { id: 'ticker', label: t('ticker') },
    { id: 'issuerName', label: t('issuerName') },
    { id: 'bondCount', label: 'Số mã trái phiếu' },
    { id: 'issuedValue', label: `${t('issuedValue')} (${t('unitBillionVND')})` },
    { id: 'remainingDebt', label: `${t('remainingDebtTitle')} (${t('unitBillionVND')})` },
  ]), [t]);

  useEffect(() => {
    if (!enterpriseColumnVisibilityOpen) return undefined;

    setEnterpriseColumnVisibilityDraft(enterpriseHiddenColumnIds);

    const handlePointerDown = (event: MouseEvent) => {
      if (!enterpriseColumnVisibilityRef.current) return;
      if (enterpriseColumnVisibilityRef.current.contains(event.target as Node)) return;
      setEnterpriseColumnVisibilityOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEnterpriseColumnVisibilityOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    document.removeEventListener('keydown', handleEscape);
    };
  }, [enterpriseColumnVisibilityOpen, enterpriseHiddenColumnIds]);

  const showEnterpriseTickerColumn = !enterpriseHiddenColumnIds.includes('ticker');
  const showEnterpriseIssuerNameColumn = !enterpriseHiddenColumnIds.includes('issuerName');
  const showEnterpriseBondCountColumn = !enterpriseHiddenColumnIds.includes('bondCount');
  const showEnterpriseIssuedValueColumn = !enterpriseHiddenColumnIds.includes('issuedValue');
  const showEnterpriseRemainingDebtColumn = !enterpriseHiddenColumnIds.includes('remainingDebt');
  const enterpriseVisibleColumnCount =
    Number(showEnterpriseTickerColumn)
    + Number(showEnterpriseIssuerNameColumn)
    + Number(showEnterpriseBondCountColumn)
    + Number(showEnterpriseIssuedValueColumn)
    + Number(showEnterpriseRemainingDebtColumn)
    + 1;

  useEffect(() => {
    /**
     * Lấy danh sách tất cả các mã trái phiếu được phát hành bởi doanh nghiệp đang được chọn.
     * API: /bonds/issuer/{ticker}
     */
    const fetchBonds = async () => {
      if (!selectedEnterprise) {
        setIssuerBonds([]);
        setLoadingCashFlows(false);
        return;
      }

      setLoadingBonds(true);
      setBondError(null);
      setCashFlowPeriod('year');
      try {
        const data = await loadIssuerBondsByFilter(selectedEnterprise.ticker);

        if (Array.isArray(data)) {
          const mappedBonds: Bond[] = data.map((bondRow) => mapIssuerBondRowToBond(bondRow, selectedEnterprise.id));
          setIssuerBonds(mappedBonds);
          setCache(`enterprise_bonds_${selectedEnterprise.ticker}`, mappedBonds);

          if (mappedBonds.length === 0) return;

          setLoadingCashFlows(true);

          const fetchBondCashFlows = async (bond: Bond): Promise<Bond> => {
            const detailData = await loadBondDetail(bond.code);
            if (!detailData) return bond;
            return enrichIssuerBondWithDetail(bond, detailData);
          };

          const results = await mapWithConcurrency(mappedBonds, 8, fetchBondCashFlows);
          const detailedBonds = results.map((result, index) =>
            result.status === 'fulfilled' ? result.value : mappedBonds[index]
          );
          setIssuerBonds(detailedBonds);
          setCache(`enterprise_bonds_${selectedEnterprise.ticker}`, detailedBonds);
        }
      } catch (error) {
        console.error('Error fetching issuer bonds:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setBondError(t('authError401'));
        } else {
          setBondError(error instanceof Error ? error.message : t('error'));
        }
      } finally {
        setLoadingBonds(false);
        setLoadingCashFlows(false);
      }
    };

    fetchBonds();
  }, [selectedEnterprise]);

  useEffect(() => {
    const fetchFinancialData = async () => {
      if (!selectedEnterprise?.ticker) {
        setFinancialData(null);
        return;
      }

      // Immediately clear old data to avoid showing stale badges for a new enterprise
      setFinancialData(null);
      setLoadingFinancial(true);

      try {
        const token = getFireantToken();
        if (!token) {
          console.warn('Financial data fetch skipped: Missing token');
          return;
        }

        const cleanToken = cleanTokenString(token);
        const symbol = selectedEnterprise.ticker;

        // Fetch multiple quarters to handle null values by falling back to previous periods
        const response = await fetch(buildFireantUrl(`symbols/${encodeURIComponent(symbol)}/financial-data`, { type: 'Q', count: 4 }), {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });

        if (response.ok) {
          const quarters = await readJsonResponse<any[]>(response, `Financial data ${symbol}`);
          if (Array.isArray(quarters) && quarters.length > 0) {
            // Helper to find the latest non-null value for a given field across quarters
            const findLatestValue = (field: string) => {
              for (const q of quarters) {
                const val = q.financialValues?.[field];
                if (val !== null && val !== undefined) return val;
              }
              return null;
            };

            const latestQ = quarters[0];
            
            // Consolidate non-null data from recent quarters
            const indicators = [
              'TotalAsset', 'TotalAssets', 'Assets',
              'TotalStockHolderEquity', 'StockHolderEquity', 'OwnerEquity', 'Equity',
              'TotalRevenue_TTM', 'TotalRevenue', 'NetSale_TTM', 'NetSale',
              'ProfitAfterTax_TTM', 'ProfitAfterTax', 'ParentCompanyShareholderProfitAfterTax_TTM',
              'EBITDA_TTM', 'EBITDA',
              'CashAndCashEquivalentAtTheEndOfPeriod', 'CashAndCashEquivalent', 'Cash', 'CashEquivalent',
              'TotalDebt', 'Liabilities',
              'ROE', 'PB', 'CAR', 'NPL', 'TotalDebtOverEquity', 'CurrentRatio'
            ];

            const consolidatedData: any = {
              __symbol: symbol,
              __period: `${latestQ.quarter}/${latestQ.year}`,
              __companyType: latestQ.companyType
            };

            indicators.forEach(ind => {
              consolidatedData[ind] = findLatestValue(ind);
            });

            setFinancialData(consolidatedData);
            setCache(`enterprise_financial_${symbol}`, consolidatedData);
          } else {
            console.warn(`No financial values found for ${symbol}`);
          }
        } else {
          if (response.status === 401) {
            console.error('Unauthorized (401): Invalid or expired token for financial data.');
          } else {
            console.error(`Financial data fetch failed for ${symbol}: ${response.status}`);
          }
        }
      } catch (error) {
        console.error('Error fetching financial data:', error);
      } finally {
        setLoadingFinancial(false);
      }
    };

    fetchFinancialData();
  }, [selectedEnterprise?.ticker]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!selectedEnterprise?.ticker) {
        setEnterpriseProfile(null);
        return;
      }

      const symbol = selectedEnterprise.ticker;
      try {
        const profile = await loadIssuerProfile(symbol);
        if (profile) {
          setEnterpriseProfile(profile);
          setCache(`enterprise_profile_${symbol}`, profile);
        }
      } catch (error) {
        console.error('Error fetching enterprise profile:', error);
      }
    };

    fetchProfile();
  }, [selectedEnterprise?.ticker]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!cachedData) {
        setLoading(true);
      }
      setError(null);
      try {
        const mappedEnterprises = await loadEnterpriseListByIssuerSymbol();

        if (!isMounted) return;

        if (mappedEnterprises) {
          setEnterprises(mappedEnterprises);
          if (isMounted) setLoading(false); 

          setCache('enterprise_list', mappedEnterprises);

          // Background fetch international names for English mode
          const tickersToFetch = mappedEnterprises
            .map(e => e.ticker)
            .filter(ticker => !enterpriseNamesEN[ticker]);
          
          if (tickersToFetch.length > 0) {
            const fetchNames = async () => {
              const currentENNames = { ...enterpriseNamesEN };
              const results = await mapWithConcurrency(tickersToFetch, 5, async (ticker) => {
                const profile = await loadIssuerProfile(ticker);
                if (!profile) return null;
                return { ticker, name: profile.internationalName };
              });

              if (!isMounted) return;

              let hasUpdates = false;
              getFulfilledValues(results).forEach(res => {
                if (res && res.name) {
                  currentENNames[res.ticker] = res.name;
                  hasUpdates = true;
                }
              });

              if (hasUpdates) {
                setEnterpriseNamesEN({ ...currentENNames });
                setCache('enterprise_names_en', { ...currentENNames });
              }
            };

            fetchNames();
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching enterprise data:', error);
        if (!cachedData) {
          if (error instanceof Error && error.message.includes('401')) {
            setError(t('tokenError401'));
          } else {
            setError(error instanceof Error ? error.message : t('error'));
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    setEnterprisePage(1);
  }, [appliedIndustryFilter, appliedEnterpriseIssuedValueMin, appliedEnterpriseIssuedValueMax, appliedEnterpriseRemainingDebtMin, appliedEnterpriseRemainingDebtMax, enterpriseAppliedSortField, enterpriseAppliedSortDirection]);

  useEffect(() => {
    setEnterprisePage(1);
  }, [enterpriseAppliedSortField, enterpriseAppliedSortDirection]);

  const filteredEnterprises = useMemo(() => {
    const searchTerm = normalizeEnterpriseSearch(appliedEnterpriseSearchTerm);
    const minIssuedValue = appliedEnterpriseIssuedValueMin.trim() ? Number(appliedEnterpriseIssuedValueMin) : null;
    const maxIssuedValue = appliedEnterpriseIssuedValueMax.trim() ? Number(appliedEnterpriseIssuedValueMax) : null;
    const minRemainingDebt = appliedEnterpriseRemainingDebtMin.trim() ? Number(appliedEnterpriseRemainingDebtMin) : null;
    const maxRemainingDebt = appliedEnterpriseRemainingDebtMax.trim() ? Number(appliedEnterpriseRemainingDebtMax) : null;

    return enterprises.filter((enterprise) => {
      const issuedValue = Number(enterprise.issuedValue || 0);
      const remainingDebt = Number(enterprise.remainingDebt || 0);
      const ticker = normalizeEnterpriseSearch(String(enterprise.ticker || ''));
      const englishName = normalizeEnterpriseSearch(String(enterpriseNamesEN[enterprise.ticker] || ''));
      const displayName = normalizeEnterpriseSearch(String(t(enterprise.name as any, enterprise.ticker) || ''));
      const rawName = normalizeEnterpriseSearch(String(enterprise.name || ''));

      if (appliedIndustryFilter !== 'All' && enterprise.industry !== appliedIndustryFilter) {
        return false;
      }

      if (searchTerm) {
        const haystack = [ticker, englishName, displayName, rawName].filter(Boolean).join(' ');
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      if (minIssuedValue !== null && Number.isFinite(minIssuedValue) && issuedValue < minIssuedValue) {
        return false;
      }

      if (maxIssuedValue !== null && Number.isFinite(maxIssuedValue) && issuedValue > maxIssuedValue) {
        return false;
      }

      if (minRemainingDebt !== null && Number.isFinite(minRemainingDebt) && remainingDebt < minRemainingDebt) {
        return false;
      }

      if (maxRemainingDebt !== null && Number.isFinite(maxRemainingDebt) && remainingDebt > maxRemainingDebt) {
        return false;
      }

      return true;
    });
  }, [
    appliedEnterpriseIssuedValueMax,
    appliedEnterpriseIssuedValueMin,
    appliedEnterpriseRemainingDebtMax,
    appliedEnterpriseRemainingDebtMin,
    appliedEnterpriseSearchTerm,
    appliedIndustryFilter,
    enterprises,
    enterpriseNamesEN,
    t,
  ]);
  const enterpriseTableLoading = loading;
  const enterpriseTableError = !loading ? error : null;

  const sortedEnterprises = useMemo(() => {
    return [...filteredEnterprises].sort((a, b) => {
      if (!enterpriseAppliedSortField || !enterpriseAppliedSortDirection) return 0;
      const direction = enterpriseAppliedSortDirection === 'asc' ? 1 : -1;
      if (enterpriseAppliedSortField === 'ticker') {
        return a.ticker.localeCompare(b.ticker) * direction;
      }
      if (enterpriseAppliedSortField === 'bondCount') {
        return (Number(a.bondCount || 0) - Number(b.bondCount || 0)) * direction;
      }
      if (enterpriseAppliedSortField === 'issuedValue') {
        return (Number(a.issuedValue || 0) - Number(b.issuedValue || 0)) * direction;
      }
      if (enterpriseAppliedSortField === 'remainingDebt') {
        return (Number(a.remainingDebt || 0) - Number(b.remainingDebt || 0)) * direction;
      }
      return 0;
    });
  }, [enterpriseAppliedSortDirection, enterpriseAppliedSortField, filteredEnterprises]);

  const totalEnterprisePages = useMemo(() => Math.ceil(sortedEnterprises.length / enterprisesPerPage), [sortedEnterprises.length]);
  const paginatedEnterprises = useMemo(
    () => sortedEnterprises.slice((enterprisePage - 1) * enterprisesPerPage, enterprisePage * enterprisesPerPage),
    [enterprisePage, sortedEnterprises]
  );

  const enterpriseBonds = selectedEnterprise 
    ? (issuerBonds.length > 0 ? issuerBonds : [])
    : [];

  const toPercentValue = (value: number, total: number) => (
    total > 0 ? roundMetric((value / total) * 100, 2) : 0
  );

  const pieData = useMemo(() => {
    const monthUnit = t('monthUnit');
    const termData = enterpriseBonds.reduce((acc: any, bond) => {
      const normalizedTerm = normalizeTermBase(bond.term, monthUnit);
      if (!normalizedTerm) return acc;
      acc[normalizedTerm] = (acc[normalizedTerm] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(termData)
      .map(([name, value]) => ({
        name: formatTermWithMonthUnit(name, monthUnit),
        value,
        term: name,
      }))
      .sort((a, b) => {
        const valA = parseInt(a.term || a.name) || 0;
        const valB = parseInt(b.term || b.name) || 0;
        return valA - valB;
      });
  }, [enterpriseBonds, t]);
  const pieDataTotal = useMemo(
    () => pieData.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [pieData],
  );
  const pieDataViewRows = useMemo(
    () => pieData.map((item) => [
      item.name,
      Number(item.value || 0),
      toPercentValue(Number(item.value || 0), pieDataTotal),
    ]),
    [pieData, pieDataTotal],
  );
  const pieLegendRows = splitLegendItems(pieData.map((item) => item.name), 5, 2);
  const hasMultiColumnPieLegend = pieLegendRows.length > 1;
  const pieLegendBase = {
    orient: 'vertical' as const,
    itemWidth: 16,
    itemHeight: 10,
    itemGap: 12,
    textStyle: {
      ...legendStyle,
      width: 88,
      overflow: 'truncate' as const,
      align: 'left' as const,
      padding: [0, 0, 0, 6] as [number, number, number, number],
    },
  };
  const pieLegendConfig = hasMultiColumnPieLegend
      ? [
        {
          ...pieLegendBase,
          right: 136,
          top: 'middle' as const,
          data: pieLegendRows[0],
        },
        {
          ...pieLegendBase,
          right: 24,
          top: 'middle' as const,
          data: pieLegendRows[1],
        },
      ]
    : {
        ...pieLegendBase,
        right: 24,
        top: 'middle' as const,
        data: pieLegendRows[0],
      };
  const pieZoomLegendBase = {
    orient: 'vertical' as const,
    itemWidth: 16,
    itemHeight: 10,
    itemGap: 12,
    textStyle: {
      ...legendStyle,
      width: 110,
      overflow: 'truncate' as const,
      align: 'left' as const,
      padding: [0, 0, 0, 6] as [number, number, number, number],
    },
  };
  const pieZoomLegendConfig = hasMultiColumnPieLegend
    ? [
        {
          ...pieZoomLegendBase,
          right: 24,
          top: 'middle' as const,
          data: pieLegendRows[1],
        },
        {
          ...pieZoomLegendBase,
          right: 168,
          top: 'middle' as const,
          data: pieLegendRows[0],
        },
      ]
    : {
        ...pieZoomLegendBase,
        right: 24,
        top: 'middle' as const,
        data: pieLegendRows[0],
      };

  const interestTypeData = enterpriseBonds.reduce((acc: any, bond) => {
    const type = (bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                 ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : t('others'));
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const interestTypePieData = Object.entries(interestTypeData)
    .sort((a, b) => {
      const order: any = { [t('fixed')]: 1, [t('floating')]: 2, [t('others')]: 3 };
      return (order[a[0]] || 99) - (order[b[0]] || 99);
    })
    .map(([name, value]) => ({ 
      name, 
      value
    }));
  const interestTypePieDataTotal = useMemo(
    () => interestTypePieData.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [interestTypePieData],
  );
  const interestTypePieDataViewRows = useMemo(
    () => interestTypePieData.map((item) => [
      item.name,
      Number(item.value || 0),
      toPercentValue(Number(item.value || 0), interestTypePieDataTotal),
    ]),
    [interestTypePieData, interestTypePieDataTotal],
  );
  const interestTypePieLegendGroups = splitLegendItems(interestTypePieData.map((item) => item.name), 5, 2);
  const interestTypePieLegendBase = {
    textStyle: legendStyle,
  };
  const interestTypePieLegendConfig = interestTypePieLegendGroups.length > 1
    ? [
        {
          ...interestTypePieLegendBase,
          bottom: 28,
          left: 'center' as const,
          data: interestTypePieLegendGroups[0],
        },
        {
          ...interestTypePieLegendBase,
          bottom: 0,
          left: 'center' as const,
          data: interestTypePieLegendGroups[1],
        },
      ]
    : {
        ...interestTypePieLegendBase,
        bottom: 0,
        left: 'center' as const,
        data: interestTypePieLegendGroups[0],
      };

  const bubbleGroups = enterpriseBonds.reduce((acc: any, bond) => {
    const type = (bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                 ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : t('others'));
    if (!acc[type]) acc[type] = [];
    const termMonths = Number.parseFloat(String(bond.term || ''));
    const interestRate = Number(bond.interestRate || 0);
    const listedVolume = Number(bond.listedVolume || 0);

    if (!Number.isFinite(termMonths) || !Number.isFinite(interestRate) || termMonths <= 0) {
      return acc;
    }

    acc[type].push([termMonths, interestRate, Math.max(0, listedVolume), bond.code]);
    return acc;
  }, {});

  const bubbleDataViewRows = useMemo(
    () => enterpriseBonds.map((bond) => ([
      bond.code,
      parseFloat(bond.term) || 0,
      roundMetric(Number(bond.interestRate || 0), 2),
      roundMetric(Number(bond.listedVolume || 0), 0),
    ])),
    [enterpriseBonds],
  );

  const maxVolume = Math.max(
    ...Object.values(bubbleGroups).flatMap((points: any) => points.map((point: any[]) => Number(point[2] || 0))),
    1,
  );

  const bubbleSeries = Object.entries(bubbleGroups)
    .sort((a, b) => {
      const order: any = { [t('fixed')]: 1, [t('floating')]: 2, [t('others')]: 3 };
      return (order[a[0]] || 99) - (order[b[0]] || 99);
    })
    .map(([name, data]) => ({
      name,
      data,
      type: 'scatter',
      symbolSize: (data: any) => {
        const size = (Math.sqrt(data[2]) / Math.sqrt(maxVolume)) * 40;
        return Math.max(8, size);
      },
      itemStyle: { 
        opacity: 0.7 
      }
    }));

  const maturityYearData = enterpriseBonds.reduce((acc: any, bond) => {
    const year = bond.maturityDate.split('-')[0];
    acc[year] = (acc[year] || 0) + bond.listedValue;
    return acc;
  }, {});
  const sortedYears = Object.keys(maturityYearData).sort();
  const columnData = sortedYears.map(year => maturityYearData[year]);

  const projectedCashFlowData = useMemo(() => {
    const buckets = new Map<string, { label: string; interest: number; principal: number }>();

    const ensureBucket = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = cashFlowPeriod === 'month'
        ? `${year}-${String(month).padStart(2, '0')}`
        : String(year);
      const label = cashFlowPeriod === 'month' ? `T${month}/${year}` : String(year);

      if (!buckets.has(key)) {
        buckets.set(key, { label, interest: 0, principal: 0 });
      }

      return buckets.get(key)!;
    };

    enterpriseBonds.forEach((bond) => {
      const cashFlows = Array.isArray(bond.cashFlows) ? bond.cashFlows : [];

      cashFlows.forEach((cashFlow) => {
        if (!cashFlow.paymentDate) return;

        const paymentDate = new Date(cashFlow.paymentDate);
        if (Number.isNaN(paymentDate.getTime())) return;

        const bucket = ensureBucket(paymentDate);
        bucket.interest += cashFlow.interestAmount || 0;
        bucket.principal += cashFlow.principalAmount || 0;
      });

      if (cashFlows.length === 0 && bond.maturityDate && bond.listedValue) {
        const maturityDate = new Date(bond.maturityDate);
        if (!Number.isNaN(maturityDate.getTime())) {
          const bucket = ensureBucket(maturityDate);
          bucket.principal += bond.listedValue || 0;
        }
      }
    });

    const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
    const labels = sortedEntries.map(([, value]) => value.label);
    const interest = sortedEntries.map(([, value]) => value.interest);
    const principal = sortedEntries.map(([, value]) => value.principal);
    const total = sortedEntries.map(([, value]) => value.interest + value.principal);

    return { labels, interest, principal, total };
  }, [enterpriseBonds, cashFlowPeriod]);

  const hasProjectedCashFlowData = projectedCashFlowData.total.some(value => value > 0);
  const projectedCashFlowTitle = language === 'vi'
    ? `${t('projectedCashFlowChart')} theo ${cashFlowPeriod === 'month' ? t('month').toLowerCase() : t('year').toLowerCase()}`
    : `${t('projectedCashFlowChart')} by ${cashFlowPeriod === 'month' ? 'month' : 'year'}`;
  const enterpriseDisplayName = selectedEnterprise
    ? (language === 'en' && enterpriseProfile?.internationalName
      ? enterpriseProfile.internationalName
      : t(selectedEnterprise.name as any, selectedEnterprise.ticker))
    : '';
  const enterpriseInsightTitle = language === 'vi'
    ? 'Nhận định tổ chức phát hành'
    : 'Issuer insight';
  const cashFlowInsightTitle = language === 'vi'
    ? 'NH\u1eacN X\u00c9T D\u00d2NG TI\u1ec0N'
    : 'CASH FLOW COMMENTARY';
  const handleEnterpriseBondDataViewCategoryClick = (bondCode: string) => {
    const normalizedBondCode = String(bondCode || '').trim().toUpperCase();
    if (!normalizedBondCode) return;

    const matchedBond = enterpriseBonds.find((bond) => String(bond.code || '').trim().toUpperCase() === normalizedBondCode);
    if (!matchedBond) return;

    setBondEnterpriseName(enterpriseDisplayName || selectedEnterprise?.ticker || '');
    setSelectedBond(matchedBond);
  };

  const enterpriseInsightPayload = useMemo(() => {
    if (!selectedEnterprise) return null;

    const topBonds = [...enterpriseBonds]
      .sort((left, right) => Number(right.listedValue || 0) - Number(left.listedValue || 0))
      .slice(0, 6)
      .map((bond) => ({
        bondCode: bond.code,
        tenorMonths: Number(bond.term || 0),
        interestRate: roundMetric(Number(bond.interestRate || 0)),
        interestType: bond.interestType || '',
        issueDate: bond.issueDate,
        maturityDate: bond.maturityDate,
        listedValueBillion: roundMetric(Number(bond.listedValue || 0)),
      }));

    const financialHighlights = financialData ? {
      totalAssetsBillion: roundMetric(Number(financialData.TotalAsset || financialData.TotalAssets || financialData.Assets || 0) / 1_000_000_000),
      equityBillion: roundMetric(Number(financialData.TotalStockHolderEquity || financialData.StockHolderEquity || financialData.OwnerEquity || financialData.Equity || 0) / 1_000_000_000),
      revenueBillion: roundMetric(Number(financialData.TotalRevenue_TTM || financialData.TotalRevenue || financialData.NetSale_TTM || financialData.NetSale || 0) / 1_000_000_000),
      profitBillion: roundMetric(Number(financialData.ProfitAfterTax_TTM || financialData.ProfitAfterTax || financialData.ParentCompanyShareholderProfitAfterTax_TTM || 0) / 1_000_000_000),
    } : null;

    return {
      issuer: {
        ticker: selectedEnterprise.ticker,
        name: enterpriseDisplayName,
        industry: selectedEnterprise.industry,
        bondCount: enterpriseBonds.length > 0 ? enterpriseBonds.length : selectedEnterprise.bondCount,
        issuedValueBillion: roundMetric(Number(selectedEnterprise.issuedValue || 0)),
        initialDebtBillion: roundMetric(Number(selectedEnterprise.initialDebt || 0)),
        remainingDebtBillion: roundMetric(Number(selectedEnterprise.remainingDebt || 0)),
      },
      termStructure: pieData.slice(0, 6).map((item) => ({
        term: item.name,
        bondCount: Number(item.value || 0),
      })),
      interestTypeStructure: interestTypePieData.map((item) => ({
        type: String(item.name || ''),
        bondCount: Number(item.value || 0),
      })),
      topBonds,
      maturityDistribution: sortedYears.slice(0, 8).map((year, index) => ({
        year,
        listedValueBillion: roundMetric(Number(columnData[index] || 0)),
      })),
      projectedCashFlows: projectedCashFlowData.labels.slice(0, 6).map((label, index) => ({
        period: label,
        interestBillion: roundMetric(projectedCashFlowData.interest[index] || 0),
        principalBillion: roundMetric(projectedCashFlowData.principal[index] || 0),
        totalBillion: roundMetric(projectedCashFlowData.total[index] || 0),
      })),
      financialHighlights,
    };
  }, [columnData, enterpriseBonds, enterpriseDisplayName, financialData, interestTypePieData, pieData, projectedCashFlowData, selectedEnterprise, sortedYears]);

  const cashFlowInsightPayload = useMemo(() => ({
    issuer: selectedEnterprise ? {
      ticker: selectedEnterprise.ticker,
      name: enterpriseDisplayName || selectedEnterprise.ticker,
    } : null,
    period: cashFlowPeriod,
    labels: projectedCashFlowData.labels,
    interest: projectedCashFlowData.interest,
    principal: projectedCashFlowData.principal,
    total: projectedCashFlowData.total,
    peakBucket: projectedCashFlowData.total.length > 0
      ? {
        label: projectedCashFlowData.labels[projectedCashFlowData.total.indexOf(Math.max(...projectedCashFlowData.total))] || '',
        value: Math.max(...projectedCashFlowData.total),
      }
      : null,
  }), [cashFlowPeriod, enterpriseDisplayName, projectedCashFlowData, selectedEnterprise]);

  const enterpriseChatContext = useMemo(() => {
    if (selectedEnterprise) {
      return {
        label: `Tổ chức phát hành ${selectedEnterprise.ticker}`,
        dataset: {
          route: location.pathname,
          page: 'issuer-detail',
          title: `Tổ chức phát hành ${selectedEnterprise.ticker}`,
          issuer: {
            ticker: selectedEnterprise.ticker,
            name: enterpriseDisplayName || selectedEnterprise.ticker,
            industry: selectedEnterprise.industry,
            bondCount: enterpriseBonds.length > 0 ? enterpriseBonds.length : Number(selectedEnterprise.bondCount || 0),
            issuedValueBillion: roundMetric(Number(selectedEnterprise.issuedValue || 0)),
            initialDebtBillion: roundMetric(Number(selectedEnterprise.initialDebt || 0)),
            remainingDebtBillion: roundMetric(Number(selectedEnterprise.remainingDebt || 0)),
          },
          filters: {
            industry: appliedIndustryFilter,
            searchTerm: appliedEnterpriseSearchTerm,
            minIssuedValueBillion: appliedEnterpriseIssuedValueMin || null,
            maxIssuedValueBillion: appliedEnterpriseIssuedValueMax || null,
            minRemainingDebtBillion: appliedEnterpriseRemainingDebtMin || null,
            maxRemainingDebtBillion: appliedEnterpriseRemainingDebtMax || null,
            aiSummary: enterpriseAISummary,
          },
          bonds: enterpriseBonds.slice(0, 20).map((bond) => ({
            bondCode: bond.code,
            tenorMonths: Number(bond.term || 0),
            interestRate: roundMetric(Number(bond.interestRate || 0)),
            interestType: bond.interestType || '',
            issueDate: bond.issueDate,
            maturityDate: bond.maturityDate,
            listedValueBillion: roundMetric(Number(bond.listedValue || 0)),
          })),
          termStructure: pieData.slice(0, 10).map((item) => ({
            term: item.name,
            bondCount: Number(item.value || 0),
          })),
          interestTypeStructure: interestTypePieData.map((item) => ({
            type: String(item.name || ''),
            bondCount: Number(item.value || 0),
          })),
          maturityDistribution: sortedYears.slice(0, 10).map((year, index) => ({
            year,
            listedValueBillion: roundMetric(Number(columnData[index] || 0)),
          })),
          projectedCashFlows: projectedCashFlowData.labels.slice(0, 10).map((label, index) => ({
            period: label,
            interestBillion: roundMetric(projectedCashFlowData.interest[index] || 0),
            principalBillion: roundMetric(projectedCashFlowData.principal[index] || 0),
            totalBillion: roundMetric(projectedCashFlowData.total[index] || 0),
          })),
          financialHighlights: enterpriseInsightPayload?.financialHighlights || null,
        },
      };
    }

    return {
      label: 'Tổ chức phát hành',
      dataset: {
        route: location.pathname,
        page: 'issuer-list',
        title: 'Tổ chức phát hành',
        filters: {
          industry: appliedIndustryFilter,
          searchTerm: appliedEnterpriseSearchTerm,
          minIssuedValueBillion: appliedEnterpriseIssuedValueMin || null,
          maxIssuedValueBillion: appliedEnterpriseIssuedValueMax || null,
          minRemainingDebtBillion: appliedEnterpriseRemainingDebtMin || null,
          maxRemainingDebtBillion: appliedEnterpriseRemainingDebtMax || null,
          aiSummary: enterpriseAISummary,
        },
        summary: {
          totalEnterprises: enterprises.length,
          filteredEnterprises: sortedEnterprises.length,
          currentPage: enterprisePage,
          totalPages: totalEnterprisePages,
          isLoading: loading,
          error,
        },
        enterprises: sortedEnterprises.slice(0, 20).map((enterprise) => ({
          ticker: enterprise.ticker,
          name: String(t(enterprise.name as any, enterprise.ticker) || enterprise.ticker),
          industry: enterprise.industry,
          bondCount: Number(enterprise.bondCount || 0),
          issuedValueBillion: roundMetric(Number(enterprise.issuedValue || 0)),
          remainingDebtBillion: roundMetric(Number(enterprise.remainingDebt || 0)),
        })),
      },
    };
  }, [
    appliedEnterpriseIssuedValueMax,
    appliedEnterpriseIssuedValueMin,
    appliedEnterpriseRemainingDebtMax,
    appliedEnterpriseRemainingDebtMin,
    appliedEnterpriseSearchTerm,
    appliedIndustryFilter,
    columnData,
    enterpriseAISummary,
    enterpriseBonds,
    enterpriseDisplayName,
    enterpriseInsightPayload,
    enterprisePage,
    enterprises,
    error,
    interestTypePieData,
    loading,
    location.pathname,
    pieData,
    projectedCashFlowData,
    selectedEnterprise,
    sortedEnterprises,
    sortedYears,
    t,
    totalEnterprisePages,
  ]);

  useEffect(() => {
    setViewChatContext({
      routePathname: location.pathname,
      label: enterpriseChatContext.label,
      dataset: enterpriseChatContext.dataset,
      updatedAt: new Date().toISOString(),
    });

    return () => {
      clearViewChatContext(location.pathname);
    };
  }, [enterpriseChatContext, location.pathname]);

  const handleExportEnterprises = async () => {
    setExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      exportRowsToExcel({
        fileNameBase: 'Enterprise_List',
        sheetName: t('enterprise'),
        rows: sortedEnterprises,
        columns: [
          { header: t('ticker'), value: (enterprise) => enterprise.ticker },
          { header: t('issuerName'), value: (enterprise) => language === 'en' && enterpriseNamesEN[enterprise.ticker] ? enterpriseNamesEN[enterprise.ticker] : t(enterprise.name as any, enterprise.ticker) },
          { header: t('bondCodeCount'), value: (enterprise) => formatNumber(enterprise.bondCount, 0) },
          { header: `${t('issuedValue')} (${t('unitBillionVND')})`, value: (enterprise) => formatNumber(enterprise.issuedValue, 2) },
          { header: `${t('remainingDebtTitle')} (${t('unitBillionVND')})`, value: (enterprise) => formatNumber(enterprise.remainingDebt, 2) },
        ],
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportSelectedEnterprise = () => {
    if (!selectedEnterprise) return;

    exportRowsToExcel({
      fileNameBase: `Issuer_${selectedEnterprise.ticker}_Bonds`,
      sheetName: selectedEnterprise.ticker,
      rows: enterpriseBonds,
      columns: [
        { header: t('bondCode'), value: (bond) => bond.code },
        { header: t('term'), value: (bond) => bond.term },
        { header: `${t('interestRate')} (${t('unitPercentLabel')})`, value: (bond) => formatInterestRate(bond.interestRate) },
        { header: t('interestType'), value: (bond) => bond.interestType },
        { header: t('issueDate'), value: (bond) => formatDate(bond.issueDate) },
        { header: t('maturityDate'), value: (bond) => formatDate(bond.maturityDate) },
        { header: t('listedVolume'), value: (bond) => formatNumber(bond.listedVolume || 0, 0) },
        { header: `${t('issuedValue')} (${t('unitBillionVND')})`, value: (bond) => formatNumber(bond.issuedValue || 0, 2) },
        { header: `${t('listedValueTitle')} (${t('unitBillionVND')})`, value: (bond) => formatNumber(bond.listedValue || 0, 2) },
      ],
    });
  };

  const pieOptions = {
    color: chartPalette,
    __dataView: {
      columns: [
        { label: t('term'), align: 'left', kind: 'text' },
        { label: 'Số mã trái phiếu', align: 'right', kind: 'number' },
        { label: t('percent'), unit: '%', align: 'right', kind: 'number' },
      ],
      rows: pieDataViewRows,
    },
    tooltip: { 
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        return `${params.name}: ${highlightChartTooltipValue(formatNumber(params.value, 0), ` ${t('bondCode')}`)} (${highlightChartTooltipValue(params.percent, '%')})`;
      }
    },
    legend: pieLegendConfig,
    series: [{
      type: 'pie',
      radius: ['30%', '60%'],
      center: hasMultiColumnPieLegend ? ['28%', '50%'] : ['36%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8 },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          fontSize: '12',
          fontWeight: 'bold',
          formatter: (params: any) => params.name,
        },
      },
      data: pieData
    }]
  };

  const interestTypePieOptions = {
    color: chartPalette,
    __dataView: {
      columns: [
        { label: t('interestType'), align: 'left', kind: 'text' },
        { label: 'Số mã trái phiếu', align: 'right', kind: 'number' },
        { label: t('percent'), unit: '%', align: 'right', kind: 'number' },
      ],
      rows: interestTypePieDataViewRows,
    },
    tooltip: { 
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => `${params.name}: ${highlightChartTooltipValue(formatNumber(params.value, 0), ` ${t('bondCode')}`)} (${highlightChartTooltipValue(params.percent, '%')})`
    },
    legend: interestTypePieLegendConfig,
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: '12', fontWeight: 'bold' } },
      data: interestTypePieData
    }]
  };

  const bubbleOptions = {
    color: chartPalette,
    __dataView: {
      columns: [
        { label: t('bondCode'), align: 'left', kind: 'text' },
        { label: t('termMonths'), align: 'center', kind: 'number' },
        { label: `${t('interestRate')} (%)`, align: 'right', kind: 'number' },
        { label: t('listedVolume'), align: 'right', kind: 'number' },
      ],
      rows: bubbleDataViewRows,
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => `${params.data[3]} (${params.seriesName})<br/>${t('term')}: ${highlightChartTooltipValue(params.data[0], ` ${t('monthUnit')}`)}<br/>${t('interestRate')}: ${highlightChartTooltipValue(formatInterestRate(params.data[1]), '%')}<br/>${t('listedVolume')}: ${highlightChartTooltipValue(formatNumber(params.data[2] || 0, 0))}`
    },
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: legendStyle
    },
    grid: { top: '15%', bottom: '20%', left: '8%', right: '10%' },
    xAxis: { 
      type: 'value',
      scale: true,
      name: `${t('term')} (${t('monthUnit')})`, 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: axisLabelStyle 
    },
    yAxis: { 
      type: 'value',
      scale: true,
      name: `${t('interestRate')} (${t('unitPercentLabel')})`, 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: { 
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: bubbleSeries
  };

  const columnOptions = {
    color: chartPalette,
    __dataView: {
      columns: [
        { label: t('year'), align: 'center', kind: 'text' },
        { label: t('listedValueTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
      ],
      rows: sortedYears.map((year, index) => [year, columnData[index] || 0]),
    },
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => `${params[0].name}<br/>${params[0].marker} ${params[0].seriesName}: ${highlightChartTooltipValue(formatNumber(params[0].value, 2), ` ${t('unitBillionVND')}`)}`
    },
    grid: { top: '15%', bottom: '15%', left: '10%', right: '5%' },
    xAxis: { type: 'category', data: sortedYears, axisLabel: axisLabelStyle },
    yAxis: { 
      name: t('unitBillion'), 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: { 
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: [{
      name: t('listedValueTitle'),
      type: 'bar',
      data: columnData,
      itemStyle: { 
        borderRadius: [4, 4, 0, 0] 
      },
      barWidth: '40%'
    }]
  };

  const projectedCashFlowOptions = {
    color: chartPalette,
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line' },
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let content = `${params[0].name}<br/>`;
        let total = 0;
        params.forEach((param: any) => {
          total += param.value || 0;
          content += `${param.marker} ${param.seriesName}: ${highlightChartTooltipValue(formatNumber(param.value || 0, 2), ` ${t('unitBillionVND')}`)}<br/>`;
        });
        content += `<strong>${t('totalCashFlow')}: ${highlightChartTooltipValue(formatNumber(total, 2), ` ${t('unitBillionVND')}`)}</strong>`;
        return content;
      }
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { top: '12%', bottom: '28%', left: '10%', right: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: projectedCashFlowData.labels,
      axisLabel: {
        ...axisLabelStyle,
        rotate: cashFlowPeriod === 'month' && projectedCashFlowData.labels.length > 10 ? 45 : 0
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 24,
        filterMode: 'none',
        brushSelect: false,
        textStyle: axisLabelStyle,
      },
    ],
    yAxis: {
      type: 'value',
      name: t('unitBillionVND'),
      nameTextStyle: chartTitleStyle,
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      }
    },
    series: [
      {
        name: t('totalInterestPayable'),
        type: 'line',
        stack: 'cashFlow',
        ...getComparisonAreaSeriesStyle(isDark, 0),
        data: projectedCashFlowData.interest,
      },
      {
        name: t('totalPrincipalPayable'),
        type: 'line',
        stack: 'cashFlow',
        ...getComparisonAreaSeriesStyle(isDark, 1),
        data: projectedCashFlowData.principal,
      }
    ]
  };

  if (loading) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-text-muted font-medium">{t('loadingEnterprisesMessage')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-text-base">{t('failedToLoadData')}</h3>
        <p className="text-text-muted max-w-md">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="rounded-lg bg-action-accent px-6 py-2 font-bold text-slate-950 transition-colors hover:opacity-90"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (selectedEnterprise) {
    return (
      <div className="min-w-0 space-y-3 py-2 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted/80">
          <button
            type="button"
            onClick={() => setSelectedEnterprise(null)}
            className="transition-colors hover:text-text-highlight cursor-pointer"
          >
            {(breadcrumbTitle || listTitle || t('filterByIssuer')).toUpperCase()}
          </button>
          <ChevronRight className="h-3 w-3 text-text-muted" />
          <span className="text-text-highlight">{t('enterpriseDetail').toUpperCase()}</span>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-2xl font-bold leading-tight text-text-base md:text-3xl">
                {language === 'en' && enterpriseProfile?.internationalName
                  ? enterpriseProfile.internationalName
                  : t(selectedEnterprise.name as any, selectedEnterprise.ticker)} ({selectedEnterprise.ticker})
              </h2>
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            
            {/* Financial Badges Section */}
            <div key={`financial-badges-${selectedEnterprise.ticker}`} className="flex flex-wrap gap-2">
              {!loadingFinancial ? (() => {
                const ind = selectedEnterprise.industry ? t(selectedEnterprise.industry as any).toLowerCase() : '';
                const type = (financialData?.__companyType || '').toLowerCase();
                const d = financialData && financialData.__symbol === selectedEnterprise.ticker ? financialData : {};
                
                // Formatting helpers
                const fmtM = (val: number | null | undefined) => {
                  if (val == null || val === 0) return '';
                  const ty = val / 1000000000;
                  
                  if (ty >= 1000000) return `${formatNumber(ty / 1000000, 3)} ${t('unitMillionTrillion')}`; 
                  if (ty >= 1000) return `${formatNumber(ty / 1000, 1)}${t('unitKTy')}`;
                  return `${formatNumber(ty, 1)} ${t('unitTy')}`;
                };

                const fmtP = (val: number | null | undefined) => (val != null ? `${formatNumber(val * 100, 1)}%` : '');
                const fmtX = (val: number | null | undefined) => (val != null ? `${formatNumber(val, 2)}x` : '');

                // Field Fallbacks Logic
                const totalAsset = d.TotalAsset ?? d.TotalAssets ?? d.Assets;
                const equity = d.TotalStockHolderEquity ?? d.StockHolderEquity ?? d.OwnerEquity ?? d.Equity;
                const revenue = d.TotalRevenue_TTM ?? d.TotalRevenue ?? d.NetSale_TTM ?? d.NetSale;
                const profit = d.ProfitAfterTax_TTM ?? d.ProfitAfterTax ?? d.ParentCompanyShareholderProfitAfterTax_TTM;
                const ebitda = d.EBITDA_TTM ?? d.EBITDA;
                const cash = d.CashAndCashEquivalentAtTheEndOfPeriod ?? d.CashAndCashEquivalent ?? (d.Cash ?? 0) + (d.CashEquivalent ?? 0);
                const debt = d.TotalDebt ?? d.Liabilities;
                
                let roe = d.ROE;
                let pb = d.PB;
                let car = d.CAR;
                let de = d.TotalDebtOverEquity;
                let cr = d.CurrentRatio;
                
                // Define badge specs
                let badgeSpecs: { label: string; value: string | null; tooltip: string }[] = [];

                if (ind === 'banking' || type === 'bank') {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialCAR'), value: fmtP(car), tooltip: t('tooltipCAR') }
                  ];
                } else if (ind === 'securities' || ind.includes('tài chính') || ind.includes('finance')) {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind === 'realestate') {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') }
                  ];
                } else if (ind.includes('năng lượng') || ind.includes('energy') || ind.includes('hạ tầng') || ind.includes('infrastructure') || ind.includes('utility') || ind.includes('tiện ích')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEbitdaTTM'), value: fmtM(ebitda), tooltip: t('tooltipEbitdaTTM') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else if (ind.includes('công nghiệp') || ind.includes('industry') || ind.includes('sản xuất') || ind.includes('manufacturing')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEbitdaTTM'), value: fmtM(ebitda), tooltip: t('tooltipEbitdaTTM') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else if (ind.includes('công nghệ') || ind.includes('tech') || ind.includes('thông tin') || ind.includes('info')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind.includes('tiêu dùng') || ind.includes('consumer') || ind.includes('bán lẻ') || ind.includes('retail') || ind.includes('thực phẩm') || ind.includes('food')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind.includes('xây dựng') || ind.includes('construction') || ind.includes('vật liệu') || ind.includes('material')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') }
                  ];
                }

                // Filtering and rendering - slice to ensure exactly 5 if available, but do not filter nulls
                const activeBadges = badgeSpecs.slice(0, 5);

                if (activeBadges.length === 0) return null;

                return activeBadges.map((badge, idx) => (
                  <div 
                    key={idx} 
                    className="flex min-h-8 items-center rounded-full border border-border-base bg-bg-surface px-3 py-1.5 shadow-sm shadow-blue-950/5 transition-colors hover:border-blue-200 hover:bg-blue-50 cursor-help select-none dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
                    title={badge.tooltip}
                  >
                    <span className="mr-2 text-xs font-semibold uppercase text-text-muted/80">{badge.label}:</span>
                    <span className="text-xs font-bold leading-none text-text-highlight">{badge.value || 'N/A'}</span>
                  </div>
                ));
              })() : loadingFinancial ? (
                <div className="flex gap-2 animate-pulse">
                  {[1, 2, 3, 4, 5].map(idx => (
                    <div key={idx} className="h-8 w-24 rounded-full border border-border-base bg-bg-surface"></div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={handleExportSelectedEnterprise}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-500 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{t('exportExcel')}</span>
            </button>
          </div>
        </div>

        {loadingBonds ? (
          <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>{t('loadingBondsMessage')}</span>
          </div>
        ) : null}

        {bondError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {bondError}
          </div>
        ) : null}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard
            label={t('bondCodeCount')}
            value={String(issuerBonds.length > 0 ? issuerBonds.length : selectedEnterprise.bondCount)}
            unit={t('unitBondCode')}
            icon={Hash}
            tone="purple"
          />
          <MetricCard
            label={t('totalIssuedValueTitle')}
            value={formatNumber(selectedEnterprise.issuedValue, 2)}
            unit={t('unitBillionVND')}
            icon={BadgeDollarSign}
            tone="blue"
          />
          <MetricCard
            label={t('initialDebtFull')}
            value={formatNumber(selectedEnterprise.initialDebt, 2)}
            unit={t('unitBillionVND')}
            icon={Landmark}
            tone="green"
          />
          <MetricCard
            label={t('remainingDebtTitle')}
            value={formatNumber(selectedEnterprise.remainingDebt, 2)}
            unit={t('unitBillionVND')}
            icon={Wallet}
            tone="orange"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4 xl:col-span-3">
            <ChartWithToolbar
              option={pieOptions}
              style={{ height: '320px' }}
              title={t('bondStructureByTerm')}
              zoomConfig={{
                shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                chartStyle: { height: '100%', width: '100%' },
                option: {
                  legend: pieZoomLegendConfig,
                  series: [
                    {
                      center: hasMultiColumnPieLegend ? ['34%', '50%'] : ['38%', '50%'],
                      radius: ['34%', '63%'],
                      label: {
                        show: true,
                        position: 'outside',
                        formatter: (params: any) => `${formatNumber(params.value, 0)}`,
                        color: isDark ? '#e5e7eb' : '#1e293b',
                        fontSize: 11,
                        fontWeight: 'bold',
                      },
                      labelLine: {
                        show: true,
                        length: 12,
                        length2: 10,
                        smooth: true,
                      },
                      emphasis: {
                        label: {
                          show: true,
                          fontSize: '12',
                          fontWeight: 'bold',
                          formatter: (params: any) => `${formatNumber(params.value, 0)}`,
                          color: isDark ? '#e5e7eb' : '#1e293b',
                        }
                      },
                    },
                  ],
                },
              }}
            />
          </div>
          <div className="rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4 xl:col-span-3">
            <ChartWithToolbar
              option={interestTypePieOptions}
              style={{ height: '300px' }}
              title={t('bondStructureByInterestType')}
              zoomConfig={{
                shellClassName: 'flex h-full max-h-screen w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                chartStyle: { height: '100%', width: '100%' },
                option: {
                  legend: {
                    left: 'center',
                    bottom: 6,
                    top: undefined,
                    itemWidth: 16,
                    itemHeight: 10,
                    itemGap: 18,
                    textStyle: {
                      ...legendStyle,
                      width: 160,
                      overflow: 'truncate',
                      align: 'center',
                    },
                  },
                  series: [
                    {
                      center: ['50%', '44%'],
                      radius: ['44%', '74%'],
                      label: {
                        show: true,
                        position: 'inside',
                        formatter: (params: any) => `${formatNumber(params.value, 0)}`,
                        color: isDark ? '#e5e7eb' : '#1e293b',
                        fontSize: 11,
                        fontWeight: 'bold',
                      },
                      labelLine: {
                        show: false,
                        length: 12,
                        length2: 10,
                        smooth: true,
                      },
                      emphasis: {
                        label: {
                          show: true,
                          position: 'inside',
                          fontSize: '12',
                          fontWeight: 'bold',
                          formatter: (params: any) => `${formatNumber(params.value, 0)}`,
                          color: isDark ? '#e5e7eb' : '#1e293b',
                        }
                      },
                    },
                  ],
                },
              }}
            />
          </div>
          <AIInsightPanel
            cacheKey={`enterprise-insight-${selectedEnterprise.ticker}`}
            title={enterpriseInsightTitle}
            pageTitle={`${enterpriseDisplayName} (${selectedEnterprise.ticker})`}
            sectionTitle={enterpriseDisplayName || selectedEnterprise.ticker}
            payload={enterpriseInsightPayload}
            className="xl:col-span-6"
            expandContent
            layout="stacked"
          />
          <div className="rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4 xl:col-span-6">
            <ChartWithToolbar
              option={bubbleOptions}
              style={{ height: '320px' }}
              title={t('interestRateVsTerm')}
              onDataViewCategoryClick={handleEnterpriseBondDataViewCategoryClick}
            />
          </div>
          <div className="rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4 xl:col-span-6">
            <ChartWithToolbar option={columnOptions} style={{ height: '320px' }} allowMagicType title={t('totalListedValueByMaturityYear')} />
          </div>
          <AIInsightPanel
            cacheKey={`enterprise-cashflow-insight-${selectedEnterprise.ticker}`}
            title={cashFlowInsightTitle}
            pageTitle={`${enterpriseDisplayName} (${selectedEnterprise.ticker})`}
            sectionTitle={cashFlowInsightTitle}
            payload={cashFlowInsightPayload}
            className="xl:col-span-4"
            expandContent
            layout="stacked"
          />
          <div className="rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4 xl:col-span-8">
            {loadingCashFlows && !hasProjectedCashFlowData ? (
              <div className="h-80 flex items-center justify-center">
                <div className="flex items-center gap-3 text-xs font-bold text-text-muted uppercase tracking-wider">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  {t('loading')}
                </div>
              </div>
            ) : hasProjectedCashFlowData ? (
              <ChartWithToolbar
                option={projectedCashFlowOptions}
                style={{ height: '360px' }}
                allowMagicType
                title={projectedCashFlowTitle}
                showDataZoomSliderOnHover
                zoomConfig={{
                  shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                  chartStyle: { height: '100%', width: '100%' },
                  option: {
                    grid: { bottom: '22%' },
                    legend: {
                      bottom: 8,
                    },
                    dataZoom: [
                      {
                        type: 'inside',
                        xAxisIndex: 0,
                        filterMode: 'none',
                      },
                      {
                        type: 'slider',
                        xAxisIndex: 0,
                        height: 18,
                        bottom: 44,
                        filterMode: 'none',
                        brushSelect: false,
                        textStyle: axisLabelStyle,
                      },
                    ],
                  },
                }}
                actions={(
                  <div className="flex items-center justify-center gap-1 rounded-lg border border-border-base bg-bg-base p-1 sm:justify-self-end">
                    <button
                      type="button"
                      onClick={() => setCashFlowPeriod('month')}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                        cashFlowPeriod === 'month'
                          ? 'bg-action-accent text-slate-950 shadow-sm'
                          : 'text-text-muted hover:text-text-base'
                      }`}
                    >
                      {t('month')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashFlowPeriod('year')}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                        cashFlowPeriod === 'year'
                          ? 'bg-action-accent text-slate-950 shadow-sm'
                          : 'text-text-muted hover:text-text-base'
                      }`}
                    >
                      {t('year')}
                    </button>
                  </div>
                )}
              />
            ) : (
              <div className="h-80 flex items-center justify-center text-sm font-medium text-text-muted">
                {t('noData')}
              </div>
            )}
          </div>
        </div>
        {/* Bond Detail Popup removed from here, now handled in App.tsx */}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2 transition-colors duration-300">
      <div className="mb-2 mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-left text-2xl font-bold text-text-base transition-colors">{listTitle || t('filterByIssuer')}</h2>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border-base bg-bg-surface/95 p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4">
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-2.5 transition-colors dark:border-blue-400/20 dark:bg-blue-500/10">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-700">
              <BadgeDollarSign className="h-4 w-4" />
              <span>{t('applyAIFilter')}</span>
            </span>
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
              <div className="min-w-0 flex-1">
                <textarea
                  rows={2}
                  value={enterpriseAIPrompt}
                  onChange={(event) => {
                    setEnterpriseAIPrompt(event.target.value);
                    if (enterpriseAISummary.length > 0) setEnterpriseAISummary([]);
                    if (enterpriseAIError) setEnterpriseAIError(null);
                  }}
                  placeholder={enterpriseAIPromptPlaceholder}
                  className="w-full resize-none rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-medium text-text-base outline-none transition-colors placeholder:text-text-muted/80 focus:border-blue-400"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleApplyEnterpriseAIFilter()}
                disabled={!enterpriseAIPrompt.trim() || isApplyingEnterpriseAIFilter || isLoadingStatus}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BadgeDollarSign className={`h-4 w-4 ${isApplyingEnterpriseAIFilter ? 'animate-pulse' : ''}`} />
                <span>{t('applyAIFilter')}</span>
              </button>
            </div>
          </div>

          {showEnterpriseAISuggestions ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {enterpriseAISuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleEnterpriseSuggestionClick(suggestion);
                  }}
                  className="rounded-full px-3 py-0.5 text-left text-xs font-semibold leading-tight text-blue-700 transition-colors hover:text-blue-900"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          {enterpriseAISummary.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {enterpriseAISummary.map((item) => (
                <span
                  key={item}
                  className="rounded-full px-3 py-0.5 text-xs font-semibold leading-tight text-blue-700"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {enterpriseAIError ? (
            <p className="mt-2 text-sm font-medium text-red-600">{enterpriseAIError}</p>
          ) : null}
        </div>

        {isFilterControlsVisible ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:flex-nowrap xl:items-stretch xl:gap-2">
              <div className="min-w-0 flex-1">
                <SearchFilterField
                  value={enterpriseSearchTerm}
                  onChange={setEnterpriseSearchTerm}
                  suggestions={safeEnterpriseSearchSuggestions.map((item) => item.label)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <SelectFilterChip
                  icon={ListFilter}
                  label={t('industryLabel')}
                  value={industryFilter === 'All' ? '' : industryFilter}
                  options={enterpriseIndustryOptions.map((item) => item.value)}
                  open={enterpriseFilterMenu === 'industry'}
                  onToggle={() => setEnterpriseFilterMenu((current) => (current === 'industry' ? null : 'industry'))}
                  onChange={(value) => setIndustryFilter(value || 'All')}
                  onClose={() => setEnterpriseFilterMenu(null)}
                  fullWidth
                />
              </div>
              <div className="min-w-0 flex-1">
                <RangeFilterChip
                  icon={BadgeDollarSign}
                  label={t('issuedValue')}
                  unit={t('unitBillionVND')}
                  minValue={enterpriseIssuedValueMin}
                  maxValue={enterpriseIssuedValueMax}
                  open={enterpriseFilterMenu === 'issuedValue'}
                  onToggle={() => setEnterpriseFilterMenu((current) => (current === 'issuedValue' ? null : 'issuedValue'))}
                  onClose={() => setEnterpriseFilterMenu(null)}
                  onMinChange={setEnterpriseIssuedValueMin}
                  onMaxChange={setEnterpriseIssuedValueMax}
                  fullWidth
                />
              </div>
              <div className="min-w-0 flex-1">
                <RangeFilterChip
                  icon={Wallet}
                  label={t('remainingDebtTitle')}
                  unit={t('unitBillionVND')}
                  minValue={enterpriseRemainingDebtMin}
                  maxValue={enterpriseRemainingDebtMax}
                  open={enterpriseFilterMenu === 'remainingDebt'}
                  onToggle={() => setEnterpriseFilterMenu((current) => (current === 'remainingDebt' ? null : 'remainingDebt'))}
                  onClose={() => setEnterpriseFilterMenu(null)}
                  onMinChange={setEnterpriseRemainingDebtMin}
                  onMaxChange={setEnterpriseRemainingDebtMax}
                  fullWidth
                />
              </div>
              <div className="w-full xl:w-36 xl:flex-none">
                <ActionFilterButton
                  icon={CheckCircle2}
                  label={t('applyFilters')}
                  onClick={handleApplyEnterpriseFilters}
                  variant="primary"
                />
              </div>
              <div className="w-full xl:w-36 xl:flex-none">
                <ActionFilterButton
                  icon={RotateCcw}
                  label={t('resetFilters')}
                  onClick={handleResetEnterpriseFilters}
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
            {t('filterResults')}: {formatNumber(sortedEnterprises.length, 0)} / {formatNumber(enterprises.length, 0)}
          </div>

          <div ref={enterpriseColumnVisibilityRef} className="relative inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFilterControlsVisible((current) => !current)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:gap-2 sm:px-3"
              aria-label={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
              title={isFilterControlsVisible ? t('hideFilters') : t('showFilters')}
            >
              {isFilterControlsVisible ? <FilterX className="h-4 w-4 text-blue-600" /> : <Filter className="h-4 w-4 text-blue-600" />}
              <span className="hidden sm:inline">{t('filterTab')}</span>
            </button>

            <button
              type="button"
              onClick={() => setEnterpriseColumnVisibilityOpen((current) => !current)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-border-base bg-bg-surface px-2 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:gap-2 sm:px-3"
              aria-haspopup="dialog"
              aria-expanded={enterpriseColumnVisibilityOpen}
              aria-label={t('hideColumns')}
              title={t('hideColumns')}
            >
              <EyeOff className="h-4 w-4 text-blue-600" />
              <span className="hidden sm:inline">{t('hideColumns')}</span>
            </button>

            {enterpriseColumnVisibilityOpen ? (
              <div className="absolute right-0 top-full z-30 mt-3 w-96 max-w-none rounded-lg border border-border-base bg-bg-surface p-4 shadow-xl shadow-blue-950/10">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
                  <EyeOff className="h-4 w-4 text-blue-600" />
                  <span>{t('hideColumns')}</span>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {enterpriseColumnOptions.map((column) => {
                    const checked = enterpriseColumnVisibilityDraft.includes(column.id);

                    return (
                      <label
                        key={column.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-base transition-colors hover:bg-surface-container-low"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setEnterpriseColumnVisibilityDraft((current) => (
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
                      setEnterpriseHiddenColumnIds(enterpriseColumnVisibilityDraft);
                      setEnterpriseColumnVisibilityOpen(false);
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    {t('hideColumns')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnterpriseHiddenColumnIds([]);
                      setEnterpriseColumnVisibilityDraft([]);
                      setEnterpriseColumnVisibilityOpen(false);
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
                  >
                    {t('reset')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Enterprise Table */}
      <div className="overflow-hidden rounded-lg border border-border-base bg-bg-surface/95 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
        <div className="hidden divide-y divide-border-base">
          {enterpriseTableLoading ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted font-medium transition-colors">{t('loading')}</div>
          ) : enterpriseTableError ? (
            <div className="px-4 py-10 text-center text-sm text-red-600 font-medium transition-colors">{enterpriseTableError}</div>
          ) : paginatedEnterprises.length > 0 ? (
            paginatedEnterprises.map((enterprise) => (
              <button
                key={enterprise.id}
                type="button"
                onClick={() => setSelectedEnterprise(enterprise)}
                className="w-full p-4 text-left transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-text-highlight">{enterprise.ticker}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">
                      {language === 'en' && enterpriseNamesEN[enterprise.ticker]
                        ? enterpriseNamesEN[enterprise.ticker]
                        : t(enterprise.name as any, enterprise.ticker)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-text-muted">{t(enterprise.industry as any) || enterprise.industry || 'N/A'}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-bg-base p-3">
                  <div>
                    <p className="text-xs font-semibold text-text-muted/80">Số mã trái phiếu</p>
                    <p className="mt-1 text-sm font-bold text-text-base dark:text-white">{formatNumber(enterprise.bondCount, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-text-muted/80">{t('issuedValue')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base dark:text-white">{formatNumber(enterprise.issuedValue, 2)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-text-muted/80">{t('remainingDebtTitle')}</p>
                    <p className="mt-1 text-sm font-bold text-text-highlight">{formatNumber(enterprise.remainingDebt, 2)}</p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-text-muted font-medium transition-colors">{t('noData')}</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-full table-fixed text-left">
            <colgroup>
              <col className="w-14" />
              {showEnterpriseTickerColumn ? <col className="w-28" /> : null}
              {showEnterpriseIssuerNameColumn ? <col className="w-72" /> : null}
              {showEnterpriseBondCountColumn ? <col className="w-32" /> : null}
              {showEnterpriseIssuedValueColumn ? <col className="w-36" /> : null}
              {showEnterpriseRemainingDebtColumn ? <col className="w-36" /> : null}
            </colgroup>
            <thead className="border-b border-blue-500/30 bg-blue-600 text-white transition-colors">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                  <span className="flex items-center justify-center">
                    <ListOrdered className="h-4 w-4" aria-hidden="true" />
                  </span>
                </th>
                {showEnterpriseTickerColumn ? (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {renderEnterpriseSortHeader('ticker', t('ticker'))}
                  </th>
                ) : null}
                {showEnterpriseIssuerNameColumn ? (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {renderEnterpriseSortHeader('issuerName', t('issuerName'))}
                  </th>
                ) : null}
                {showEnterpriseBondCountColumn ? (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {renderEnterpriseSortHeader('bondCount', 'Số mã trái phiếu', undefined, 'normal-case')}
                  </th>
                ) : null}
                {showEnterpriseIssuedValueColumn ? (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {renderEnterpriseSortHeader('issuedValue', t('issuedValue'), t('unitBillionVND'))}
                  </th>
                ) : null}
                {showEnterpriseRemainingDebtColumn ? (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {renderEnterpriseSortHeader('remainingDebt', t('remainingDebtTitle'), t('unitBillionVND'))}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {enterpriseTableLoading ? (
                <tr>
                  <td colSpan={enterpriseVisibleColumnCount} className="px-4 py-10 text-center text-sm font-medium text-text-muted transition-colors">{t('loading')}</td>
                </tr>
              ) : enterpriseTableError ? (
                <tr>
                  <td colSpan={enterpriseVisibleColumnCount} className="px-4 py-10 text-center text-sm font-medium text-red-600 transition-colors">{enterpriseTableError}</td>
                </tr>
              ) : paginatedEnterprises.length === 0 ? (
                <tr>
                  <td colSpan={enterpriseVisibleColumnCount} className="px-4 py-10 text-center text-sm font-medium text-text-muted transition-colors">{t('noData')}</td>
                </tr>
              ) : paginatedEnterprises.map((enterprise, idx) => (
                <tr 
                  key={enterprise.id} 
                  onClick={() => setSelectedEnterprise(enterprise)}
                  className={`group cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-bg-base/50' : 'bg-bg-surface'} hover:bg-surface-container-low/70`}
                >
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className="text-sm font-medium text-text-base">{idx + 1}</span>
                  </td>
                  {showEnterpriseTickerColumn ? (
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-sm font-bold text-text-highlight transition-colors group-hover:text-blue-600">
                        {enterprise.ticker}
                      </span>
                    </td>
                  ) : null}
                  {showEnterpriseIssuerNameColumn ? (
                    <td className="px-4 py-3 text-left whitespace-nowrap">
                      <div className="space-y-1">
                        <p className="truncate text-sm font-medium text-text-base transition-colors group-hover:text-blue-600">
                          {language === 'en' && enterpriseNamesEN[enterprise.ticker] 
                            ? enterpriseNamesEN[enterprise.ticker] 
                            : t(enterprise.name as any, enterprise.ticker)}
                        </p>
                        <p className="truncate text-xs font-medium text-text-muted transition-colors group-hover:text-blue-600">
                          {t(enterprise.industry as any) || enterprise.industry || 'N/A'}
                        </p>
                      </div>
                    </td>
                  ) : null}
                  {showEnterpriseBondCountColumn ? (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-medium text-text-base transition-colors group-hover:text-blue-600">{formatNumber(enterprise.bondCount, 0)}</span>
                    </td>
                  ) : null}
                  {showEnterpriseIssuedValueColumn ? (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-medium text-text-base transition-colors group-hover:text-blue-600">
                        {formatNumber(enterprise.issuedValue, 2)}
                      </span>
                    </td>
                  ) : null}
                  {showEnterpriseRemainingDebtColumn ? (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-medium text-text-base transition-colors group-hover:text-blue-600">
                        {formatNumber(enterprise.remainingDebt, 2)}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Enterprise Pagination Controls */}
        {totalEnterprisePages > 1 && (
          <div className="flex items-center justify-end border-t border-border-base bg-surface-container-low/70 px-4 py-4 pr-20 transition-colors sm:pr-24 lg:pr-28">
            <div className="flex gap-2">
              <button 
                onClick={() => setEnterprisePage(prev => Math.max(1, prev - 1))}
                disabled={enterprisePage === 1}
                className="p-2 text-xs font-bold text-text-base bg-bg-base border border-border-base rounded-lg hover:bg-bg-surface disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {totalEnterprisePages <= 4 ? (
                [...Array(totalEnterprisePages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setEnterprisePage(i + 1)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === i + 1 
                        ? "bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))
              ) : (
                <>
                  <button
                    onClick={() => setEnterprisePage(1)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === 1 
                        ? "bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    1
                  </button>
                  <button
                    onClick={() => setEnterprisePage(2)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === 2 
                        ? "bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    2
                  </button>
                  
                  {enterprisePage <= 3 ? (
                    <>
                      <button
                        onClick={() => setEnterprisePage(3)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                          enterprisePage === 3 
                            ? "bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                            : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                        }`}
                      >
                        3
                      </button>
                      <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                      {enterprisePage < totalEnterprisePages && (
                        <>
                          <button
                            className="px-3 py-1 text-xs font-bold rounded-lg bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                          >
                            {enterprisePage}
                          </button>
                          <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                        </>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => setEnterprisePage(totalEnterprisePages)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === totalEnterprisePages 
                        ? "bg-action-accent text-slate-950 border-transparent shadow-md shadow-cyan-500/20"
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    {totalEnterprisePages}
                  </button>
                </>
              )}

              <button 
                onClick={() => setEnterprisePage(prev => Math.min(totalEnterprisePages, prev + 1))}
                disabled={enterprisePage === totalEnterprisePages}
                className="p-2 text-xs font-bold text-text-base bg-bg-base border border-border-base rounded-lg hover:bg-bg-surface disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


