import ChartWithToolbar from './ChartWithToolbar';
import AIInsightPanel from './AIInsightPanel';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';
import {
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  Hash,
  Landmark,
  PieChart,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { type ChartDataTableColumn } from './ui/ChartDataViewModal';
import { sendChat } from '../api/ai';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

interface TopInterestBond {
  bondCode: string;
  bondRate: number;
  maturityDate?: string;
  tenorPeriod?: number;
}

import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { Card, MetricCard, MetricCardSkeleton, SectionCardSkeleton } from './ui/Card';
import { getChartTheme, getChartTooltip, getComparisonAreaSeriesStyle, highlightChartTooltipValue, PIE_PALETTE } from '../utils/chart';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { useAIStore } from '../store/aiStore';
import { readDailyAIInsight, sanitizeAIInsightText, writeDailyAIInsight } from '../utils/aiInsight';
import { loadBondDetail, loadIssuerBondsByFilter } from '../services/bondData';
import {
  MARKET_OVERVIEW_CACHE_KEY,
  MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY,
  MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY,
  MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY,
  type IndustryData,
  type TopDebtIssuer,
} from '../services/marketOverviewData';
import {
  useMarketOverviewIndustryDataQuery,
  useMarketOverviewIssuerStatsQuery,
  useMarketOverviewTopInterestQuery,
} from '../query/dashboardQueries';
import { useVisibleOnce } from '../hooks/useVisibleOnce';

const TOP_INTEREST_CHART_LIMIT = 10;
type IndustryCompositionMetric = 'issuedValue' | 'listedValue' | 'remainingDebt';

const roundMetric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const wrapAxisLabel = (label: string, maxLineLength = 12) => {
  const normalized = String(label || '').trim();
  if (!normalized) return '';

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    if (word.length > maxLineLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      for (let index = 0; index < word.length; index += maxLineLength) {
        lines.push(word.slice(index, index + maxLineLength));
      }
      return;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxLineLength) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
};

type InsightTone = 'blue' | 'emerald' | 'violet' | 'red' | 'amber';

const insightToneClass: Record<InsightTone, { shell: string; icon: string; iconWrap: string; value: string; track: string; bar: string }> = {
  blue: {
    shell: 'border-blue-100 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20',
    icon: 'text-blue-600 dark:text-blue-400',
    iconWrap: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
    value: 'text-blue-700 dark:text-blue-300',
    track: 'bg-blue-100 dark:bg-blue-950/60',
    bar: 'bg-blue-500',
  },
  emerald: {
    shell: 'border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
    iconWrap: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    value: 'text-emerald-700 dark:text-emerald-300',
    track: 'bg-emerald-100 dark:bg-emerald-950/60',
    bar: 'bg-emerald-500',
  },
  violet: {
    shell: 'border-violet-100 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20',
    icon: 'text-violet-600 dark:text-violet-400',
    iconWrap: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    value: 'text-violet-700 dark:text-violet-300',
    track: 'bg-violet-100 dark:bg-violet-950/60',
    bar: 'bg-violet-500',
  },
  red: {
    shell: 'border-red-100 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/20',
    icon: 'text-red-600 dark:text-red-400',
    iconWrap: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
    value: 'text-red-700 dark:text-red-300',
    track: 'bg-red-100 dark:bg-red-950/60',
    bar: 'bg-red-500',
  },
  amber: {
    shell: 'border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20',
    icon: 'text-amber-600 dark:text-amber-400',
    iconWrap: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-300',
    track: 'bg-amber-100 dark:bg-amber-950/60',
    bar: 'bg-amber-500',
  },
};

interface InsightMiniCardProps {
  label: string;
  value: string;
  tone: InsightTone;
}

interface StructuredInsightItem {
  label: string;
  value: string;
}

interface MarketOverviewStructuredInsight {
  insights: StructuredInsightItem[];
  suggestions: [string, string, string, string, string];
}

function InsightHighlightCard({ label, value, tone }: InsightMiniCardProps) {
  const toneClass = insightToneClass[tone];

  return (
    <div className={`flex min-w-0 flex-col justify-center rounded-xl border p-3 ${toneClass.shell}`}>
      <div className="min-w-0 text-center">
        <p className="break-words text-xs font-medium leading-tight text-text-muted">{label}</p>
        <p className={`mt-0.5 break-words text-xs font-bold leading-snug ${toneClass.value}`}>{value}</p>
      </div>
    </div>
  );
}

const getShareWidthClass = (share: number) => {
  if (share <= 0) return 'w-0';
  if (share <= 8) return 'w-1/12';
  if (share <= 16) return 'w-1/6';
  if (share <= 25) return 'w-1/4';
  if (share <= 33) return 'w-1/3';
  if (share <= 42) return 'w-5/12';
  if (share <= 50) return 'w-1/2';
  if (share <= 58) return 'w-7/12';
  if (share <= 66) return 'w-2/3';
  if (share <= 75) return 'w-3/4';
  if (share <= 83) return 'w-5/6';
  if (share <= 92) return 'w-11/12';
  return 'w-full';
};

const stableSerializeInsightPayload = (payload: unknown) => {
  const seen = new WeakSet<object>();

  const normalizeValue = (value: unknown): unknown => {
    if (value == null) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => normalizeValue(item));

    const record = value as Record<string, unknown>;
    if (seen.has(record)) return null;
    seen.add(record);

    return Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = normalizeValue(record[key]);
        if (normalized !== undefined) result[key] = normalized;
        return result;
      }, {});
  };

  return JSON.stringify(normalizeValue(payload));
};

