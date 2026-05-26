import ChartWithToolbar from './ChartWithToolbar';
import ReactECharts from 'echarts-for-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { BarChart3, Download, LineChart, Maximize2, RotateCcw, TableProperties, X } from 'lucide-react';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

interface TopInterestBond {
  bondCode: string;
  bondRate: number;
}

import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { Card, MetricCard } from './ui/Card';
import { CHART_PALETTE, applyChartTheme, getChartTheme, getChartTooltip } from '../utils/chart';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { loadBondDetail, loadIssuerBondsByFilter } from '../services/bondData';
import {
  loadMarketOverviewData,
  MARKET_OVERVIEW_CACHE_KEY,
  MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY,
  MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY,
  MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY,
  type IndustryData,
  type TopDebtIssuer,
} from '../services/marketOverviewData';
import { loadIssuerStatsSummary } from '../services/industryBondData';

export default function MarketOverview() {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const cachedData = getCache(MARKET_OVERVIEW_CACHE_KEY) || getCache('market_overview');
  const cachedIssuerStats = getCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY) || getCache('top_debt_200');
  const cachedIndustryData = getCache(MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY);
  const cachedTopInterestData = getCache('market_top_interest_bonds') || getCache(MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY);
  const cachedProjectedCashFlows = getCache('market_projected_cash_flows') || {};
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
  const [topInterestMetric, setTopInterestMetric] = useState<'highest' | 'lowest'>('highest');
  const [loadingTopInterestChart, setLoadingTopInterestChart] = useState(false);
  const [industryData, setIndustryData] = useState<IndustryData[]>(
    (Array.isArray(cachedIndustryData) ? cachedIndustryData : cachedData?.industryData || [])
  );
  const [topIssuerMetric, setTopIssuerMetric] = useState<'remainingDebt' | 'issuedValue'>('remainingDebt');
  const [loadingTopIssuerChart, setLoadingTopIssuerChart] = useState(false);
  const [showTopIssuerDataView, setShowTopIssuerDataView] = useState(false);
  const [showTopIssuerZoom, setShowTopIssuerZoom] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(cachedProjectedCashFlows);
  const [loadingCashFlows, setLoadingCashFlows] = useState(
    Object.keys(cachedProjectedCashFlows).length === 0
    && Array.isArray(cachedIssuerStats)
    && cachedIssuerStats.length > 0
  );
  const [loading, setLoading] = useState(!hasSeedData);
  const [error, setError] = useState<string | null>(null);
  const topIssuerChartRef = useRef<any>(null);

  // Common styles for consistency
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

  const chartTitleStyle = {
    fontSize: 10,
    color: chartTheme.text,
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };

  const tooltipTextStyle = getChartTooltip(isDark).textStyle;
  const chartTooltip = getChartTooltip(isDark);
  const chartPalette = CHART_PALETTE;

  const toNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const toBillionVnd = (value: unknown) => {
    const numberValue = toNumber(value);
    if (!numberValue) return 0;
    return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
  };

  const getTopIssuerDisplayName = (issuer: TopDebtIssuer) => {
    return t(issuer.issuerName as any, issuer.issuerSymbol);
  };

  const getTopIssuerChartData = (source: TopDebtIssuer[], metric: 'remainingDebt' | 'issuedValue') => {
    const sorted = [...source].sort((a, b) => {
      if (metric === 'issuedValue') return b.totalIssuedValue - a.totalIssuedValue;
      return b.totalRemainingDebt - a.totalRemainingDebt;
    });

    return sorted.slice(0, 10);
  };

  const getTopInterestChartData = (source: TopInterestBond[], metric: 'highest' | 'lowest') => {
    const sorted = [...source].sort((a, b) => {
      return metric === 'highest' ? b.bondRate - a.bondRate : a.bondRate - b.bondRate;
    });

    return sorted.slice(0, 10);
  };

  const topIssuerMetricTitle = topIssuerMetric === 'remainingDebt'
    ? (language === 'vi'
      ? 'Top 10 doanh nghiệp có dư nợ trái phiếu lớn nhất'
      : 'Top 10 enterprises with the highest bond debt')
    : (language === 'vi'
      ? 'Top 10 doanh nghiệp có giá trị phát hành lớn nhất'
      : 'Top 10 enterprises with the highest issued value');

  const topInterestChartTitle = topInterestMetric === 'highest'
    ? (language === 'vi'
      ? 'Top 10 mã trái phiếu lãi suất cao nhất'
      : 'Top 10 bond codes with the highest interest rates')
    : (language === 'vi'
      ? 'Top 10 mã trái phiếu lãi suất thấp nhất'
      : 'Top 10 bond codes with the lowest interest rates');

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

  const marketKpis = useMemo(() => {
    return industryData.reduce(
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
  }, [industryData]);

  const kpiCards = [
    {
      label: t('totalBondCodes'),
      value: formatNumber(marketKpis.bondCount, 0),
      unit: t('bondCodeUnit')
    },
    {
      label: t('totalIssuedVolume'),
      value: formatNumber(marketKpis.issuedVolume, 0),
      unit: t('bondunits')
    },
    {
      label: t('totalIssuedValueTitle'),
      value: formatNumber(marketKpis.issuedValue / 1000000000, 2),
      unit: t('unitBillionVND')
    },
    {
      label: t('totalRemainingDebt'),
      value: formatNumber(marketKpis.remainingDebt / 1000000000, 2),
      unit: t('unitBillionVND')
    }
  ];

  useEffect(() => {
    let isMounted = true;
    setError(null);
    if (!hasSeedData) setLoading(true);

    const fail = (error: unknown) => {
      if (!isMounted) return;
      console.error('Error fetching market data:', error);
      if (!hasSeedData) {
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('error'));
        }
      }
    };

    const applyOverviewPayload = (payload: any) => {
      const issuers = Array.isArray(payload?.issuerStatsData) ? payload.issuerStatsData : [];
      const refreshedTopInterest = getCache('market_top_interest_bonds');
      const topInterest = Array.isArray(refreshedTopInterest)
        ? refreshedTopInterest
        : Array.isArray(payload?.topInterestData)
          ? payload.topInterestData
          : [];
      const industries = Array.isArray(payload?.industryData) ? payload.industryData : [];

      setIssuerStatsData(issuers);
      setTopInterestData(topInterest);
      setIndustryData(industries);
      setCache('top_debt_200', issuers);
      if (issuers.length > 0 && Object.keys(getCache('market_projected_cash_flows') || {}).length === 0) {
        setLoadingCashFlows(true);
      }
    };

    if (!hasSeedData) {
      void loadMarketOverviewData()
        .then((payload) => {
          if (!isMounted) return;
          applyOverviewPayload(payload);
        })
        .catch(fail)
        .finally(() => {
          if (isMounted) setLoading(false);
        });

      return () => { isMounted = false; };
    }

    void loadMarketOverviewData()
      .then((payload) => {
        if (!isMounted) return;
        applyOverviewPayload(payload);
      })
      .catch(fail)
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  const refreshTopIssuerChart = async (metric: 'remainingDebt' | 'issuedValue') => {
    setLoadingTopIssuerChart(true);
    try {
      const freshIssuers = await loadIssuerStatsSummary(200);
      if (Array.isArray(freshIssuers)) {
        setIssuerStatsData(freshIssuers);
        setCache('top_debt_200', freshIssuers);
        setCache(MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY, freshIssuers);
      }
    } catch (error) {
      console.error('Top issuer chart refresh error', error);
    } finally {
      setLoadingTopIssuerChart(false);
    }
  };

  const refreshTopInterestChart = async (metric: 'highest' | 'lowest') => {
    const cachedInterest = getCache('market_top_interest_bonds');
    const baseFromCache = Array.isArray(cachedInterest) ? cachedInterest : [];
    setLoadingTopInterestChart(true);
    try {
      const sourceIssuers = issuerStatsData.length > 0 ? issuerStatsData : (cachedIssuerStats || cachedData?.issuerStatsData || []);
      const issuerSymbols: string[] = Array.from(
        new Set(
          sourceIssuers
            .map((issuer) => issuer.issuerSymbol)
            .filter((symbol): symbol is string => Boolean(symbol))
        )
      );
      const issuerBondResults = await mapWithConcurrency(issuerSymbols, 6, async (symbol) => {
        const bonds = await loadIssuerBondsByFilter(symbol);
        return Array.isArray(bonds) ? bonds : [];
      });

      const allBonds = getFulfilledValues(issuerBondResults)
        .flat()
        .reduce<TopInterestBond[]>((items, bond: any) => {
          const bondCode = String(bond.bondCode || bond.code || '').trim();
          const bondRate = Number(bond.bondRate || 0);
          if (bondCode && Number.isFinite(bondRate)) {
            items.push({ bondCode, bondRate });
          }
          return items;
        }, []);

      const uniqueBonds = Array.from(new Map(allBonds.map((bond) => [bond.bondCode, bond])).values());
      setTopInterestData(uniqueBonds);
      setCache('market_top_interest_bonds', uniqueBonds);
    } catch (error) {
      console.error('Top interest chart refresh error', error);
    } finally {
      setLoadingTopInterestChart(false);
    }
  };

  useEffect(() => {
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

    fetchProjectedCashFlows();

    return () => { isMounted = false; };
  }, [issuerStatsData]);

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
    () => getTopIssuerChartData(issuerStatsData, 'remainingDebt'),
    [issuerStatsData]
  );

  const topIssuerDisplayData = useMemo(
    () => getTopIssuerChartData(issuerStatsData, topIssuerMetric),
    [issuerStatsData, topIssuerMetric]
  );

  const topInterestChartData = useMemo(
    () => getTopInterestChartData(topInterestData as TopInterestBond[], topInterestMetric),
    [topInterestData, topInterestMetric]
  );

  const topIssuerDataViewRows = useMemo(() => {
    return topIssuerDisplayData.map((issuer, index) => ([
      String(index + 1),
      getTopIssuerDisplayName(issuer),
      issuer.issuerSymbol || '',
      formatNumber(issuer.totalRemainingDebt / 1000000000, 0),
      formatNumber(issuer.totalIssuedValue / 1000000000, 0),
    ]));
  }, [topIssuerDisplayData, t]);

  const topIssuerOptions = useMemo(() => {
    const labels = topIssuerDisplayData.length > 0
      ? topIssuerDisplayData.map((d) => d.issuerSymbol || getTopIssuerDisplayName(d))
      : [];
    const remainingDebtData = topIssuerDisplayData.length > 0
      ? topIssuerDisplayData.map((d) => Math.round(d.totalRemainingDebt / 1000000000))
      : [];
    const issuedValueData = topIssuerDisplayData.length > 0
      ? topIssuerDisplayData.map((d) => Math.round(d.totalIssuedValue / 1000000000))
      : [];

    return {
      color: chartPalette,
      tooltip: {
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          const index = params?.[0]?.dataIndex ?? 0;
          const issuer = topIssuerDisplayData[index];
          const symbol = issuer?.issuerSymbol || params?.[0]?.name || '';
          const issuerLabel = issuer ? getTopIssuerDisplayName(issuer) : symbol;
          let content = `${issuerLabel} (${symbol})`;
          params.forEach((param: any) => {
            const unit = param.seriesName === t('bondLotsTitle') ? '' : ` ${t('unitBillionVND')}`;
            content += `<br/>${param.marker}${param.seriesName}: ${formatNumber(param.value, 0)}${unit}`;
          });
          return content;
        }
      },
      legend: { bottom: 5, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
      grid: { left: '3%', right: '8%', top: '4%', bottom: '12%', containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { show: false },
        name: t('unitBillionVND'),
        nameGap: 16,
        nameTextStyle: chartTitleStyle,
        axisLabel: {
          ...valueLabelStyle,
          formatter: (value: number) => formatNumber(value, 0)
        }
      },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        axisLabel: {
          ...categoryLabelStyle,
          width: 120,
          overflow: 'truncate',
        }
      },
      series: [
        {
          name: t('remainingDebtTitle'),
          type: 'bar',
          data: remainingDebtData,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          barWidth: '38%',
          universalTransition: true,
          animationDurationUpdate: 600,
          animationEasingUpdate: 'cubicOut'
        },
        {
          name: t('totalIssuedValueTitle'),
          type: 'bar',
          data: issuedValueData,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          barWidth: '38%',
          universalTransition: true,
          animationDurationUpdate: 600,
          animationEasingUpdate: 'cubicOut'
        }
      ]
    };
  }, [chartPalette, chartTooltip, chartTitleStyle, categoryLabelStyle, topIssuerDisplayData, t, tooltipTextStyle, valueLabelStyle, legendStyle]);
  const themedTopIssuerOptions = useMemo(
    () => applyChartTheme(topIssuerOptions, isDark),
    [topIssuerOptions, isDark]
  );

  const topInterestOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        return `${params[0].name}<br/>${params[0].marker}${params[0].seriesName}: ${formatInterestRate(params[0].value)}%`;
      }
    },
    grid: { left: '5%', right: '8%', top: '14%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: topInterestChartData.length > 0 
        ? topInterestChartData.map(d => d.bondCode) 
        : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: t('unitPercentLabel'),
      nameGap: 24,
      nameTextStyle: chartTitleStyle,
      axisLabel: { 
        ...valueLabelStyle,
        formatter: '{value}'
      } 
    },
    series: [{
      name: t('interestRate'),
      type: 'bar',
      data: topInterestChartData.length > 0 
        ? topInterestChartData.map(d => d.bondRate) 
        : [],
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      barWidth: '50%',
      barGap: 15,
      universalTransition: true,
      animationDurationUpdate: 600,
      animationEasingUpdate: 'cubicOut'
    }]
  };

  const debtLotsOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const symbol = params[0].name;
        const issuer = topDebtData.find(d => d.issuerSymbol === symbol);
        let res = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
        params.forEach((p: any) => {
          res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)}${p.seriesName === t('remainingDebtTitle') ? ' ' + t('unitBillionVND') : ''}`;
        });
        return res;
      }
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '3%', right: '8%', top: '12%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: topDebtData.length > 0 
        ? topDebtData.map(d => d.issuerSymbol) 
        : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: [
      { 
        type: 'value', 
        name: t('unitBillionVND'),
        nameGap: 24,
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
        splitLine: { show: false },
        axisLabel: {
          ...valueLabelStyle,
          formatter: (value: number) => formatNumber(value, 0)
        } 
      }
    ],
    series: [
      { 
        name: t('remainingDebtTitle'), 
        type: 'bar', 
        data: topDebtData.length > 0 
          ? topDebtData.map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
          : [], 
        itemStyle: { },
        barWidth: '60%',
        barGap: 15
      },
      { 
        name: t('bondLotsTitle'), 
        type: 'line', 
        yAxisIndex: 1, 
        data: topDebtData.length > 0 
          ? topDebtData.map(d => d.bondCount) 
          : [], 
        itemStyle: { },
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  };

  const industryValueOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let res = params[0].name;
        params.forEach((p: any) => {
          res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)} ${t('unitBillionVND')}`;
        });
        return res;
      }
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '3%', right: '4%', top: '12%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryData.length > 0 
        ? industryData.map(d => t(d.icbName as any)) 
        : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: t('unitBillionVND'),
      nameTextStyle: chartTitleStyle,
      axisLabel: { 
        ...valueLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: [
      { 
        name: t('totalIssuedValueTitle'), 
        type: 'bar', 
        data: industryData.length > 0 
          ? industryData.map(d => Math.round(d.totalIssuedValue / 1000000000)) 
          : [], 
        itemStyle: { } 
      },
      { 
        name: t('listedValueTitle'), 
        type: 'bar', 
        data: industryData.length > 0 
          ? industryData.map(d => Math.round(d.totalCurrentListedValue / 1000000000)) 
          : [], 
        itemStyle: { } 
      }
    ]
  };

  const industryVolumeOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let res = params[0].name;
        params.forEach((p: any) => {
          res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)} ${t('bondunits')}`;
        });
        return res;
      }
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '3%', right: '8%', top: '12%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryData.length > 0 ? industryData.map(d => t(d.icbName as any)) : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: t('bondunits'),
      nameGap: 28,
      nameTextStyle: chartTitleStyle,
      axisLabel: { 
        ...valueLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: [
      {
        name: t('issuedVolumeTitle'),
        type: 'bar',
        data: industryData.length > 0 ? industryData.map(d => Math.round(d.totalIssuedVolume)) : [],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        barWidth: '30%'
      },
      {
        name: t('listedVolume'),
        type: 'bar',
        data: industryData.length > 0 ? industryData.map(d => Math.round(d.totalCurrentListedVolume)) : [],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        barWidth: '30%'
      }
    ]
  };

  const projectedCashFlowOptions = {
    color: chartPalette,
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const interest = params.find((param: any) => param.seriesName === t('totalInterestPayable'))?.value || 0;
        const principal = params.find((param: any) => param.seriesName === t('totalPrincipalPayable'))?.value || 0;
        const total = interest + principal;

        return `${params[0].name}<br/>${params[0].marker} ${t('totalInterestPayable')}: ${formatNumber(interest, 2)} ${t('unitBillionVND')}<br/>${params[1].marker} ${t('totalPrincipalPayable')}: ${formatNumber(principal, 2)} ${t('unitBillionVND')}<br/><strong>${t('totalCashFlow')}: ${formatNumber(total, 2)} ${t('unitBillionVND')}</strong>`;
      }
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { left: '3%', right: '8%', top: '12%', bottom: '28%', containLabel: true },
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
      splitLine: { show: false },
      name: t('unitBillionVND'),
      nameGap: 24,
      nameTextStyle: chartTitleStyle,
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
        barWidth: '45%'
      },
      {
        name: t('totalPrincipalPayable'),
        type: 'bar',
        stack: 'cashFlow',
        data: projectedCashFlowData.principal,
        itemStyle: { borderRadius: 0 },
        barWidth: '45%'
      }
    ]
  };

  const handleTopIssuerDownload = () => {
    const instance = topIssuerChartRef.current?.getEchartsInstance?.();
    if (!instance) return;
    const url = instance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: chartTheme.bg,
    });
    const link = document.createElement('a');
    link.href = url;
    link.download = 'top-10-issuer-chart.png';
    link.click();
  };

  const handleTopIssuerReset = () => {
    const instance = topIssuerChartRef.current?.getEchartsInstance?.();
    instance?.restore?.();
    setTopIssuerMetric('remainingDebt');
    setShowTopIssuerDataView(false);
    setShowTopIssuerZoom(false);
  };

  const topIssuerToolbarButtonClass = (disabled = false) => (
    `rounded-md p-1.5 transition-colors ${
      disabled
        ? 'cursor-not-allowed text-text-muted/60 opacity-60'
        : 'text-text-muted hover:bg-surface-container-low hover:text-text-highlight'
    }`
  );

  if (loading) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-text-muted font-medium">{t('loadingMarketData')}</p>
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
            className="rounded-lg bg-action-accent px-6 py-2 font-bold text-slate-950 transition-colors hover:opacity-90 cursor-pointer"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 transition-colors duration-300">
      <div className="sticky top-0 z-20 -mx-2 -mt-2 mb-3 flex min-w-0 items-center justify-between border-b border-border-base bg-bg-base/95 px-2 py-3 shadow-sm backdrop-blur md:-mx-4 md:px-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-base tracking-tight break-words transition-colors">{t('marketOverview')}</h1>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-12 gap-3">
        <div className="col-span-12 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} unit={card.unit} />
          ))}
        </div>

        <Card className="col-span-12 flex flex-col p-3 md:p-4 lg:col-span-6 min-h-0">
          <div className="mb-1 flex min-w-0 flex-col gap-1">
            <div className="flex items-center justify-end gap-1 text-text-muted">
                <button
                  type="button"
                  onClick={() => setShowTopIssuerDataView(true)}
                  className={topIssuerToolbarButtonClass()}
                  title={t('dataView')}
                  aria-label={t('dataView')}
                >
                  <TableProperties className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled
                  className={topIssuerToolbarButtonClass()}
                  title="Line chart"
                >
                  <LineChart className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled
                  className={topIssuerToolbarButtonClass()}
                  title="Column chart"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTopIssuerReset}
                  className={topIssuerToolbarButtonClass()}
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTopIssuerDownload}
                  className={topIssuerToolbarButtonClass()}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTopIssuerZoom(true)}
                  className={topIssuerToolbarButtonClass()}
                  title="Zoom"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
            </div>
            <div className="min-w-0 text-center">
              <h3 className="text-sm md:text-base font-bold text-text-base leading-snug break-words text-center">{topIssuerMetricTitle}</h3>
            </div>
            <div className="flex justify-center md:justify-end">
              <div className="flex rounded-lg border border-border-base bg-surface-container-low p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTopIssuerMetric('remainingDebt');
                    refreshTopIssuerChart('remainingDebt');
                  }}
                  disabled={loadingTopIssuerChart && topIssuerMetric === 'remainingDebt'}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                    topIssuerMetric === 'remainingDebt'
                      ? 'bg-action-accent text-slate-950'
                      : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  {t('remainingDebtTitle')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTopIssuerMetric('issuedValue');
                    refreshTopIssuerChart('issuedValue');
                  }}
                  disabled={loadingTopIssuerChart && topIssuerMetric === 'issuedValue'}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                    topIssuerMetric === 'issuedValue'
                      ? 'bg-action-accent text-slate-950'
                      : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  {t('totalIssuedValueTitle')}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
            {loadingTopIssuerChart && topIssuerDisplayData.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  {t('loading')}
                </div>
              </div>
            ) : (
              <ReactECharts ref={topIssuerChartRef} option={themedTopIssuerOptions} style={{ height: '100%', width: '100%' }} />
            )}
          </div>
        </Card>

        <div className="col-span-12 flex flex-col space-y-3 lg:col-span-6 min-h-0">
          <Card className="flex flex-1 flex-col p-3 md:p-4 min-h-0">
            <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
              {loadingTopInterestChart && topInterestChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                    {t('loading')}
                  </div>
                </div>
              ) : (
                <ChartWithToolbar
                  option={topInterestOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  title={topInterestChartTitle}
                  actions={(
                    <div className="flex rounded-lg border border-border-base bg-surface-container-low p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTopInterestMetric('highest');
                          refreshTopInterestChart('highest');
                        }}
                        disabled={loadingTopInterestChart && topInterestMetric === 'highest'}
                        className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                          topInterestMetric === 'highest'
                            ? 'bg-action-accent text-slate-950'
                            : 'text-text-muted hover:text-text-base'
                        }`}
                      >
                        {t('highest')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTopInterestMetric('lowest');
                          refreshTopInterestChart('lowest');
                        }}
                        disabled={loadingTopInterestChart && topInterestMetric === 'lowest'}
                        className={`rounded-md px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                          topInterestMetric === 'lowest'
                            ? 'bg-action-accent text-slate-950'
                            : 'text-text-muted hover:text-text-base'
                        }`}
                      >
                        {t('lowest')}
                      </button>
                    </div>
                  )}
                />
              )}
            </div>
          </Card>

          <Card className="flex flex-1 flex-col p-3 md:p-4 min-h-0">
            <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
              <ChartWithToolbar
                option={debtLotsOptions}
                style={{ height: '100%', width: '100%' }}
                allowMagicType
                title={t('debtAndLots')}
              />
            </div>
          </Card>
        </div>

        <Card className="col-span-12 flex flex-col p-3 md:p-4 min-h-0">
          <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
            <ChartWithToolbar
              option={industryValueOptions}
              style={{ height: '100%', width: '100%' }}
              allowMagicType
              title={t('valueByIndustry')}
            />
          </div>
        </Card>

        <Card className="col-span-12 flex flex-col p-3 md:p-4 min-h-0">
          <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
            <ChartWithToolbar
              option={industryVolumeOptions}
              style={{ height: '100%', width: '100%' }}
              allowMagicType
              title={t('volumeByIndustry')}
            />
          </div>
        </Card>

        <Card className="col-span-12 flex flex-col p-3 md:p-4 min-h-0">
          <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
            {loadingCashFlows && !hasProjectedCashFlowData ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  {t('loading')}
                </div>
              </div>
            ) : (
              <ChartWithToolbar
                option={projectedCashFlowOptions}
                style={{ height: '100%', width: '100%' }}
                allowMagicType
                title={projectedCashFlowTitle}
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
            )}
          </div>
        </Card>
      </div>

      {showTopIssuerDataView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowTopIssuerDataView(false)}
        >
          <div
            className="flex h-full max-h-screen w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-base px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text-base text-left leading-snug break-words">
                  {t('dataView')}
                </h3>
                <p className="text-xs font-medium text-text-muted">
                  {topIssuerMetricTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopIssuerDataView(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="overflow-x-auto rounded-xl border border-border-base bg-bg-surface">
                <table className="min-w-full border-collapse text-left bg-bg-surface">
                  <thead className="bg-surface-container-low">
                    <tr className="border-b border-border-base">
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                        {t('rank')}
                      </th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                        {t('enterprise')}
                      </th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                        {t('ticker')}
                      </th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                        <span className="block">Remaining debt</span>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted/80">
                          {t('unitBillionVND')}
                        </span>
                      </th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                        <span className="block">Issued value</span>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted/80">
                          {t('unitBillionVND')}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topIssuerDataViewRows.map((row, index) => (
                      <tr key={`${row[2] || row[1]}-${index}`} className="border-b border-border-base/70 bg-bg-surface last:border-b-0">
                        <td className="bg-bg-surface px-3 py-3 text-sm font-semibold text-text-base">{row[0]}</td>
                        <td className="bg-bg-surface px-3 py-3 text-sm font-medium text-text-base">{row[1]}</td>
                        <td className="bg-bg-surface px-3 py-3 text-sm font-medium text-text-muted">{row[2] || '-'}</td>
                        <td className="bg-bg-surface px-3 py-3 text-sm font-medium text-text-base">{row[3]}</td>
                        <td className="bg-bg-surface px-3 py-3 text-sm font-medium text-text-base">{row[4]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTopIssuerZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowTopIssuerZoom(false)}
        >
          <div
            className="flex h-full max-h-screen w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-base px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text-base text-left leading-snug break-words">
                  {topIssuerMetricTitle}
                </h3>
                <p className="text-xs font-medium text-text-muted">
                  Zoom
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopIssuerZoom(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <ReactECharts option={themedTopIssuerOptions} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
