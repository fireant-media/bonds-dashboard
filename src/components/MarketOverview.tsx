import ChartWithToolbar from './ChartWithToolbar';
import AIInsightPanel from './AIInsightPanel';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatInterestRate, formatNumber } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { BadgeDollarSign, Boxes, Hash, Landmark, Maximize2, RotateCcw, TableProperties, Wallet, X } from 'lucide-react';
import { ChartDataViewModal, type ChartDataTableColumn } from './ui/ChartDataViewModal';

interface ProjectedCashFlowBucket {
  label: string;
  interest: number;
  principal: number;
}

interface TopInterestBond {
  bondCode: string;
  bondRate: number;
  maturityDate?: string;
  tenorPeriod?: number;
}

import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';
import { Card, MetricCard, MetricCardSkeleton, SectionCardSkeleton } from './ui/Card';
import { CHART_PALETTE, getComparisonAreaSeriesStyle, getChartTheme, getChartTooltip, highlightChartTooltipValue } from '../utils/chart';
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
type IndustryCompositionMetric = 'issuedValue' | 'listedValue' | 'remainingDebt';

const roundMetric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

export default function MarketOverview() {
  const navigate = useNavigate();
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
  const [industryCompositionMetric, setIndustryCompositionMetric] = useState<IndustryCompositionMetric>('remainingDebt');
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
  const { ref: projectedCashFlowSectionRef, isVisible: projectedCashFlowSectionVisible } = useVisibleOnce<HTMLDivElement>();

  const legendStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 600 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const categoryLabelStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 600 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const valueLabelStyle = {
    fontSize: 11,
    color: chartTheme.subText,
    fontWeight: 500 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const chartTitleStyle = {
    fontSize: 11,
    color: chartTheme.text,
    fontWeight: 700 as const,
    fontFamily: 'Inter, Manrope, sans-serif',
  };

  const tooltipTextStyle = getChartTooltip(isDark).textStyle;
  const chartTooltip = getChartTooltip(isDark);
  const chartPalette = CHART_PALETTE;
  const bondVolumeUnitLabel = t('unitMillionShares');
  const industryPrimaryBarColor = '#0E87F7';
  const industrySecondaryBarColor = '#20BEE8';
  const industryPieColors = ['#4D93F9', '#23C68E', '#F56B2D', '#7279F5', '#F8B011', '#14C6E4', '#94D926', '#F05DA8'];

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

  const topIssuerMetricTitle = topIssuerMetric === 'remainingDebt'
    ? (language === 'vi'
      ? 'Top 10 doanh nghi\u1ec7p c\u00f3 d\u01b0 n\u1ee3 tr\u00e1i phi\u1ebfu l\u1edbn nh\u1ea5t'
      : 'Top 10 enterprises with the highest bond debt')
    : (language === 'vi'
      ? 'Top 10 doanh nghi\u1ec7p c\u00f3 gi\u00e1 tr\u1ecb ph\u00e1t h\u00e0nh l\u1edbn nh\u1ea5t'
      : 'Top 10 enterprises with the highest issued value');

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

  const getSparklineSource = (...sources: number[][]) => (
    sources.find((source) => {
      const values = source.filter((value) => Number.isFinite(value));
      return values.length >= 2 && Math.max(...values) !== Math.min(...values);
    }) || []
  );

  const kpiCards = [
    {
      label: t('totalBondCodes'),
      value: formatNumber(marketKpis.bondCount, 0),
      unit: t('bondCodeUnit'),
      icon: Hash,
      tone: 'blue' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.bondCount)),
        deferredIndustryData.map((industry) => toNumber(industry.bondCount)),
      ),
    },
    {
      label: t('totalIssuedVolume'),
      value: formatNumber(marketKpis.issuedVolume / 1_000_000, 2),
      unit: t('unitMillionShares'),
      icon: Boxes,
      tone: 'purple' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalIssuedVolume)),
        deferredIndustryData.map((industry) => toNumber(industry.totalIssuedVolume)),
      ),
    },
    {
      label: t('totalIssuedValueTitle'),
      value: formatNumber(marketKpis.issuedValue / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: BadgeDollarSign,
      tone: 'green' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalIssuedValue)),
        deferredIndustryData.map((industry) => toNumber(industry.totalIssuedValue)),
      ),
    },
    {
      label: t('totalRemainingDebt'),
      value: formatNumber(marketKpis.remainingDebt / 1000000000, 2),
      unit: t('unitBillionVND'),
      icon: Wallet,
      tone: 'orange' as const,
      sparklineValues: getSparklineSource(
        deferredIssuerStatsData.slice(0, 12).map((issuer) => toNumber(issuer.totalRemainingDebt)),
        deferredIndustryData.map((industry) => toNumber(industry.totalRemainingDebt)),
      ),
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
    () => [...deferredIssuerStatsData].sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt).slice(0, 10),
    [deferredIssuerStatsData]
  );

  const topIssuerDisplayData = useMemo(
    () => [...deferredIssuerStatsData].sort((a, b) => (
      topIssuerMetric === 'issuedValue'
        ? b.totalIssuedValue - a.totalIssuedValue
        : b.totalRemainingDebt - a.totalRemainingDebt
    )).slice(0, 10),
    [deferredIssuerStatsData, topIssuerMetric]
  );

  const topInterestRankingItems = useMemo(() => {
    const normalized = (deferredTopInterestData as TopInterestBond[])
      .map((bond: any) => {
        const bondCode = String(bond?.bondCode || bond?.BondCode || bond?.code || bond?.Code || '').trim();
        const bondRate = toNumber(bond?.bondRate ?? bond?.BondRate ?? bond?.interestRate ?? bond?.InterestRate ?? bond?.couponRate ?? bond?.CouponRate);
        const maturityDate = String(bond?.maturityDate || bond?.MaturityDate || bond?.dueDate || bond?.DueDate || '').split('T')[0];
        const tenorPeriod = toNumber(bond?.tenorPeriod ?? bond?.TenorPeriod ?? bond?.term ?? bond?.Term);

        return {
          bondCode,
          bondRate,
          maturityDate,
          tenorPeriod,
        };
      })
      .filter((bond) => Boolean(bond.bondCode) && Number.isFinite(bond.bondRate));

    const sorted = normalized.sort((left, right) => {
      const rateDiff = right.bondRate - left.bondRate;
      if (rateDiff !== 0) return rateDiff;
      return left.bondCode.localeCompare(right.bondCode);
    });

    const topRows = sorted.slice(0, TOP_INTEREST_CHART_LIMIT);
    const maxRate = topRows.reduce((max, bond) => Math.max(max, bond.bondRate), 0);

    return topRows.map((bond, index) => {
      const remainingTermLabel = (() => {
        if (bond.maturityDate) {
          const maturityTime = new Date(bond.maturityDate).getTime();
          if (!Number.isNaN(maturityTime)) {
            const diffDays = Math.ceil((maturityTime - Date.now()) / 86400000);
            if (diffDays <= 0) return language === 'vi' ? 'Đã đáo hạn' : 'Matured';
            if (diffDays < 30) return language === 'vi' ? `${diffDays} ngày` : `${diffDays} days`;
            const diffMonths = Math.ceil(diffDays / 30);
            if (diffMonths < 12) return language === 'vi' ? `${diffMonths} tháng` : `${diffMonths} months`;
            const years = Math.floor(diffMonths / 12);
            const months = diffMonths % 12;
            if (months === 0) return language === 'vi' ? `${years} năm` : `${years} years`;
            return language === 'vi' ? `${years} năm ${months} tháng` : `${years} years ${months} months`;
          }
        }

        if (bond.tenorPeriod > 0) {
          return language === 'vi' ? `${formatNumber(bond.tenorPeriod, 0)} tháng` : `${formatNumber(bond.tenorPeriod, 0)} months`;
        }

        return language === 'vi' ? 'Không có dữ liệu' : 'No data';
      })();

      return {
        ...bond,
        rank: index + 1,
        rateRatio: maxRate > 0 ? bond.bondRate / maxRate : 0,
        remainingTermLabel,
      };
    });
  }, [deferredTopInterestData, language]);

  const industryCompositionConfig = useMemo(() => {
    switch (industryCompositionMetric) {
      case 'issuedValue':
        return {
          label: language === 'vi' ? 'Giá trị phát hành' : 'Issued value',
          title: language === 'vi' ? 'Cơ cấu giá trị phát hành theo ngành' : 'Issued value composition by industry',
          selectorKey: 'totalIssuedValue' as const,
        };
      case 'listedValue':
        return {
          label: language === 'vi' ? 'Giá trị niêm yết' : 'Listed value',
          title: language === 'vi' ? 'Cơ cấu giá trị niêm yết theo ngành' : 'Listed value composition by industry',
          selectorKey: 'totalCurrentListedValue' as const,
        };
      default:
        return {
          label: language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt',
          title: language === 'vi' ? 'Cơ cấu dư nợ còn lại theo ngành' : 'Remaining debt composition by industry',
          selectorKey: 'totalRemainingDebt' as const,
        };
    }
  }, [industryCompositionMetric, language]);
  const industryCompositionData = useMemo(() => (
    [...deferredIndustryData]
      .map((industry) => ({
        name: t(industry.icbName as any),
        value: toBillionVnd(industry[industryCompositionConfig.selectorKey]),
      }))
      .filter((item) => item.value > 0)
      .sort((left, right) => right.value - left.value)
  ), [deferredIndustryData, industryCompositionConfig.selectorKey, t]);
  const marketInsightTitle = language === 'vi'
    ? 'NH\u1eacN X\u00c9T T\u1ed4NG QUAN'
    : 'OVERVIEW COMMENTARY';
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
    topBondRates: topInterestRankingItems.slice(0, 6).map((bond) => ({
      bondCode: bond.bondCode,
      bondRate: roundMetric(bond.bondRate),
    })),
  }), [marketKpis, topDebtData, topInterestRankingItems]);

  const cashFlowInsightTitle = language === 'vi'
    ? 'NH\u1eacN X\u00c9T V\u1ec0 D\u00d2NG TI\u1ec0N'
    : 'CASH FLOW COMMENTARY';

  const cashFlowInsightPayload = useMemo(() => ({
    period: cashFlowPeriod,
    labels: projectedCashFlowData.labels,
    interest: projectedCashFlowData.interest,
    principal: projectedCashFlowData.principal,
    total: projectedCashFlowData.total,
    peakBucket: projectedCashFlowData.total.length > 0
      ? {
        label: projectedCashFlowData.labels[projectedCashFlowData.total.indexOf(Math.max(...projectedCashFlowData.total))] || '',
        value: Math.max(...projectedCashFlowData.total),
      }
      : null,
  }), [cashFlowPeriod, projectedCashFlowData]);

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

  const handleTopIssuerCategoryClick = (ticker: string) => {
    const normalizedTicker = String(ticker || '').trim();
    if (!normalizedTicker) return;
    setShowTopIssuerDataView(false);
    navigate(`/filter/issuer/${encodeURIComponent(normalizedTicker)}`);
  };

  const handleTopIssuerMetricChange = (metric: 'remainingDebt' | 'issuedValue') => {
    setTopIssuerMetric(metric);
    void refreshTopIssuerChart(metric);
  };

  const topIssuerRankingItems = useMemo(() => {
    const maxValue = topIssuerDisplayData.reduce((highest, issuer) => {
      const currentValue = topIssuerMetric === 'remainingDebt'
        ? toNumber(issuer.totalRemainingDebt)
        : toNumber(issuer.totalIssuedValue);
      return Math.max(highest, currentValue);
    }, 0);

    return topIssuerDisplayData.map((issuer, index) => {
      const currentValue = topIssuerMetric === 'remainingDebt'
        ? toNumber(issuer.totalRemainingDebt)
        : toNumber(issuer.totalIssuedValue);
      const ratio = maxValue > 0 ? currentValue / maxValue : 0;

      return {
        issuer,
        rank: index + 1,
        value: currentValue,
        valueBillion: currentValue / 1_000_000_000,
        ratio,
      };
    });
  }, [topIssuerDisplayData, topIssuerMetric]);

  const renderTopIssuerRankingList = (zoom = false) => {
    if (topIssuerRankingItems.length === 0) {
      return (
        <div className={`flex items-center justify-center text-center text-sm font-medium text-text-muted ${zoom ? 'h-full min-h-96' : 'h-full min-h-80'}`}>
          {t('noData')}
        </div>
      );
    }

    return (
      <div className={`${zoom ? 'h-full overflow-y-auto pr-1 space-y-4' : 'space-y-2.5'}`}>
        {topIssuerRankingItems.map(({ issuer, rank, valueBillion, ratio }) => {
          const symbol = issuer.issuerSymbol || '';
          const minWidth = ratio > 0 ? Math.max(ratio * 100, 8) : 0;

          return (
            <button
              key={`${symbol}-${rank}`}
              type="button"
              onClick={() => handleTopIssuerCategoryClick(symbol)}
              className={`w-full text-left transition-colors hover:text-blue-700 dark:hover:text-blue-200 ${zoom ? 'py-1.5' : 'py-0.5'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex shrink-0 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200 ${zoom ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-xs'}`}>
                  {rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className={`truncate font-bold text-text-base ${zoom ? 'text-base' : 'text-sm'}`}>
                      {symbol}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-bold text-text-base ${zoom ? 'text-base' : 'text-sm'}`}>
                        {formatNumber(valueBillion, 0)}
                      </div>
                    </div>
                  </div>
                  <div className={`mt-2.5 h-2 overflow-hidden rounded-full bg-surface-container-low ${zoom ? 'h-2.5' : 'h-2'}`}>
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${minWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const industryValueOptions = {
    color: industryPieColors,
    __dataView: {
      categoryLabel: t('marketTitle'),
      categoryAlign: 'left',
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => `${params.name}<br/>${params.marker}${industryCompositionConfig.label}: ${highlightChartTooltipValue(formatNumber(params.value, 2), ` ${t('unitBillionVND')}`)}`,
    },
    legend: {
      type: 'plain',
      orient: 'vertical',
      top: 20,
      bottom: 20,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 8,
      textStyle: legendStyle,
    },
    graphic: industryCompositionData.length === 0 ? {
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: language === 'vi' ? 'Không có dữ liệu' : 'No data',
        fill: chartTheme.subText,
        fontSize: 12,
        fontFamily: 'Inter, Manrope, sans-serif',
        fontWeight: 600,
      },
    } : undefined,
    series: [
      {
        name: industryCompositionConfig.label,
        type: 'pie',
        radius: '68%',
        center: ['31%', '50%'],
        avoidLabelOverlap: true,
        minAngle: 4,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderRadius: 4,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
        },
        emphasis: {
          scale: true,
          scaleSize: 4,
        },
        data: industryCompositionData.map((item, index) => ({
          ...item,
          itemStyle: { color: industryPieColors[index % industryPieColors.length] },
        })),
      },
    ],
  };

  const industryVolumeOptions = {
    color: ['#0E87F7', '#20BEE8'],
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
    grid: { left: '3%', right: '6%', top: '10%', bottom: '5%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: industryData.length > 0 ? industryData.map(d => t(d.icbName as any)) : [], 
      axisLabel: { ...categoryLabelStyle, rotate: 45 } 
    },
    yAxis: { 
      type: 'value', 
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      name: bondVolumeUnitLabel,
      nameGap: 10,
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
          itemStyle: { borderRadius: [4, 4, 0, 0], color: industryPrimaryBarColor },
          barWidth: '30%'
        },
        {
          name: t('listedVolume'),
          type: 'bar',
          data: industryData.length > 0 ? industryData.map((d) => d.totalCurrentListedVolume / 1_000_000) : [],
          itemStyle: { borderRadius: [4, 4, 0, 0], color: industrySecondaryBarColor },
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
      bottom: 25,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { top: '3%', bottom: '30%', left: '8%', right: '6%' },
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
        bottom: 5,
        filterMode: 'none',
        brushSelect: false,
        textStyle: valueLabelStyle
      }
    ],
    yAxis: {
      type: 'value',
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
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

  const handleTopIssuerReset = () => {
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
  const isTopInterestSectionLoading = topInterestQuery.isLoading && topInterestRankingItems.length === 0;
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
    <div className="min-w-0 py-3 transition-colors duration-300">
      <div className="mb-3 flex min-w-0 items-center justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-950 transition-colors dark:text-text-base">{t('marketOverview')}</h1>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-12 gap-3">
        <div className="col-span-12 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isKpiSectionLoading
            ? Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)
            : kpiCards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                unit={card.unit}
                icon={card.icon}
                tone={card.tone}
                sparklineValues={card.sparklineValues}
              />
            ))}
        </div>

        {isTopInterestSectionLoading ? (
          <SectionCardSkeleton className="order-5 col-span-12 lg:col-span-4 lg:h-full" />
        ) : (
          <Card className="order-5 col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-4 lg:h-full">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h3 className="text-left text-base font-bold leading-snug text-text-base">
                {language === 'vi' ? 'Top 10 mã trái phiếu lãi suất cao nhất' : 'Top 10 bonds with the highest interest rate'}
              </h3>
            </div>
            <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="grid min-h-0 flex-1 gap-1.5">
                {topInterestRankingItems.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-sm font-medium text-text-muted">
                    {t('noData')}
                  </div>
                ) : (
                  topInterestRankingItems.map((item) => {
                    const filledDots = Math.max(1, Math.min(10, Math.round(item.rateRatio * 10)));

                    return (
                      <button
                        key={`${item.bondCode}-${item.rank}`}
                        type="button"
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-border-base/60 px-1.5 py-2 text-left transition-colors last:border-b-0 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 cursor-pointer"
                        onClick={() => navigate(`/${encodeURIComponent(item.bondCode)}`)}
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 shadow-sm shadow-blue-500/10 dark:bg-blue-500/10 dark:text-blue-300">
                          {item.rank}
                        </div>
                        <div className="min-w-0 text-sm font-semibold text-text-base whitespace-nowrap">
                          {item.bondCode}
                        </div>
                        <div className="inline-flex min-w-[88px] items-center justify-center rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {formatInterestRate(item.bondRate)} %
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          {Array.from({ length: 10 }, (_, index) => (
                            <span
                              key={`${item.bondCode}-dot-${index}`}
                              className={`h-2.5 w-2.5 rounded-full ${index < filledDots ? 'bg-blue-500' : 'bg-surface-container-low'}`}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="order-1 col-span-12 grid min-w-0 grid-cols-12 gap-3 lg:col-span-8">
          {isIndustryChartSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex h-96 min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div className="h-96 overflow-hidden">
                <ChartWithToolbar
                  key={`market-overview-industry-composition-${industryCompositionMetric}`}
                  option={industryValueOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                  title={industryCompositionConfig.title}
                  showZoomButton={false}
                  actionsPlacement="below"
                  headerClassName="gap-1"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  actions={(
                    <select
                      value={industryCompositionMetric}
                      onChange={(event) => setIndustryCompositionMetric(event.target.value as IndustryCompositionMetric)}
                      className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                      aria-label={language === 'vi' ? 'Chọn giá trị biểu đồ ngành' : 'Select industry chart metric'}
                    >
                      <option value="issuedValue">{language === 'vi' ? 'Giá trị phát hành' : 'Issued value'}</option>
                      <option value="listedValue">{language === 'vi' ? 'Giá trị niêm yết' : 'Listed value'}</option>
                      <option value="remainingDebt">{language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt'}</option>
                    </select>
                  )}
                />
              </div>
            </Card>
          )}

          {isIndustryChartSectionLoading ? (
            <SectionCardSkeleton className="col-span-12 lg:col-span-6" />
          ) : (
            <Card className="col-span-12 flex h-96 min-h-0 flex-col p-3 md:p-4 lg:col-span-6">
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChartWithToolbar
                  key="market-overview-industry-volume"
                  option={industryVolumeOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  notMerge
                  title={t('volumeByIndustry')}
                  chartContainerClassName="pt-1"
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
            className="col-span-12"
            expandContent
            layout="stacked"
          />
        </div>

        {isTopIssuerSectionLoading ? (
          <SectionCardSkeleton className="order-2 col-span-12 lg:col-span-4" />
        ) : (
          <Card className="group order-2 col-span-12 flex min-h-0 flex-col p-3 md:p-4 lg:col-span-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 justify-start text-left">
                  <div className="inline-flex max-w-full items-center justify-start gap-2 transition-colors duration-200 group-hover:text-blue-600">
                    <Landmark className="h-4 w-4 shrink-0 text-blue-600 transition-all duration-200 group-hover:scale-110 group-hover:text-blue-700" />
                    <h3 className="text-left text-base font-bold leading-snug break-words text-slate-950 transition-colors duration-200 group-hover:text-blue-600 dark:text-text-base">
                      {topIssuerMetricTitle}
                    </h3>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                      onClick={handleTopIssuerReset}
                      className={topIssuerToolbarButtonClass()}
                      title={t('reset')}
                    >
                      <RotateCcw className="h-4 w-4" />
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
              </div>
              <div className="flex justify-end">
                <select
                  value={topIssuerMetric}
                  onChange={(event) => handleTopIssuerMetricChange(event.target.value as 'remainingDebt' | 'issuedValue')}
                  className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                  aria-label={language === 'vi' ? 'Chọn giá trị xếp hạng doanh nghiệp' : 'Select issuer ranking metric'}
                >
                  <option value="issuedValue">{language === 'vi' ? 'Giá trị phát hành' : 'Issued value'}</option>
                  <option value="remainingDebt">{language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt'}</option>
                </select>
              </div>
            </div>
            <div className="min-w-0">
              {renderTopIssuerRankingList(false)}
            </div>
          </Card>
        )}

        <div className="order-4 col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-8 lg:h-full">
          <div
            ref={projectedCashFlowSectionRef}
            className="flex min-h-0 flex-col rounded-lg border border-border-base bg-bg-surface p-2 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20 md:p-3 lg:flex-1"
          >
            {isProjectedCashFlowPending ? (
              <div className="h- lg:h-full">
                <SectionCardSkeleton className="h-full border-0 bg-transparent p-0 shadow-none" />
              </div>
            ) : (
              <div className="h-86 overflow-hidden">
                <ChartWithToolbar
                  key={`market-overview-projected-cash-flow-${cashFlowPeriod}`}
                  option={projectedCashFlowOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  notMerge
                  title={projectedCashFlowTitle}
                  actionsPlacement="below"
                  headerClassName="gap-1"
                  belowActionsClassName="mt-0"
                  chartContainerClassName="pt-2"
                  showDataZoomSliderOnHover
                  zoomConfig={{
                    shellClassName: 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl',
                      chartStyle: { height: '100%', width: '100%' },
                      option: {
                        grid: { top: '10%', bottom: '20%', left: '8%', right: '6%' },
                        legend: {
                          bottom: 4,
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
                          bottom: 36,
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
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
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
            cacheKey="market-overview-cash-flow-insight"
            title={cashFlowInsightTitle}
            pageTitle={t('marketOverview')}
            sectionTitle={cashFlowInsightTitle}
            payload={cashFlowInsightPayload}
            expandContent
            layout="stacked"
          />
        </div>
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
        onCategoryClick={handleTopIssuerCategoryClick}
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
                    onClick={handleTopIssuerReset}
                    className={topIssuerToolbarButtonClass()}
                    title={t('reset')}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
                </div>
                <div className="mt-2 flex justify-end text-right">
                  <select
                    value={topIssuerMetric}
                    onChange={(event) => handleTopIssuerMetricChange(event.target.value as 'remainingDebt' | 'issuedValue')}
                    className="appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-xs font-semibold text-text-base outline-none transition-colors hover:border-blue-200 focus:border-border-base focus:outline-none focus:ring-0 focus-visible:outline-none"
                    aria-label={language === 'vi' ? 'Chọn giá trị xếp hạng doanh nghiệp' : 'Select issuer ranking metric'}
                  >
                    <option value="issuedValue">{language === 'vi' ? 'Giá trị phát hành' : 'Issued value'}</option>
                    <option value="remainingDebt">{language === 'vi' ? 'Dư nợ còn lại' : 'Remaining debt'}</option>
                  </select>
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
              {renderTopIssuerRankingList(true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
