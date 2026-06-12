import ChartWithToolbar from './ChartWithToolbar';
import AIInsightPanel from './AIInsightPanel';
import ReactECharts from 'echarts-for-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { BadgeDollarSign, BarChart3, Boxes, Download, Hash, Landmark, LineChart, Maximize2, RotateCcw, TableProperties, Wallet, X } from 'lucide-react';
import { ChartDataViewModal, type ChartDataTableColumn } from './ui/ChartDataViewModal';

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
import { Card, MetricCard, MetricCardSkeleton, SectionCardSkeleton } from './ui/Card';
import { CHART_PALETTE, applyChartTheme, downloadChartImage, getComparisonAreaSeriesStyle, getChartTheme, getChartTooltip, highlightChartTooltipValue } from '../utils/chart';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { loadBondDetail, loadIssuerBondsByFilter } from '../services/bondData';
import {
  MARKET_OVERVIEW_CACHE_KEY,
  MARKET_OVERVIEW_INDUSTRY_DATA_CACHE_KEY,
  MARKET_OVERVIEW_ISSUER_STATS_CACHE_KEY,
  MARKET_OVERVIEW_TOP_INTEREST_CACHE_KEY,
  type IndustryData,
  type TopDebtIssuer,
} from '../services/marketOverviewData';
import { loadIssuerStatsSummary } from '../services/industryBondData';
import {
  useMarketOverviewIndustryDataQuery,
  useMarketOverviewIssuerStatsQuery,
  useMarketOverviewTopInterestQuery,
} from '../query/dashboardQueries';
import { useVisibleOnce } from '../hooks/useVisibleOnce';

const TOP_INTEREST_CHART_LIMIT = 10;

