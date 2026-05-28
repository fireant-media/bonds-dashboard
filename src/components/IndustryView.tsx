import { useState, useEffect, useMemo } from 'react';
import ChartWithToolbar from './ChartWithToolbar';
import { IndustryType } from '../types';
import { TrendingUp, Activity, PieChart, BarChart3, Info } from 'lucide-react';
import { formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';

interface IndustryViewProps {
  industry: IndustryType;
}

import { Settings } from 'lucide-react';
import { getCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { CHART_PALETTE, getAdaptiveBarWidth, getComparisonAreaSeriesStyle, getChartTheme, getChartTooltip, highlightChartTooltipValue, splitLegendItems } from '../utils/chart';
import { INDUSTRY_LABEL_KEYS } from '../constants/industries';
import { loadDedupedIndustrySymbols, loadIndustryBaseBondGroupData, loadIndustryBondGroupData, loadIndustryStats, loadResidualFinancialIndustryStats } from '../services/industryBondData';
import { MetricCard } from './ui/Card';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

export default function IndustryView({ industry }: IndustryViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const cacheKey = `industry_bond_group_v10_${industry}`;
  const statsCacheKey = `industry_stats_api_v5_${industry}`;
  const cachedData = getCache(cacheKey);
  const cachedStats = getCache(statsCacheKey);
  const [industryStats, setIndustryStats] = useState<any>(cachedStats || cachedData?.industryStats || null);
  const [rankingData, setRankingData] = useState<any[]>(cachedData?.issuerSummaries || cachedData?.rankingData || []);
  const [industryBonds, setIndustryBonds] = useState<any[]>(cachedData?.bonds || []);
  const [financialChildSymbols, setFinancialChildSymbols] = useState<Set<string> | null>(null);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(
    cachedData?.projectedCashFlowBuckets || getCache(`industry_projected_cash_flows_${industry}`) || {}
  );
  const [loadingCashFlows, setLoadingCashFlows] = useState(!cachedData);
  const [loading, setLoading] = useState(!cachedData && !cachedStats);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextCachedData = getCache(cacheKey);
    const nextCachedStats = getCache(statsCacheKey);
    setCashFlowPeriod('year');
    setIndustryStats(nextCachedStats || nextCachedData?.industryStats || null);
    setRankingData(nextCachedData?.issuerSummaries || nextCachedData?.rankingData || []);
    setIndustryBonds(nextCachedData?.bonds || []);
    setProjectedCashFlowBuckets(nextCachedData?.projectedCashFlowBuckets || {});
    setLoading(!nextCachedData && !nextCachedStats);
    setLoadingCashFlows(!nextCachedData);
  }, [industry, cacheKey, statsCacheKey]);

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

    return rankingData.filter((item) => {
      const symbol = String(item?.issuerSymbol || '').trim().toUpperCase();
      return !symbol || !financialChildSymbols.has(symbol);
    });
  }, [industry, financialChildSymbols, rankingData]);

  const visibleIndustryBonds = useMemo(() => {
    if (industry !== 'Financials' || !financialChildSymbols) return industryBonds;

    return industryBonds.filter((bond) => {
      const symbol = String(bond?.issuerSymbol || bond?.infoObj?.issuerSymbol || '').trim().toUpperCase();
      return !symbol || !financialChildSymbols.has(symbol);
    });
  }, [industry, financialChildSymbols, industryBonds]);

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

    visibleIndustryBonds.forEach((bond) => {
      if (Array.isArray(bond.cashFlows) && bond.cashFlows.length > 0) {
        bond.cashFlows.forEach((cashFlow: any) => {
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
  }, [cashFlowPeriod, visibleIndustryBonds]);

  useEffect(() => {
    let isMounted = true;
    let hasAnyData = Boolean(cachedData || cachedStats);
    let hasProjectedData = Boolean(cachedData?.projectedCashFlowBuckets && Object.keys(cachedData.projectedCashFlowBuckets).length > 0);
    let firstError: string | null = null;

    const fetchIndustryData = async () => {
      const cachedGroupData = getCache(cacheKey);
      const cachedIndustryStats = getCache(statsCacheKey);
      if (cachedGroupData) {
        if (!isMounted) return;
        if (!cachedIndustryStats) {
          setIndustryStats(cachedGroupData.industryStats);
        }
        setRankingData(cachedGroupData.issuerSummaries || cachedGroupData.rankingData || []);
        setIndustryBonds(cachedGroupData.bonds || []);
        setProjectedCashFlowBuckets(cachedGroupData.projectedCashFlowBuckets || {});
        setLoading(false);
        setLoadingCashFlows(false);
        hasAnyData = true;
        hasProjectedData = Object.keys(cachedGroupData.projectedCashFlowBuckets || {}).length > 0;
      }
      if (cachedIndustryStats && !cachedGroupData) {
        if (!isMounted) return;
        setIndustryStats(cachedIndustryStats);
        setLoading(false);
        hasAnyData = true;
      }

      setError(null);
      if (!cachedGroupData && !cachedIndustryStats) {
        setLoading(true);
        setLoadingCashFlows(true);
      }

      const registerError = (error: unknown) => {
        if (firstError) return;
        if (error instanceof Error && error.message.includes('401')) {
          firstError = t('tokenError401');
          return;
        }
        firstError = error instanceof Error ? error.message : t('error');
      };

      const applyIndustryStats = (stats: any) => {
        if (!isMounted || !stats) return;
        setIndustryStats(stats);
        setLoading(false);
        hasAnyData = true;
      };

      const applyBaseData = (baseData: any) => {
        if (!isMounted || !baseData) return;
        if (!getCache(statsCacheKey)) {
          setIndustryStats(baseData.industryStats);
        }
        setRankingData(baseData.issuerSummaries || []);
        setIndustryBonds(baseData.bonds || []);
        setLoading(false);
        hasAnyData = true;
      };

      const applyGroupData = (groupData: any) => {
        if (!isMounted || !groupData) return;
        if (!getCache(statsCacheKey)) {
          setIndustryStats(groupData.industryStats);
        }
        setRankingData(groupData.issuerSummaries || []);
        setIndustryBonds(groupData.bonds || []);
        setProjectedCashFlowBuckets(groupData.projectedCashFlowBuckets || {});
        setLoading(false);
        setLoadingCashFlows(false);
        hasAnyData = true;
        hasProjectedData = Object.keys(groupData.projectedCashFlowBuckets || {}).length > 0;
      };

      const statsPromise = (industry === 'Financials'
        ? loadResidualFinancialIndustryStats()
        : loadIndustryStats(String(industry)))
        .then(applyIndustryStats)
        .catch((error) => {
          console.error('Error fetching industry stats:', error);
          registerError(error);
        });

      const basePromise = loadIndustryBaseBondGroupData(String(industry))
        .then(applyBaseData)
        .catch((error) => {
          console.error('Error fetching industry base data:', error);
          registerError(error);
        });

      const groupPromise = loadIndustryBondGroupData(String(industry))
        .then(applyGroupData)
        .catch((error) => {
          console.error('Error fetching industry group data:', error);
          registerError(error);
        });

      await Promise.allSettled([statsPromise, basePromise, groupPromise]);

      if (!isMounted) return;
      if (!hasAnyData && firstError) {
        setError(firstError);
      }
      if (!hasProjectedData) {
        setLoadingCashFlows(false);
      }
    };

    void fetchIndustryData();
    return () => {
      isMounted = false;
    };
  }, [industry, cacheKey, statsCacheKey, cachedData, cachedStats, t]);

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  const getIndustryLabel = (ind: string) => {
    const labelKey = INDUSTRY_LABEL_KEYS[ind];
    if (labelKey) return t(labelKey as any);
    
    // Fallback to general translation for any other industry string
    return t(ind as any);
  };

  const chartColors = {
    primary: CHART_PALETTE[0],
    secondary: CHART_PALETTE[2],
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
  const chartPalette = CHART_PALETTE;
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
      return [
        { 
          label: t('issuedVolumeTitle'), 
          value: formatNumber(industryStats.totalIssuedVolume, 0),
          unit: t('unitBond')
        },
        { 
          label: industryIssuedValueLabel, 
          value: formatNumber(industryStats.totalIssuedValue / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
        { 
          label: industryInitialDebtLabel, 
          value: formatNumber(industryStats.totalDebtFull / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
        { 
          label: t('listedVolume'), 
          value: formatNumber(industryStats.totalCurrentListedVolume, 0),
          unit: t('unitBond')
        },
        { 
          label: t('listedValueTitle'), 
          value: formatNumber(industryStats.totalCurrentListedValue / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
        { 
          label: t('remainingDebtTitle'), 
          value: formatNumber(industryStats.totalRemainingDebt / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
      ];
    }

    return [];
  };

  const kpis = getKpis();
  const rankingDataViewRows = useMemo(() => (
    (() => {
      const totalRemainingDebt = visibleRankingData.reduce((sum, current) => sum + (current.totalRemainingDebt || 0), 0);
      return [...visibleRankingData]
        .filter((item) => item.totalRemainingDebt > 0)
        .sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt)
        .map((item) => [
          item.issuerSymbol,
          item.totalRemainingDebt / 1000000,
          totalRemainingDebt > 0 ? (item.totalRemainingDebt / totalRemainingDebt) * 100 : 0,
        ]);
    })()
  ), [visibleRankingData]);
  const issuedValueDataViewRows = useMemo(() => {
    const totalIssuedValue = visibleRankingData.reduce((sum, item) => sum + (item.totalIssuedValue || 0), 0);
    return [...visibleRankingData]
      .filter((item) => item.totalIssuedValue > 0)
      .sort((a, b) => b.totalIssuedValue - a.totalIssuedValue)
      .map((item) => [
        item.issuerSymbol,
        item.totalIssuedValue / 1000000000,
        totalIssuedValue > 0 ? (item.totalIssuedValue / totalIssuedValue) * 100 : 0,
      ]);
  }, [visibleRankingData]);
  const combinedDataViewRows = useMemo(() => {
    return [...visibleRankingData]
      .sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt)
      .map((item) => [
        item.issuerSymbol,
        item.totalRemainingDebt / 1000000000,
        item.bondCount,
      ]);
  }, [visibleRankingData]);

  const getRankingOptions = () => {
    const displayData = [...visibleRankingData].reverse();
    const categoryCount = displayData.length;
    const maxDebt = visibleRankingData.length > 0 ? Math.max(...visibleRankingData.map(d => d.totalRemainingDebt / 1000000000)) : 0;
    const interval = (industry === 'Banking' || industry === 'RealEstate') ? 20000 : (maxDebt > 10000 ? 5000 : 2000);

    return {
      color: chartPalette,
      __dataView: {
        categoryLabel: t('ticker'),
        categoryAlign: 'center',
      },
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params[0].name;
          const issuer = visibleRankingData.find(d => d.issuerSymbol === symbol);
          const displayName = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
          return `${displayName}<br/>${params[0].marker}${params[0].seriesName}: ${highlightChartTooltipValue(formatNumber(params[0].value, 0), ` ${t('unitBillionVND')}`)}`;
        }
      },
      grid: { left: '3%', right: '8%', top: '3%', bottom: '3%', containLabel: true },
      xAxis: { 
        type: 'value', 
        splitLine: { show: false },
        interval: interval,
        name: t('unitBillionVND'),
        nameTextStyle: chartTitleStyle,
        axisLabel: { 
          ...valueLabelStyle,
          formatter: (value: number) => formatNumber(value, 0)
        } 
      },
      yAxis: { 
        type: 'category', 
        data: displayData.map(d => d.issuerSymbol), 
        axisLabel: categoryLabelStyle 
      },
      series: [{
        name: t('remainingDebtTitle'),
        type: 'bar',
        data: displayData.map(d => Math.round(d.totalRemainingDebt / 1000000000)),
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        barWidth: getAdaptiveBarWidth(categoryCount)
      }]
    };
  };

  const rankingOptions = getRankingOptions();

  const getMarketShareOptions = () => {
    const hasData = visibleRankingData.length > 0;
    let chartData: { value: number; name: string; itemStyle: { color: string } }[] = [];
    const totalRemainingDebt = visibleRankingData.reduce((sum, item) => sum + (item.totalRemainingDebt || 0), 0);

    if (hasData) {
      const totalDebt = totalRemainingDebt;
      const top9 = visibleRankingData.slice(0, 9);
      const top9Debt = top9.reduce((sum, item) => sum + item.totalRemainingDebt, 0);
      const othersDebt = totalDebt - top9Debt;

      const colors = isDark 
        ? [
          '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe',
          '#1d4ed8', '#1e40af', '#1e3a8a', '#2563eb', '#172554'
        ]
        : [
          '#2563eb', '#1e3a8a', '#1e40af', '#1d4ed8', '#3b82f6', 
          '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'
        ];
      
      chartData = top9.map((item, idx) => {
        return {
          value: item.totalRemainingDebt,
          name: item.issuerSymbol,
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
          const issuer = visibleRankingData.find(d => d.issuerSymbol === symbol);
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
    const totalIssuedValue = visibleRankingData.reduce((sum, item) => sum + (item.totalIssuedValue || 0), 0);

    return [...visibleRankingData]
      .filter((item) => item.totalIssuedValue > 0)
      .sort((a, b) => b.totalIssuedValue - a.totalIssuedValue)
      .map((item, index) => ({
        name: item.issuerSymbol,
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
  }, [visibleRankingData, chartPalette, t]);

  const buildTreemapZoomLabel = (params: any) => {
    const data = params?.data || {};
    const value = Number(params?.value || 0);
    const name = String(params?.name || data?.fullName || '').trim();
    const showValueLine = data?.showValueLine === true;

    if (!name || value <= 0) return '';
    const valueText = `${formatNumber(value, 3)} ${t('unitBillionVND')}`;

    if (!showValueLine) {
      return `{name|${name}}`;
    }

    return `{name|${name}}\n{value|${valueText}}`;
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

  const getCombinedOptions = () => {
    const displayData = visibleRankingData;
    const categoryCount = displayData.length;

    return {
      color: chartPalette,
      __dataView: {
        columns: [
          { label: t('ticker'), align: 'center', kind: 'text' },
          { label: t('remainingDebtTitle'), unit: t('unitBillionVND'), align: 'right', kind: 'number' },
          { label: t('bondLotsTitle'), unit: t('unitLot'), align: 'right', kind: 'number' },
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
          const issuer = visibleRankingData.find(d => d.issuerSymbol === symbol);
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
          name: t('bondLotsTitle'), 
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

  if (loading && !industryStats) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-text-muted font-medium">{t('loadingIndustryData')} {getIndustryLabel(industry)}...</p>
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

  return (
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="sticky top-0 z-20 -mx-2 -mt-2 mb-3 border-b border-border-base bg-bg-base/95 px-2 py-3 shadow-sm backdrop-blur md:-mx-4 md:px-4">
        <h1 className="text-2xl font-bold text-text-base tracking-tight transition-colors">{t('marketTitle')} {getIndustryLabel(industry)}</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map((kpi, idx) => (
          <MetricCard key={idx} label={kpi.label} value={kpi.value} unit={kpi.unit} />
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3 lg:items-stretch">
        {/* Ranking - Double Height */}
        <div 
          className="col-span-12 flex flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 lg:col-span-6"
        >
          <div className="min-h-80 flex-1 overflow-hidden md:min-h-96">
            <ChartWithToolbar option={rankingOptions} style={{ height: '100%', width: '100%' }} title={t('debtRanking')} />
          </div>
        </div>

        <div className="col-span-12 flex flex-col gap-3 lg:col-span-6">
          {/* Market Share */}
          <div 
            className="flex flex-1 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 min-h-0"
          >
            <div className="min-h-80 flex-1 overflow-hidden md:min-h-96">
              <ChartWithToolbar
                option={marketShareOptions}
                style={{ height: '100%', width: '100%' }}
                title={t('marketShare')}
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

          {/* Interest Rates */}
          <div 
            className="flex flex-1 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 min-h-0"
          >
            <div className="min-h-72 flex-1 overflow-hidden md:min-h-80">
              <ChartWithToolbar option={interestOptions} style={{ height: '100%', width: '100%' }} allowMagicType title={t('industryInterest')} />
            </div>
          </div>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
          {issuedValueTreemapData.length > 0 ? (
            <div className="h-80 overflow-hidden md:h-96">
              <ChartWithToolbar
                option={issuedValueTreemapOptions}
                style={{ height: '100%', width: '100%' }}
                title={industryIssuedValueTreemapLabel}
                zoomConfig={{
                  scale: 1.1,
                  shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                  chartStyle: { height: '100%', width: '100%' },
                  option: {
                    series: [
                      {
                        labelLayout: (params: any) => {
                          const rect = params?.rect || {};
                          const width = Number(rect.width || 0);
                          const height = Number(rect.height || 0);

                          return {
                            width,
                            height,
                            align: 'center',
                            verticalAlign: 'middle',
                            hideOverlap: true,
                          };
                        },
                        label: {
                          show: true,
                          formatter: buildTreemapZoomLabel,
                          position: 'inside',
                          align: 'center',
                          verticalAlign: 'middle',
                          padding: 0,
                          color: isDark ? '#ffffff' : '#111827',
                          fontSize: 14,
                          fontFamily: 'Manrope',
                          fontWeight: 'normal',
                          overflow: 'none',
                          lineHeight: 18,
                          rich: {
                            name: {
                              color: isDark ? '#ffffff' : '#111827',
                              fontWeight: 'bold',
                              lineHeight: 18,
                            },
                            value: {
                              color: isDark ? '#ffffff' : '#111827',
                              fontWeight: 'normal',
                              lineHeight: 18,
                            },
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

        {/* Combined Chart */}
        <div 
          className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20"
        >
          <div className="h-80 overflow-hidden md:h-96">
            <ChartWithToolbar
              option={combinedOptions}
              style={{ height: '100%', width: '100%' }}
              allowMagicType
              title={t('debtAndLotsEnterprise')}
            />
          </div>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
          {loadingCashFlows && !hasProjectedCashFlowData ? (
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
