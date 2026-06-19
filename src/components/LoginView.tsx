import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ChartWithToolbar from './ChartWithToolbar';
import {
  ArrowRight,
  Building2,
  Clock3,
  Database,
  FileSearch,
  Globe2,
  Landmark,
  LineChart,
  Languages,
  Moon,
  Sun,
  Users,
  AlertCircle,
} from 'lucide-react';
import Logo from './Logo';
import { getCache } from '../utils/cache';
import { formatNumber } from '../utils/format';
import { CHART_PALETTE, getChartTheme, getChartTooltip } from '../utils/chart';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';
import { Language } from '../translations';
import { loadMarketOverviewData } from '../services/marketOverviewData';

interface LoginViewProps {
  onSignIn: () => Promise<void> | void;
  isSigningIn?: boolean;
}

type LoginSnapshot = {
  totalBonds: number;
  totalIssuers: number;
  totalRemainingDebt: number;
  totalIssuedValue: number;
  topIssuerName: string;
  topIssuerSymbol: string;
  topIssuerRemainingDebt: number;
  topIndustryName: string;
  topIndustryRemainingDebt: number;
  upcoming30: number;
  upcoming90: number;
  upcoming180: number;
  issuerBars: Array<{
    label: string;
    value: number;
    debt: number;
  }>;
  industryHeatmap: Array<{
    label: string;
    value: number;
    debt: number;
  }>;
  industryData: Array<{
    icbName: string;
    totalIssuedVolume: number;
    totalCurrentListedVolume: number;
  }>;
  maturityTimeline: Array<{
    label: string;
    value: number;
  }>;
};

type CacheIssuerRow = {
  issuerName?: string;
  issuerSymbol?: string;
  totalRemainingDebt?: number;
  totalIssuedValue?: number;
  bondCount?: number;
};

type CacheIndustryRow = {
  icbName?: string;
  totalRemainingDebt?: number;
  totalIssuedVolume?: number;
  totalCurrentListedVolume?: number;
};

const formatBillion = (value: number) => `${formatNumber(value / 1_000_000_000, 2)} tỷ`;

const normalizeIndustryLabel = (value: string | undefined) => (value && value.trim() ? value : 'Chưa xác định');

const buildSnapshotFromOverview = (cachedOverview: {
  issuerStatsData?: CacheIssuerRow[];
  industryData?: CacheIndustryRow[];
}): LoginSnapshot | null => {
  const issuerRows = cachedOverview.issuerStatsData || [];
  const industryRows = cachedOverview.industryData || [];

  if (!issuerRows.length && !industryRows.length) {
    return null;
  }

  const sortedIssuers = [...issuerRows].sort(
    (a, b) => Number(b.totalRemainingDebt || 0) - Number(a.totalRemainingDebt || 0),
  );
  const sortedIndustries = [...industryRows].sort(
    (a, b) => Number(b.totalRemainingDebt || 0) - Number(a.totalRemainingDebt || 0),
  );
  const topIssuer = sortedIssuers[0];
  const topIndustry = sortedIndustries[0];
  const maxIssuerDebt = Math.max(...sortedIssuers.slice(0, 5).map((issuer) => Number(issuer.totalRemainingDebt || 0)), 0);
  const maxIndustryDebt = Math.max(
    ...sortedIndustries.slice(0, 6).map((industry) => Number(industry.totalRemainingDebt || 0)),
    0,
  );

  return {
    totalBonds: issuerRows.reduce((total, issuer) => total + Number(issuer.bondCount || 0), 0),
    totalIssuers: issuerRows.length,
    totalRemainingDebt: issuerRows.reduce((total, issuer) => total + Number(issuer.totalRemainingDebt || 0), 0),
    totalIssuedValue: issuerRows.reduce((total, issuer) => total + Number(issuer.totalIssuedValue || 0), 0),
    topIssuerName: topIssuer?.issuerName || topIssuer?.issuerSymbol || 'FireAnt',
    topIssuerSymbol: topIssuer?.issuerSymbol || '',
    topIssuerRemainingDebt: Number(topIssuer?.totalRemainingDebt || 0),
    topIndustryName: normalizeIndustryLabel(topIndustry?.icbName),
    topIndustryRemainingDebt: Number(topIndustry?.totalRemainingDebt || 0),
    upcoming30: 0,
    upcoming90: 0,
    upcoming180: 0,
    issuerBars: sortedIssuers.slice(0, 5).map((issuer) => ({
      label: issuer.issuerSymbol || issuer.issuerName || '--',
      value: maxIssuerDebt > 0 ? Math.round((Number(issuer.totalRemainingDebt || 0) / maxIssuerDebt) * 100) : 0,
      debt: Number(issuer.totalRemainingDebt || 0),
    })),
    industryHeatmap: sortedIndustries.slice(0, 6).map((industry) => ({
      label: normalizeIndustryLabel(industry.icbName),
      value: maxIndustryDebt > 0 ? Math.round((Number(industry.totalRemainingDebt || 0) / maxIndustryDebt) * 100) : 0,
      debt: Number(industry.totalRemainingDebt || 0),
    })),
    industryData: industryRows as Array<{
      icbName: string;
      totalIssuedVolume: number;
      totalCurrentListedVolume: number;
    }>,
    maturityTimeline: [
      { label: '30 ngày', value: 0 },
      { label: '90 ngày', value: 0 },
      { label: '180 ngày', value: 0 },
    ],
  };
};

