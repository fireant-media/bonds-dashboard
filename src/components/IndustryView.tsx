import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
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
import { CHART_PALETTE, getAdaptiveBarWidth, getChartTooltip } from '../utils/chart';
import { INDUSTRY_LABEL_KEYS } from '../constants/industries';
import { loadIndustryBaseBondGroupData, loadIndustryBondGroupData, loadIndustryStats } from '../services/industryBondData';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

export default function IndustryView({ industry }: IndustryViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cacheKey = `industry_bond_group_v2_${industry}`;
  const cachedData = getCache(cacheKey);
  const [industryStats, setIndustryStats] = useState<any>(cachedData?.industryStats || null);
  const [rankingData, setRankingData] = useState<any[]>(cachedData?.issuerSummaries || cachedData?.rankingData || []);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(
    cachedData?.projectedCashFlowBuckets || getCache(`industry_projected_cash_flows_${industry}`) || {}
  );
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextCachedData = getCache(cacheKey);
    setCashFlowPeriod('year');
    setIndustryStats(nextCachedData?.industryStats || null);
    setRankingData(nextCachedData?.issuerSummaries || nextCachedData?.rankingData || []);
    setProjectedCashFlowBuckets(nextCachedData?.projectedCashFlowBuckets || {});
    setLoading(!nextCachedData);
    setLoadingCashFlows(false);
  }, [industry, cacheKey]);

  useEffect(() => {
    let isMounted = true;

    const fetchIndustryData = async () => {
      const cachedGroupData = getCache(cacheKey);
      if (cachedGroupData) {
        if (!isMounted) return;
        setIndustryStats(cachedGroupData.industryStats);
        setRankingData(cachedGroupData.issuerSummaries || cachedGroupData.rankingData || []);
        setProjectedCashFlowBuckets(cachedGroupData.projectedCashFlowBuckets || {});
        setLoading(false);
        setLoadingCashFlows(false);
      }

      setError(null);
      if (!cachedGroupData) {
        setLoading(true);
        setLoadingCashFlows(true);
      }

      try {
        const stats = await loadIndustryStats(String(industry));
        if (!isMounted) return;
        setIndustryStats(stats);
        setLoading(false);

        const baseGroupedData = await loadIndustryBaseBondGroupData(String(industry));
        if (!isMounted) return;
        setIndustryStats(baseGroupedData.industryStats);
        setRankingData(baseGroupedData.issuerSummaries);

        const groupedData = await loadIndustryBondGroupData(String(industry));
        if (!isMounted) return;

        setIndustryStats(groupedData.industryStats);
        setRankingData(groupedData.issuerSummaries);
        setProjectedCashFlowBuckets(groupedData.projectedCashFlowBuckets);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching industry data:', error);
        if (!cachedGroupData) {
          if (error instanceof Error && error.message.includes('401')) {
            setError(t('tokenError401'));
          } else {
            setError(error instanceof Error ? error.message : t('error'));
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setLoadingCashFlows(false);
        }
      }
    };

    void fetchIndustryData();
    return () => {
      isMounted = false;
    };
  }, [industry, cacheKey]);

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  const getIndustryLabel = (ind: string) => {
    const labelKey = INDUSTRY_LABEL_KEYS[ind];
    if (labelKey) return t(labelKey as any);
    
    // Fallback to general translation for any other industry string
    return t(ind as any);
  };

  const chartColors = {
    primary: isDark ? '#3b82f6' : '#2563eb', // blue-500 : blue-600
    secondary: isDark ? '#94a3b8' : '#64748b', // slate-400 : slate-500
  };

  const legendStyle = {
    fontSize: 12,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
  };

  const categoryLabelStyle = {
    fontSize: 12,
    color: isDark ? '#e5e7eb' : '#333',
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };

  const valueLabelStyle = {
    fontSize: 12,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
  };

  const tooltipTextStyle = getChartTooltip(isDark).textStyle;
  const chartTooltip = getChartTooltip(isDark);
  const chartPalette = CHART_PALETTE;
  const chartTitleStyle = {
    fontSize: 10,
    color: isDark ? '#e5e7eb' : '#374151',
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };
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
          unit: t('bondunits') 
        },
        { 
          label: t('totalIssuedValueTitle'), 
          value: formatNumber(industryStats.totalIssuedValue / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
        { 
          label: t('initialDebtFull'), 
          value: formatNumber(industryStats.totalDebtFull / 1000000000, 2), 
          unit: t('unitBillionVND') 
        },
        { 
          label: t('listedVolume'), 
          value: formatNumber(industryStats.totalCurrentListedVolume, 0), 
          unit: t('bondunits') 
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

  const getRankingOptions = () => {
    const displayData = [...rankingData].reverse();
    const categoryCount = displayData.length;
    const maxDebt = rankingData.length > 0 ? Math.max(...rankingData.map(d => d.totalRemainingDebt / 1000000000)) : 0;
    const interval = (industry === 'Banking' || industry === 'RealEstate') ? 20000 : (maxDebt > 10000 ? 5000 : 2000);

    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params[0].name;
          const issuer = rankingData.find(d => d.issuerSymbol === symbol);
          const displayName = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
          return `${displayName}<br/>${params[0].marker}${params[0].seriesName}: ${formatNumber(params[0].value, 0)} Tỷ VND`;
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
    const hasData = rankingData.length > 0;
    let chartData: { value: number; name: string; itemStyle: { color: string } }[] = [];

    if (hasData) {
      const totalDebt = rankingData.reduce((sum, item) => sum + item.totalRemainingDebt, 0);
      const top9 = rankingData.slice(0, 9);
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

    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'item',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params.name;
          const issuer = rankingData.find(d => d.issuerSymbol === symbol);
          const displayName = (symbol === t('others')) ? t('others') : (issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol);
          return `${displayName}<br/>${t('marketShare')}: ${params.percent}%<br/>${t('remainingDebtTitle')}: ${formatNumber(Math.round(params.value / 1000000000), 0)} ${t('unitBillionVND')}`;
        }
      },
      legend: [
        { 
          orient: 'vertical',
          right: '22%', 
          top: 'middle', 
          itemWidth: 8, 
          itemHeight: 8, 
          textStyle: legendStyle,
          data: chartData.slice(0, 5).map(d => d.name)
        },
        { 
          orient: 'vertical',
          right: '5%', 
          top: 'middle', 
          itemWidth: 8, 
          itemHeight: 8, 
          textStyle: legendStyle,
          data: chartData.slice(5, 10).map(d => d.name)
        }
      ],
      series: [{
        name: t('marketShare'),
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 'bold',
            formatter: '{b}: {d}%'
          }
        },
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

    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          return `${params[0].name}: ${formatInterestRate(params[0].value)}%`;
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '5%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: data.map(d => d.name),
        axisLabel: { ...categoryLabelStyle, interval: 0 } 
      },
      yAxis: { 
        type: 'value',
        splitLine: { show: false },
        name: t('unitPercentLabel'),
        nameTextStyle: chartTitleStyle,
        axisLabel: valueLabelStyle 
      },
      series: [{
        name: `${t('interestRate')} (%)`,
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

  const getCombinedOptions = () => {
    const displayData = rankingData;
    const categoryCount = displayData.length;

    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const symbol = params[0].name;
          const issuer = rankingData.find(d => d.issuerSymbol === symbol);
          let res = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
          params.forEach((p: any) => {
            res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)}${p.seriesName === t('remainingDebtTitle') ? ' ' + t('unitBillionVND') : ''}`;
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

  const projectedCashFlowOptions = {
    color: chartPalette,
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let content = `${params[0].name}<br/>`;
        let total = 0;
        params.forEach((param: any) => {
          total += param.value || 0;
          content += `${param.marker} ${param.seriesName}: ${formatNumber(param.value || 0, 2)} ${t('unitBillionVND')}<br/>`;
        });
        content += `<strong>${t('totalCashFlow')}: ${formatNumber(total, 2)} ${t('unitBillionVND')}</strong>`;
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
    grid: { top: '12%', bottom: '20%', left: '10%', right: '8%' },
    xAxis: {
      type: 'category',
      data: projectedCashFlowData.labels,
      axisLabel: {
        ...categoryLabelStyle,
        rotate: cashFlowPeriod === 'month' && projectedCashFlowData.labels.length > 10 ? 45 : 0
      }
    },
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
        type: 'bar',
        stack: 'cashFlow',
        data: projectedCashFlowData.interest,
        itemStyle: { borderRadius: 0 },
        barWidth: getAdaptiveBarWidth(projectedCashFlowData.labels.length)
      },
      {
        name: t('totalPrincipalPayable'),
        type: 'bar',
        stack: 'cashFlow',
        data: projectedCashFlowData.principal,
        itemStyle: { borderRadius: 0 },
        barWidth: getAdaptiveBarWidth(projectedCashFlowData.labels.length)
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
            className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="sticky top-0 z-20 -mx-2 border-b border-border-base bg-surface-container-low px-2 py-2 md:-mx-4 md:px-4">
        <h1 className="text-2xl font-bold text-blue-600 dark:text-white tracking-tight transition-colors">{t('marketTitle')} {getIndustryLabel(industry)}</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-32">
            <p className="text-sm font-semibold text-text-muted/80 mb-2">{kpi.label}</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-white mb-1 transition-colors">{kpi.value}</p>
            <p className="text-sm font-bold text-gray-400">{kpi.unit}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3 lg:items-stretch">
        {/* Ranking - Double Height */}
        <div 
          className="col-span-12 flex flex-col rounded-lg border border-border-base bg-bg-surface p-4 shadow-sm transition-colors lg:col-span-6"
        >
          <div className="mb-3">
            <h3 className="text-base font-bold text-blue-600 dark:text-white text-center transition-colors">{t('debtRanking')}</h3>
          </div>
          <div className="min-h-80 flex-1 overflow-hidden md:min-h-96">
            <ReactECharts option={rankingOptions} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        <div className="col-span-12 flex flex-col gap-3 lg:col-span-6">
          {/* Market Share */}
          <div 
            className="flex flex-1 flex-col rounded-lg border border-border-base bg-bg-surface p-4 shadow-sm transition-colors min-h-0"
          >
          <div className="mb-3">
            <h3 className="text-base font-bold text-blue-600 dark:text-white text-center transition-colors">{t('marketShare')}</h3>
          </div>
            <div className="min-h-80 flex-1 overflow-hidden md:min-h-96">
              <ReactECharts option={marketShareOptions} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>

          {/* Interest Rates */}
          <div 
            className="flex flex-1 flex-col rounded-lg border border-border-base bg-bg-surface p-4 shadow-sm transition-colors min-h-0"
          >
          <div className="mb-3">
            <h3 className="text-base font-bold text-blue-600 dark:text-white text-center transition-colors">{t('industryInterest')}</h3>
          </div>
            <div className="min-h-72 flex-1 overflow-hidden md:min-h-80">
              <ReactECharts option={interestOptions} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>

        {/* Combined Chart */}
        <div 
          className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface p-4 shadow-sm transition-colors"
        >
          <div className="mb-2">
            <h3 className="text-base font-bold text-blue-600 dark:text-white text-center transition-colors">{t('debtAndLotsEnterprise')}</h3>
          </div>
          <div className="h-80 overflow-hidden md:h-96">
            <ReactECharts option={combinedOptions} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface p-4 shadow-sm transition-colors">
          <div className="mb-2 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3 md:items-center">
            <div className="hidden md:block" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-blue-600 dark:text-white text-center transition-colors">{projectedCashFlowTitle}</h3>
            </div>
            <div className="flex shrink-0 items-center justify-center md:justify-end">
              <div className="flex rounded-lg border border-border-base bg-surface-container-low p-1">
                {(['month', 'year'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setCashFlowPeriod(period)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                      cashFlowPeriod === period
                        ? 'bg-blue-600 text-white'
                        : 'text-text-muted hover:text-text-base'
                    }`}
                  >
                    {period === 'month' ? t('month') : t('year')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {loadingCashFlows && !hasProjectedCashFlowData ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <p className="text-xs font-semibold uppercase text-text-muted/80">{t('loadingCashFlow')}</p>
            </div>
          ) : hasProjectedCashFlowData ? (
            <div className="h-80 overflow-hidden md:h-96">
              <ReactECharts option={projectedCashFlowOptions} style={{ height: '100%', width: '100%' }} />
            </div>
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
