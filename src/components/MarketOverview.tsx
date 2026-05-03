import ReactECharts from 'echarts-for-react';
import { useState, useEffect } from 'react';
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

import { getFireantToken, cleanTokenString } from '../utils/token';
import { Settings } from 'lucide-react';
import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';

export default function MarketOverview() {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cachedData = getCache('market_overview');
  const [topDebtData, setTopDebtData] = useState<TopDebtIssuer[]>(cachedData?.topDebtData || []);
  const [topInterestData, setTopInterestData] = useState<any[]>(cachedData?.topInterestData || []);
  const [industryData, setIndustryData] = useState<IndustryData[]>(cachedData?.industryData || []);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  // Common styles for consistency
  const chartColors = {
    primary: isDark ? '#5c6bc0' : '#3634B3',
    secondary: isDark ? '#ff8a65' : '#ff7043',
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
        let currentInterest = topInterestData;
        let currentIndustry = industryData;

        // Use Promise.all to fetch but handle results individually as they resolve
        const fetchTopDebt = async () => {
          try {
            const res = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=10', { headers });
            if (res.ok) {
              const data = await res.json();
              if (isMounted && Array.isArray(data)) {
                setTopDebtData(data);
                currentDebt = data;
              }
            } else if (res.status === 401) throw new Error('401');
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
            const res = await fetch('/api/fireant/bonds/stats/industries?top=100&level=1', { headers });
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

  const topDebtOptions = {
    tooltip: { 
      trigger: 'axis', 
      axisPointer: { type: 'shadow' },
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
        itemStyle: { color: chartColors.primary, borderRadius: [0, 4, 4, 0] },
        barWidth: '40%'
      },
      {
        name: t('remainingDebtTitle'),
        type: 'bar',
        data: topDebtData.length > 0 
          ? [...topDebtData].reverse().map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
          : [],
        itemStyle: { color: chartColors.secondary, borderRadius: [0, 4, 4, 0] },
        barWidth: '40%'
      }
    ]
  };

  const topInterestOptions = {
    tooltip: { 
      trigger: 'axis',
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
      itemStyle: { color: chartColors.primary, borderRadius: [4, 4, 0, 0] },
      barWidth: '50%',
      barGap: 15
    }]
  };

  const debtLotsOptions = {
    tooltip: { 
      trigger: 'axis',
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
        itemStyle: { color: chartColors.primary },
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
        itemStyle: { color: chartColors.secondary },
        symbol: 'circle',
        symbolSize: 6
      }
    ]
  };

  const industryValueOptions = {
    tooltip: { 
      trigger: 'axis',
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
        itemStyle: { color: chartColors.primary } 
      },
      { 
        name: t('remainingDebtTitle'), 
        type: 'bar', 
        data: industryData.length > 0 
          ? industryData.map(d => Math.round(d.totalRemainingDebt / 1000000000)) 
          : [], 
        itemStyle: { color: chartColors.secondary } 
      }
    ]
  };

  const industryVolumeOptions = {
    tooltip: { 
      trigger: 'axis',
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
        itemStyle: { color: chartColors.primary, borderRadius: [4, 4, 0, 0] },
        barWidth: '30%'
      },
      {
        name: t('listedVolume'),
        type: 'bar',
        data: industryData.length > 0 ? industryData.map(d => Math.round(d.totalCurrentListedVolume / 1000)) : [],
        itemStyle: { color: chartColors.secondary, borderRadius: [4, 4, 0, 0] },
        barWidth: '30%'
      }
    ]
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3634B3]"></div>
        <p className="text-gray-500 font-medium">{t('loadingMarketData')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
        <div className="bg-red-50 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('failedToLoadData')}</h3>
        <p className="text-gray-500 max-w-md">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#3634B3] text-white rounded-xl font-bold hover:opacity-90 transition-colors"
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
          <h2 className="text-2xl font-bold text-text-base tracking-tight">{t('marketOverview')}</h2>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Top 10 Debt - Double Height */}
        <div 
          className="col-span-12 lg:col-span-6 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-bold text-text-base text-center">{t('top10Debt')}</h3>
            <p className="text-[10px] text-text-muted text-right mt-1">{t('unitBillion')}</p>
          </div>
          <ReactECharts option={topDebtOptions} style={{ height: '500px' }} />
        </div>

        <div className="col-span-12 lg:col-span-6 space-y-2">
          {/* Top 10 Interest Rates */}
          <div 
            className="bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
          >
            <div className="mb-2">
              <h3 className="text-base font-bold text-text-base text-center">{t('top10Interest')}</h3>
              <p className="text-[10px] text-text-muted text-right mt-1">{t('unitPercent')}</p>
            </div>
            <ReactECharts option={topInterestOptions} style={{ height: '250px' }} />
          </div>

          {/* Debt & Lots Relationship */}
          <div 
            className="bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
          >
            <h3 className="text-base font-bold text-text-base text-center mb-2">{t('debtAndLots')}</h3>
            <ReactECharts option={debtLotsOptions} style={{ height: '250px' }} />
          </div>
        </div>

        {/* Industry Value - Full Width */}
        <div 
          className="col-span-12 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-bold text-text-base text-center">{t('valueByIndustry')}</h3>
            <p className="text-[10px] text-text-muted text-right mt-1">{t('unitBillion')}</p>
          </div>
          <ReactECharts option={industryValueOptions} style={{ height: '350px' }} />
        </div>

        {/* Industry Volume - Full Width */}
        <div 
          className="col-span-12 bg-bg-surface p-2 rounded-2xl border border-border-base shadow-sm"
        >
          <div className="mb-2">
            <h3 className="text-base font-bold text-text-base text-center">{t('volumeByIndustry')}</h3>
            <p className="text-[10px] text-text-muted text-right mt-1">{t('unitThousand')}</p>
          </div>
          <ReactECharts option={industryVolumeOptions} style={{ height: '350px' }} />
        </div>
      </div>
    </div>
  );
}