const resolveSnapshot = (): LoginSnapshot | null => {
  const cachedOverview = getCache('market_overview') as {
    issuerStatsData?: CacheIssuerRow[];
    industryData?: CacheIndustryRow[];
  } | null;

  const snapshotFromOverview = cachedOverview ? buildSnapshotFromOverview(cachedOverview) : null;
  if (snapshotFromOverview) return snapshotFromOverview;

  const cachedSnapshot = getCache('login_snapshot') as LoginSnapshot | null;
  if (cachedSnapshot) return cachedSnapshot;

  if (!cachedOverview?.issuerStatsData?.length && !cachedOverview?.industryData?.length) {
    return null;
  }

  const issuerRows = cachedOverview.issuerStatsData || [];
  const industryRows = cachedOverview.industryData || [];
  const sortedIssuers = [...issuerRows].sort(
    (a, b) => Number(b.totalRemainingDebt || 0) - Number(a.totalRemainingDebt || 0),
  );
  const sortedIndustries = [...industryRows].sort(
    (a, b) => Number(b.totalRemainingDebt || 0) - Number(a.totalRemainingDebt || 0),
  );
  const topIssuer = sortedIssuers[0];
  const topIndustry = sortedIndustries[0];
  const maxIssuerDebt = Math.max(...sortedIssuers.slice(0, 5).map((issuer) => Number(issuer.totalRemainingDebt || 0)), 0);
  const maxIndustryDebt = Math.max(
    ...sortedIndustries.slice(0, 6).map((industry) => Number(industry.totalRemainingDebt || 0)),
    0,
  );

  return {
    totalBonds: issuerRows.reduce((total, issuer) => total + Number(issuer.bondCount || 0), 0),
    totalIssuers: issuerRows.length,
    totalRemainingDebt: issuerRows.reduce((total, issuer) => total + Number(issuer.totalRemainingDebt || 0), 0),
    totalIssuedValue: issuerRows.reduce((total, issuer) => total + Number(issuer.totalIssuedValue || 0), 0),
    topIssuerName: topIssuer?.issuerName || topIssuer?.issuerSymbol || 'FireAnt',
    topIssuerSymbol: topIssuer?.issuerSymbol || '',
    topIssuerRemainingDebt: Number(topIssuer?.totalRemainingDebt || 0),
    topIndustryName: normalizeIndustryLabel(topIndustry?.icbName),
    topIndustryRemainingDebt: Number(topIndustry?.totalRemainingDebt || 0),
    upcoming30: 0,
    upcoming90: 0,
    upcoming180: 0,
    issuerBars: sortedIssuers.slice(0, 5).map((issuer) => ({
      label: issuer.issuerSymbol || issuer.issuerName || '--',
      value: maxIssuerDebt > 0 ? Math.round((Number(issuer.totalRemainingDebt || 0) / maxIssuerDebt) * 100) : 0,
      debt: Number(issuer.totalRemainingDebt || 0),
    })),
    industryHeatmap: sortedIndustries.slice(0, 6).map((industry) => ({
      label: normalizeIndustryLabel(industry.icbName),
      value: maxIndustryDebt > 0 ? Math.round((Number(industry.totalRemainingDebt || 0) / maxIndustryDebt) * 100) : 0,
      debt: Number(industry.totalRemainingDebt || 0),
    })),
    industryData: industryRows as Array<{
      icbName: string;
      totalIssuedVolume: number;
      totalCurrentListedVolume: number;
    }>,
    maturityTimeline: [
      { label: '30 ngày', value: 0 },
      { label: '90 ngày', value: 0 },
      { label: '180 ngày', value: 0 },
    ],
  };
};

