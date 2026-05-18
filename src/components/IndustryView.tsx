import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { IndustryType } from '../types';
import { TrendingUp, Activity, PieChart, BarChart3, Info } from 'lucide-react';
import { formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';

interface IndustryViewProps {
  industry: IndustryType;
}

import { getFireantToken, cleanTokenString } from '../utils/token';
import { Settings } from 'lucide-react';
import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { CHART_PALETTE, getChartTooltip } from '../utils/chart';
import { buildFireantUrl, fireantApi } from '../api/fireant';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

export default function IndustryView({ industry }: IndustryViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cacheKey = `industry_stats_${industry}`;
  const cachedData = getCache(cacheKey);
  const [industryStats, setIndustryStats] = useState<any>(cachedData?.industryStats || null);
  const [rankingData, setRankingData] = useState<any[]>(cachedData?.rankingData || []);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(
    getCache(`industry_projected_cash_flows_${industry}`) || {}
  );
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  const industryConfig = useMemo(() => {
    let statsUrl = buildFireantUrl('bonds/stats/industries', { top: 10, level: 2 });
    let targetName = 'Ngân hàng';
    let icbCode = '3010';

    if (industry === 'Securities') {
      statsUrl = buildFireantUrl('bonds/stats/industries', { top: 20, level: 4 });
      targetName = 'Công ty chứng khoán';
      icbCode = '30202005';
    } else if (industry === 'RealEstate') {
      statsUrl = buildFireantUrl('bonds/stats/industries', { top: 10, level: 2 });
      targetName = 'Bất động sản';
      icbCode = '3510';
    }

    return { statsUrl, targetName, icbCode };
  }, [industry]);

  useEffect(() => {
    setCashFlowPeriod('year');
    setProjectedCashFlowBuckets(getCache(`industry_projected_cash_flows_${industry}`) || {});
    setLoadingCashFlows(false);
  }, [industry]);

  useEffect(() => {
    let isMounted = true;
    const fetchAllData = async () => {
      if (!cachedData) {
        setLoading(true);
      }
      setError(null);
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;
        const headers: any = {
          'Accept': 'application/json'
        };
        if (cleanToken) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }

        // Fetch Industry Stats
        const statsUrl = industryConfig.statsUrl;
        const targetName = industryConfig.targetName;
        const icbCode = industryConfig.icbCode;

        let newStats = industryStats;
        let newRanking = rankingData;

        // Fetch each part independently for better responsiveness
        const fetchStats = async () => {
          try {
            const res = await fetch(statsUrl, { cache: 'no-store', headers });
            if (res.ok) {
              const data = await res.json();
              const stats = data.find((item: any) => item.icbName === targetName) || null;
              if (isMounted && stats) {
                setIndustryStats(stats);
                newStats = stats;
              }
            } else if (res.status === 401) throw new Error('401');
          } catch (e) { console.error('Stats fetch error', e); }
        };

        const fetchRanking = async () => {
          try {
            // Re-use common debt cache if available
            let topDebt = getCache('top_debt_200');
            if (!topDebt) {
              const topDebtRes = await fetch(buildFireantUrl('bonds/stats/issuers/top-debt', { top: 200 }), { cache: 'no-store', headers });
              if (topDebtRes.ok) {
                topDebt = await topDebtRes.json();
                setCache('top_debt_200', topDebt);
              } else if (topDebtRes.status === 401) throw new Error('401');
            }

            const symbolsRes = await fetch(buildFireantUrl(`icb/${icbCode}/symbols`), { cache: 'no-store', headers });
            if (symbolsRes.ok && topDebt) {
              const symbols = await symbolsRes.json();
              const ranking = topDebt
                .filter((item: any) => symbols.includes(item.issuerSymbol))
                .sort((a: any, b: any) => b.totalRemainingDebt - a.totalRemainingDebt);
              
              if (isMounted) {
                setRankingData(ranking);
                newRanking = ranking;
              }
            } else if (symbolsRes.status === 401) throw new Error('401');
          } catch (e) { console.error('Ranking fetch error', e); }
        };

        await Promise.all([fetchStats(), fetchRanking()]);

        if (!isMounted) return;

        // Cache industry specific results
        setCache(cacheKey, {
          industryStats: newStats,
          rankingData: newRanking
        });

      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching industry data:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('error'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAllData();
    return () => { isMounted = false; };
  }, [industry, industryConfig]);

  useEffect(() => {
    let isMounted = true;

    const fetchProjectedCashFlows = async () => {
      const cashFlowCacheKey = `industry_projected_cash_flows_${industry}`;
      const cached = getCache(cashFlowCacheKey);
      if (cached && Object.keys(cached).length > 0) {
        setProjectedCashFlowBuckets(cached);
        return;
      }

      setLoadingCashFlows(true);

      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;
        const headers: any = {
          Accept: 'application/json',
        };
        if (cleanToken) {
          headers.Authorization = `Bearer ${cleanToken}`;
        }

        const symbolsRes = await fetch(buildFireantUrl(`icb/${industryConfig.icbCode}/symbols`), {
          cache: 'no-store',
          headers,
        });

        if (!symbolsRes.ok) {
          if (symbolsRes.status === 401) throw new Error('401');
          return;
        }

        const symbolsRaw = await symbolsRes.json();
        const issuerSymbols = Array.from(new Set((Array.isArray(symbolsRaw) ? symbolsRaw : []).filter(Boolean)));
        const bondsByCode = new Map<string, any>();
        const issuerChunkSize = 6;

        for (let i = 0; i < issuerSymbols.length; i += issuerChunkSize) {
          if (!isMounted) return;

          const chunk = issuerSymbols.slice(i, i + issuerChunkSize);
          const results = await Promise.allSettled(
            chunk.map(async (symbol) => {
              const data = await fireantApi.getIssuerBonds(symbol);
              return Array.isArray(data) ? data : [];
            })
          );

          results.forEach((result) => {
            if (result.status !== 'fulfilled') return;
            result.value.forEach((bond: any) => {
              const code = bond.bondCode || bond.code;
              if (code) bondsByCode.set(String(code), bond);
            });
          });
        }

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
        const bondChunkSize = 10;

        for (let i = 0; i < bonds.length; i += bondChunkSize) {
          if (!isMounted) return;

          const chunk = bonds.slice(i, i + bondChunkSize);
          const results = await Promise.allSettled(
            chunk.map(async (bond) => {
              const code = bond.bondCode || bond.code;
              if (!code) return { bond, cashFlows: [] };

              const bondCacheKey = `bond_cash_flows_${code}`;
              const cachedCashFlows = getCache(bondCacheKey);
              if (Array.isArray(cachedCashFlows)) {
                return { bond, cashFlows: cachedCashFlows };
              }

              const detailData = await fireantApi.getBond(code);
              const cashFlows = Array.isArray(detailData.cashFlows)
                ? detailData.cashFlows.map((cashFlow: any) => ({
                    paymentDate: cashFlow.paymentDate,
                    interestAmount: toBillionVnd(cashFlow.interestAmount),
                    principalAmount: toBillionVnd(cashFlow.principalAmount),
                  }))
                : [];

              setCache(bondCacheKey, cashFlows);
              return { bond, cashFlows };
            })
          );

          results.forEach((result) => {
            if (result.status !== 'fulfilled') return;

            const cashFlows = result.value.cashFlows;
            if (cashFlows.length > 0) {
              addCashFlows(cashFlows);
              return;
            }

            const bond = result.value.bond;
            const fallbackDate = bond.maturityDate || bond.paymentDate;
            const fallbackPrincipal = bond.currentListedValue || bond.totalRemainingDebt || bond.totalIssuedValue;
            if (!fallbackDate || !fallbackPrincipal) return;

            const bucket = ensureBucket(fallbackDate);
            if (bucket) bucket.principal += toBillionVnd(fallbackPrincipal);
          });

          if (isMounted) {
            const partialBuckets = Object.fromEntries(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
            setProjectedCashFlowBuckets(partialBuckets);
          }
        }

        if (!isMounted) return;

        const finalBuckets = Object.fromEntries(Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)));
        setProjectedCashFlowBuckets(finalBuckets);
        setCache(cashFlowCacheKey, finalBuckets);
      } catch (error) {
        console.error('Industry projected cash flow fetch error', error);
      } finally {
        if (isMounted) setLoadingCashFlows(false);
      }
    };

    fetchProjectedCashFlows();

    return () => {
      isMounted = false;
    };
  }, [industry, industryConfig]);

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  const getIndustryLabel = (ind: string) => {
    // Basic translations for the three main tabs
    if (ind === 'Banking') return t('Banking');
    if (ind === 'Securities') return t('Securities');
    if (ind === 'RealEstate') return t('RealEstate');
    
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

  const toNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const toBillionVnd = (value: unknown) => {
    const numberValue = toNumber(value);
    if (!numberValue) return 0;
    return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
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
        barWidth: '60%'
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
        barWidth: '40%',
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
    <div className="space-y-4 transition-colors duration-300">
      <div>
        <h1 className="text-2xl font-bold text-blue-600 dark:text-white tracking-tight transition-colors">{t('marketTitle')} {getIndustryLabel(industry)}</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          className="col-span-12 lg:col-span-6 bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors flex flex-col"
        >
          <div className="mb-3">
            <h3 className="text-base font-semibold text-blue-600 dark:text-white text-center transition-colors">{t('debtRanking')}</h3>
          </div>
          <ReactECharts option={rankingOptions} style={{ height: '570px' }} />
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col gap-3 h-full">
          {/* Market Share */}
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors flex flex-col flex-1 min-h-0"
          >
          <div className="mb-3">
            <h3 className="text-base font-semibold text-blue-600 dark:text-white text-center transition-colors">{t('marketShare')}</h3>
          </div>
            <ReactECharts option={marketShareOptions} className="flex-1 min-h-0" style={{ height: '100%', minHeight: '250px' }} />
          </div>

          {/* Interest Rates */}
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors flex flex-col flex-1 min-h-0"
          >
          <div className="mb-3">
            <h3 className="text-base font-semibold text-blue-600 dark:text-white text-center transition-colors">{t('industryInterest')}</h3>
          </div>
            <ReactECharts option={interestOptions} className="flex-1 min-h-0" style={{ height: '100%', minHeight: '200px' }} />
          </div>
        </div>

        {/* Combined Chart */}
        <div 
          className="col-span-12 bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors"
        >
          <div className="mb-2">
            <h3 className="text-base font-semibold text-blue-600 dark:text-white text-center transition-colors">{t('debtAndLotsEnterprise')}</h3>
          </div>
          <ReactECharts option={combinedOptions} style={{ height: '400px' }} />
        </div>

        <div className="col-span-12 bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors">
          <div className="mb-2 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3 md:items-center">
            <div className="hidden md:block" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-blue-600 dark:text-white text-center transition-colors">{projectedCashFlowTitle}</h3>
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
            <ReactECharts option={projectedCashFlowOptions} style={{ height: '420px' }} />
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