const roundMetric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

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
  const [topInterestMetric, setTopInterestMetric] = useState<'highest' | 'lowest'>('highest');
  const [loadingTopInterestChart, setLoadingTopInterestChart] = useState(false);
  const [industryData, setIndustryData] = useState<IndustryData[]>(
    (Array.isArray(cachedIndustryData) ? cachedIndustryData : cachedData?.industryData || [])
  );
  const [topIssuerMetric, setTopIssuerMetric] = useState<'remainingDebt' | 'issuedValue'>('remainingDebt');
  const [loadingTopIssuerChart, setLoadingTopIssuerChart] = useState(false);
  const [showTopIssuerDataView, setShowTopIssuerDataView] = useState(false);
  const [showTopIssuerDataViewBackButton, setShowTopIssuerDataViewBackButton] = useState(false);
  const [showTopIssuerZoom, setShowTopIssuerZoom] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [projectedCashFlowBuckets, setProjectedCashFlowBuckets] = useState<Record<string, ProjectedCashFlowBucket>>(cachedProjectedCashFlows);
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const topIssuerChartRef = useRef<any>(null);
  const { ref: projectedCashFlowSectionRef, isVisible: projectedCashFlowSectionVisible } = useVisibleOnce<HTMLDivElement>();

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
  const bondVolumeUnitLabel = t('unitMillionShares');

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

    return sorted.slice(0, TOP_INTEREST_CHART_LIMIT);
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

  const kpiCards = [
    {
      label: t('totalBondCodes'),
      value: formatNumber(marketKpis.bondCount, 0),
      unit: t('bondCodeUnit'),
      icon: Hash,
    },
    {
      label: t('totalIssuedVolume'),
      value: formatNumber(marketKpis.issuedVolume / 1_000_000, 2),
      unit: t('unitMillionShares'),
      icon: Boxes,
    },
    {
      label: t('totalIssuedValueTitle'),
      value: formatNumber(marketKpis.issuedValue / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: BadgeDollarSign,
    },
    {
      label: t('totalRemainingDebt'),
      value: formatNumber(marketKpis.remainingDebt / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: Wallet,
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
    () => getTopIssuerChartData(deferredIssuerStatsData, 'remainingDebt'),
    [deferredIssuerStatsData]
  );

  const topIssuerDisplayData = useMemo(
    () => getTopIssuerChartData(deferredIssuerStatsData, topIssuerMetric),
    [deferredIssuerStatsData, topIssuerMetric]
  );

  const topInterestChartData = useMemo(
    () => getTopInterestChartData(deferredTopInterestData as TopInterestBond[], topInterestMetric),
    [deferredTopInterestData, topInterestMetric]
  );
  const marketInsightTitle = language === 'vi'
    ? 'Nhận định tổng quan thị trường trái phiếu'
    : 'Bond market overview insight';
  const marketInsightPayload = useMemo(() => ({
    kpis: {
      bondCount: marketKpis.bondCount,
      issuedVolumeMillion: roundMetric(marketKpis.issuedVolume / 1_000_000),
      issuedValueBillion: roundMetric(marketKpis.issuedValue / 1_000_000_000),
      remainingDebtBillion: roundMetric(marketKpis.remainingDebt / 1_000_000_000),
    },
    topIssuersByRemainingDebt: topDebtData.slice(0, 6).map((issuer) => ({
      issuerSymbol: issuer.issuerSymbol || '',
      issuerName: issuer.issuerName || '',
      remainingDebtBillion: roundMetric(issuer.totalRemainingDebt / 1_000_000_000),
      issuedValueBillion: roundMetric(issuer.totalIssuedValue / 1_000_000_000),
      bondCount: issuer.bondCount,
    })),
    topBondRates: topInterestChartData.slice(0, 6).map((bond) => ({
      bondCode: bond.bondCode,
      bondRate: roundMetric(bond.bondRate),
    })),
  }), [marketKpis, topDebtData, topInterestChartData]);
  const marketFlowInsightTitle = language === 'vi'
    ? 'Nhận xét dòng tiền và cơ cấu theo ngành'
    : 'Industry structure and cash flow insight';
  const marketFlowInsightPayload = useMemo(() => ({
    valueByIndustry: [...deferredIndustryData]
      .sort((left, right) => toNumber(right.totalCurrentListedValue) - toNumber(left.totalCurrentListedValue))
      .slice(0, 8)
      .map((industry) => ({
        industry: t(industry.icbName as any),
        listedValueBillion: roundMetric(toNumber(industry.totalCurrentListedValue) / 1_000_000_000),
        remainingDebtBillion: roundMetric(toNumber(industry.totalRemainingDebt) / 1_000_000_000),
      })),
    volumeByIndustry: [...deferredIndustryData]
      .sort((left, right) => toNumber(right.totalIssuedVolume) - toNumber(left.totalIssuedVolume))
      .slice(0, 8)
      .map((industry) => ({
        industry: t(industry.icbName as any),
        issuedVolumeMillion: roundMetric(toNumber(industry.totalIssuedVolume) / 1_000_000),
        listedVolumeMillion: roundMetric(toNumber(industry.totalCurrentListedVolume) / 1_000_000),
      })),
    projectedCashFlows: projectedCashFlowData.labels.map((label, index) => ({
      period: label,
      interestBillion: roundMetric(projectedCashFlowData.interest[index] || 0),
      principalBillion: roundMetric(projectedCashFlowData.principal[index] || 0),
      totalBillion: roundMetric(projectedCashFlowData.total[index] || 0),
    })),
  }), [deferredIndustryData, projectedCashFlowData, t]);

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
            content += `<br/>${param.marker}${param.seriesName}: ${highlightChartTooltipValue(formatNumber(param.value, 0), unit)}`;
          });
          return content;
        }
      },
      legend: { bottom: 5, itemWidth: 10, itemHeight: 10, textStyle: legendStyle },
      grid: { left: '6%', right: '14%', top: '4%', bottom: '12%', containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { show: false },
        name: t('unitBillionVND'),
        nameGap: 12,
        nameTextStyle: chartTitleStyle,
        axisLabel: {
          ...valueLabelStyle,
          margin: 12,
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
    __dataView: {
      categoryLabel: t('bondCode'),
      categoryAlign: 'center',
    },
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        return `${params[0].name}<br/>${params[0].marker}${params[0].seriesName}: ${highlightChartTooltipValue(formatInterestRate(params[0].value), '%')}`;
      }
    },
    grid: { left: '5%', right: '8%', top: '14%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: topInterestChartData.length > 0 
        ? topInterestChartData.map(d => d.bondCode) 
        : [], 
      axisLabel: {
        ...categoryLabelStyle,
        rotate: 45,
      }
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

  const industryValueOptions = {
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
          res += `<br/>${p.marker}${p.seriesName}: ${highlightChartTooltipValue(formatNumber(p.value, 0), ` ${t('unitBillionVND')}`)}`;
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
    grid: { left: '3%', right: '8%', top: '12%', bottom: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryData.length > 0 ? industryData.map(d => t(d.icbName as any)) : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: false },
      name: bondVolumeUnitLabel,
      nameGap: 28,
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
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          barWidth: '30%'
        },
        {
          name: t('listedVolume'),
          type: 'bar',
          data: industryData.length > 0 ? industryData.map((d) => d.totalCurrentListedVolume / 1_000_000) : [],
          itemStyle: { borderRadius: [4, 4, 0, 0] },
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
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { top: '12%', bottom: '28%', left: '10%', right: '8%' },
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

  const handleTopIssuerDownload = async () => {
    const instance = topIssuerChartRef.current?.getEchartsInstance?.();
    if (!instance) return;
    await downloadChartImage(instance, {
      fileName: 'top-10-issuer-chart.png',
      title: topIssuerMetricTitle,
      backgroundColor: chartTheme.bg,
      textColor: chartTheme.text,
      titleAlign: 'center',
    });
  };

  const handleTopIssuerReset = () => {
    const instance = topIssuerChartRef.current?.getEchartsInstance?.();
    instance?.restore?.();
    setTopIssuerMetric('remainingDebt');
    setShowTopIssuerDataView(false);
    setShowTopIssuerDataViewBackButton(false);
    setShowTopIssuerZoom(false);
  };

  const openTopIssuerDataView = (fromZoom = false) => {
    setShowTopIssuerDataViewBackButton(fromZoom);
    setShowTopIssuerDataView(true);
    if (fromZoom) {
      setShowTopIssuerZoom(false);
    }
  };

  const closeTopIssuerDataView = () => {
    setShowTopIssuerDataView(false);
    setShowTopIssuerDataViewBackButton(false);
  };

  const handleTopIssuerDataViewBack = () => {
    const shouldRestoreZoom = showTopIssuerDataViewBackButton;
    closeTopIssuerDataView();
    if (shouldRestoreZoom) {
      setShowTopIssuerZoom(true);
    }
  };

  const topIssuerToolbarButtonClass = (disabled = false) => (
    `rounded-md p-1.5 transition-colors ${
      disabled
        ? 'cursor-not-allowed text-text-muted/60 opacity-60'
        : 'text-text-muted hover:bg-surface-container-low hover:text-text-highlight'
    }`
  );

  const hoverToolbarClass =
    'flex flex-wrap items-center justify-end gap-1 text-text-muted opacity-100 pointer-events-auto lg:flex-nowrap lg:opacity-0 lg:pointer-events-none lg:transition-opacity lg:duration-200 lg:ease-out lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto lg:group-focus-within:opacity-100 lg:group-focus-within:pointer-events-auto';

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
  const isTopIssuerSectionLoading = (issuerStatsQuery.isLoading || loadingTopIssuerChart) && topIssuerDisplayData.length === 0;
  const isTopInterestSectionLoading = (topInterestQuery.isLoading || loadingTopInterestChart) && topInterestChartData.length === 0;
  const isIndustryChartSectionLoading = industryDataQuery.isLoading && industryData.length === 0;
  const isProjectedCashFlowPending = !projectedCashFlowSectionVisible && !hasProjectedCashFlowData && Object.keys(projectedCashFlowBuckets).length === 0;

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
    <div className="min-w-0 transition-colors duration-300">
      <div className="mb-3 mt-1 flex min-w-0 items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-base tracking-tight break-words transition-colors">{t('marketOverview')}</h1>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-12 gap-3">
        <div className="col-span-12 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isKpiSectionLoading
            ? Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)
            : kpiCards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} unit={card.unit} icon={card.icon} />
            ))}
        </div>

        {isTopIssuerSectionLoading ? (
          <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
        ) : (
        <Card className="group col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 justify-start text-left">
                <div className="inline-flex max-w-full items-center justify-start gap-2 transition-colors duration-200 group-hover:text-blue-600">
                  <Landmark className="h-4 w-4 shrink-0 text-blue-600 transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700" />
                  <h3 className="text-left text-base font-bold leading-snug break-words text-text-base transition-colors duration-200 group-hover:text-blue-600 md:text-lg">
                    {topIssuerMetricTitle}
                  </h3>
                </div>
              </div>
              <div className={hoverToolbarClass}>
                <button
                  type="button"
                  onClick={() => openTopIssuerDataView(false)}
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
                  title={t('lineChart')}
                >
                  <LineChart className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled
                  className={topIssuerToolbarButtonClass()}
                  title={t('columnChart')}
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTopIssuerReset}
                  className={topIssuerToolbarButtonClass()}
                  title={t('reset')}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTopIssuerDownload}
                  className={topIssuerToolbarButtonClass()}
                  title={t('download')}
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
            <ReactECharts ref={topIssuerChartRef} option={themedTopIssuerOptions} style={{ height: '100%', width: '100%' }} autoResize />
          </div>
        </Card>
        )}

        <div className="col-span-12 flex min-h-0 flex-col space-y-3 lg:col-span-6">
          {isTopInterestSectionLoading ? (
            <SectionCardSkeleton className="flex-1" />
          ) : (
            <Card className="flex flex-none flex-col p-3 md:p-4">
              <div className="h-80 min-w-0 overflow-hidden md:h-96">
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
              </div>
            </Card>
          )}

          <AIInsightPanel
            cacheKey="market-overview-insight"
            title={marketInsightTitle}
            pageTitle={t('marketOverview')}
            sectionTitle={t('marketOverview')}
            payload={marketInsightPayload}
            className="flex min-h-0 flex-1 flex-col"
          />
        </div>

        {isIndustryChartSectionLoading ? (
          <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
        ) : (
          <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
            <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
              <ChartWithToolbar
                option={industryValueOptions}
                style={{ height: '100%', width: '100%' }}
                allowMagicType
                title={t('valueByIndustry')}
              />
            </div>
          </Card>
        )}

        {isIndustryChartSectionLoading ? (
          <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
        ) : (
          <Card className="col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
            <div className="flex-1 min-h-80 min-w-0 overflow-hidden md:min-h-96">
              <ChartWithToolbar
                option={industryVolumeOptions}
                style={{ height: '100%', width: '100%' }}
                allowMagicType
                title={t('volumeByIndustry')}
              />
            </div>
          </Card>
        )}

        <div ref={projectedCashFlowSectionRef} className="col-span-12 flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20">
          {isProjectedCashFlowPending ? (
            <div className="min-h-80">
              <SectionCardSkeleton className="h-full border-0 bg-transparent p-0 shadow-none" />
            </div>
          ) : (
            <div className="h-80 overflow-hidden md:h-96">
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
            </div>
          )}
        </div>

        <AIInsightPanel
          cacheKey="market-overview-structure-insight"
          title={marketFlowInsightTitle}
          pageTitle={t('marketOverview')}
          sectionTitle={projectedCashFlowTitle}
          payload={marketFlowInsightPayload}
          className="col-span-12"
        />
      </div>

      <ChartDataViewModal
        isOpen={showTopIssuerDataView}
        title={topIssuerMetricTitle}
        columns={topIssuerDataViewColumns}
        rows={topIssuerDataViewRows}
        onClose={closeTopIssuerDataView}
        onBack={handleTopIssuerDataViewBack}
        showBackButton={showTopIssuerDataViewBackButton}
        fileNameBase={`top-issuer-${topIssuerMetric}`}
        sheetName={topIssuerMetricTitle}
      />

      {showTopIssuerZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowTopIssuerZoom(false)}
        >
          <div
            className="group flex h-full max-h-screen w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-base px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <div className="inline-flex max-w-full items-center justify-start gap-2">
                      <Landmark className="h-5 w-5 shrink-0 text-blue-600" />
                      <h3 className="line-clamp-2 text-left text-base font-bold leading-snug text-text-base md:text-2xl">
                        {topIssuerMetricTitle}
                      </h3>
                    </div>
                  </div>
                  <div className={hoverToolbarClass}>
                  <button
                    type="button"
                    onClick={() => openTopIssuerDataView(true)}
                    className={topIssuerToolbarButtonClass()}
                    title={t('dataView')}
                    aria-label={t('dataView')}
                  >
                    <TableProperties className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled
                    className={topIssuerToolbarButtonClass(true)}
                    title={t('lineChart')}
                  >
                    <LineChart className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled
                    className={topIssuerToolbarButtonClass(true)}
                    title={t('columnChart')}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleTopIssuerReset}
                    className={topIssuerToolbarButtonClass()}
                    title={t('reset')}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleTopIssuerDownload}
                    className={topIssuerToolbarButtonClass()}
                    title={t('download')}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
                </div>
                <div className="mt-2 flex justify-end text-right">
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
              <button
                type="button"
                onClick={() => setShowTopIssuerZoom(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
                title={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
              <ReactECharts option={themedTopIssuerOptions} style={{ height: '100%', width: '100%' }} autoResize />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
