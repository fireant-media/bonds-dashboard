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

import { getFireantToken, cleanTokenString } from '../utils/token';
import { Banknote, BarChart3, Hash, Wallet } from 'lucide-react';
import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';

export default function MarketOverview() {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cachedData = getCache('market_overview');
  const cachedIssuerStats = getCache('top_debt_200');
  const [topDebtData, setTopDebtData] = useState<TopDebtIssuer[]>(cachedData?.topDebtData || []);
  const [issuerStatsData, setIssuerStatsData] = useState<TopDebtIssuer[]>(cachedData?.issuerStatsData || cachedIssuerStats || cachedData?.topDebtData || []);
  const [topInterestData, setTopInterestData] = useState<any[]>(cachedData?.topInterestData || []);
  const [industryData, setIndustryData] = useState<IndustryData[]>(cachedData?.industryData || []);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(getCache('market_projected_cash_flows') || {});
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  // Common styles for consistency
  const chartColors = {
    primary: isDark ? '#3b82f6' : '#2563eb', // blue-500 : blue-600
    secondary: isDark ? '#94a3b8' : '#64748b', // slate-400 : slate-500
  };

  const legendStyle = {
    fontSize: 12,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
  };

  const categoryLabelStyle = {
    fontSize: 12,
    color: isDark ? '#e5e7eb' : '#333',
    fontWeight: 'bold' as const,
    fontFamily: 'Inter',
  };

  const valueLabelStyle = {
    fontSize: 12,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
  };

  const tooltipTextStyle = {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: 'normal' as const,
    color: isDark ? '#e5e7eb' : '#333'
  };

  const chartPalette = ['#4D93F9', '#F56B2D', '#23C68E', '#F55A5A', '#F8B011', '#9974F8', '#F05DA8', '#14C6E4', '#7279F5', '#94D926'];

  const toNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const toBillionVnd = (value: unknown) => {
    const numberValue = toNumber(value);
    if (!numberValue) return 0;
    return Math.abs(numberValue) > 1000000 ? numberValue / 1000000000 : numberValue;
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
      unit: t('bondCodeUnit'),
      icon: Hash
    },
    {
      label: t('totalIssuedVolume'),
      value: formatNumber(marketKpis.issuedVolume, 0),
      unit: t('bondunits'),
      icon: BarChart3
    },
    {
      label: t('totalIssuedValueTitle'),
      value: formatNumber(marketKpis.issuedValue / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: Banknote
    },
    {
      label: t('totalRemainingDebt'),
      value: formatNumber(marketKpis.remainingDebt / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: Wallet
    }
  ];

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
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

        let currentDebt = topDebtData;
        let currentIssuerStats = issuerStatsData;
        let currentInterest = topInterestData;
        let currentIndustry = industryData;

        // Use Promise.all to fetch but handle results individually as they resolve
        const fetchTopDebt = async () => {
          try {
            let data = getCache('top_debt_200');
            if (!data) {
              const res = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=200', { headers });
              if (res.ok) {
                data = await res.json();
                setCache('top_debt_200', data);
              } else if (res.status === 401) throw new Error('401');
            }

            if (isMounted && Array.isArray(data)) {
              const top10 = data.slice(0, 10);
              setIssuerStatsData(data);
              setTopDebtData(top10);
              currentIssuerStats = data;
              currentDebt = top10;
            }
          } catch (e) { console.error('Debt fetch error', e); }
        };

        const fetchHighYield = async () => {
          try {
            const res = await fetch('/api/fireant/bonds/stats/bonds/high-yield?top=10', { headers });
            if (res.ok) {
              const data = await res.json();
              if (isMounted && Array.isArray(data)) {
                setTopInterestData(data);
                currentInterest = data;
              }
            } else if (res.status === 401) throw new Error('401');
          } catch (e) { console.error('Interest fetch error', e); }
        };

        const fetchIndustries = async () => {
          try {
            const res = await fetch('/api/fireant/bonds/stats/industries?top=1000&level=1', { headers });
            if (res.ok) {
              const data = await res.json();
              if (isMounted && Array.isArray(data)) {
                setIndustryData(data);
                currentIndustry = data;
              }
            } else if (res.status === 401) throw new Error('401');
          } catch (e) { console.error('Industry fetch error', e); }
        };

        await Promise.all([fetchTopDebt(), fetchHighYield(), fetchIndustries()]);

        if (!isMounted) return;

        // Final cache update after all are done
        setCache('market_overview', {
          topDebtData: currentDebt,
          issuerStatsData: currentIssuerStats,
          topInterestData: currentInterest,
          industryData: currentIndustry
        });

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
    if (!issuerStatsData.length) return;

    let isMounted = true;

    const fetchProjectedCashFlows = async () => {
      const cached = getCache('market_projected_cash_flows');
      if (cached && Object.keys(cached).length > 0) {
        setProjectedCashFlowBuckets(cached);
        return;
      }

      const token = getFireantToken();
      const cleanToken = token ? cleanTokenString(token) : undefined;
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (cleanToken) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      }

      setLoadingCashFlows(true);

      try {
        const issuerSymbols = Array.from(new Set(issuerStatsData.map(issuer => issuer.issuerSymbol).filter(Boolean)));
        const bondsByCode = new Map<string, any>();
        const issuerChunkSize = 6;

        for (let i = 0; i < issuerSymbols.length; i += issuerChunkSize) {
          if (!isMounted) return;

          const chunk = issuerSymbols.slice(i, i + issuerChunkSize);
          const results = await Promise.allSettled(
            chunk.map(async (symbol) => {
              const response = await fetch(`/api/fireant/bonds/issuer/${encodeURIComponent(symbol)}`, { headers });
              if (!response.ok) return [];
              const data = await response.json();
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

              const cacheKey = `bond_cash_flows_${code}`;
              const cachedCashFlows = getCache(cacheKey);
              if (Array.isArray(cachedCashFlows)) {
                return { bond, cashFlows: cachedCashFlows };
              }

              const detailResponse = await fetch(`/api/fireant/bonds/${encodeURIComponent(code)}`, { headers });
              if (!detailResponse.ok) return { bond, cashFlows: [] };

              const detailData = await detailResponse.json();
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

  const topDebtOptions = {
    color: chartPalette,
    tooltip: { 
      trigger: 'axis', 
      axisPointer: { type: 'shadow' },
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        const symbol = params[0].name;
        const issuer = topDebtData.find(d => d.issuerSymbol === symbol);
        let relVal = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
        for (let i = 0; i < params.length; i++) {
          relVal += `<br/>${params[i].marker}${params[i].seriesName}: ${formatNumber(params[i].value, 0)} ${t('unitBillionVND')}`;
        }
        return relVal;
      }
    },
    legend: { bottom: 5, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
    grid: { left: '3%', right: '8%', top: '5%', bottom: '8%', containLabel: true },
    xAxis: { 
      type: 'value', 
      splitLine: { show: false },
      axisLabel: { 
        ...valueLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    yAxis: { 
      type: 'category',
      data: topDebtData.length > 0 
        ? [...topDebtData].reverse().map(d => d.issuerSymbol) 
        : [],
      axisLabel: categoryLabelStyle
    },
    series: [
      {
        name: t('totalIssuedValueTitle'),
        type: 'bar',
        data: topDebtData.length > 0 
          ? [...topDebtData].reverse().map(d => Math.round(d.totalIssuedValue / 1000000000)) 
          : [],
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        barWidth: '40%'
      },
      {
        name: t('remainingDebtTitle'),
        type: 'bar',
        data: topDebtData.length > 0 
          ? [...topDebtData].reverse().map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
          : [],
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        barWidth: '40%'
      }
    ]
  };

  const topInterestOptions = {
    color: chartPalette,
    tooltip: { 
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
      data: topInterestData.length > 0 
        ? topInterestData.map(d => d.bondCode) 
        : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      axisLabel: { 
        ...valueLabelStyle,
        formatter: '{value}'
      } 
    },
    series: [{
      name: t('interestRate'),
      type: 'bar',
      data: topInterestData.length > 0 
        ? topInterestData.map(d => d.bondRate) 
        : [],
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      barWidth: '50%',
      barGap: 15
    }]
  };

  const debtLotsOptions = {
    color: chartPalette,
    tooltip: { 
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
        nameTextStyle: { ...valueLabelStyle, align: 'right', padding: [0, 0, 0, 40] },
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
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-text-muted font-medium">{t('loadingMarketData')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
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
    <div className="space-y-2 transition-colors duration-300">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-text-base tracking-tight">{t('marketOverview')}</h1>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <p className="text-xs font-semibold uppercase text-text-muted/80">{card.label}</p>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-text-base">{card.value}</p>
                      <p className="text-xs font-medium text-text-muted mt-1">{card.unit}</p>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Top 10 Debt - Double Height */}
        <div 
          className="col-span-12 lg:col-span-6 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-semibold text-text-base/80 text-center">{t('top10Debt')}</h3>
            <p className="text-xs font-normal text-text-muted/80 text-right mt-1 tracking-wider">Đơn vị: Tỷ VNĐ</p>
          </div>
          <ReactECharts option={topDebtOptions} style={{ height: '500px' }} />
        </div>

        <div className="col-span-12 lg:col-span-6 space-y-2">
          {/* Top 10 Interest Rates */}
          <div 
            className="bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
          >
            <div className="mb-2">
              <h3 className="text-base font-semibold text-text-base/80 text-center">{t('top10Interest')}</h3>
              <p className="text-xs font-normal text-text-muted/80 text-right mt-1 tracking-wider">Đơn vị: %</p>
            </div>
            <ReactECharts option={topInterestOptions} style={{ height: '250px' }} />
          </div>

          {/* Debt & Lots Relationship */}
          <div 
            className="bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
          >
            <h3 className="text-base font-semibold text-text-base/80 text-center mb-2">{t('debtAndLots')}</h3>
            <ReactECharts option={debtLotsOptions} style={{ height: '250px' }} />
          </div>
        </div>

        {/* Industry Value - Full Width */}
        <div 
          className="col-span-12 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-semibold text-text-base/80 text-center">{t('valueByIndustry')}</h3>
            <p className="text-xs font-normal text-text-muted/80 text-right mt-1 tracking-wider">Đơn vị: Tỷ USD</p>
          </div>
          <ReactECharts option={industryValueOptions} style={{ height: '350px' }} />
        </div>

        {/* Industry Volume - Full Width */}
        <div 
          className="col-span-12 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-semibold text-text-base/80 text-center">{t('volumeByIndustry')}</h3>
            <p className="text-xs font-normal text-text-muted/80 text-right mt-1 tracking-wider">Đơn vị: Nghìn trái phiếu</p>
          </div>
          <ReactECharts option={industryVolumeOptions} style={{ height: '350px' }} />
        </div>

        {/* Projected Cash Flow - Full Width */}
        <div 
          className="col-span-12 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="hidden md:block w-32"></div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-text-base/80">{t('expectedCashFlow')}</h3>
              <p className="text-xs font-normal text-text-muted/80 mt-1 tracking-wider">Đơn vị: Tỷ VNĐ</p>
            </div>
            <div className="flex w-full md:w-32 items-center justify-center md:justify-end">
              <div className="flex rounded-lg border border-border-base bg-bg-base p-1">
                {(['month', 'year'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setCashFlowPeriod(period)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
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
          <div className="min-h-96">
            {loadingCashFlows && !hasProjectedCashFlowData ? (
              <div className="h-96 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <p className="text-xs font-semibold uppercase text-text-muted/80">{t('loadingCashFlow')}</p>
              </div>
            ) : hasProjectedCashFlowData ? (
              <ReactECharts option={projectedCashFlowOptions} style={{ height: '400px' }} />
            ) : (
              <div className="h-96 flex items-center justify-center">
                <p className="text-sm font-medium text-text-muted">{t('noData')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
