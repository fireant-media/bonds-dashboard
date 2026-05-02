import { useState, useEffect } from 'react';
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

export default function IndustryView({ industry }: IndustryViewProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cacheKey = `industry_stats_${industry}`;
  const cachedData = getCache(cacheKey);
  const [industryStats, setIndustryStats] = useState<any>(cachedData?.industryStats || null);
  const [rankingData, setRankingData] = useState<any[]>(cachedData?.rankingData || []);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

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
        let statsUrl = '/api/fireant/bonds/stats/industries?top=10&level=2';
        let targetName = 'Ngân hàng';
        
        if (industry === 'Securities') {
          statsUrl = '/api/fireant/bonds/stats/industries?top=20&level=4';
          targetName = 'Công ty chứng khoán';
        } else if (industry === 'RealEstate') {
          statsUrl = '/api/fireant/bonds/stats/industries?top=10&level=2';
          targetName = 'Bất động sản';
        }

        let icbCode = '3010';
        if (industry === 'Securities') icbCode = '30202005';
        else if (industry === 'RealEstate') icbCode = '3510';

        let newStats = industryStats;
        let newRanking = rankingData;

        // Fetch each part independently for better responsiveness
        const fetchStats = async () => {
          try {
            const res = await fetch(statsUrl, { headers });
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
              const topDebtRes = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=200', { headers });
              if (topDebtRes.ok) {
                topDebt = await topDebtRes.json();
                setCache('top_debt_200', topDebt);
              } else if (topDebtRes.status === 401) throw new Error('401');
            }

            const symbolsRes = await fetch(`/api/fireant/icb/${icbCode}/symbols`, { headers });
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
  }, [industry]);

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

  const getKpis = () => {
    if (industryStats) {
      return [
        { 
          label: t('issuedVolumeTitle'), 
          value: formatNumber(Math.round(industryStats.totalIssuedVolume / 1000000), 0), 
          unit: t('unitMillionShares') 
        },
        { 
          label: t('totalIssuedValueTitle'), 
          value: formatNumber(Math.round(industryStats.totalIssuedValue / 1000000000), 0), 
          unit: t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '') 
        },
        { 
          label: t('initialDebtFull'), 
          value: formatNumber(Math.round(industryStats.totalDebtFull / 1000000000), 0), 
          unit: t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '') 
        },
        { 
          label: t('listedVolume'), 
          value: formatNumber(Math.round(industryStats.totalCurrentListedVolume / 1000000), 0), 
          unit: t('unitMillionShares') 
        },
        { 
          label: t('listedValueTitle'), 
          value: formatNumber(Math.round(industryStats.totalCurrentListedValue / 1000000000), 0), 
          unit: t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '') 
        },
        { 
          label: t('remainingDebtTitle'), 
          value: formatNumber(Math.round(industryStats.totalRemainingDebt / 1000000000), 0), 
          unit: t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '') 
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
      tooltip: { 
        trigger: 'axis',
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
        name: `${t('remainingDebtTitle')} (${t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '')})`,
        type: 'bar',
        data: displayData.map(d => Math.round(d.totalRemainingDebt / 1000000000)),
        itemStyle: { color: chartColors.primary, borderRadius: [0, 4, 4, 0] },
        barWidth: '60%'
      }]
    };
  };

  const rankingOptions = getRankingOptions();

  const getMarketShareOptions = () => {
    const hasData = rankingData.length > 0;
    let chartData = [];

    if (hasData) {
      const totalDebt = rankingData.reduce((sum, item) => sum + item.totalRemainingDebt, 0);
      const top9 = rankingData.slice(0, 9);
      const top9Debt = top9.reduce((sum, item) => sum + item.totalRemainingDebt, 0);
      const othersDebt = totalDebt - top9Debt;

      const colors = isDark 
        ? [
          '#5c6bc0', '#7986cb', '#9fa8da', '#c5cae9', '#e8eaf6',
          '#3949ab', '#303f9f', '#283593', '#3634B3', '#0d134d'
        ]
        : [
          '#3634B3', '#283593', '#303f9f', '#3949ab', '#3f51b5', 
          '#5c6bc0', '#7986cb', '#9fa8da', '#c5cae9', '#e8eaf6'
        ];
      
      chartData = top9.map((item, idx) => {
        return {
          value: item.totalRemainingDebt,
          name: item.issuerSymbol,
          itemStyle: { color: colors[idx] }
        };
      });

      if (othersDebt > 0) {
        chartData.push({
          value: othersDebt,
          name: t('others'),
          itemStyle: { color: colors[9] }
        });
      }
    }

    return {
      tooltip: { 
        trigger: 'item',
        formatter: (params: any) => {
          const symbol = params.name;
          const issuer = rankingData.find(d => d.issuerSymbol === symbol);
          const displayName = (symbol === t('others')) ? t('others') : (issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol);
          return `${displayName}<br/>${t('marketShare')}: ${params.percent}%<br/>${t('remainingDebtTitle')}: ${formatNumber(Math.round(params.value / 1000000000), 0)} ${t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '')}`;
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
      tooltip: { 
        trigger: 'axis',
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
        axisLabel: valueLabelStyle 
      },
      series: [{
        name: `${t('interestRate')} (%)`,
        type: 'bar',
        barWidth: '40%',
        data: data.map(d => d.value),
        itemStyle: { 
          color: chartColors.primary,
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
      tooltip: { 
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const symbol = params[0].name;
          const issuer = rankingData.find(d => d.issuerSymbol === symbol);
          let res = issuer ? t(issuer.issuerName as any, issuer.issuerSymbol) : symbol;
          params.forEach((p: any) => {
            res += `<br/>${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)}${p.seriesName === t('remainingDebtTitle') ? ' ' + t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', '') : ''}`;
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
          name: t('unitBillion').replace('Đơn vị: ', '').replace('Unit: ', ''), 
          splitLine: { show: false },
          nameTextStyle: { ...valueLabelStyle, align: 'right', padding: [0, 0, 0, 40] },
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
          itemStyle: { color: chartColors.primary } 
        },
        { 
          name: t('bondLotsTitle'), 
          type: 'line', 
          yAxisIndex: 1, 
          data: displayData.map(d => d.bondCount), 
          itemStyle: { color: chartColors.secondary },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    };
  };

  const combinedOptions = getCombinedOptions();

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3634B3]"></div>
        <p className="text-text-muted font-medium">{t('loadingIndustryData')} {getIndustryLabel(industry)}...</p>
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
        <h3 className="text-xl font-bold dark:text-white text-gray-900">{t('failedToLoadData')}</h3>
        <p className="text-text-muted max-w-md">{error}</p>
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
    <div className="space-y-6 transition-colors duration-300">
      <div>
        <h2 className="text-2xl font-bold text-text-base tracking-tight transition-colors">{t('marketTitle')} {getIndustryLabel(industry)}</h2>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-bg-surface p-5 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-[140px]">
            <p className="text-base font-bold text-text-muted mb-2">{kpi.label}</p>
            <p className="text-3xl font-bold text-text-base mb-1 transition-colors">{kpi.value}</p>
            <p className="text-sm font-bold text-gray-400">{kpi.unit}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Ranking - Double Height */}
        <div 
          className="col-span-12 lg:col-span-6 bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm transition-colors"
        >
          <div className="mb-6">
            <h3 className="text-base font-bold text-text-base text-center transition-colors">{t('debtRanking')}</h3>
            <p className="text-[10px] text-text-muted text-right mt-1">{t('unitBillion')}</p>
          </div>
          <ReactECharts option={rankingOptions} style={{ height: '570px' }} />
        </div>

        <div className="col-span-12 lg:col-span-6 space-y-2">
          {/* Market Share */}
          <div 
            className="bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <div className="mb-6">
              <h3 className="text-base font-bold text-text-base text-center transition-colors">{t('marketShare')}</h3>
              <p className="text-[10px] text-text-muted text-right mt-1">{t('unitPercent')}</p>
            </div>
            <ReactECharts option={marketShareOptions} style={{ height: '250px' }} />
          </div>

          {/* Interest Rates */}
          <div 
            className="bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <div className="mb-6">
              <h3 className="text-base font-bold text-text-base text-center transition-colors">{t('industryInterest')}</h3>
              <p className="text-[10px] text-text-muted text-right mt-1">{t('unitPercent')}</p>
            </div>
            <ReactECharts option={interestOptions} style={{ height: '200px' }} />
          </div>
        </div>

        {/* Combined Chart */}
        <div 
          className="col-span-12 bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm transition-colors"
        >
          <div className="mb-2">
            <h3 className="text-base font-bold text-text-base text-center transition-colors">{t('debtAndLotsEnterprise')}</h3>
          </div>
          <ReactECharts option={combinedOptions} style={{ height: '400px' }} />
        </div>
      </div>
    </div>
  );
}