const createInsightPayloadSignature = (payloadText: string) => {
  let hash = 2166136261;

  for (let index = 0; index < payloadText.length; index += 1) {
    hash ^= payloadText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `overview-${payloadText.length}-${(hash >>> 0).toString(36)}`;
};

const parseStructuredMarketOverviewInsight = (
  text: string,
): MarketOverviewStructuredInsight | null => {
  if (!text.trim()) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const getField = (prefix: string) => {
    const line = lines.find((entry) => entry.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : '';
  };

  const allInsights = [
    { label: getField('I1_LABEL:'), value: getField('I1_VALUE:') },
    { label: getField('I2_LABEL:'), value: getField('I2_VALUE:') },
    { label: getField('I3_LABEL:'), value: getField('I3_VALUE:') },
    { label: getField('I4_LABEL:'), value: getField('I4_VALUE:') },
  ];
  const insights = allInsights.filter((item) => item.label && item.value);
  const suggestions = [
    getField('S1:'),
    getField('S2:'),
    getField('S3:'),
    getField('S4:'),
    getField('S5:'),
  ] as const;

  const isValid = insights.length >= 2 && suggestions.every(Boolean);

  if (!isValid) return null;

  return {
    insights,
    suggestions: [suggestions[0], suggestions[1], suggestions[2], suggestions[3], suggestions[4]],
  };
};

export default function MarketOverview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const { ref: marketInsightRef, isVisible: marketInsightVisible } = useVisibleOnce<HTMLDivElement>();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const cachedData = getCache(MARKET_OVERVIEW_CACHE_KEY) || getCache('market_overview');
  const cachedIssuerStats = getCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY) || getCache('top_debt_200');
  const cachedIndustryData = getCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY);
  const cachedTopInterestData = getCache('market_top_interest_bonds') || getCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY);
  const cachedProjectedCashFlows = getCache('market_projected_cash_flows') || {};
  const issuerStatsQuery = useMarketOverviewIssuerStatsQuery();
  const topInterestQuery = useMarketOverviewTopInterestQuery();
  const industryDataQuery = useMarketOverviewIndustryDataQuery();
  const hasSeedData = Boolean(
    (Array.isArray(cachedIssuerStats) && cachedIssuerStats.length > 0)
    || (Array.isArray(cachedIndustryData) && cachedIndustryData.length > 0)
    || (Array.isArray(cachedTopInterestData) && cachedTopInterestData.length > 0)
    || cachedData
  );
  const [issuerStatsData, setIssuerStatsData] = useState<TopDebtIssuer[]>(
    (Array.isArray(cachedIssuerStats) ? cachedIssuerStats : cachedData?.issuerStatsData || cachedData?.topDebtData || [])
  );
  const [topInterestData, setTopInterestData] = useState<any[]>(
    (Array.isArray(cachedTopInterestData) ? cachedTopInterestData : cachedData?.topInterestData || [])
  );
  const [industryCompositionMetric, setIndustryCompositionMetric] = useState<IndustryCompositionMetric>('remainingDebt');
  const [topIssuerMetric, setTopIssuerMetric] = useState<'remainingDebt' | 'issuedValue'>('remainingDebt');
  const [topInterestDirection, setTopInterestDirection] = useState<'highest' | 'lowest'>('highest');
  const [industryData, setIndustryData] = useState<IndustryData[]>(
    (Array.isArray(cachedIndustryData) ? cachedIndustryData : cachedData?.industryData || [])
  );
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(cachedProjectedCashFlows);
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [marketInsightText, setMarketInsightText] = useState('');
  const [marketInsightUpdatedAt, setMarketInsightUpdatedAt] = useState('');
  const [marketInsightError, setMarketInsightError] = useState<string | null>(null);
  const [isMarketInsightLoading, setIsMarketInsightLoading] = useState(false);
  const marketInsightRequestIdRef = useRef(0);
  const industryCompositionContainerRef = useRef<HTMLDivElement>(null);
  const [industryCompositionSize, setIndustryCompositionSize] = useState({ width: 0, height: 0 });
  const [insightPanelWidth, setInsightPanelWidth] = useState(0);
  const suggestionsListRef = useRef<HTMLDivElement>(null);
  const [visibleSuggestionCount, setVisibleSuggestionCount] = useState(5);
  const { ref: projectedCashFlowSectionRef, isVisible: projectedCashFlowSectionVisible } = useVisibleOnce<HTMLDivElement>();
  const {
    configured,
    baseUrl,
    defaultModel,
    defaultSystemPrompt,
    selectedModel,
    systemPrompt,
    isLoadingStatus,
    statusError,
    refreshStatus,
  } = useAIStore();

  useEffect(() => {
    const element = industryCompositionContainerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect?.width) {
        setIndustryCompositionSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = marketInsightRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setInsightPanelWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const legendStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 600 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const categoryLabelStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 600 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const valueLabelStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 500 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const chartTitleStyle = {
    fontSize: 11,
    color: chartTheme.text,
    fontWeight: 700 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const tooltipTextStyle = getChartTooltip(isDark).textStyle;
  const chartTooltip = getChartTooltip(isDark);
  const bondVolumeUnitLabel = t('unitMillionShares');
  // Shared chart palette — kept identical to IndustryView so the overview charts
  // render with the same colors as their industry-tab counterparts.
  const chartPalette = [
    '#4D93F9',
    '#F56B2D',
    '#23C68E',
    '#F55A5A',
    '#F8B011',
    '#9974F8',
    '#F05DA8',
    '#14C6E4',
    '#7279F5',
    '#94D926',
  ];
  // Composition pie shares the canonical dark -> light blue scale used across all pies/bars.
  const industryPieColors = PIE_PALETTE;

  const toNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const toBillionVnd = (value: unknown) => {
    const numberValue = toNumber(value);
    if (!numberValue) return 0;
    return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
  };

  const serializeIssuerSummary = (issuer: TopDebtIssuer) => ([
    issuer.issuerSymbol || '',
    issuer.issuerName || '',
    toNumber(issuer.totalIssuedVolume),
    toNumber(issuer.totalIssuedValue),
    toNumber(issuer.totalRemainingDebt),
    toNumber(issuer.bondCount),
  ].join(':'));

  const serializeTopInterestBond = (bond: any) => ([
    String(bond?.bondCode || bond?.code || ''),
    toNumber(bond?.bondRate),
  ].join(':'));

  const serializeIndustrySummary = (industry: IndustryData) => ([
    industry.icbCode || '',
    industry.icbName || '',
    toNumber(industry.totalIssuedValue),
    toNumber(industry.totalCurrentListedValue),
    toNumber(industry.totalRemainingDebt),
    toNumber(industry.bondCount),
    toNumber(industry.totalIssuedVolume),
    toNumber(industry.totalCurrentListedVolume),
  ].join(':'));

  const getOverviewStateSignature = (
    issuers: TopDebtIssuer[],
    topInterest: any[],
    industries: IndustryData[],
  ) => ([
    issuers.map(serializeIssuerSummary).join('|'),
    topInterest.map(serializeTopInterestBond).join('|'),
    industries.map(serializeIndustrySummary).join('|'),
  ].join('||'));

  const getOverviewPayloadSections = (payload: any) => {
    const issuers = Array.isArray(payload?.issuerStatsData) ? payload.issuerStatsData : [];
    const refreshedTopInterest = getCache('market_top_interest_bonds');
    const topInterest = Array.isArray(refreshedTopInterest)
      ? refreshedTopInterest
      : Array.isArray(payload?.topInterestData)
        ? payload.topInterestData
        : [];
    const industries = Array.isArray(payload?.industryData) ? payload.industryData : [];

    return { issuers, topInterest, industries };
  };

  const topIssuerChartTitle = useMemo(() => {
    if (language === 'vi') {
      return topIssuerMetric === 'issuedValue'
        ? 'Top 10 doanh nghi\u1ec7p c\u00f3 gi\u00e1 tr\u1ecb ph\u00e1t h\u00e0nh l\u1edbn nh\u1ea5t'
        : 'Top 10 doanh nghi\u1ec7p c\u00f3 d\u01b0 n\u1ee3 tr\u00e1i phi\u1ebfu l\u1edbn nh\u1ea5t';
    }
    return topIssuerMetric === 'issuedValue'
      ? 'Top 10 enterprises with the highest issued value'
      : 'Top 10 enterprises with the highest bond debt';
  }, [language, topIssuerMetric]);

  const topInterestChartTitle = useMemo(() => {
    if (language === 'vi') {
      return topInterestDirection === 'lowest'
        ? 'Top 10 m\u00e3 tr\u00e1i phi\u1ebfu l\u00e3i su\u1ea5t th\u1ea5p nh\u1ea5t'
        : 'Top 10 m\u00e3 tr\u00e1i phi\u1ebfu l\u00e3i su\u1ea5t cao nh\u1ea5t';
    }
    return topInterestDirection === 'lowest'
      ? 'Top 10 bonds with the lowest interest rate'
      : 'Top 10 bonds with the highest interest rate';
  }, [language, topInterestDirection]);

  const getDateKey = (dateString: string, period: 'month' | 'year') => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const sortKey = `${year}-${String(month).padStart(2, '0')}`;

    return {
      sortKey,
      bucketKey: period === 'month' ? sortKey : String(year),
      label: period === 'month' ? `T${month}/${year}` : String(year)
    };
  };

  const deferredIssuerStatsData = useDeferredValue(issuerStatsData);
  const deferredTopInterestData = useDeferredValue(topInterestData);
  const deferredIndustryData = useDeferredValue(industryData);

  const marketKpis = useMemo(() => {
    return deferredIndustryData.reduce(
      (totals, industry) => ({
        bondCount: totals.bondCount + toNumber(industry.bondCount),
        issuedVolume: totals.issuedVolume + toNumber(industry.totalIssuedVolume),
        issuedValue: totals.issuedValue + toNumber(industry.totalIssuedValue),
        remainingDebt: totals.remainingDebt + toNumber(industry.totalRemainingDebt),
      }),
      {
        bondCount: 0,
        issuedVolume: 0,
        issuedValue: 0,
        remainingDebt: 0,
      }
    );
  }, [deferredIndustryData]);

  const getSparklineSource = (...sources: number[][]) => (
    sources.find((source) => {
      const values = source.filter((value) => Number.isFinite(value));
      return values.length >= 2 && Math.max(...values) !== Math.min(...values);
    }) || []
  );

  const kpiCards = [
    {
      label: t('totalBondCodes'),
      value: formatNumber(marketKpis.bondCount, 0),
      unit: t('bondCodeUnit'),
      icon: Hash,
      tone: 'blue' as const,
      iconTone: 'blue' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.bondCount)),
        deferredIndustryData.map((industry) => toNumber(industry.bondCount)),
      ),
    },
    {
      label: t('totalIssuedVolume'),
      value: formatNumber(marketKpis.issuedVolume / 1_000_000, 2),
      unit: t('unitMillionShares'),
      icon: Boxes,
      tone: 'indigo' as const,
      iconTone: 'purple' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalIssuedVolume)),
        deferredIndustryData.map((industry) => toNumber(industry.totalIssuedVolume)),
      ),
    },
    {
      label: t('totalIssuedValueTitle'),
      value: formatNumber(marketKpis.issuedValue / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: BadgeDollarSign,
      tone: 'cyan' as const,
      iconTone: 'green' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalIssuedValue)),
        deferredIndustryData.map((industry) => toNumber(industry.totalIssuedValue)),
      ),
    },
    {
      label: t('totalRemainingDebt'),
      value: formatNumber(marketKpis.remainingDebt / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: Wallet,
      tone: 'sky' as const,
      iconTone: 'orange' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalRemainingDebt)),
        deferredIndustryData.map((industry) => toNumber(industry.totalRemainingDebt)),
      ),
    }
  ];

  useEffect(() => {
    const nextIssuers = Array.isArray(issuerStatsQuery.data) ? issuerStatsQuery.data : [];
    if (nextIssuers.length === 0) return;

    setIssuerStatsData((previous) => {
      const previousSignature = previous.map(serializeIssuerSummary).join('|');
      const nextSignature = nextIssuers.map(serializeIssuerSummary).join('|');
      return previousSignature === nextSignature ? previous : nextIssuers;
    });
    setCache('top_debt_200', nextIssuers);
    setCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY, nextIssuers);
  }, [issuerStatsQuery.data]);

  useEffect(() => {
    const nextTopInterest = Array.isArray(topInterestQuery.data) ? topInterestQuery.data : [];
    if (nextTopInterest.length === 0) return;

    setTopInterestData((previous) => {
      const previousSignature = previous.map(serializeTopInterestBond).join('|');
      const nextSignature = nextTopInterest.map(serializeTopInterestBond).join('|');
      return previousSignature === nextSignature ? previous : nextTopInterest;
    });
    setCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY, nextTopInterest);
  }, [topInterestQuery.data]);

  useEffect(() => {
    const nextIndustryData = Array.isArray(industryDataQuery.data) ? industryDataQuery.data : [];
    if (nextIndustryData.length === 0) return;

    setIndustryData((previous) => {
      const previousSignature = previous.map(serializeIndustrySummary).join('|');
      const nextSignature = nextIndustryData.map(serializeIndustrySummary).join('|');
      return previousSignature === nextSignature ? previous : nextIndustryData;
    });
    setCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY, nextIndustryData);
  }, [industryDataQuery.data]);

  useEffect(() => {
    if (!projectedCashFlowSectionVisible && Object.keys(projectedCashFlowBuckets).length === 0) return;
    if (!issuerStatsData.length) return;

    let isMounted = true;

    const fetchProjectedCashFlows = async () => {
      const cached = getCache('market_projected_cash_flows');
      if (cached && Object.keys(cached).length > 0) {
        setProjectedCashFlowBuckets(cached);
        return;
      }

      setLoadingCashFlows(true);

      try {
        const issuerSymbols = Array.from(new Set(issuerStatsData.map(issuer => issuer.issuerSymbol).filter(Boolean)));
        const bondsByCode = new Map<string, any>();

        const issuerBondResults = await mapWithConcurrency(issuerSymbols, 6, async (symbol) => {
          if (!isMounted) return [];
          const data = await loadIssuerBondsByFilter(symbol);
          return Array.isArray(data) ? data : [];
        });
        if (!isMounted) return;

        getFulfilledValues(issuerBondResults).flat().forEach((bond: any) => {
          const code = bond.bondCode || bond.code;
          if (code) bondsByCode.set(String(code), bond);
        });

        const buckets = new Map<string, ProjectedCashFlowBucket>();
        const ensureBucket = (dateString: string) => {
          const keyInfo = getDateKey(dateString, 'month');
          if (!keyInfo) return null;

          if (!buckets.has(keyInfo.bucketKey)) {
            buckets.set(keyInfo.bucketKey, { label: keyInfo.label, interest: 0, principal: 0 });
          }

          return buckets.get(keyInfo.bucketKey)!;
        };

        const addCashFlows = (cashFlows: any[]) => {
          cashFlows.forEach((cashFlow) => {
            if (!cashFlow?.paymentDate) return;

            const bucket = ensureBucket(cashFlow.paymentDate);
            if (!bucket) return;

            bucket.interest += toBillionVnd(cashFlow.interestAmount);
            bucket.principal += toBillionVnd(cashFlow.principalAmount);
          });
        };

        const bonds = Array.from(bondsByCode.values());
        const cashFlowResults = await mapWithConcurrency(bonds, 10, async (bond) => {
          const code = bond.bondCode || bond.code;
          if (!code) return { bond, cashFlows: [] };

          const cacheKey = `bond_cash_flows_${code}`;
          const cachedCashFlows = getCache(cacheKey);
          if (Array.isArray(cachedCashFlows)) {
            return { bond, cashFlows: cachedCashFlows };
          }

          const detailData = await loadBondDetail(code);
          if (!detailData) return { bond, cashFlows: [] };
          const cashFlows = Array.isArray(detailData.cashFlows)
            ? detailData.cashFlows.map((cashFlow: any) => ({
                paymentDate: cashFlow.paymentDate,
                interestAmount: toBillionVnd(cashFlow.interestAmount),
                principalAmount: toBillionVnd(cashFlow.principalAmount),
                totalCashflow: toBillionVnd(cashFlow.totalCashflow),
                bondRate: cashFlow.bondRate || 0
              }))
            : [];

          setCache(cacheKey, cashFlows);
          return { bond, cashFlows };
        });
        if (!isMounted) return;

        getFulfilledValues(cashFlowResults).forEach(({ bond, cashFlows }) => {
          if (cashFlows.length > 0) {
            addCashFlows(cashFlows);
            return;
          }

          const fallbackDate = bond.maturityDate || bond.paymentDate;
          const fallbackPrincipal = bond.currentListedValue || bond.totalRemainingDebt || bond.totalIssuedValue;
          if (!fallbackDate || !fallbackPrincipal) return;

          const bucket = ensureBucket(fallbackDate);
          if (bucket) bucket.principal += toBillionVnd(fallbackPrincipal);
        });

        if (!isMounted) return;

        const finalBuckets = Object.fromEntries(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
        setProjectedCashFlowBuckets(finalBuckets);
        setCache('market_projected_cash_flows', finalBuckets);
      } catch (error) {
        console.error('Projected cash flow fetch error', error);
      } finally {
        if (isMounted) setLoadingCashFlows(false);
      }
    };

    void fetchProjectedCashFlows();

    return () => { isMounted = false; };
  }, [issuerStatsData, projectedCashFlowBuckets, projectedCashFlowSectionVisible]);

  const projectedCashFlowData = useMemo(() => {
    const buckets = new Map<string, ProjectedCashFlowBucket>();

    Object.entries(projectedCashFlowBuckets).forEach(([key, value]) => {
      const keyInfo = getDateKey(`${key}-01`, cashFlowPeriod);
      if (!keyInfo) return;

      if (!buckets.has(keyInfo.bucketKey)) {
        buckets.set(keyInfo.bucketKey, { label: keyInfo.label, interest: 0, principal: 0 });
      }

      const bucket = buckets.get(keyInfo.bucketKey)!;
      bucket.interest += value.interest || 0;
      bucket.principal += value.principal || 0;
    });

    const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
    const labels = sortedEntries.map(([, value]) => value.label);
    const interest = sortedEntries.map(([, value]) => value.interest);
    const principal = sortedEntries.map(([, value]) => value.principal);
    const total = sortedEntries.map(([, value]) => value.interest + value.principal);

    return { labels, interest, principal, total };
  }, [projectedCashFlowBuckets, cashFlowPeriod]);

  const hasProjectedCashFlowData = projectedCashFlowData.total.some(value => value > 0);
  const projectedCashFlowTitle = language === 'vi'
    ? `${t('projectedCashFlowChart')} theo ${cashFlowPeriod === 'month' ? t('month').toLowerCase() : t('year').toLowerCase()}`
    : `${t('projectedCashFlowChart')} by ${cashFlowPeriod === 'month' ? 'month' : 'year'}`;

  const topDebtData = useMemo(
    () => [...deferredIssuerStatsData].sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt).slice(0, 10),
    [deferredIssuerStatsData]
  );

  const topIssuerDisplayData = useMemo(() => {
    const sorted = topIssuerMetric === 'issuedValue'
      ? [...deferredIssuerStatsData].sort((a, b) => toNumber(b.totalIssuedValue) - toNumber(a.totalIssuedValue))
      : [...deferredIssuerStatsData].sort((a, b) => toNumber(b.totalRemainingDebt) - toNumber(a.totalRemainingDebt));
    return sorted.slice(0, 10);
  }, [deferredIssuerStatsData, topIssuerMetric]);

  const topInterestAllNormalized = useMemo(() => {
    return (deferredTopInterestData as any[])
      .map((bond: any) => {
        const bondCode = String(bond?.bondCode || bond?.BondCode || bond?.code || bond?.Code || '').trim();
        const bondRate = toNumber(bond?.bondRate ?? bond?.BondRate ?? bond?.interestRate ?? bond?.InterestRate ?? bond?.couponRate ?? bond?.CouponRate);
        const maturityDate = String(bond?.maturityDate || bond?.MaturityDate || bond?.dueDate || bond?.DueDate || '').split('T')[0];
        const tenorPeriod = toNumber(bond?.tenorPeriod ?? bond?.TenorPeriod ?? bond?.term ?? bond?.Term);
        return { bondCode, bondRate, maturityDate, tenorPeriod };
      })
      .filter((bond) => Boolean(bond.bondCode) && Number.isFinite(bond.bondRate))
      .sort((left, right) => {
        const rateDiff = right.bondRate - left.bondRate;
        if (rateDiff !== 0) return rateDiff;
        return left.bondCode.localeCompare(right.bondCode);
      });
  }, [deferredTopInterestData]);

  const topInterestRankingItems = useMemo(() => {
    const displayBonds = topInterestDirection === 'lowest'
      ? topInterestAllNormalized.slice(-TOP_INTEREST_CHART_LIMIT).reverse()
      : topInterestAllNormalized.slice(0, TOP_INTEREST_CHART_LIMIT);

    const maxRate = displayBonds.reduce((max, bond) => Math.max(max, bond.bondRate), 0);

    return displayBonds.map((bond, index) => {
      const remainingTermLabel = (() => {
        if (bond.maturityDate) {
          const maturityTime = new Date(bond.maturityDate).getTime();
          if (!Number.isNaN(maturityTime)) {
            const diffDays = Math.ceil((maturityTime - Date.now()) / 86400000);
            if (diffDays <= 0) return language === 'vi' ? 'Đã đáo hạn' : 'Matured';
            if (diffDays < 30) return language === 'vi' ? `${diffDays} ngày` : `${diffDays} days`;
            const diffMonths = Math.ceil(diffDays / 30);
            if (diffMonths < 12) return language === 'vi' ? `${diffMonths} tháng` : `${diffMonths} months`;
            const years = Math.floor(diffMonths / 12);
            const months = diffMonths % 12;
            if (months === 0) return language === 'vi' ? `${years} năm` : `${years} years`;
            return language === 'vi' ? `${years} năm ${months} tháng` : `${years} years ${months} months`;
          }
        }
        if (bond.tenorPeriod > 0) {
          return language === 'vi' ? `${formatNumber(bond.tenorPeriod, 0)} tháng` : `${formatNumber(bond.tenorPeriod, 0)} months`;
        }
        return language === 'vi' ? 'Không có dữ liệu' : 'No data';
      })();

      return { ...bond, rank: index + 1, rateRatio: maxRate > 0 ? bond.bondRate / maxRate : 0, remainingTermLabel };
    });
  }, [topInterestAllNormalized, topInterestDirection, language]);

  const industryCompositionConfig = useMemo(() => {
    switch (industryCompositionMetric) {
      case 'issuedValue':
        return {
          label: language === 'vi' ? 'Giá trị phát hành' : 'Issued value',
          title: language === 'vi' ? 'Cơ cấu giá trị phát hành theo ngành' : 'Issued value composition by industry',
          selectorKey: 'totalIssuedValue' as const,
        };
      case 'listedValue':
        return {
          label: language === 'vi' ? 'Giá trị niêm yết' : 'Listed value',
          title: language === 'vi' ? 'Cơ cấu giá trị niêm yết theo ngành' : 'Listed value composition by industry',
          selectorKey: 'totalCurrentListedValue' as const,
        };
      default:
        return {
          label: language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt',
          title: language === 'vi' ? 'Cơ cấu dư nợ còn lại theo ngành' : 'Remaining debt composition by industry',
          selectorKey: 'totalRemainingDebt' as const,
        };
    }
  }, [industryCompositionMetric, language]);
  const industryCompositionData = useMemo(() => {
    const namedIndustryCodes = new Set(['30', '35', '40', '45', '50']);
    const named: { name: string; value: number }[] = [];
    let othersValue = 0;

    [...deferredIndustryData].forEach((industry) => {
      const value = toBillionVnd(industry[industryCompositionConfig.selectorKey]);
      if (value <= 0) return;

      if (namedIndustryCodes.has(String(industry.icbCode || '').trim())) {
        named.push({ name: t(industry.icbName as any), value });
      } else {
        othersValue += value;
      }
    });

    named.sort((left, right) => right.value - left.value);

    const top5 = named.slice(0, 5);
    const remainingValue = named.slice(5).reduce((sum, item) => sum + item.value, 0) + othersValue;

    const result = [...top5];
    if (remainingValue > 0) {
      result.push({ name: language === 'vi' ? 'Khác' : 'Others', value: remainingValue });
    }

    return result;
  }, [deferredIndustryData, industryCompositionConfig.selectorKey, language, t]);
  const industryVolumeCategories = useMemo(
    () => (industryData.length > 0 ? industryData.map((item) => t(item.icbName as any)) : []),
    [industryData, t]
  );
  const industryVolumeAxisRotate = useMemo(() => {
    const maxLabelLength = industryVolumeCategories.reduce((max, label) => Math.max(max, label.length), 0);
    if (industryVolumeCategories.length >= 10 || maxLabelLength >= 20) return 48;
    if (industryVolumeCategories.length >= 8 || maxLabelLength >= 14) return 36;
    return 0;
  }, [industryVolumeCategories]);
  const marketInsightTitle = language === 'vi'
    ? 'Nh\u1eadn x\u00e9t t\u1ed5ng quan'
    : 'Overview commentary';

  const marketInsightSummary = useMemo(() => {
    const remainingDebtBillion = marketKpis.remainingDebt / 1000000000;
    const highestRate = topInterestAllNormalized[0]?.bondRate || 0;
    const highestRateBondCode = topInterestAllNormalized[0]?.bondCode || '';
    const industryShares = [...deferredIndustryData]
      .map((item) => {
        const value = toNumber(item.totalRemainingDebt);
        return {
          label: t(item.icbName as any),
          value,
          share: marketKpis.remainingDebt > 0 ? (value / marketKpis.remainingDebt) * 100 : 0,
        };
      })
      .filter((item) => item.value > 0)
      .sort((left, right) => right.value - left.value);

    const topIndustry = industryShares[0];
    const secondIndustry = industryShares[1];
    const industryCount = industryShares.length;
    const topTwoIndustryShare = industryShares.slice(0, 2).reduce((sum, item) => sum + item.share, 0);
    const topIssuerShare = marketKpis.remainingDebt > 0 && topDebtData[0]
      ? (topDebtData[0].totalRemainingDebt / marketKpis.remainingDebt) * 100
      : 0;
    const topThreeIssuerShare = marketKpis.remainingDebt > 0
      ? (topDebtData.slice(0, 3).reduce((sum, issuer) => sum + toNumber(issuer.totalRemainingDebt), 0) / marketKpis.remainingDebt) * 100
      : 0;
    const highYieldCount = topInterestAllNormalized.filter((bond) => bond.bondRate >= 10).length;

    // Market-wide listing ratio: tổng giá trị niêm yết / tổng giá trị phát hành
    const totalListedValue = deferredIndustryData.reduce((sum, item) => sum + toNumber(item.totalCurrentListedValue), 0);
    const listingRatio = marketKpis.issuedValue > 0 ? (totalListedValue / marketKpis.issuedValue) * 100 : 0;

    return {
      remainingDebtBillion,
      highestRate,
      highestRateBondCode,
      topIndustry,
      secondIndustry,
      industryCount,
      topTwoIndustryShare,
      topIssuerShare,
      topThreeIssuerShare,
      highYieldCount,
      listingRatio,
      notableIndustries: [topIndustry, secondIndustry].filter(Boolean),
    };
  }, [deferredIndustryData, marketKpis.issuedValue, marketKpis.remainingDebt, t, topDebtData, topInterestAllNormalized]);

  // Only generate/cache the AI insight once the underlying market data is actually
  // loaded. On a cold production load the data arrays are briefly empty; generating
  // then produces a "no data" insight that gets stuck (see generate effect below).
  const hasMarketInsightData = Boolean(
    marketInsightSummary.topIndustry
    && topDebtData.length > 0
    && topInterestAllNormalized.length > 0,
  );

  const activeModel = selectedModel || defaultModel;
  const activeSystemPrompt = systemPrompt || defaultSystemPrompt;
  const marketInsightPayload = useMemo(() => ({
    // KPI da hien thi noi khac tren dashboard - KHONG dung lai trong insight
    alreadyShownKpis: {
      bondCount: marketKpis.bondCount,
      issuedVolumeMillion: roundMetric(marketKpis.issuedVolume / 1_000_000),
      issuedValueBillion: roundMetric(marketKpis.issuedValue / 1_000_000_000),
      remainingDebtBillion: roundMetric(marketKpis.remainingDebt / 1_000_000_000),
    },
    // Card 1 - Nganh dan dat (theo du no con lai)
    leadingIndustry: marketInsightSummary.topIndustry
      ? {
          name: marketInsightSummary.topIndustry.label,
          shareOfRemainingDebtPct: roundMetric(marketInsightSummary.topIndustry.share, 1),
          secondIndustryName: marketInsightSummary.secondIndustry?.label || '',
          secondIndustrySharePct: roundMetric(marketInsightSummary.secondIndustry?.share || 0, 1),
        }
      : null,
    // Card 2 - Muc do tap trung
    concentration: {
      topIssuerSymbol: topDebtData[0]?.issuerSymbol || '',
      topIssuerSharePct: roundMetric(marketInsightSummary.topIssuerShare || 0, 1),
      topThreeIssuerSharePct: roundMetric(marketInsightSummary.topThreeIssuerShare || 0, 1),
    },
    // Card 3 - Xu huong lai suat (chi co snapshot, KHONG suy dien xu huong tang/giam)
    interestRate: {
      highestRatePct: roundMetric(marketInsightSummary.highestRate || 0, 2),
      highestRateBondCode: marketInsightSummary.highestRateBondCode,
      bondsAbove10PctCount: marketInsightSummary.highYieldCount,
    },
    // Card 4 - cac ung vien diem noi bat khac (chon 1 cai noi bat nhat)
    otherHighlights: {
      activeIndustryCount: marketInsightSummary.industryCount,
      topTwoIndustrySharePct: roundMetric(marketInsightSummary.topTwoIndustryShare || 0, 1),
    },
    topIndustries: marketInsightSummary.notableIndustries.map((industry) => ({
      name: industry.label,
      share: roundMetric(industry.share, 1),
      remainingDebtBillion: roundMetric(industry.value / 1_000_000_000, 1),
    })),
    topIssuers: topDebtData.slice(0, 5).map((issuer) => ({
      symbol: issuer.issuerSymbol || '',
      issuerName: issuer.issuerName || '',
      remainingDebtBillion: roundMetric(toNumber(issuer.totalRemainingDebt) / 1_000_000_000, 1),
      issuedValueBillion: roundMetric(toNumber(issuer.totalIssuedValue) / 1_000_000_000, 1),
      bondCount: toNumber(issuer.bondCount),
    })),
    topBondRates: topInterestAllNormalized.slice(0, 5).map((bond) => ({
      bondCode: bond.bondCode,
      bondRate: roundMetric(bond.bondRate, 2),
    })),
  }), [marketKpis, marketInsightSummary, topDebtData, topInterestAllNormalized]);
  const marketInsightPayloadText = useMemo(() => {
    try {
      return stableSerializeInsightPayload({
        pageTitle: t('marketOverview'),
        sectionTitle: marketInsightTitle,
        data: marketInsightPayload,
      });
    } catch (error) {
      console.warn('Failed to serialize market overview insight payload', error);
      return '';
    }
  }, [marketInsightPayload, marketInsightTitle, t]);
  const marketInsightPayloadSignature = useMemo(
    () => (marketInsightPayloadText ? createInsightPayloadSignature(marketInsightPayloadText) : ''),
    [marketInsightPayloadText],
  );
  // Adapt the AI content length to the panel width so it fits each card without scrolling.
  const insightDensity = insightPanelWidth === 0 || insightPanelWidth >= 296
    ? 'full'
    : insightPanelWidth >= 248
      ? 'compact'
      : 'mini';
  const insightLengthRules = insightDensity === 'mini'
    ? { valueWords: '3', suggestionWords: '6-9' }
    : insightDensity === 'compact'
      ? { valueWords: '3-4', suggestionWords: '9-12' }
      : { valueWords: '4-5', suggestionWords: '12-16' };
  const marketInsightCacheKey = useMemo(
    () => `market-overview-structured-insight-v11-${language}-${insightDensity}`,
    [language, insightDensity],
  );
  const cachedMarketInsight = useMemo(
    () => (marketInsightPayloadSignature ? readDailyAIInsight(marketInsightCacheKey, marketInsightPayloadSignature) : null),
    [marketInsightCacheKey, marketInsightPayloadSignature],
  );
  const parsedMarketInsight = useMemo(
    () => parseStructuredMarketOverviewInsight(marketInsightText),
    [marketInsightText],
  );
  // Show between 3 and 5 watchlist cues depending on the space the card actually has,
  // so the full text of each cue renders without clipping or an inner scrollbar.
  useEffect(() => {
    const list = suggestionsListRef.current;
    if (!list || !parsedMarketInsight) return;

    const computeVisibleCount = () => {
      const available = list.clientHeight;
      const items = Array.from(list.children) as HTMLElement[];
      if (!available || items.length === 0) return;

      const gap = 8; // matches gap-2 between cues
      const tallestItem = Math.max(...items.map((item) => item.offsetHeight));
      if (!tallestItem) return;

      const fits = Math.floor((available + gap) / (tallestItem + gap));
      const clamped = Math.max(3, Math.min(5, fits));
      setVisibleSuggestionCount((previous) => (previous === clamped ? previous : clamped));
    };

    computeVisibleCount();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(computeVisibleCount);
    observer.observe(list);
    return () => observer.disconnect();
  }, [parsedMarketInsight, insightPanelWidth, language]);
  const marketInsightUpdatedLabel = useMemo(() => {
    if (!marketInsightUpdatedAt) return '';

    const date = new Date(marketInsightUpdatedAt);
    if (Number.isNaN(date.getTime())) return '';

    return `${t('updated')}: ${new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
      timeZone: 'Asia/Saigon',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)}`;
  }, [language, marketInsightUpdatedAt, t]);

  useEffect(() => {
    if (!marketInsightPayloadSignature) {
      setMarketInsightText('');
      setMarketInsightUpdatedAt('');
      setMarketInsightError(null);
      return;
    }

    if (!cachedMarketInsight) {
      setMarketInsightText('');
      setMarketInsightUpdatedAt('');
      setMarketInsightError(null);
      return;
    }

    // Discard cache if it uses an outdated format that no longer parses
    if (!parseStructuredMarketOverviewInsight(cachedMarketInsight.text)) {
      setMarketInsightText('');
      setMarketInsightUpdatedAt('');
      setMarketInsightError(null);
      return;
    }

    setMarketInsightText(cachedMarketInsight.text);
    setMarketInsightUpdatedAt(cachedMarketInsight.updatedAt);
    setMarketInsightError(null);
  }, [cachedMarketInsight, marketInsightPayloadSignature]);

  useEffect(() => {
    if (!marketInsightVisible || configured || baseUrl || isLoadingStatus || statusError) return;
    void refreshStatus();
  }, [baseUrl, configured, isLoadingStatus, marketInsightVisible, refreshStatus, statusError]);

  const generateMarketInsight = async (force = false) => {
    if (!marketInsightPayloadText || !hasMarketInsightData) return;

    if (!configured) {
      setMarketInsightError(t('aiNotConfiguredShort'));
      return;
    }

    if (!force) {
      const cachedInsight = readDailyAIInsight(marketInsightCacheKey, marketInsightPayloadSignature);
      if (cachedInsight && parseStructuredMarketOverviewInsight(cachedInsight.text)) {
        setMarketInsightText(cachedInsight.text);
        setMarketInsightUpdatedAt(cachedInsight.updatedAt);
        setMarketInsightError(null);
        return;
      }
    }

    const requestId = marketInsightRequestIdRef.current + 1;
    marketInsightRequestIdRef.current = requestId;
    setIsMarketInsightLoading(true);
    setMarketInsightError(null);

    try {
      const analystPrompt = language === 'en'
        ? [
            'You are a professional fixed-income analyst. Respond in English only.',
            'Use ONLY the numbers present in the provided data. Never invent, estimate, or round figures not given. Do not infer trends (rising/falling) unless the data explicitly contains them. Do not mention JSON, APIs, endpoints, internal fields, variables, or code structure.',
            'Fill a fixed market-overview layout with up to 4 insight cards and exactly 5 watchlist cues. Return plain text only, no markdown, no bullets, no numbering, no extra commentary.',
            'Each insight card has exactly 2 lines: a fixed title (LABEL) and a short value/finding (VALUE) containing a concrete figure from the data.',
            'Return these lines in this exact order:',
            'I1_LABEL: Leading sector',
            'I1_VALUE: (use leadingIndustry: name + shareOfRemainingDebtPct, e.g. "Financials hold 79.7% of debt")',
            'I2_LABEL: Concentration',
            'I2_VALUE: (use concentration: top issuer or top-3 share, e.g. "Top 3 issuers hold 25.1%")',
            'I3_LABEL: Interest rates',
            'I3_VALUE: (use interestRate: bondsAbove10PctCount or highestRatePct, e.g. "8 bonds above 10%")',
            'I4_LABEL: (pick ONE: Sector spread / Market breadth / Capital concentration — based on otherHighlights)',
            'I4_VALUE: (matching figure from otherHighlights, e.g. topTwoIndustrySharePct or activeIndustryCount)',
            'S1:',
            'S2:',
            'S3:',
            'S4:',
            'S5:',
            `Rules: keep I1/I2/I3 titles exactly as written above. VALUE max ${insightLengthRules.valueWords} words with a real figure. Return exactly 5 watchlist cues (S1 to S5), none left empty. Each suggestion must be a single clear sentence of roughly ${insightLengthRules.suggestionWords} words on ONE line, combining a specific figure with a concrete action to monitor; do not write fragments and do not exceed one line. Each suggestion is distinct from the insight cards and from the other suggestions. Never use the word "Risk" unless it is a genuine warning. Do not reuse the alreadyShownKpis (bond count, issued value, issued volume, remaining debt) as a standalone insight. Do not repeat the same point across cards or against the cash-flow commentary. If otherHighlights lacks a meaningful distinct figure, leave I4_LABEL and I4_VALUE empty rather than duplicating or fabricating.`,
          ].join(' ')
        : [
            'Bạn là chuyên gia phân tích thị trường trái phiếu doanh nghiệp. Chỉ trả lời bằng tiếng Việt CÓ DẤU đầy đủ. TUYỆT ĐỐI không viết tiếng Việt không dấu; mọi từ trong phần trả lời (cả LABEL và VALUE) đều phải có dấu thanh và dấu mũ chính xác.',
            'CHỈ dùng các con số có trong dữ liệu được cung cấp. Tuyệt đối không bịa, không ước lượng, không tự tạo số liệu không có. Không suy diễn xu hướng (tăng/giảm) trừ khi dữ liệu có sẵn. Không nhắc tới JSON, API, endpoint, tên biến, tên hàm hay cấu trúc nội bộ.',
            'Hãy điền nội dung cho layout nhận xét tổng quan với tối đa 4 card insight và đúng 5 gợi ý theo dõi. Trả về văn bản thường, không markdown, không bullet, không giải thích thêm.',
            'Mỗi card insight có đúng 2 dòng: tiêu đề cố định (LABEL) và giá trị/nhận định ngắn (VALUE) có kèm số liệu thực từ dữ liệu.',
            'Bắt buộc trả về các dòng theo đúng thứ tự sau:',
            'I1_LABEL: Ngành dẫn dắt',
            'I1_VALUE: (dùng leadingIndustry: tên ngành + shareOfRemainingDebtPct, ví dụ "Tài chính chiếm 79,7% dư nợ")',
            'I2_LABEL: Mức độ tập trung',
            'I2_VALUE: (dùng concentration: top issuer hoặc top 3, ví dụ "Top 3 doanh nghiệp chiếm 25,1%")',
            'I3_LABEL: Xu hướng lãi suất',
            'I3_VALUE: (dùng interestRate: bondsAbove10PctCount hoặc highestRatePct, ví dụ "8 mã lãi suất trên 10%")',
            'I4_LABEL: (chọn ĐÚNG MỘT tiêu đề phù hợp nhất với otherHighlights, lấy nguyên văn có dấu từ danh sách: "Ngành tăng trưởng mạnh" / "Áp lực đáo hạn" / "Phân hóa ngành" / "Thanh khoản thị trường" / "Hoạt động phát hành" / "Chất lượng phân bổ danh mục" / "Độ rộng thị trường" / "Mức độ tập trung vốn" / "Xu hướng dịch chuyển vốn")',
            'I4_VALUE: (số liệu tương ứng từ otherHighlights, ví dụ topTwoIndustrySharePct hoặc activeIndustryCount)',
            'S1:',
            'S2:',
            'S3:',
            'S4:',
            'S5:',
            `Quy tắc: giữ nguyên chính xác tiêu đề I1/I2/I3 như trên. Mỗi VALUE tối đa ${insightLengthRules.valueWords} từ và phải có số liệu thực. Trả về đúng 5 gợi ý theo dõi (S1 đến S5), không để trống gợi ý nào. Mỗi gợi ý là MỘT câu rõ ràng dài khoảng ${insightLengthRules.suggestionWords} từ trên MỘT dòng, kết hợp số liệu cụ thể với hành động cần theo dõi; không viết câu cụt và không vượt quá một dòng. Mỗi gợi ý khác biệt với các card insight và khác biệt giữa các gợi ý với nhau. Không dùng từ "Rủi ro" trừ khi là cảnh báo thực sự. Không dùng lại các KPI đã hiển thị (tổng số mã, tổng giá trị phát hành, khối lượng phát hành, dư nợ còn lại) làm một insight riêng. Không lặp ý giữa các card hoặc với phần nhận xét dòng tiền. Nếu otherHighlights không có số liệu nổi bật khác biệt, để trống I4_LABEL và I4_VALUE thay vì lặp lại hoặc bịa. Nhắc lại: toàn bộ nội dung phải là tiếng Việt có dấu.`,
          ].join(' ');

      const response = await sendChat({
        model: activeModel,
        systemPrompt: `${activeSystemPrompt ? `${activeSystemPrompt}\n\n` : ''}${analystPrompt}`,
        userMessage: language === 'en'
          ? 'Write the overview insight content for the fixed dashboard slots.'
          : 'Hay viet noi dung nhan xet tong quan cho cac o co dinh tren dashboard.',
        pageContext: marketInsightPayloadText,
      });

      if (marketInsightRequestIdRef.current !== requestId) return;

      const nextInsight = sanitizeAIInsightText(String(response.text || ''), language === 'en' ? 'en' : 'vi');
      const parsed = parseStructuredMarketOverviewInsight(nextInsight);
      if (!parsed) {
        throw new Error(language === 'vi' ? 'AI tra ve sai dinh dang nhan xet.' : 'AI returned an invalid overview insight format.');
      }

      const generatedAt = new Date().toISOString();
      setMarketInsightText(nextInsight);
      setMarketInsightUpdatedAt(generatedAt);
      writeDailyAIInsight(marketInsightCacheKey, {
        signature: marketInsightPayloadSignature,
        text: nextInsight,
        model: response.model || activeModel,
        updatedAt: generatedAt,
      });
    } catch (error: any) {
      if (marketInsightRequestIdRef.current !== requestId) return;
      setMarketInsightError(error?.response?.data?.details || error?.response?.data?.error || error?.message || t('aiCannotGenerateInsight'));
    } finally {
      if (marketInsightRequestIdRef.current === requestId) {
        setIsMarketInsightLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!marketInsightVisible || !marketInsightPayloadText || !hasMarketInsightData || !configured || isMarketInsightLoading || marketInsightText || marketInsightError || cachedMarketInsight) return;
    void generateMarketInsight(false);
  }, [
    cachedMarketInsight,
    configured,
    hasMarketInsightData,
    isMarketInsightLoading,
    marketInsightError,
    marketInsightPayloadText,
    marketInsightText,
    marketInsightVisible,
  ]);

  const handleRefreshMarketInsight = () => {
    void Promise.all([
      issuerStatsQuery.refetch(),
      topInterestQuery.refetch(),
      industryDataQuery.refetch(),
    ]).finally(() => {
      void generateMarketInsight(true);
    });
  };

  const cashFlowInsightTitle = language === 'vi'
    ? 'NH\u1eacN X\u00c9T V\u1ec0 D\u00d2NG TI\u1ec0N'
    : 'CASH FLOW COMMENTARY';

  const cashFlowInsightPayload = useMemo(() => ({
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
  }), [cashFlowPeriod, projectedCashFlowData]);

  const topIssuerDataViewRows = useMemo(() => {
    return topIssuerDisplayData.map((issuer) => ([
      issuer.issuerSymbol || '',
      formatNumber(issuer.totalRemainingDebt / 1000000000, 0),
      formatNumber(issuer.totalIssuedValue / 1000000000, 0),
    ]));
  }, [topIssuerDisplayData]);

  const topIssuerDataViewColumns: ChartDataTableColumn[] = useMemo(() => ([
    { label: t('ticker'), align: 'center', kind: 'text' },
    { label: t('remainingDebtTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
    { label: t('totalIssuedValueTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
  ]), [t]);
  const topInterestDataViewRows = useMemo(() => (
    topInterestRankingItems.map((item) => ([
      item.bondCode,
      formatNumber(item.bondRate, 2),
      item.remainingTermLabel,
    ]))
  ), [topInterestRankingItems]);
  const topInterestDataViewColumns: ChartDataTableColumn[] = useMemo(() => ([
    { label: t('ticker'), align: 'center', kind: 'text' },
    { label: t('interestRate'), unit: '%', align: 'right', kind: 'number' },
    { label: language === 'vi' ? 'Kỳ hạn còn lại' : 'Remaining term', align: 'left', kind: 'text' },
  ]), [language, t]);

  const handleTopIssuerCategoryClick = (ticker: string) => {
    const normalizedTicker = String(ticker || '').trim();
    if (!normalizedTicker) return;
    navigate(`/filter/issuer/${encodeURIComponent(normalizedTicker)}`, {
      state: {
        from: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
      },
    });
  };

  const handleTopInterestCategoryClick = (bondCode: string) => {
    const normalizedCode = String(bondCode || '').trim();
    if (!normalizedCode) return;
    navigate(`/${encodeURIComponent(normalizedCode)}`);
  };

  // Top 10 issuers - reversed so the largest sits on top of the horizontal bar chart.
  const topIssuerBarData = useMemo(() => [...topIssuerDisplayData].reverse(), [topIssuerDisplayData]);

  const topIssuerOptions = {
    color: chartPalette,
    __dataView: {
      categoryLabel: t('ticker'),
      categoryAlign: 'center',
      columns: topIssuerDataViewColumns,
      rows: topIssuerDataViewRows,
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const safeParams = Array.isArray(params) ? params : [params];
        let res = safeParams[0]?.name || '';
        safeParams.forEach((p: any) => {
          res += `<br/>${p.marker}${p.seriesName}: ${highlightChartTooltipValue(formatNumber(p.value, 0), ` ${t('unitBillionVND')}`)}`;
        });
        return res;
      },
    },
    grid: { left: '3%', right: '18%', top: '0%', bottom: '6%', containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { show: false },
      name: t('unitBillionVND'),
      nameGap: 10,
      nameTextStyle: chartTitleStyle,
      axisLabel: { ...valueLabelStyle, formatter: (value: number) => formatNumber(value, 0) },
    },
    yAxis: {
      type: 'category',
      data: topIssuerBarData.map((issuer) => issuer.issuerSymbol || ''),
      axisLabel: categoryLabelStyle,
    },
    series: [
      {
        name: topIssuerMetric === 'issuedValue' ? t('totalIssuedValueTitle') : t('remainingDebtTitle'),
        type: 'bar',
        data: topIssuerBarData.map((issuer) => topIssuerMetric === 'issuedValue'
          ? roundMetric(toNumber(issuer.totalIssuedValue) / 1_000_000_000, 0)
          : roundMetric(toNumber(issuer.totalRemainingDebt) / 1_000_000_000, 0)),
        itemStyle: {
          // No explicit color: inherit the shared default bar gradient from applyChartTheme,
          // exactly like the "Top 10 highest interest rate" chart (oriented for horizontal bars here).
          borderRadius: [0, 4, 4, 0],
        },
        barWidth: '50%',
      },
    ],
  };

  const topInterestOptions = {
    color: chartPalette,
    __dataView: {
      categoryLabel: t('ticker'),
      categoryAlign: 'center',
      columns: topInterestDataViewColumns,
      rows: topInterestDataViewRows,
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        return `${point.name}<br/>${point.marker}${point.seriesName}: ${highlightChartTooltipValue(formatInterestRate(point.value), ' %')}`;
      },
    },
    grid: { left: '5%', right: '5%', top: '8%', bottom: '6%', containLabel: true },
    xAxis: {
      type: 'category',
      data: topInterestRankingItems.map((item) => item.bondCode),
      axisTick: { alignWithLabel: true },
      axisLabel: { ...categoryLabelStyle, interval: 0, rotate: 45, margin: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { show: false },
      name: '%',
      nameGap: 10,
      nameTextStyle: chartTitleStyle,
      axisLabel: { ...valueLabelStyle, formatter: (value: number) => formatNumber(value, 1) },
    },
    series: [
      {
        name: t('interestRate'),
        type: 'bar',
        data: topInterestRankingItems.map((item) => item.bondRate),
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        barWidth: '46%',
      },
    ],
  };

  // Keep the legend pinned to the right of the pie while scaling both so they never overlap.
  const industryCompositionLayout = (() => {
    const width = industryCompositionSize.width;
    if (!width) {
      // Initial render before measurement: fall back to the roomy desktop layout.
      return {
        center: ['36%', '50%'] as [string, string],
        radius: ['40%', '72%'] as [string, string],
        legendRightPct: 2,
        legendTextWidth: undefined as number | undefined,
      };
    }

    // Estimate the actual chart canvas height (container minus the title/toolbar header).
    const canvasHeight = Math.max(180, industryCompositionSize.height - 72);
    // Reserve a column on the right for the legend; it grows (proportionally) as the chart narrows.
    const legendFraction = Math.min(0.46, Math.max(0.3, 160 / width));
    const pieFraction = 1 - legendFraction;
    const minSide = Math.min(width, canvasHeight);
    // Bound the pie by both the available pie column width and the canvas height, leaving a little padding.
    const outerRadiusPx = Math.max(40, Math.min((pieFraction * width) / 2 - 6, (canvasHeight / 2) * 0.9));
    // ECharts pie radius % is relative to min(width,height)/2, so convert px accordingly.
    const outerRadiusPct = Math.min(72, (outerRadiusPx / (minSide / 2)) * 100);
    const innerRadiusPct = outerRadiusPct * 0.55;
    const centerXPct = (pieFraction / 2) * 100;

    return {
      center: [`${centerXPct}%`, '50%'] as [string, string],
      radius: [`${innerRadiusPct}%`, `${outerRadiusPct}%`] as [string, string],
      legendRightPct: 1,
      legendTextWidth: Math.max(64, legendFraction * width - 18),
    };
  })();

  const industryCompositionTotal = industryCompositionData.reduce((sum, item) => sum + item.value, 0);
  const industryValueOptions = {
    color: industryPieColors,
    __dataView: {
      categoryLabel: t('marketTitle'),
      categoryAlign: 'left',
      columns: [
        { label: t('name'), align: 'left' as const, kind: 'text' as const },
        { label: industryCompositionConfig.label, unit: t('unitBillionVND'), align: 'right' as const, kind: 'number' as const },
        { label: language === 'vi' ? 'Tỷ trọng' : 'Proportion', align: 'right' as const, kind: 'number' as const },
      ],
      rows: industryCompositionData.map((item) => [
        item.name,
        item.value,
        industryCompositionTotal > 0 ? `${formatNumber((item.value / industryCompositionTotal) * 100, 2)}%` : '',
      ]),
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const proportionLabel = language === 'vi' ? 'Tỷ trọng' : 'Proportion';
        return `${params.name}<br/>${params.marker}${industryCompositionConfig.label}: ${highlightChartTooltipValue(formatNumber(params.value, 2), ` ${t('unitBillionVND')}`)}<br/>${params.marker}${proportionLabel}: ${highlightChartTooltipValue(formatNumber(params.percent, 2), '%')}`;
      },
    },
    legend: {
      show: true,
      type: 'scroll',
      orient: 'vertical',
      right: `${industryCompositionLayout.legendRightPct}%`,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: industryCompositionLayout.legendTextWidth
        ? { ...legendStyle, width: industryCompositionLayout.legendTextWidth, overflow: 'break' }
        : legendStyle,
    },
    graphic: industryCompositionData.length === 0 ? {
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: language === 'vi' ? 'Không có dữ liệu' : 'No data',
        fill: chartTheme.subText,
        fontSize: 12,
        fontFamily: 'Inter, Manrope, sans-serif',
        fontWeight: 600,
      },
    } : undefined,
    series: [
      {
        name: industryCompositionConfig.label,
        type: 'pie',
        radius: industryCompositionLayout.radius,
        center: industryCompositionLayout.center,
        avoidLabelOverlap: true,
        minAngle: 4,
        label: {
          show: false,
        },
        labelLine: {
          show: false,
        },
        itemStyle: {
          borderRadius: 10,
          borderWidth: 0,
        },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: {
            shadowBlur: 16,
            shadowColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(37, 99, 235, 0.18)',
          },
        },
        data: industryCompositionData.map((item, index) => ({
          ...item,
          itemStyle: { color: industryPieColors[index % industryPieColors.length] },
        })),
      },
    ],
  };

  // Two columns in the same blue family as the "Top 10 highest interest rate" bar gradient:
  // the issued-volume column is the dark tone, the listed-volume column is the light tone.
  const industryVolumeDarkColor = {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: '#2563EB' },
      { offset: 0.5, color: '#3B82F6' },
      { offset: 1, color: '#0EA5E9' },
    ],
  };
  const industryVolumeLightColor = {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: '#60A5FA' },
      { offset: 1, color: '#93C5FD' },
    ],
  };

  const industryVolumeOptions = {
    color: chartPalette,
    __dataView: {
      categoryLabel: t('marketTitle'),
      categoryAlign: 'left',
    },
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let res = params[0].name;
        params.forEach((p: any) => {
          res += `<br/>${p.marker}${p.seriesName}: ${highlightChartTooltipValue(formatNumber(p.value, 2), ` ${bondVolumeUnitLabel}`)}`;
        });
        return res;
      }
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '6%', right: '4%', top: '8%', bottom: '8%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryVolumeCategories,
      axisTick: {
        alignWithLabel: true,
      },
      axisLabel: {
        ...categoryLabelStyle,
        interval: 0,
        rotate: industryVolumeAxisRotate,
        margin: industryVolumeAxisRotate > 0 ? 16 : 12,
        lineHeight: 14,
        hideOverlap: false,
        fontSize: industryVolumeAxisRotate > 0 ? 10 : categoryLabelStyle.fontSize,
        formatter: (value: string) => String(value || ''),
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { show: false },
      name: bondVolumeUnitLabel,
      nameGap: 10,
      nameTextStyle: chartTitleStyle,
      axisLabel: { 
        ...valueLabelStyle,
        formatter: (value: number) => formatNumber(value, 2)
      } 
    },
    series: [
        {
          name: t('issuedVolumeTitle'),
          type: 'bar',
          data: industryData.length > 0 ? industryData.map((d) => d.totalIssuedVolume / 1_000_000) : [],
          itemStyle: {
            color: industryVolumeDarkColor,
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '30%'
        },
        {
          name: t('listedVolume'),
          type: 'bar',
          data: industryData.length > 0 ? industryData.map((d) => d.totalCurrentListedVolume / 1_000_000) : [],
          itemStyle: {
            color: industryVolumeLightColor,
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '30%'
        }
    ]
  };

  const projectedCashFlowOptions = {
    color: chartPalette,
    __dataView: {
      categoryLabel: t('year'),
      categoryAlign: 'center',
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line' },
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const safeParams = Array.isArray(params) ? params : [];
        const interest = safeParams.find((param: any) => param.seriesName === t('totalInterestPayable'))?.value || 0;
        const principal = safeParams.find((param: any) => param.seriesName === t('totalPrincipalPayable'))?.value || 0;
        const total = interest + principal;

        const firstMarker = safeParams[0]?.marker || '';
        const secondMarker = safeParams[1]?.marker || '';
        const label = safeParams[0]?.name || '';

        return `${label}<br/>${firstMarker} ${t('totalInterestPayable')}: ${highlightChartTooltipValue(formatNumber(interest, 2), ` ${t('unitBillionVND')}`)}<br/>${secondMarker} ${t('totalPrincipalPayable')}: ${highlightChartTooltipValue(formatNumber(principal, 2), ` ${t('unitBillionVND')}`)}<br/><strong>${t('totalCashFlow')}: ${highlightChartTooltipValue(formatNumber(total, 2), ` ${t('unitBillionVND')}`)}</strong>`;
      }
    },
    legend: {
      bottom: 25,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { top: '3%', bottom: '30%', left: '8%', right: '6%' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: projectedCashFlowData.labels,
      axisLabel: {
        ...categoryLabelStyle,
        rotate: cashFlowPeriod === 'month' && projectedCashFlowData.labels.length > 10 ? 45 : 0,
        margin: 12
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none'
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 5,
        filterMode: 'none',
        brushSelect: false,
        textStyle: valueLabelStyle
      }
    ],
    yAxis: {
      type: 'value',
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      name: t('unitBillionVND'),
      nameGap: 12,
      nameTextStyle: chartTitleStyle,
      axisLabel: {
        ...valueLabelStyle,
        margin: 12,
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

  const hasAnyOverviewData = issuerStatsData.length > 0 || topInterestData.length > 0 || industryData.length > 0;
  const marketOverviewError = !hasAnyOverviewData
    ? [industryDataQuery.error, issuerStatsQuery.error, topInterestQuery.error].find(Boolean)
    : null;
  const errorMessage = marketOverviewError instanceof Error
    ? (marketOverviewError.message.includes('401') ? t('tokenError401') : marketOverviewError.message)
    : marketOverviewError
      ? t('error')
      : null;
  const isKpiSectionLoading = industryDataQuery.isLoading && industryData.length === 0;
  const isTopIssuerSectionLoading = issuerStatsQuery.isLoading && topDebtData.length === 0;
  const isTopInterestSectionLoading = topInterestQuery.isLoading && topInterestRankingItems.length === 0;
  const isIndustryChartSectionLoading = industryDataQuery.isLoading && industryData.length === 0;
  const isProjectedCashFlowPending = !projectedCashFlowSectionVisible && !hasProjectedCashFlowData && Object.keys(projectedCashFlowBuckets).length === 0;
  const isCashFlowInsightLoading = isProjectedCashFlowPending || loadingCashFlows;
  const shouldShowCashFlowInsight = !isCashFlowInsightLoading;
  const cashFlowInsightLoadingLabel = t('aiGeneratingInsight');

  if (errorMessage && !hasAnyOverviewData) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-text-base">{t('failedToLoadData')}</h3>
        <p className="text-text-muted max-w-md">{errorMessage}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="rounded-lg bg-action-accent px-6 py-2 font-bold text-slate-950 transition-colors hover:opacity-90 cursor-pointer"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 py-3 transition-colors duration-300">
      <div className="grid min-w-0 grid-cols-12 gap-3">
        <div className="col-span-12 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isKpiSectionLoading
            ? Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)
            : kpiCards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                unit={card.unit}
                icon={card.icon}
                tone={card.tone}
                iconTone={card.iconTone}
                sparklineValues={card.sparklineValues}
              />
            ))}
        </div>

        <div className="order-1 col-span-12 grid min-w-0 content-start grid-cols-12 gap-x-3 gap-y-3 lg:col-span-9">
          {isTopIssuerSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div className="h-96 overflow-hidden">
                <ChartWithToolbar
                  key={`market-overview-top-issuer-${topIssuerMetric}`}
                  option={topIssuerOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                  title={topIssuerChartTitle}
                  titleIcon={Landmark}
                  headerClassName="gap-1"
                  actionsPlacement="below"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  onDataViewCategoryClick={(value) => handleTopIssuerCategoryClick(value)}
                  actions={(
                    <select
                      value={topIssuerMetric}
                      onChange={(event) => setTopIssuerMetric(event.target.value as 'remainingDebt' | 'issuedValue')}
                      className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                      aria-label={language === 'vi' ? 'Chọn chỉ tiêu biểu đồ' : 'Select chart metric'}
                    >
                      <option value="remainingDebt">{language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt'}</option>
                      <option value="issuedValue">{language === 'vi' ? 'Giá trị phát hành' : 'Issued value'}</option>
                    </select>
                  )}
                />
              </div>
            </Card>
          )}

          {isTopInterestSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div className="h-96 overflow-hidden">
                <ChartWithToolbar
                  key={`market-overview-top-interest-${topInterestDirection}`}
                  option={topInterestOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  notMerge
                  title={topInterestChartTitle}
                  titleIcon={TrendingUp}
                  headerClassName="gap-1"
                  actionsPlacement="below"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  onDataViewCategoryClick={(value) => handleTopInterestCategoryClick(value)}
                  actions={(
                    <select
                      value={topInterestDirection}
                      onChange={(event) => setTopInterestDirection(event.target.value as 'highest' | 'lowest')}
                      className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                      aria-label={language === 'vi' ? 'Chọn chiều sắp xếp' : 'Select sort direction'}
                    >
                      <option value="highest">{language === 'vi' ? 'Cao nhất' : 'Highest'}</option>
                      <option value="lowest">{language === 'vi' ? 'Thấp nhất' : 'Lowest'}</option>
                    </select>
                  )}
                />
              </div>
            </Card>
          )}

          {isIndustryChartSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div ref={industryCompositionContainerRef} className="h-96 overflow-hidden">
                <ChartWithToolbar
                  key={`market-overview-industry-composition-${industryCompositionMetric}`}
                  option={industryValueOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                  title={industryCompositionConfig.title}
                  showZoomButton={false}
                  actionsPlacement="below"
                  headerClassName="gap-1"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  actions={(
                    <select
                      value={industryCompositionMetric}
                      onChange={(event) => setIndustryCompositionMetric(event.target.value as IndustryCompositionMetric)}
                      className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                      aria-label={language === 'vi' ? 'Chọn giá trị biểu đồ ngành' : 'Select industry chart metric'}
                    >
                      <option value="issuedValue">{language === 'vi' ? 'Giá trị phát hành' : 'Issued value'}</option>
                      <option value="listedValue">{language === 'vi' ? 'Giá trị niêm yết' : 'Listed value'}</option>
                      <option value="remainingDebt">{language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt'}</option>
                    </select>
                  )}
                />
              </div>
            </Card>
          )}

          {isIndustryChartSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div className="h-96 overflow-hidden pt-2">
                <ChartWithToolbar
                  key="market-overview-industry-volume"
                  option={industryVolumeOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  notMerge
                  title={t('volumeByIndustry')}
                  headerClassName="gap-1"
                  chartContainerClassName="pt-0"
                />
              </div>
            </Card>
          )}

        </div>

        <Card className="order-2 col-span-12 flex min-h-0 flex-col border-blue-100/80 bg-blue-50/50 p-3 shadow-sm shadow-blue-500/10 dark:border-blue-900/40 dark:bg-blue-950/10 dark:shadow-black/20 lg:col-span-3 lg:h-[844px]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden" ref={marketInsightRef}>
            <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-surface text-blue-600 shadow-sm ring-1 ring-blue-100 dark:bg-slate-900/40 dark:ring-blue-900/40">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold leading-snug text-text-base">{marketInsightTitle}</h3>
                  {marketInsightUpdatedLabel ? (
                    <p className="mt-1 break-words text-xs font-semibold leading-snug text-text-muted/80">{marketInsightUpdatedLabel}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefreshMarketInsight}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 active:scale-95 dark:hover:bg-blue-950/30"
                title={t('refresh')}
                aria-label={t('refresh')}
              >
                <RefreshCw className={`h-4 w-4 ${isMarketInsightLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isMarketInsightLoading ? (
              <div className="flex items-center gap-3 px-1 py-2 text-sm font-semibold text-text-muted">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span>{t('aiGeneratingInsight')}</span>
              </div>
            ) : marketInsightError ? (
              <div className="flex items-start gap-3 rounded-lg bg-bg-surface/80 px-4 py-3 text-sm text-text-muted shadow-sm ring-1 ring-amber-200/80 dark:bg-slate-900/20 dark:ring-amber-500/20">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{marketInsightError}</span>
              </div>
            ) : parsedMarketInsight ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <section className="rounded-lg border border-border-base bg-bg-surface/90 p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-xs font-bold text-text-base">{language === 'vi' ? 'Insight nổi bật' : 'Key insights'}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {parsedMarketInsight.insights.map((item, index) => {
                      const tones = ['blue', 'violet', 'amber', 'emerald'] as const;
                      return (
                        <InsightHighlightCard
                          key={`${item.label}-${index}`}
                          label={item.label}
                          value={item.value}
                          tone={tones[index % tones.length]}
                        />
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-lg border border-border-base bg-bg-surface/90 p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                      <PieChart className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-xs font-bold text-text-base">{language === 'vi' ? 'Nhóm ngành đáng chú ý' : 'Notable industries'}</h4>
                  </div>
                  <div className="space-y-3">
                    {marketInsightSummary.notableIndustries.length > 0 ? marketInsightSummary.notableIndustries.map((industry, index) => {
                      const tone = index === 0 ? insightToneClass.blue : insightToneClass.emerald;

                      return (
                        <div key={industry.label} className="min-w-0">
                          <div className="mb-1.5 flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-xs font-medium text-text-base">{industry.label}</p>
                            <p className="shrink-0 text-xs font-bold tabular-nums text-text-base">{formatNumber(industry.share, 1)}%</p>
                          </div>
                          <div className={`h-2 overflow-hidden rounded-full ${tone.track}`}>
                            <div className={`h-full rounded-full ${tone.bar} ${getShareWidthClass(industry.share)}`} />
                          </div>
                        </div>
                      );
                    }) : (
                      <p className="text-xs font-medium text-text-muted">{language === 'vi' ? 'Chưa có dữ liệu ngành.' : 'No industry data yet.'}</p>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border-base bg-bg-surface/90 p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-xs font-bold text-text-base">{language === 'vi' ? 'Gợi ý theo dõi' : 'Watchlist cues'}</h4>
                  </div>
                  <div ref={suggestionsListRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                    {parsedMarketInsight.suggestions.slice(0, visibleSuggestionCount).map((suggestion) => (
                      <div key={suggestion} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <p className="min-w-0 text-xs font-medium leading-relaxed text-text-base">{suggestion}</p>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            ) : (
              <div className="rounded-lg bg-bg-surface/80 px-4 py-3 text-sm text-text-muted shadow-sm ring-1 ring-blue-100/70 dark:bg-slate-900/20 dark:ring-blue-900/30">
                {marketInsightPayloadText ? t('aiNoInsight') : t('noData')}
              </div>
            )}
          </div>
        </Card>

        <div className="order-3 col-span-12 flex flex-col gap-3 lg:flex-row">
          {isCashFlowInsightLoading ? (
            <Card className="flex min-h-0 shrink-0 flex-col border-blue-100/80 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-4 shadow-sm shadow-blue-500/10 dark:border-blue-900/40 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20 dark:shadow-black/20 lg:w-[37.5%]">
              <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-surface text-blue-600 shadow-sm ring-1 ring-blue-100 dark:bg-slate-900/40 dark:ring-blue-900/40">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text-base">
                      {language === 'vi' ? 'Nhận xét về dòng tiền' : 'Cash flow commentary'}
                    </h3>
                  </div>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-base bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted opacity-60">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                </div>
              </div>
              <div className="flex items-center gap-3 px-1 py-2 text-sm font-semibold text-text-muted">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span>{cashFlowInsightLoadingLabel}</span>
              </div>
            </Card>
          ) : shouldShowCashFlowInsight ? (
            <AIInsightPanel
              cacheKey="market-overview-cash-flow-insight"
              title={cashFlowInsightTitle}
              pageTitle={t('marketOverview')}
              sectionTitle={cashFlowInsightTitle}
              payload={cashFlowInsightPayload}
              className="shrink-0 lg:w-[37.5%]"
              expandContent
              layout="stacked"
              contentChrome="plain"
            />
          ) : null}

          <div
            ref={projectedCashFlowSectionRef}
            className="group relative min-w-0 flex-1 flex flex-col overflow-hidden rounded-xl border border-border-base bg-bg-surface p-2 shadow-sm shadow-blue-950/5 ring-1 ring-transparent transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-950/10 hover:ring-blue-100/80 motion-reduce:hover:translate-y-0 dark:shadow-black/20 dark:hover:border-blue-500/20 dark:hover:shadow-black/30 dark:hover:ring-blue-500/10 md:p-3"
          >
            {isProjectedCashFlowPending ? (
              <div className="h-80 shrink-0 md:h-96">
                <SectionCardSkeleton className="h-full border-0 bg-transparent p-0 shadow-none" />
              </div>
            ) : (
              <div className="h-80 shrink-0 overflow-hidden md:h-96">
                <ChartWithToolbar
                  key={`market-overview-projected-cash-flow-${cashFlowPeriod}`}
                  option={projectedCashFlowOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  notMerge
                  title={projectedCashFlowTitle}
                  actionsPlacement="below"
                  headerClassName="gap-1"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  showDataZoomSliderOnHover
                  zoomConfig={{
                    shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                    chartStyle: { height: '100%', width: '100%' },
                    option: {
                      grid: { top: '10%', bottom: '20%', left: '8%', right: '6%' },
                      legend: { bottom: 4 },
                      dataZoom: [
                        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
                        { type: 'slider', xAxisIndex: 0, height: 18, bottom: 36, filterMode: 'none', brushSelect: false, textStyle: valueLabelStyle },
                      ],
                    },
                  }}
                  actions={(
                    <div className="flex rounded-lg border border-border-base bg-surface-container-low p-1">
                      {(['month', 'year'] as const).map((period) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setCashFlowPeriod(period)}
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                            cashFlowPeriod === period
                              ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                              : 'text-text-muted hover:text-text-base'
                          }`}
                        >
                          {period === 'month' ? t('month') : t('year')}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