const getHeightClass = (value: number) => {
  if (value >= 90) return 'h-28';
  if (value >= 75) return 'h-24';
  if (value >= 60) return 'h-20';
  if (value >= 45) return 'h-16';
  if (value >= 30) return 'h-12';
  if (value >= 15) return 'h-10';
  return 'h-8';
};

const getHeatWidthClass = (value: number) => {
  if (value >= 90) return 'w-full';
  if (value >= 75) return 'w-5/6';
  if (value >= 60) return 'w-3/4';
  if (value >= 45) return 'w-2/3';
  if (value >= 30) return 'w-1/2';
  return 'w-1/3';
};

const getCurrentLanguageLabel = (language: Language) => (language === 'vi' ? 'VI' : 'EN');

export default function LoginView({ onSignIn, isSigningIn = false }: LoginViewProps) {
  const [snapshot, setSnapshot] = useState<LoginSnapshot | null>(() => resolveSnapshot());
  const [loginError, setLoginError] = useState<string | null>(null);
  const { t, language, setLanguage } = useLanguage();
  const { effectiveTheme, setTheme } = useTheme();

  const isDarkMode = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDarkMode);
  const billionVndUnit = t('unitBillionVND');
  const formatBillionVnd = (value: number) => `${formatNumber(value / 1_000_000_000, 2)} ${billionVndUnit}`;
  const currentLanguageLabel = getCurrentLanguageLabel(language);
  const whyTitle = t('loginWhyTitle');
  const whyDescription = t('loginWhyDescription');
  const featureCards = [
    {
      icon: LineChart,
      title: t('loginWhyCard1Title'),
      description: t('loginWhyCard1Desc'),
    },
    {
      icon: Building2,
      title: t('loginWhyCard2Title'),
      description: t('loginWhyCard2Desc'),
    },
    {
      icon: FileSearch,
      title: t('loginWhyCard3Title'),
      description: t('loginWhyCard3Desc'),
    },
  ];
  const loginCopy = language === 'vi'
    ? {
        errorTitle: 'Lỗi đăng nhập',
        errorHint: 'Kiểm tra console (F12) để xem chi tiết lỗi.',
        heroTitle: 'Làm Chủ Thị Trường Trái Phiếu Với Fireant',
        heroDescription:
          'Nền tảng dữ liệu và phân tích trái phiếu dành cho nhà đầu tư chuyên nghiệp - trực quan, tốc độ cao và tập trung vào quyết định đầu tư.',
        primaryAction: 'Bắt Đầu Ngay',
        signInButton: 'Đăng nhập',
        heroStats: [
          { label: 'Mã trái phiếu' },
          { label: 'Tổ chức phát hành' },
        ],
        marketOverviewTitle: 'Tổng quan thị trường',
        chartTitle: 'Khối lượng trái phiếu theo ngành',
        yAxisName: 'Nghìn TP',
        issuedLabel: 'Phát hành',
        listedLabel: 'Niêm yết',
        totalBondsLabel: 'Tổng mã trái phiếu',
        totalIssuedLabel: 'Tổng giá trị phát hành',
        totalRemainingLabel: 'Tổng dư nợ còn lại',
        topIssuerTitle: 'Top doanh nghiệp dư nợ lớn nhất',
        loadingSnapshot: 'Đang chờ cache dữ liệu',
        unknownIndustry: 'Chưa xác định',
        debtSuffix: 'dư nợ',
        debtUnitSuffix: 'tỷ VND',
        maturityLabel: 'Đáo hạn 90 ngày',
        maturityDetail: 'Giám sát thanh khoản',
      }
    : {
        errorTitle: 'Login error',
        errorHint: 'Check the console (F12) for error details.',
        heroTitle: 'Take Control of the Bond Market with Fireant',
        heroDescription:
          'An institutional bond data and analytics platform for professional investors - intuitive, fast, and focused on investment decisions.',
        primaryAction: 'Get Started',
        signInButton: 'Sign in',
        heroStats: [
          { label: 'Bond codes' },
          { label: 'Issuers' },
        ],
        marketOverviewTitle: 'Market Overview',
        chartTitle: 'Bond Volume by Industry',
        yAxisName: 'Thousand bonds',
        issuedLabel: 'Issued',
        listedLabel: 'Listed',
        totalBondsLabel: 'Total bond codes',
        totalIssuedLabel: 'Total issued value',
        totalRemainingLabel: 'Total remaining debt',
        topIssuerTitle: 'Top issuers by outstanding debt',
        loadingSnapshot: 'Waiting for cached data',
        unknownIndustry: 'Unspecified',
        debtSuffix: 'outstanding debt',
        debtUnitSuffix: 'Billion VND',
        maturityLabel: '90-day maturity',
        maturityDetail: 'Liquidity monitoring',
      };

  useEffect(() => {
    let active = true;

    const fetchOverview = async () => {
      try {
        const overview = await loadMarketOverviewData();
        if (!active) return;
        setSnapshot(buildSnapshotFromOverview(overview));
      } catch (error) {
        console.error('Login overview fetch error', error);
      }
    };

    void fetchOverview();

    return () => {
      active = false;
    };
  }, []);

  const industryVolumeOptions = {
    backgroundColor: 'transparent',
    color: CHART_PALETTE,
    tooltip: {
      ...getChartTooltip(isDarkMode),
      show: false,
    },
    grid: { left: '2%', right: '2%', top: '12%', bottom: '2%', containLabel: true },
    xAxis: {
      type: 'category',
      data: snapshot?.industryData?.length ? snapshot.industryData.map((d) => t(d.icbName as any)) : [],
      axisLabel: {
        fontSize: 10,
        color: chartTheme.subText,
        fontFamily: 'Manrope',
        fontWeight: 'bold' as const,
        rotate: 45,
      },
      axisLine: {
        lineStyle: {
          color: chartTheme.axisLine,
        },
      },
      axisTick: {
        lineStyle: {
          color: chartTheme.axisLine,
        },
      },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      splitLine: {
        show: true,
        lineStyle: {
          color: chartTheme.grid,
        },
      },
      name: loginCopy.yAxisName,
      nameTextStyle: {
        fontSize: 10,
        color: chartTheme.text,
        fontWeight: 'bold' as const,
        fontFamily: 'Manrope',
      },
      axisLine: {
        lineStyle: {
          color: chartTheme.axisLine,
        },
      },
      axisTick: {
        lineStyle: {
          color: chartTheme.axisLine,
        },
      },
      axisLabel: {
        fontSize: 10,
        color: chartTheme.subText,
        fontFamily: 'Manrope',
        formatter: (value: number) => formatNumber(value, 0),
      },
    },
    series: [
      {
        name: t('issuedVolumeTitle'),
        type: 'bar',
        data: snapshot?.industryData?.length ? snapshot.industryData.map((d) => Math.round((d.totalIssuedVolume || 0) / 1000)) : [],
        itemStyle: { borderRadius: [10, 10, 0, 0] },
        barWidth: '30%',
      },
      {
        name: t('listedVolume'),
        type: 'bar',
        data: snapshot?.industryData?.length ? snapshot.industryData.map((d) => Math.round((d.totalCurrentListedVolume || 0) / 1000)) : [],
        itemStyle: { borderRadius: [10, 10, 0, 0] },
        barWidth: '30%',
      },
    ],
  };

  const handleLogin = async () => {
    try {
      setLoginError(null);
      await onSignIn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('OIDC sign-in failed:', errorMessage);
      setLoginError(errorMessage || (language === 'vi' ? 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.' : 'An error occurred while signing in. Please try again.'));
    }
  };

  const scrollToSection = (target: string) => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const heroStats = [
    {
      label: 'Mã trái phiếu',
      value: snapshot ? formatNumber(snapshot.totalBonds, 0) : '0',
      icon: Database,
    },
    {
      label: 'Tổ chức phát hành',
      value: snapshot ? formatNumber(snapshot.totalIssuers, 0) : '0',
      icon: Users,
    },
    {
      label: 'Dư nợ còn lại',
      value: snapshot ? formatBillionVnd(snapshot.totalRemainingDebt) : `0 ${billionVndUnit}`,
      icon: LineChart,
    },
    {
      label: 'Giá trị phát hành',
      value: snapshot ? formatBillionVnd(snapshot.totalIssuedValue) : `0 ${billionVndUnit}`,
      icon: Building2,
    },
  ];

  const topIssuerLabel = snapshot
    ? snapshot.topIssuerSymbol
      ? `${snapshot.topIssuerName} (${snapshot.topIssuerSymbol})`
      : snapshot.topIssuerName
    : 'FireAnt';

  const previewCards = [
    {
      label: 'Tổ chức dẫn đầu',
      value: topIssuerLabel,
      detail: snapshot ? `${formatBillionVnd(snapshot.topIssuerRemainingDebt)} dư nợ` : 'Đang chờ cache dữ liệu',
      icon: Landmark,
    },
    {
      label: 'Ngành dẫn đầu',
      value: snapshot?.topIndustryName || 'Chưa xác định',
      detail: snapshot ? `${formatBillionVnd(snapshot.topIndustryRemainingDebt)} dư nợ` : 'Đang chờ cache dữ liệu',
      icon: Globe2,
    },
    {
      label: 'Đáo hạn 90 ngày',
      value: snapshot ? `${formatNumber(snapshot.upcoming90, 0)} mã` : '0 mã',
      detail: 'Giám sát thanh khoản',
      icon: Clock3,
    },
  ];

  const bars = snapshot?.issuerBars || [];
  const hasSnapshotBars = bars.length > 0;
  const heatmap = snapshot?.industryHeatmap || [];
  const maturityTimeline = snapshot?.maturityTimeline || [
    { label: '30 ngày', value: 0 },
    { label: '90 ngày', value: 0 },
    { label: '180 ngày', value: 0 },
  ];

  return (
    <div className="min-h-dvh overflow-x-hidden overflow-y-auto bg-bg-base text-text-base">
      <header className="relative sticky top-0 z-40 flex min-h-16 shrink-0 items-center gap-3 border-b border-border-base bg-surface-bright/95 px-3 py-2 shadow-md shadow-blue-950/5 backdrop-blur transition-colors duration-300 dark:shadow-black/20 sm:px-4 lg:h-16 lg:px-6 lg:py-0">
        <div className="flex min-w-0 shrink-0 items-center gap-2 lg:min-w-72 lg:pr-3">
          <button
            type="button"
            onClick={() => scrollToSection('overview')}
            className="flex min-w-0 shrink-0 items-center gap-3 select-none"
            aria-label="FireAnt Bond Dashboard"
          >
            <Logo />
          </button>
        </div>

        <div className="ml-auto flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
            className="shrink-0 rounded-lg p-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95"
            title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
            aria-label={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
          >
            {effectiveTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setLanguage((language === 'vi' ? 'en' : 'vi') as Language)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95 sm:px-2.5"
            title={t('uiLanguage')}
            aria-label={t('uiLanguage')}
          >
            <Languages className="h-5 w-5" />
            <span className="text-xs font-bold uppercase">{currentLanguageLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isSigningIn}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-action-accent px-3 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/20 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {loginCopy.signInButton}
          </button>
        </div>
      </header>

      {loginError && (
        <div className="mx-4 mt-4 border-l-4 border-red-500 bg-red-50 p-4 sm:mx-6 lg:mx-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">{loginCopy.errorTitle}</p>
              <p className="text-sm text-red-700 mt-1">{loginError}</p>
              <p className="text-xs text-red-600 mt-2">
                {loginCopy.errorHint}
              </p>
            </div>
          </div>
        </div>
      )}

      <main>
        <section id="overview" className="relative overflow-hidden bg-bg-base px-3 pb-8 pt-8 sm:px-4 sm:pb-10 sm:pt-10 lg:px-6 lg:pb-12 lg:pt-12 xl:px-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-900/5" />
          <div className="mx-auto grid max-w-7xl items-start gap-8 xl:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="relative z-10 xl:col-span-5"
            >
              <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-text-base sm:text-4xl md:text-5xl xl:text-6xl">
                {loginCopy.heroTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-text-muted sm:mt-5 sm:text-base sm:leading-8 md:text-lg">
                {loginCopy.heroDescription}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <button
                  type="button"
                  onClick={() => void handleLogin()}
                  disabled={isSigningIn}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-action-accent px-6 py-3.5 font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-8 sm:py-4"
                >
                  {loginCopy.primaryAction}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                {heroStats.slice(0, 2).map((stat, index) => (
                  <div
                    key={stat.label}
                    className="flex flex-col rounded-lg border border-border-base bg-bg-surface/95 p-3 shadow-md shadow-blue-950/5 backdrop-blur sm:p-4 dark:shadow-black/20"
                  >
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-text-highlight">
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <span className="text-xl font-bold text-text-base sm:text-2xl">
                      {index === 0
                        ? snapshot ? formatNumber(snapshot.totalBonds, 0) : '1,000+'
                        : snapshot ? formatNumber(snapshot.totalIssuers, 0) : '100+'}
                    </span>
                    <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="relative xl:col-span-7"
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="data-card overflow-hidden rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-lg shadow-blue-950/5 backdrop-blur sm:p-5 xl:col-span-12 dark:shadow-black/20">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h3 className="text-left text-sm font-semibold text-text-base">{loginCopy.chartTitle}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_PALETTE[0] }} />
                        <span className="text-xs font-semibold text-text-muted">{loginCopy.issuedLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_PALETTE[2] }} />
                        <span className="text-xs font-semibold text-text-muted">{loginCopy.listedLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-52 w-full overflow-hidden bg-bg-surface sm:h-64 lg:h-72">
                    <ChartWithToolbar
                      option={industryVolumeOptions}
                      style={{ height: '100%', width: '100%' }}
                      allowMagicType
                      showToolbar={false}
                      notMerge
                      lazyUpdate
                    />
                  </div>
                </div>

                <div className="data-card rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 dark:shadow-black/20 xl:col-span-4">
                  <span className="mb-3 block text-sm font-semibold text-text-base">
                    {loginCopy.marketOverviewTitle}
                  </span>
                  <div className="space-y-3">
                    <div className="border-b border-border-base pb-1">
                      <span className="block text-xs font-medium text-text-muted/80">
                        {loginCopy.totalBondsLabel}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatNumber(snapshot.totalBonds, 0) : '1,248'}
                      </span>
                    </div>
                    <div className="border-b border-border-base pb-1">
                      <span className="block text-xs font-medium text-text-muted/80">
                        {loginCopy.totalIssuedLabel}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatBillionVnd(snapshot.totalIssuedValue) : `0 ${billionVndUnit}`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-text-muted/80">
                        {loginCopy.totalRemainingLabel}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatBillionVnd(snapshot.totalRemainingDebt) : `0 ${billionVndUnit}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="data-card rounded-lg border border-border-base bg-bg-surface/95 p-4 shadow-md shadow-blue-950/5 dark:shadow-black/20 xl:col-span-8">
                  <span className="mb-4 block text-sm font-semibold text-text-base">
                    {loginCopy.topIssuerTitle}
                  </span>
                  <div className="space-y-3">
                    {(bars.length > 0
                      ? bars
                      : [
                          { label: 'VIC', value: 100, debt: 85000 },
                          { label: 'NVL', value: 82, debt: 70000 },
                          { label: 'MSN', value: 70, debt: 60000 },
                          { label: 'VHM', value: 65, debt: 55000 },
                          { label: 'DIG', value: 53, debt: 45000 },
                        ]
                    ).map((item) => (
                      <div key={item.label} className="grid grid-cols-12 items-center gap-2 sm:gap-3">
                        <span className="col-span-2 truncate text-sm font-semibold text-text-base sm:col-span-2">
                          {item.label}
                        </span>
                        <div className="col-span-4 h-2 w-full overflow-hidden rounded-full bg-border-base/50 sm:col-span-5">
                          <div className={`h-full rounded-full bg-action-accent ${getHeatWidthClass(item.value)}`} />
                        </div>
                        <span className="col-span-6 min-w-0 whitespace-nowrap text-right text-xs font-medium tabular-nums text-text-muted sm:col-span-5 sm:text-sm">
                          {hasSnapshotBars
                            ? formatBillionVnd(item.debt)
                            : item.debt
                              ? `${formatNumber(item.debt, 0)} ${loginCopy.debtUnitSuffix}`
                              : `${item.value}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="solutions" className="-mt-8 border-t border-border-base bg-bg-surface py-16 lg:-mt-10">
          <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6 xl:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-text-base">{whyTitle}</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-text-muted">
                {whyDescription}
              </p>
            </div>

            <div className="mt-2 grid gap-6 md:grid-cols-3">
              {featureCards.map((card) => (
                <motion.div
                  key={card.title}
                  whileHover={{ y: -3 }}
                  className="rounded-lg border border-border-base bg-surface-bright p-6 shadow-md shadow-slate-900/5 transition-colors hover:border-text-highlight dark:shadow-black/20"
                >
                  <card.icon className="mb-4 h-8 w-8 text-text-highlight" />
                  <h3 className="text-xl font-semibold text-text-base">{card.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-text-muted">{card.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}


