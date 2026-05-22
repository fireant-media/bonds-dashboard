import ReactECharts from 'echarts-for-react';
import { useState, useEffect, useMemo } from 'react';
import { formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';

interface TopDebtIssuer {
  issuerName: string;
  issuerSymbol: string;
  totalIssuedValue: number;
  totalRemainingDebt: number;
  bondCount: number;
}

interface IndustryData {
  icbName: string;
  totalCurrentListedValue: number;
  totalRemainingDebt: number;
  bondCount: number;
  totalIssuedVolume: number;
  totalCurrentListedVolume: number;
}

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
import { fireantApi } from '../api/fireant';
import { Card, MetricCard } from './ui/Card';
import { CHART_PALETTE, getChartTooltip } from '../utils/chart';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';

interface MarketOverviewPayload {
  topDebtData: TopDebtIssuer[];
  issuerStatsData: TopDebtIssuer[];
  topInterestData: any[];
  industryData: IndustryData[];
}

let marketOverviewPromise: Promise<MarketOverviewPayload> | null = null;

const loadMarketOverviewData = async (): Promise<MarketOverviewPayload> => {
  const cachedOverview = getCache('market_overview');
  if (cachedOverview) return cachedOverview;

  if (!marketOverviewPromise) {
    marketOverviewPromise = (async () => {
      const [topDebtRaw, highYieldRaw, industriesRaw] = await Promise.all([
        (async () => {
          const cachedTopDebt = getCache('top_debt_200');
          if (cachedTopDebt) return cachedTopDebt;
          const data = await fireantApi.getTopDebtIssuers(200);
          setCache('top_debt_200', data);
          return data;
        })(),
        fireantApi.getHighYieldBonds(10).catch((error) => {
          console.error('Interest fetch error', error);
          return [];
        }),
        fireantApi.getIndustries(1000, 1).catch((error) => {
          console.error('Industry fetch error', error);
          return [];
        }),
      ]);

      const issuerStatsData = Array.isArray(topDebtRaw) ? topDebtRaw : [];
      const payload: MarketOverviewPayload = {
        topDebtData: issuerStatsData.slice(0, 10),
        issuerStatsData,
        topInterestData: Array.isArray(highYieldRaw) ? highYieldRaw : [],
        industryData: Array.isArray(industriesRaw) ? industriesRaw : [],
      };

      setCache('market_overview', payload);
      return payload;
    })().finally(() => {
      marketOverviewPromise = null;
    });
  }

  return marketOverviewPromise;
};

export default function MarketOverview() {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cachedData = getCache('market_overview');
  const cachedIssuerStats = getCache('top_debt_200');
  const [topDebtData, setTopDebtData] = useState<TopDebtIssuer[]>(cachedData?.topDebtData || []);
  const [issuerStatsData, setIssuerStatsData] = useState<TopDebtIssuer[]>(cachedData?.issuerStatsData || cachedIssuerStats || cachedData?.topDebtData || []);
  const [topInterestData, setTopInterestData] = useState<any[]>(cachedData?.topInterestData || []);
  const [topInterestMetric, setTopInterestMetric] = useState<'highest' | 'lowest'>('highest');
  const [topInterestChartData, setTopInterestChartData] = useState<TopInterestBond[]>(cachedData?.topInterestData || []);
  const [loadingTopInterestChart, setLoadingTopInterestChart] = useState(false);
  const [industryData, setIndustryData] = useState<IndustryData[]>(cachedData?.industryData || []);
  const [topIssuerMetric, setTopIssuerMetric] = useState<'remainingDebt' | 'issuedValue'>('remainingDebt');
  const [topIssuerChartData, setTopIssuerChartData] = useState<TopDebtIssuer[]>(cachedData?.topDebtData || []);
  const [loadingTopIssuerChart, setLoadingTopIssuerChart] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(getCache('market_projected_cash_flows') || {});
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  // Common styles for consistency
  const chartColors = {
    primary: isDark ? '#3b82f6' : '#2563eb',
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

  const chartTitleStyle = {
    fontSize: 10,
    color: isDark ? '#e5e7eb' : '#374151',
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
    const issuerTotals = issuerStatsData.reduce(
      (totals, issuer) => ({
        bondCount: totals.bondCount + toNumber(issuer.bondCount),
        issuedValue: totals.issuedValue + toNumber(issuer.totalIssuedValue),
        remainingDebt: totals.remainingDebt + toNumber(issuer.totalRemainingDebt)
      }),
      {
        bondCount: 0,
        issuedValue: 0,
        remainingDebt: 0
      }
    );

    const issuedVolume = industryData.reduce(
      (total, industry) => total + toNumber(industry.totalIssuedVolume),
      0
    );

    return {
      ...issuerTotals,
      issuedVolume
    };
  }, [issuerStatsData, industryData]);

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
    const fetchData = async () => {
      setError(null);
      if (!cachedData) setLoading(true);
      try {
        const data = await loadMarketOverviewData();
        if (!isMounted) return;
        setTopDebtData(data.topDebtData);
        setIssuerStatsData(data.issuerStatsData);
        setTopInterestData(data.topInterestData);
        setIndustryData(data.industryData);
        setTopIssuerChartData(getTopIssuerChartData(data.issuerStatsData, topIssuerMetric));
        setTopInterestChartData(getTopInterestChartData(data.topInterestData as TopInterestBond[], topInterestMetric));
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching market data:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('error'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    setTopIssuerChartData(getTopIssuerChartData(issuerStatsData, topIssuerMetric));
  }, [issuerStatsData, topIssuerMetric]);

  const refreshTopIssuerChart = async (metric: 'remainingDebt' | 'issuedValue') => {
    const source = issuerStatsData.length > 0 ? issuerStatsData : cachedIssuerStats || [];
    if (source.length > 0) {
      setTopIssuerChartData(getTopIssuerChartData(source, metric));
    }

    setLoadingTopIssuerChart(true);
    try {
      const freshIssuers = await fireantApi.getTopDebtIssuers(200);
      if (Array.isArray(freshIssuers)) {
        setIssuerStatsData(freshIssuers);
        setTopDebtData(getTopIssuerChartData(freshIssuers, 'remainingDebt'));
        setTopIssuerChartData(getTopIssuerChartData(freshIssuers, metric));
        setCache('top_debt_200', freshIssuers);
      }
    } catch (error) {
      console.error('Top issuer chart refresh error', error);
    } finally {
      setLoadingTopIssuerChart(false);
    }
  };

  useEffect(() => {
    setTopInterestChartData(getTopInterestChartData(topInterestData as TopInterestBond[], topInterestMetric));
  }, [topInterestData, topInterestMetric]);

  const refreshTopInterestChart = async (metric: 'highest' | 'lowest') => {
    const cachedInterest = getCache('market_top_interest_bonds');
    const baseFromCache = Array.isArray(cachedInterest) ? cachedInterest : [];
    if (baseFromCache.length > 0) {
      setTopInterestChartData(getTopInterestChartData(baseFromCache, metric));
    }

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
        const bonds = await fireantApi.getIssuerBonds(symbol);
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
      setTopInterestChartData(getTopInterestChartData(uniqueBonds, metric));
      setCache('market_top_interest_bonds', uniqueBonds);
    } catch (error) {
      console.error('Top interest chart refresh error', error);
      const fallback = Array.isArray(topInterestData) ? topInterestData : [];
      setTopInterestChartData(getTopInterestChartData(fallback as TopInterestBond[], metric));
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
          const data = await fireantApi.getIssuerBonds(symbol);
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

          const detailData = await fireantApi.getBond(code);
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

  const topIssuerDisplayData = topIssuerChartData;

  const topIssuerOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const symbol = params[0].name;
        const issuer = topIssuerDisplayData.find(d => d.issuerSymbol === symbol);
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
    grid: { left: '3%', right: '8%', top: '5%', bottom: '8%', containLabel: true },
    xAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: t('unitBillionVND'),
      nameTextStyle: chartTitleStyle,
      axisLabel: { 
        ...valueLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    yAxis: { 
      type: 'category',
      inverse: true,
      data: topIssuerDisplayData.length > 0 
        ? topIssuerDisplayData.map(d => d.issuerSymbol) 
        : [],
      axisLabel: {
        ...categoryLabelStyle,
        width: 150,
        overflow: 'truncate'
      }
    },
    series: [
      {
        name: t('remainingDebtTitle'),
        type: 'bar',
        data: topIssuerDisplayData.length > 0 
          ? topIssuerDisplayData.map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
          : [],
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        barWidth: '40%',
        universalTransition: true,
        animationDurationUpdate: 600,
        animationEasingUpdate: 'cubicOut'
      },
      {
        name: t('totalIssuedValueTitle'),
        type: 'bar',
        data: topIssuerDisplayData.length > 0 
          ? topIssuerDisplayData.map(d => Math.round(d.totalIssuedValue / 1000000000)) 
          : [],
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        barWidth: '40%',
        universalTransition: true,
        animationDurationUpdate: 600,
        animationEasingUpdate: 'cubicOut'
      }
    ]
  };

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
    grid: { left: '5%', right: '8%', top: '10%', bottom: '8%', containLabel: true },
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
    grid: { left: '3%', right: '8%', bottom: '8%', containLabel: true },
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
    grid: { left: '3%', right: '4%',top: '5%', bottom: '8%', containLabel: true },
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
        name: t('listedValueTitle'), 
        type: 'bar', 
        data: industryData.length > 0 
          ? industryData.map(d => Math.round(d.totalCurrentListedValue / 1000000000)) 
          : [], 
        itemStyle: { } 
      },
      { 
        name: t('remainingDebtTitle'), 
        type: 'bar', 
        data: industryData.length > 0 
          ? industryData.map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
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
          res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)} ${t('unitThousandShares')}`;
        });
        return res;
      }
    },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '3%', right: '8%', top: '5%', bottom: '8%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryData.length > 0 ? industryData.map(d => t(d.icbName as any)) : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: t('unitThousandShares'),
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
        data: industryData.length > 0 ? industryData.map(d => Math.round(d.totalIssuedVolume / 1000)) : [],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        barWidth: '30%'
      },
      {
        name: t('listedVolume'),
        type: 'bar',
        data: industryData.length > 0 ? industryData.map(d => Math.round(d.totalCurrentListedVolume / 1000)) : [],
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
    grid: { left: '3%', right: '8%', top: '5%', bottom: '12%', containLabel: true },
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
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="flex min-w-0 items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-white tracking-tight break-words">{t('marketOverview')}</h1>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-12 gap-3">
        <div className="col-span-12 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} unit={card.unit} />
          ))}
        </div>

        <Card className="col-span-12 p-3 md:p-4 lg:col-span-6 flex flex-col min-h-screen">
          <div className="mb-2 flex min-w-0 flex-col gap-2">
            <div className="min-w-0 text-center">
              <h3 className="text-sm md:text-base font-bold text-blue-600 dark:text-white leading-snug break-words">{topIssuerMetricTitle}</h3>
            </div>
            <div className="flex justify-end">
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
                      ? 'bg-blue-600 text-white'
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
                      ? 'bg-blue-600 text-white'
                      : 'text-text-muted hover:text-text-base'
                  }`}
                >
                  {t('totalIssuedValueTitle')}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            {loadingTopIssuerChart && topIssuerChartData.length === 0 ? (
              <div className="flex h-full min-h-80 items-center justify-center">
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  {t('loading')}
                </div>
              </div>
            ) : (
              <ReactECharts option={topIssuerOptions} style={{ height: '100%', width: '100%' }} />
            )}
          </div>
        </Card>

        <div className="col-span-12 space-y-3 lg:col-span-6 flex flex-col min-h-screen">
          <Card className="p-3 md:p-4 flex flex-col flex-1">
            <div className="mb-2 flex min-w-0 flex-col gap-2">
              <div className="min-w-0 text-center">
                <h3 className="text-sm md:text-base font-bold text-blue-600 dark:text-white leading-snug break-words">{topInterestChartTitle}</h3>
              </div>
              <div className="flex justify-end">
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
                        ? 'bg-blue-600 text-white'
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
                        ? 'bg-blue-600 text-white'
                        : 'text-text-muted hover:text-text-base'
                    }`}
                  >
                    {t('lowest')}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              {loadingTopInterestChart && topInterestChartData.length === 0 ? (
                <div className="flex h-full min-h-80 items-center justify-center">
                  <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                    {t('loading')}
                  </div>
                </div>
              ) : (
                <ReactECharts option={topInterestOptions} style={{ height: '100%', width: '100%' }} />
              )}
            </div>
          </Card>

          <Card className="p-3 md:p-4 flex flex-col flex-1">
            <h3 className="mb-2 text-sm md:text-base font-bold text-blue-600 dark:text-white text-center leading-snug break-words">{t('debtAndLots')}</h3>
            <div className="flex-1 min-w-0 overflow-hidden">
              <ReactECharts option={debtLotsOptions} style={{ height: '100%', width: '100%' }} />
            </div>
          </Card>
        </div>

        <Card className="col-span-12 p-3 md:p-4 flex flex-col min-h-96">
          <div className="mb-2 min-w-0">
            <h3 className="text-sm md:text-base font-bold text-blue-600 dark:text-white text-center leading-snug break-words">{t('valueByIndustry')}</h3>
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <ReactECharts option={industryValueOptions} style={{ height: '500px' }} />
          </div>
        </Card>

        <Card className="col-span-12 p-3 md:p-4 flex flex-col min-h-96">
          <div className="mb-2 min-w-0">
            <h3 className="text-sm md:text-base font-bold text-blue-600 dark:text-white text-center leading-snug break-words">{t('volumeByIndustry')}</h3>
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <ReactECharts option={industryVolumeOptions} style={{ height: '500px' }} />
          </div>
        </Card>

        <Card className="col-span-12 p-3 md:p-4 flex flex-col min-h-96">
          <div className="mb-2 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3 md:items-center">
            <div className="hidden md:block" />
            <div className="min-w-0">
              <h3 className="text-sm md:text-base font-bold text-blue-600 dark:text-white text-center leading-snug break-words">{projectedCashFlowTitle}</h3>
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
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
              <p className="text-xs font-semibold uppercase text-text-muted/80">{t('loadingCashFlow')}</p>
            </div>
          ) : hasProjectedCashFlowData ? (
            <div className="flex-1 min-w-0 overflow-hidden">
              <ReactECharts option={projectedCashFlowOptions} style={{ height: '500px' }} />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm font-medium text-text-muted">{t('noData')}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
