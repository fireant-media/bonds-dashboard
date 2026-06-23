import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChartWithToolbar from './ChartWithToolbar';
import AIInsightPanel from './AIInsightPanel';
import { IndustryType } from '../types';
import { formatBondVolumeByThreshold, formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { BadgeDollarSign, Boxes, GalleryVerticalEnd, Landmark, Wallet, type LucideIcon } from 'lucide-react';

interface IndustryViewProps {
  industry: IndustryType;
}

import { getCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { getAdaptiveBarWidth, getComparisonAreaSeriesStyle, getChartTheme, getChartTooltip, highlightChartTooltipValue, splitLegendItems } from '../utils/chart';
import { INDUSTRY_LABEL_KEYS } from '../constants/industries';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';
import { Card, MetricCardSkeleton, SectionCardSkeleton } from './ui/Card';
import { useIndustryBaseDashboardQuery, useIndustryFullDashboardQuery } from '../query/dashboardQueries';
import { useVisibleOnce } from '../hooks/useVisibleOnce';
import { MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY, type IndustryData } from '../services/marketOverviewData';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

interface IndustryRankingItem {
  issuerSymbol?: string;
  issuerName?: string;
  totalRemainingDebt: number;
  totalIssuedValue: number;
  bondCount: number;
  [key: string]: unknown;
}

interface IndustryBondItem {
  issuerSymbol?: string;
  infoObj?: { issuerSymbol?: string };
  cashFlows?: Array<{
    paymentDate?: string;
    interestAmount?: number | string;
    principalAmount?: number | string;
  }>;
  maturityDate?: string;
  paymentDate?: string;
  currentListedValue?: number;
  totalRemainingDebt?: number;
  totalIssuedValue?: number;
  [key: string]: unknown;
}

type IndustryMetricTone = 'blue' | 'purple' | 'green' | 'cyan' | 'indigo' | 'orange';

interface IndustryMetricCardProps {
  label: string;
  value: string;
  unit: string;
  icon: LucideIcon;
  tone: IndustryMetricTone;
}

const chartCardClassName = 'col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface p-3 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-4';

const metricToneClasses: Record<IndustryMetricTone, { icon: string; line: string; glow: string }> = {
  blue: {
    icon: 'from-blue-500 to-blue-400 shadow-blue-500/25',
    line: 'text-blue-500',
    glow: 'from-blue-50/90 dark:from-blue-500/10',
  },
  purple: {
    icon: 'from-violet-500 to-violet-400 shadow-violet-500/25',
    line: 'text-violet-500',
    glow: 'from-violet-50/90 dark:from-violet-500/10',
  },
  green: {
    icon: 'from-emerald-500 to-emerald-400 shadow-emerald-500/25',
    line: 'text-emerald-500',
    glow: 'from-emerald-50/90 dark:from-emerald-500/10',
  },
  cyan: {
    icon: 'from-cyan-500 to-cyan-300 shadow-cyan-500/25',
    line: 'text-cyan-500',
    glow: 'from-cyan-50/90 dark:from-cyan-500/10',
  },
  indigo: {
    icon: 'from-indigo-500 to-blue-400 shadow-indigo-500/25',
    line: 'text-indigo-500',
    glow: 'from-indigo-50/90 dark:from-indigo-500/10',
  },
  orange: {
    icon: 'from-orange-500 to-amber-400 shadow-orange-500/25',
    line: 'text-orange-500',
    glow: 'from-orange-50/90 dark:from-orange-500/10',
  },
};

function IndustryMetricCard({ label, value, unit, icon: Icon, tone }: IndustryMetricCardProps) {
  const toneClass = metricToneClasses[tone];

  return (
    <Card className="group relative min-h-40 p-4 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10">
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t to-transparent ${toneClass.glow}`} />
      <div className="relative flex min-h-32 flex-col justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-lg ${toneClass.icon}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs font-bold uppercase leading-snug tracking-wider text-slate-950 dark:text-text-base">
              {label}
            </p>
            <p className="mt-2 break-words text-2xl font-bold leading-tight text-slate-950 transition-colors group-hover:text-blue-600 dark:text-text-base">
              {value}
            </p>
            <p className="mt-1 break-words text-xs font-semibold leading-snug text-text-muted">{unit}</p>
          </div>
        </div>
        <svg viewBox="0 0 120 26" preserveAspectRatio="none" className={`h-7 w-full ${toneClass.line}`} aria-hidden="true">
          <polyline points="0,18 12,15 24,17 36,11 48,14 60,8 72,12 84,7 96,10 108,5 120,9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
      </div>
    </Card>
  );
}

const hasMeaningfulIndustryData = (value: unknown) => {
  const data = value as { bonds?: unknown[]; issuerSummaries?: unknown[]; symbols?: unknown[]; industryStats?: { bondCount?: number } } | null | undefined;
  if (!data || typeof data !== 'object') return false;

  return Boolean(
    (Array.isArray(data.bonds) && data.bonds.length > 0)
    || (Array.isArray(data.issuerSummaries) && data.issuerSummaries.length > 0)
    || (Array.isArray(data.symbols) && data.symbols.length > 0)
    || data.industryStats?.bondCount
  );
};

const getIndustryPayloadForView = (value: unknown, industry: string) => {
  if (!hasMeaningfulIndustryData(value)) return null;

  const data = value as {
    industryId?: string;
    bonds?: unknown[];
    issuerSummaries?: unknown[];
    rankingData?: unknown[];
    symbols?: unknown[];
    industryStats?: { bondCount?: number };
    projectedCashFlowBuckets?: Record<string, ProjectedCashFlowBucket>;
  };
  const payloadIndustry = String(data.industryId || '').trim();
  return !payloadIndustry || payloadIndustry === industry ? data : null;
};

const roundMetric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

export default function IndustryView({ industry }: IndustryViewProps) {
  const navigate = useNavigate();
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const cacheKey = `industry_bond_group_v11_${industry}`;
  const baseCacheKey = `industry_bond_base_v10_${industry}`;
  const statsCacheKey = `industry_stats_api_v6_${industry}`;
  const cachedData = getCache(cacheKey);
  const cachedBaseData = getCache(baseCacheKey);
  const cachedStats = getCache(statsCacheKey);
  const meaningfulCachedData = getIndustryPayloadForView(cachedData, industry);
  const meaningfulCachedBaseData = getIndustryPayloadForView(cachedBaseData, industry) || meaningfulCachedData;
  const cachedProjectedCashFlows = meaningfulCachedData?.projectedCashFlowBuckets || getCache(`industry_projected_cash_flows_${industry}`) || {};
  const { ref: projectedCashFlowSectionRef, isVisible: projectedCashFlowSectionVisible } = useVisibleOnce<HTMLDivElement>();
  const shouldLoadFullIndustryData = projectedCashFlowSectionVisible || Object.keys(cachedProjectedCashFlows).length > 0;
  const industryBaseQuery = useIndustryBaseDashboardQuery(industry);
  const industryFullQuery = useIndustryFullDashboardQuery(industry, shouldLoadFullIndustryData);
  const meaningfulBaseQueryData = getIndustryPayloadForView(industryBaseQuery.data, industry);
  const meaningfulFullQueryData = getIndustryPayloadForView(industryFullQuery.data, industry);
  const basePayload = meaningfulBaseQueryData || meaningfulCachedBaseData;
  const fullPayload = meaningfulFullQueryData || meaningfulCachedData;
  const industryStats = cachedStats || fullPayload?.industryStats || basePayload?.industryStats || null;
  const rankingData = (fullPayload?.issuerSummaries || fullPayload?.rankingData || basePayload?.issuerSummaries || basePayload?.rankingData || []) as IndustryRankingItem[];
  const industryBonds = (fullPayload?.bonds || basePayload?.bonds || []) as IndustryBondItem[];
  const [financialChildSymbols, setFinancialChildSymbols] = useState<Set<string> | null>(null);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const projectedCashFlowBuckets = fullPayload?.projectedCashFlowBuckets || cachedProjectedCashFlows;

  useEffect(() => {
    let cancelled = false;

    if (industry !== 'Financials') {
      setFinancialChildSymbols(null);
      return;
    }

    const loadChildSymbols = async () => {
      try {
        const symbolGroups = await loadDedupedIndustrySymbols();
        if (cancelled) return;

        const grouped = new Set<string>([
          ...(symbolGroups.Banking || []),
          ...(symbolGroups.Securities || []),
        ].map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean));

        setFinancialChildSymbols(grouped);
      } catch (error) {
        console.warn('Failed to load financial child symbols', error);
        if (!cancelled) setFinancialChildSymbols(null);
      }
    };

    void loadChildSymbols();
    return () => {
      cancelled = true;
    };
  }, [industry]);

  const visibleRankingData = useMemo(() => {
    if (industry !== 'Financials' || !financialChildSymbols) return rankingData;

    return rankingData.filter((item: IndustryRankingItem) => {
      const symbol = String(item?.issuerSymbol || '').trim().toUpperCase();
      return !symbol || !financialChildSymbols.has(symbol);
    });
  }, [industry, financialChildSymbols, rankingData]);

  const visibleIndustryBonds = useMemo(() => {
    if (industry !== 'Financials' || !financialChildSymbols) return industryBonds;

    return industryBonds.filter((bond: IndustryBondItem) => {
      const symbol = String(bond?.issuerSymbol || bond?.infoObj?.issuerSymbol || '').trim().toUpperCase();
      return !symbol || !financialChildSymbols.has(symbol);
    });
  }, [industry, financialChildSymbols, industryBonds]);

  const deferredRankingData = useDeferredValue<IndustryRankingItem[]>(visibleRankingData);
  const deferredIndustryBonds = useDeferredValue<IndustryBondItem[]>(visibleIndustryBonds);

  const visibleProjectedCashFlowBuckets = useMemo(() => {
    const buckets = new Map<string, ProjectedCashFlowBucket>();

    const ensureBucket = (dateString: string) => {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return null;

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const bucketKey = cashFlowPeriod === 'month' ? `${year}-${String(month).padStart(2, '0')}` : String(year);
      const label = cashFlowPeriod === 'month' ? `T${month}/${year}` : String(year);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { label, interest: 0, principal: 0 });
      }

      return buckets.get(bucketKey)!;
    };

    deferredIndustryBonds.forEach((bond: IndustryBondItem) => {
      if (Array.isArray(bond.cashFlows) && bond.cashFlows.length > 0) {
        bond.cashFlows.forEach((cashFlow) => {
          if (!cashFlow?.paymentDate) return;

          const bucket = ensureBucket(cashFlow.paymentDate);
          if (!bucket) return;

          bucket.interest += Number(cashFlow.interestAmount || 0) / 1000000000;
          bucket.principal += Number(cashFlow.principalAmount || 0) / 1000000000;
        });
        return;
      }

      const fallbackDate = bond.maturityDate || bond.paymentDate;
      const fallbackPrincipal = bond.currentListedValue || bond.totalRemainingDebt || bond.totalIssuedValue;
      if (!fallbackDate || !fallbackPrincipal) return;

      const bucket = ensureBucket(fallbackDate);
      if (bucket) bucket.principal += Number(fallbackPrincipal || 0) / 1000000000;
    });

    return Object.fromEntries(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
  }, [cashFlowPeriod, deferredIndustryBonds]);

  const getIndustryLabel = (ind: string) => {
    const labelKey = INDUSTRY_LABEL_KEYS[ind];
    if (labelKey) return t(labelKey as any);
    
    // Fallback to general translation for any other industry string
    return t(ind as any);
  };

  const legendStyle = {
    fontSize: 12,
    color: chartTheme.subText,
    fontFamily: 'Manrope',
  };

  const categoryLabelStyle = {
    fontSize: 12,
    color: chartTheme.subText,
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };

  const valueLabelStyle = {
    fontSize: 12,
    color: chartTheme.subText,
    fontFamily: 'Manrope',
  };

  const tooltipTextStyle = getChartTooltip(isDark).textStyle;
  const chartTooltip = getChartTooltip(isDark);
  const chartPalette = useMemo(() => [
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
  ], []);
  const chartTitleStyle = {
    fontSize: 10,
    color: chartTheme.text,
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };
  const industryIssuedValueLabel = language === 'vi' ? 'Giá trị phát hành' : 'Issued Value';
  const industryInitialDebtLabel = language === 'vi' ? 'Dư nợ ban đầu' : 'Initial Debt';
  const industryIssuedValueTreemapLabel = language === 'vi'
    ? 'Giá trị phát hành của các doanh nghiệp trong ngành'
    : 'Issued Value of companies in the industry';
  const getBondVolumeUnitLabel = (scale: 'thousand' | 'million') => (
    scale === 'million'
      ? t('unitMillionShares')
      : language === 'vi'
        ? 'Nghìn trái phiếu'
        : 'Thousand Bonds'
  );
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

  const getKpis = () => {
    if (industryStats) {
      const issuedVolume = formatBondVolumeByThreshold(industryStats.totalIssuedVolume);
      const listedVolume = formatBondVolumeByThreshold(industryStats.totalCurrentListedVolume);

      return [
        { 
          label: t('issuedVolumeTitle'), 
          value: issuedVolume.value,
          unit: getBondVolumeUnitLabel(issuedVolume.unitScale),
          icon: Boxes,
          tone: 'purple' as const,
        },
        { 
          label: industryIssuedValueLabel, 
          value: formatNumber(industryStats.totalIssuedValue / 1000000000, 2), 
          unit: t('unitBillionVND'),
          icon: BadgeDollarSign,
          tone: 'blue' as const,
        },
        { 
          label: industryInitialDebtLabel, 
          value: formatNumber(industryStats.totalDebtFull / 1000000000, 2), 
          unit: t('unitBillionVND'),
          icon: Landmark,
          tone: 'green' as const,
        },
        { 
          label: t('listedVolume'), 
          value: listedVolume.value,
          unit: getBondVolumeUnitLabel(listedVolume.unitScale),
          icon: GalleryVerticalEnd,
          tone: 'cyan' as const,
        },
        { 
          label: t('listedValueTitle'), 
          value: formatNumber(industryStats.totalCurrentListedValue / 1000000000, 2), 
          unit: t('unitBillionVND'),
          icon: BadgeDollarSign,
          tone: 'indigo' as const,
        },
        { 
          label: t('remainingDebtTitle'), 
          value: formatNumber(industryStats.totalRemainingDebt / 1000000000, 2), 
          unit: t('unitBillionVND'),
          icon: Wallet,
          tone: 'orange' as const,
        },
      ];
    }

    return [];
  };

  const kpis = getKpis();
  const rankingDataViewRows = useMemo(() => (
    (() => {
      const totalRemainingDebt = deferredRankingData.reduce((sum, current) => sum + (current.totalRemainingDebt || 0), 0);
      return [...deferredRankingData]
        .filter((item) => item.totalRemainingDebt > 0)
        .sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt)
        .map((item) => [
          item.issuerSymbol,
          item.totalRemainingDebt / 1000000,
          totalRemainingDebt > 0 ? (item.totalRemainingDebt / totalRemainingDebt) * 100 : 0,
        ]);
    })()
  ), [deferredRankingData]);
  const issuedValueDataViewRows = useMemo(() => {
    const totalIssuedValue = deferredRankingData.reduce((sum, item) => sum + (item.totalIssuedValue || 0), 0);
    return [...deferredRankingData]
      .filter((item) => item.totalIssuedValue > 0)
      .sort((a, b) => b.totalIssuedValue - a.totalIssuedValue)
      .map((item) => [
        item.issuerSymbol,
        item.totalIssuedValue / 1000000000,
        totalIssuedValue > 0 ? (item.totalIssuedValue / totalIssuedValue) * 100 : 0,
      ]);
  }, [deferredRankingData]);
  const combinedDataViewRows = useMemo(() => {
    return [...deferredRankingData]
      .sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt)
      .map((item) => [
        item.issuerSymbol,
        item.totalRemainingDebt / 1000000000,
        item.bondCount,
      ]);
  }, [deferredRankingData]);

  const getMarketShareOptions = () => {
    const hasData = deferredRankingData.length > 0;
    let chartData: { value: number; name: string; itemStyle: { color: string } }[] = [];
    const totalRemainingDebt = deferredRankingData.reduce((sum, item) => sum + (item.totalRemainingDebt || 0), 0);

    if (hasData) {
      const totalDebt = totalRemainingDebt;
      const top9 = deferredRankingData.slice(0, 9);
      const top9Debt = top9.reduce((sum, item) => sum + item.totalRemainingDebt, 0);
      const othersDebt = totalDebt - top9Debt;
      
      chartData = top9.map((item, idx) => {
        return {
          value: item.totalRemainingDebt,
          name: item.issuerSymbol || '',
          itemStyle: { color: chartPalette[idx % chartPalette.length] }
        };
      });

      if (othersDebt > 0) {
        chartData.push({
          value: othersDebt,
          name: t('others'),
          itemStyle: { color: chartPalette[9 % chartPalette.length] }
        });
      }
    }

    const legendGroups = splitLegendItems(chartData.map((item) => item.name), 5, 2);
    const legendBase = {
      orient: 'vertical' as const,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: legendStyle,
    };
    const legendConfig = legendGroups.length > 1
      ? [
          {
            ...legendBase,
            right: '22%',
            top: 'middle',
            data: legendGroups[0],
          },
          {
            ...legendBase,
            right: '5%',
            top: 'middle',
            data: legendGroups[1],
          },
        ]
      : {
          ...legendBase,
          right: '5%',
          top: 'middle',
          data: legendGroups[0],
        };

    return {
      color: chartPalette,
      grid: undefined,
      xAxis: undefined,
      yAxis: undefined,
      __dataView: {
        columns: [
          { label: t('ticker'), align: 'center', kind: 'text' },
          { label: t('remainingDebtTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
          { label: t('weight'), unit: '%', align: 'right', kind: 'number' },
        ],
        rows: rankingDataViewRows,
      },
      tooltip: { 
        ...chartTooltip,
        trigger: 'item',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params.name;
          const issuer = deferredRankingData.find(d => d.issuerSymbol === symbol);
          const displayName = (symbol === t('others')) ? t('others') : (issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol);
          return `${displayName}<br/>${t('marketShare')}: ${highlightChartTooltipValue(params.percent, '%')}<br/>${t('remainingDebtTitle')}: ${highlightChartTooltipValue(formatNumber(Math.round(params.value / 1000000000), 0), ` ${t('unitBillionVND')}`)}`;
        }
      },
      legend: legendConfig,
      series: [{
        name: t('marketShare'),
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', formatter: '{d}%' } },
        data: chartData
      }]
    };
  };

  const marketShareOptions = getMarketShareOptions();

  const getInterestOptions = () => {
    const data = industryStats ? [
      { name: t('avgInterest'), value: industryStats.avgRate },
      { name: t('avgCouponInterest'), value: industryStats.avgCouponRate },
      { name: t('floatingInterest'), value: industryStats.floatingRate }
    ] : [];
    const categoryCount = data.length;
    const interestDataViewRows = data.map((item) => [item.name, item.value]);

    return {
      color: chartPalette,
      __dataView: {
        columns: [
          { label: t('interestType'), align: 'center', kind: 'text' },
          { label: t('interestRate'), unit: '%', align: 'right', kind: 'number' },
        ],
        rows: interestDataViewRows,
      },
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          return `${params[0].name}: ${highlightChartTooltipValue(formatInterestRate(params[0].value), '%')}`;
        }
      },
      grid: { left: '10%', right: '4%', bottom: '6%', top: '12%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: data.map(d => d.name),
        axisLabel: { ...categoryLabelStyle, interval: 0 } 
      },
      yAxis: { 
        type: 'value',
        splitLine: { show: false },
        name: t('unitPercentLabel'),
        nameGap: 22,
        nameTextStyle: chartTitleStyle,
        axisLabel: valueLabelStyle 
      },
      series: [{
        name: t('interestRate'),
        type: 'bar',
        barWidth: getAdaptiveBarWidth(categoryCount),
        data: data.map(d => d.value),
        itemStyle: { 
          borderRadius: [4, 4, 0, 0]
        },
        label: {
          show: true,
          position: 'top',
          color: isDark ? '#e5e7eb' : '#333',
          formatter: (params: any) => `${formatInterestRate(params.value)}%`,
          fontSize: 10,
          fontWeight: 'bold'
        }
      }]
    };
  };

  const interestOptions = getInterestOptions();

  const issuedValueTreemapData = useMemo(() => {
    const totalIssuedValue = deferredRankingData.reduce((sum, item) => sum + (item.totalIssuedValue || 0), 0);

    return [...deferredRankingData]
      .filter((item) => item.totalIssuedValue > 0)
      .sort((a, b) => b.totalIssuedValue - a.totalIssuedValue)
      .map((item, index) => ({
        name: item.issuerSymbol || '',
        value: item.totalIssuedValue / 1000000000,
        fullName: t(item.issuerName as any, item.issuerSymbol),
        issuerSymbol: item.issuerSymbol,
        showValueLine: totalIssuedValue > 0
          ? (item.totalIssuedValue / totalIssuedValue) >= 0.045 || (item.totalIssuedValue / 1000000000) >= 40
          : false,
        itemStyle: {
          color: chartPalette[index % chartPalette.length],
        },
      }));
  }, [deferredRankingData, chartPalette, t]);

  const buildTreemapZoomLabel = (params: any) => {
    const data = params?.data || {};
    const value = Number(params?.value || 0);
    const name = String(params?.name || data?.fullName || '').trim();
    const showValueLine = data?.showValueLine === true;

    if (!name || value <= 0) return '';
    const valueText = `${formatNumber(value, 3)} ${t('unitBillionVND')}`;

    if (!showValueLine) {
      return name;
    }

    return `${name}\n${valueText}`;
  };

  const getIssuedValueTreemapOptions = () => ({
    color: chartPalette,
    __dataView: {
      columns: [
        { label: t('ticker'), align: 'center', kind: 'text' },
        { label: t('issuedValueShort'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
        { label: t('weight'), unit: '%', align: 'right', kind: 'number' },
      ],
      rows: issuedValueDataViewRows,
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const data = params?.data || {};
        const displayName = data.fullName || data.name || '';
        const value = Number(data.value || 0);
        return `${displayName}<br/>${industryIssuedValueLabel}: ${highlightChartTooltipValue(formatNumber(value, 3), ` ${t('unitBillionVND')}`)}`;
      },
    },
    series: [
      {
        name: industryIssuedValueTreemapLabel,
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: (params: any) => params.name,
          position: 'inside',
          align: 'center',
          verticalAlign: 'middle',
          color: isDark ? '#ffffff' : '#111827',
          fontSize: 11,
          fontFamily: 'Manrope',
          fontWeight: 'bold',
          overflow: 'truncate',
        },
        upperLabel: {
          show: false,
        },
        itemStyle: {
          borderColor: isDark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
          gapWidth: 2,
        },
        data: issuedValueTreemapData,
        levels: [
          {
            itemStyle: {
              borderColor: isDark ? '#0f172a' : '#ffffff',
              borderWidth: 2,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  });

  const issuedValueTreemapOptions = getIssuedValueTreemapOptions();
  const handleIndustryDataViewCategoryClick = (ticker: string) => {
    const normalizedTicker = String(ticker || '').trim();
    if (!normalizedTicker) return;
    navigate(`/filter/issuer/${encodeURIComponent(normalizedTicker)}`);
  };

  const getCombinedOptions = () => {
    const displayData = deferredRankingData;
    const categoryCount = displayData.length;

    return {
      color: chartPalette,
      __dataView: {
        columns: [
          { label: t('ticker'), align: 'center', kind: 'text' },
          { label: t('remainingDebtTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
          { label: language === 'vi' ? 'Số mã trái phiếu' : 'Bond codes', align: 'right', kind: 'number' },
        ],
        rows: combinedDataViewRows,
      },
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params[0].name;
          const issuer = deferredRankingData.find(d => d.issuerSymbol === symbol);
          let res = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
          params.forEach((p: any) => {
            res += `<br/>${p.marker}${p.seriesName}: ${highlightChartTooltipValue(formatNumber(p.value, 0), p.seriesName === t('remainingDebtTitle') ? ` ${t('unitBillionVND')}` : '')}`;
          });
          return res;
        }
      },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
      grid: { left: '3%', right: '4%', top: '10%', bottom: '8%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: displayData.map(d => d.issuerSymbol), 
        axisLabel: { ...categoryLabelStyle, rotate: 45 } 
      },
      yAxis: [
        { 
          type: 'value', 
          name: t('unitBillionVND'), 
          nameTextStyle: chartTitleStyle,
          splitLine: { show: false },
          axisLabel: {
            ...valueLabelStyle,
            formatter: (value: number) => formatNumber(value, 0)
          } 
        },
        { 
          type: 'value', 
          name: '', 
          nameTextStyle: { ...valueLabelStyle, align: 'left' },
          axisLabel: {
            ...valueLabelStyle,
            formatter: (value: number) => formatNumber(value, 0)
          },
          splitLine: { show: false }
        }
      ],
      series: [
        { 
          name: t('remainingDebtTitle'), 
          type: 'bar', 
          data: displayData.map(d => Math.round(d.totalRemainingDebt / 1000000000)), 
          barWidth: getAdaptiveBarWidth(categoryCount),
          itemStyle: { } 
        },
        { 
          name: language === 'vi' ? 'Số mã trái phiếu' : 'Bond codes', 
          type: 'line', 
          yAxisIndex: 1, 
          data: displayData.map(d => d.bondCount), 
          itemStyle: { },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    };
  };

  const combinedOptions = getCombinedOptions();

  const projectedCashFlowData = useMemo(() => {
    const buckets = new Map<string, ProjectedCashFlowBucket>();

    Object.entries(visibleProjectedCashFlowBuckets).forEach(([key, value]) => {
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
  }, [visibleProjectedCashFlowBuckets, cashFlowPeriod]);

  const hasProjectedCashFlowData = projectedCashFlowData.total.some(value => value > 0);
  const projectedCashFlowTitle = language === 'vi'
    ? `${t('projectedCashFlowChart')} theo ${cashFlowPeriod === 'month' ? t('month').toLowerCase() : t('year').toLowerCase()}`
    : `${t('projectedCashFlowChart')} by ${cashFlowPeriod === 'month' ? 'month' : 'year'}`;
  const combinedChartTitle = language === 'vi'
    ? 'Số mã trái phiếu & Dư nợ còn lại của các doanh nghiệp'
    : 'Bond codes & remaining debt of companies';
  const industryPageTitle = `${t('marketTitle')} ${getIndustryLabel(industry)}`;
  const industryMarketShare = useMemo(() => {
    const overviewPayload = getCache('market_overview') as { industryData?: IndustryData[] } | null;
    const overviewIndustries = (
      getCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY)
      || overviewPayload?.industryData
      || []
    ) as IndustryData[];

    if (!Array.isArray(overviewIndustries) || overviewIndustries.length === 0) return null;

    const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
    const currentLabel = normalize(getIndustryLabel(industry));
    const matchedIndustry = overviewIndustries.find((item) => (
      normalize(item.icbName) === normalize(industry)
      || normalize(t(item.icbName as any)) === currentLabel
    ));
    const currentDebt = Number(matchedIndustry?.totalRemainingDebt || industryStats?.totalRemainingDebt || 0);
    const totalDebt = overviewIndustries.reduce((sum, item) => sum + Number(item.totalRemainingDebt || 0), 0);

    if (!Number.isFinite(currentDebt) || !Number.isFinite(totalDebt) || currentDebt <= 0 || totalDebt <= 0) {
      return null;
    }

    return (currentDebt / totalDebt) * 100;
  }, [industry, industryStats?.totalRemainingDebt, t]);
  const industryMarketShareLabel = industryMarketShare == null
    ? null
    : `${formatNumber(industryMarketShare, 1)}% ${language === 'vi' ? 'thị phần' : 'share'}`;
  const industryInsightTitle = language === 'vi'
    ? `Nhận định ngành ${getIndustryLabel(industry)}`
    : `${getIndustryLabel(industry)} insight`;
  const industryInsightPayload = useMemo(() => ({
    industry: getIndustryLabel(industry),
    summary: industryStats ? {
      bondCount: Number(industryStats.bondCount || 0),
      issuedVolumeMillion: roundMetric(Number(industryStats.totalIssuedVolume || 0) / 1_000_000),
      issuedValueBillion: roundMetric(Number(industryStats.totalIssuedValue || 0) / 1_000_000_000),
      listedValueBillion: roundMetric(Number(industryStats.totalCurrentListedValue || 0) / 1_000_000_000),
      remainingDebtBillion: roundMetric(Number(industryStats.totalRemainingDebt || 0) / 1_000_000_000),
    } : null,
    interestProfile: industryStats ? {
      averageRate: roundMetric(Number(industryStats.avgRate || 0)),
      averageCouponRate: roundMetric(Number(industryStats.avgCouponRate || 0)),
      floatingRateRatio: roundMetric(Number(industryStats.floatingRate || 0)),
    } : null,
    leadingIssuers: deferredRankingData.slice(0, 6).map((item) => ({
      issuerSymbol: item.issuerSymbol || '',
      issuerName: item.issuerName || '',
      remainingDebtBillion: roundMetric(Number(item.totalRemainingDebt || 0) / 1_000_000_000),
      issuedValueBillion: roundMetric(Number(item.totalIssuedValue || 0) / 1_000_000_000),
      bondCount: Number(item.bondCount || 0),
    })),
    issuedValueLeaders: issuedValueTreemapData.slice(0, 6).map((item) => ({
      issuerSymbol: item.issuerSymbol || '',
      issuerName: item.fullName || item.name || '',
      issuedValueBillion: roundMetric(Number(item.value || 0)),
    })),
    projectedCashFlows: projectedCashFlowData.labels.slice(0, 6).map((label, index) => ({
      period: label,
      interestBillion: roundMetric(projectedCashFlowData.interest[index] || 0),
      principalBillion: roundMetric(projectedCashFlowData.principal[index] || 0),
      totalBillion: roundMetric(projectedCashFlowData.total[index] || 0),
    })),
  }), [deferredRankingData, getIndustryLabel, industry, industryStats, issuedValueTreemapData, projectedCashFlowData]);

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
    grid: { top: '12%', bottom: '28%', left: '10%', right: '8%' },
    xAxis: {
      type: 'category',
      data: projectedCashFlowData.labels,
      axisLabel: {
        ...categoryLabelStyle,
        rotate: cashFlowPeriod === 'month' && projectedCashFlowData.labels.length > 10 ? 45 : 0
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
        bottom: 24,
        filterMode: 'none',
        brushSelect: false,
        textStyle: valueLabelStyle
      }
    ],
    yAxis: {
      type: 'value',
      name: t('unitBillionVND'),
      nameTextStyle: chartTitleStyle,
      splitLine: { show: false },
      axisLabel: {
        ...valueLabelStyle,
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

  const hasAnyIndustryData = Boolean(industryStats) || rankingData.length > 0 || industryBonds.length > 0;
  const industryError = !hasAnyIndustryData
    ? [industryBaseQuery.error, industryFullQuery.error].find(Boolean)
    : null;
  const errorMessage = industryError instanceof Error
    ? (industryError.message.includes('401') ? t('tokenError401') : industryError.message)
    : industryError
      ? t('error')
      : null;
  const isIndustrySummaryLoading = !industryStats && industryBaseQuery.isLoading;
  const isIndustryChartsLoading = rankingData.length === 0 && industryBaseQuery.isLoading;
  const isIndustryCashFlowPending = !projectedCashFlowSectionVisible && Object.keys(projectedCashFlowBuckets).length === 0;
  const isIndustryCashFlowLoading = projectedCashFlowSectionVisible && industryFullQuery.isFetching && !hasProjectedCashFlowData;

  if (errorMessage && !hasAnyIndustryData) {
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
            className="rounded-lg bg-action-accent px-6 py-2 font-bold text-slate-950 transition-colors hover:opacity-90"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 transition-colors duration-300">
      <div className="flex min-w-0 flex-col gap-2 pt-1 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 transition-colors dark:text-text-base md:text-3xl">{t('marketTitle')} {getIndustryLabel(industry)}</h1>
            {industryMarketShareLabel ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
                {industryMarketShareLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {isIndustrySummaryLoading
          ? Array.from({ length: 6 }, (_, index) => <MetricCardSkeleton key={index} />)
          : kpis.map((kpi, idx) => (
            <IndustryMetricCard key={`${kpi.label}-${idx}`} label={kpi.label} value={kpi.value} unit={kpi.unit} icon={kpi.icon} tone={kpi.tone} />
          ))}
      </div>

      <AIInsightPanel
        cacheKey={`industry-insight-${industry}`}
        title={industryInsightTitle}
        pageTitle={industryPageTitle}
        sectionTitle={getIndustryLabel(industry)}
        payload={industryInsightPayload}
        expandContent
        className="border-blue-100 bg-blue-50/70 shadow-blue-500/10 dark:border-blue-500/20 dark:bg-blue-500/10"
      />

      <div className="grid grid-cols-12 gap-3 lg:items-stretch">
        {isIndustryChartsLoading ? (
          <SectionCardSkeleton className="col-span-12 xl:col-span-4" />
        ) : (
          <div 
            className={`${chartCardClassName} xl:col-span-4`}
          >
            <div className="h-80 overflow-hidden md:h-96">
              <ChartWithToolbar
                option={marketShareOptions}
                style={{ height: '100%', width: '100%' }}
                notMerge
                title={t('marketShare')}
                onDataViewCategoryClick={handleIndustryDataViewCategoryClick}
                zoomConfig={{
                  shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                  chartStyle: { height: '100%', width: '100%' },
                  option: {
                    series: [
                      {
                        center: ['33%', '50%'],
                        radius: ['42%', '72%'],
                        label: {
                          show: true,
                          position: 'outside',
                          formatter: '{d}%',
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
                            fontSize: 12,
                            fontWeight: 'bold',
                            formatter: '{d}%',
                            color: isDark ? '#e5e7eb' : '#1e293b',
                          }
                        },
                      },
                    ],
                  },
                }}
              />
            </div>
          </div>
        )}

        {isIndustryChartsLoading ? (
          <SectionCardSkeleton className="col-span-12 xl:col-span-4" />
        ) : (
          <div 
            className={`${chartCardClassName} xl:col-span-4`}
          >
            <div className="h-80 overflow-hidden md:h-96">
              <ChartWithToolbar option={interestOptions} style={{ height: '100%', width: '100%' }} allowMagicType title={t('industryInterest')} />
            </div>
          </div>
        )}

        <div className={`${chartCardClassName} xl:col-span-4`}>
          {issuedValueTreemapData.length > 0 ? (
            <div className="h-80 overflow-hidden md:h-96">
              <ChartWithToolbar
                option={issuedValueTreemapOptions}
                style={{ height: '100%', width: '100%' }}
                title={industryIssuedValueTreemapLabel}
                onDataViewCategoryClick={handleIndustryDataViewCategoryClick}
                zoomConfig={{
                  scale: 1.1,
                  shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                  chartStyle: { height: '100%', width: '100%' },
                  option: {
                    series: [
                      {
                        label: {
                          show: true,
                          formatter: buildTreemapZoomLabel,
                          position: 'inside',
                          distance: 0,
                          align: 'center',
                          verticalAlign: 'middle',
                          padding: 0,
                          color: isDark ? '#ffffff' : '#111827',
                          fontSize: 14,
                          fontFamily: 'Manrope',
                          fontWeight: 'bold',
                          overflow: 'break',
                          lineHeight: 18,
                        },
                        emphasis: {
                          label: {
                            show: true,
                            formatter: buildTreemapZoomLabel,
                            position: 'inside',
                            distance: 0,
                            align: 'center',
                            verticalAlign: 'middle',
                            padding: 0,
                            fontWeight: 'bold',
                            overflow: 'break',
                            lineHeight: 18,
                          },
                        },
                        upperLabel: { show: false },
                        breadcrumb: { show: false },
                      },
                    ],
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-80 items-center justify-center">
              <p className="text-sm font-medium text-text-muted">{t('noData')}</p>
            </div>
          )}
        </div>

        <div 
          className={`${chartCardClassName} lg:col-span-6`}
        >
          <div className="h-80 overflow-hidden md:h-96">
            <ChartWithToolbar
              option={combinedOptions}
              style={{ height: '100%', width: '100%' }}
              allowMagicType
              title={combinedChartTitle}
              onDataViewCategoryClick={handleIndustryDataViewCategoryClick}
            />
          </div>
        </div>

        <div ref={projectedCashFlowSectionRef} className={`${chartCardClassName} lg:col-span-6`}>
          {isIndustryCashFlowPending ? (
            <div className="min-h-80">
              <SectionCardSkeleton className="h-full border-0 bg-transparent p-0 shadow-none" />
            </div>
          ) : isIndustryCashFlowLoading ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <p className="text-xs font-semibold uppercase text-text-muted/80">{t('loadingCashFlow')}</p>
            </div>
          ) : hasProjectedCashFlowData ? (
            <ChartWithToolbar
              option={projectedCashFlowOptions}
              style={{ height: '360px', width: '100%' }}
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
                      textStyle: valueLabelStyle,
                    },
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
                          ? 'bg-action-accent text-slate-950'
                          : 'text-text-muted hover:text-text-base'
                      }`}
                    >
                      {period === 'month' ? t('month') : t('year')}
                    </button>
                  ))}
                </div>
              )}
            />
          ) : (
            <div className="flex min-h-80 items-center justify-center">
              <p className="text-sm font-medium text-text-muted">{t('noData')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
