import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Clock3,
  Database,
  Globe2,
  Landmark,
  LineChart,
  PlayCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  AlertCircle,
} from 'lucide-react';
import Logo from './Logo';
import { getCache } from '../utils/cache';
import { formatNumber } from '../utils/format';

interface LoginViewProps {
  onRegister: () => void;
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
};

const navItems = [
  { label: 'Tính năng', target: 'features' },
  { label: 'Giải pháp', target: 'solutions' },
  { label: 'Giới thiệu', target: 'about' },
];

const featureCards = [
  {
    icon: TrendingUp,
    title: 'Phân tích chuyên sâu',
    description: 'Phân tích dư nợ, lợi suất và quy mô phát hành theo thời gian thực trong một giao diện tập trung.',
  },
  {
    icon: ShieldCheck,
    title: 'Quản trị rủi ro',
    description: 'Theo dõi áp lực đáo hạn và tín hiệu biến động để hỗ trợ quyết định nhanh hơn.',
  },
  {
    icon: BarChart3,
    title: 'Tích hợp API',
    description: 'Kết nối dữ liệu thị trường, tổ chức phát hành và ngành trong một luồng hiển thị nhất quán.',
  },
];

const footerColumns = [
  {
    title: 'Product',
    items: ['Dashboard', 'Market Data', 'Realtime Flow'],
  },
  {
    title: 'Company',
    items: ['About', 'Contact', 'Support'],
  },
  {
    title: 'Legal',
    items: ['Privacy Policy', 'Terms of Service', 'Security'],
  },
];

const formatBillion = (value: number) => `${formatNumber(value / 1_000_000_000, 2)} tỷ`;

const normalizeIndustryLabel = (value: string | undefined) => (value && value.trim() ? value : 'Chưa xác định');

const resolveSnapshot = (): LoginSnapshot | null => {
  const cachedSnapshot = getCache('login_snapshot') as LoginSnapshot | null;
  if (cachedSnapshot) return cachedSnapshot;

  const cachedOverview = getCache('market_overview') as {
    issuerStatsData?: CacheIssuerRow[];
    industryData?: CacheIndustryRow[];
  } | null;

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

export default function LoginView({ onRegister, onSignIn, isSigningIn = false }: LoginViewProps) {
  const [snapshot] = useState<LoginSnapshot | null>(() => resolveSnapshot());
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      await onSignIn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('OIDC sign-in failed:', errorMessage);
      setLoginError(errorMessage || 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.');
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
      value: snapshot ? formatBillion(snapshot.totalRemainingDebt) : '0 tỷ',
      icon: LineChart,
    },
    {
      label: 'Giá trị phát hành',
      value: snapshot ? formatBillion(snapshot.totalIssuedValue) : '0 tỷ',
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
      detail: snapshot ? `${formatBillion(snapshot.topIssuerRemainingDebt)} dư nợ` : 'Đang chờ cache dữ liệu',
      icon: Landmark,
    },
    {
      label: 'Ngành dẫn đầu',
      value: snapshot?.topIndustryName || 'Chưa xác định',
      detail: snapshot ? `${formatBillion(snapshot.topIndustryRemainingDebt)} dư nợ` : 'Đang chờ cache dữ liệu',
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
  const heatmap = snapshot?.industryHeatmap || [];
  const maturityTimeline = snapshot?.maturityTimeline || [
    { label: '30 ngày', value: 0 },
    { label: '90 ngày', value: 0 },
    { label: '180 ngày', value: 0 },
  ];

  return (
    <div className="min-h-dvh bg-bg-base text-text-base">
      <header className="sticky top-0 z-30 border-b border-border-base bg-bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => scrollToSection('overview')}
              className="flex items-center"
              aria-label="Fireant"
            >
              <Logo />
            </button>

            <nav className="hidden items-center gap-6 md:flex">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => scrollToSection(item.target)}
                  className="rounded px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-base hover:text-text-base"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRegister}
              disabled={isSigningIn}
              className="inline-flex items-center justify-center rounded-lg border border-blue-500 px-5 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Đăng ký tài khoản
            </button>
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={isSigningIn}
              className="inline-flex items-center justify-center rounded-lg border border-blue-500 px-5 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </header>

      {loginError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-4 mt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Lỗi đăng nhập</p>
              <p className="text-sm text-red-700 mt-1">{loginError}</p>
              <p className="text-xs text-red-600 mt-2">
                Kiểm tra console (F12) để xem chi tiết lỗi.
              </p>
            </div>
          </div>
        </div>
      )}

      <main>
        <section id="overview" className="relative overflow-hidden bg-bg-base px-4 pt-12 pb-4 sm:px-6 lg:px-8 lg:pt-12 lg:pb-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
          <div className="mx-auto grid max-w-7xl items-center gap-6 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="relative z-10 lg:col-span-6"
            >
              <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-text-base sm:text-5xl xl:text-6xl">
                Làm Chủ Thị Trường Trái Phiếu Với <span className="text-blue-600">Fireant</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-text-muted sm:text-lg">
                Nền tảng dữ liệu và phân tích trái phiếu dành cho nhà đầu tư chuyên nghiệp - trực quan, tốc độ cao
                và tập trung vào quyết định đầu tư.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleLogin()}
                  disabled={isSigningIn}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-8 py-4 font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Bắt Đầu Ngay
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('solutions')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-border-base bg-bg-surface px-8 py-4 font-semibold text-text-base transition-colors hover:bg-bg-base"
                >
                  <PlayCircle className="h-4 w-4" />
                  Xem Demo
                </button>
              </div>

              <div className="mt-6 flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-text-base">
                    {snapshot ? formatNumber(snapshot.totalBonds, 0) : '1,000+'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Mã trái phiếu
                  </span>
                </div>
                <div className="h-10 w-px bg-border-base" />
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-text-base">
                    {snapshot ? formatNumber(snapshot.totalIssuers, 0) : '100+'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Tổ chức phát hành
                  </span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="relative lg:col-span-6"
            >
              <div className="grid grid-cols-6 gap-4 items-start">
                <div className="data-card col-span-6 overflow-hidden rounded-xl border border-border-base bg-bg-surface p-5 shadow-sm">
                  <div className="flex flex-col">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-text-base">Khối lượng trái phiếu theo ngành</h3>
                        <p className="mt-1 text-xs text-text-muted">Đơn vị: Nghìn tỷ VNĐ</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm bg-blue-500" />
                          <span className="text-xs font-medium text-text-muted">Phát hành</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                          <span className="text-xs font-medium text-text-muted">Niêm yết</span>
                        </div>
                      </div>
                    </div>

                  <div className="mt-4 grid grid-cols-5 items-end gap-2">
                    {[
                      { label: 'Bất động sản', issue: 85, listed: 70 },
                      { label: 'Ngân hàng', issue: 95, listed: 90 },
                      { label: 'Xây dựng', issue: 45, listed: 35 },
                      { label: 'Năng lượng', issue: 60, listed: 40 },
                      { label: 'Dịch vụ tài chính', issue: 30, listed: 25 },
                    ].map((item) => (
                      <div key={item.label} className="flex min-w-0 flex-col items-center justify-end gap-2">
                        <div className="flex h-32 w-full items-end justify-center gap-1">
                          <div className={`w-8 rounded-t-sm bg-sky-400 transition-all duration-1000 ${getHeightClass(item.issue)}`} />
                          <div className={`w-8 rounded-t-sm bg-emerald-300 transition-all duration-1000 ${getHeightClass(item.listed)}`} />
                        </div>
                        <span className="flex h-12 items-start text-center text-xs leading-tight text-text-muted">
                          <span className="block max-w-full break-words whitespace-normal">{item.label}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  </div>
                </div>

                <div className="data-card col-span-3 rounded-xl border border-border-base bg-bg-surface p-4">
                  <span className="mb-3 block text-sm font-semibold text-text-base">
                    Tổng quan thị trường
                  </span>
                  <div className="space-y-3">
                    <div className="border-b border-border-base pb-1">
                      <span className="block text-xs font-medium text-text-muted/80">
                        Tổng mã trái phiếu
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatNumber(snapshot.totalBonds, 0) : '1,248'}
                      </span>
                    </div>
                    <div className="border-b border-border-base pb-1">
                      <span className="block text-xs font-medium text-text-muted/80">
                        Tổng giá trị phát hành
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatBillion(snapshot.totalIssuedValue) : '450 tỷ VNĐ'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-text-muted/80">
                        Tổng dư nợ còn lại
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-text-base">
                        {snapshot ? formatBillion(snapshot.totalRemainingDebt) : '320 tỷ VNĐ'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="data-card col-span-3 rounded-xl border border-border-base bg-bg-surface p-4">
                  <span className="mb-4 block text-sm font-semibold text-text-base">
                    Top doanh nghiệp dư nợ lớn nhất
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
                      <div key={item.label} className="flex items-center gap-4">
                        <span className="w-10 text-sm font-semibold text-text-base">{item.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border-base/50">
                          <div className={`h-full rounded-full bg-blue-500 ${getHeatWidthClass(item.value)}`} />
                        </div>
                        <span className="w-24 text-right text-sm font-medium text-text-muted">
                          {item.debt ? `${formatNumber(item.debt, 0)} tỷ VND` : `${item.value}%`}
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
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-text-base">Tại Sao Chọn Fireant?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-text-muted">
                Công cụ phân tích chuyên sâu và dữ liệu thị trường được thiết kế để bạn nhìn nhanh, hiểu nhanh và hành
                động nhanh.
              </p>
            </div>

            <div className="mt-2 grid gap-6 md:grid-cols-3">
              {featureCards.map((card) => (
                <motion.div
                  key={card.title}
                  whileHover={{ y: -3 }}
                  className="rounded-xl border border-border-base bg-bg-surface p-6 transition-colors hover:border-blue-600/30"
                >
                  <card.icon className="mb-4 h-8 w-8 text-blue-600" />
                  <h3 className="text-xl font-semibold text-text-base">{card.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-text-muted">{card.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="relative border-t border-border-base bg-bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-4">
              <div>
                <div className="flex items-center gap-3">
                  <Logo />
                </div>
                <p className="mt-4 max-w-xs text-sm leading-7 text-text-muted">
                  Phân tích trái phiếu cấp độ tổ chức cho nhà đầu tư hiện đại.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
                {footerColumns.map((group) => (
                  <div key={group.title} className="rounded-lg bg-bg-surface p-4">
                    <p className="text-xs font-medium uppercase tracking-widest text-text-muted/80">{group.title}</p>
                    <div className="mt-3 space-y-2">
                      {group.items.map((item) => (
                        <p key={item} className="text-sm text-text-muted">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-5 text-sm text-text-muted">
              <p>© 2024 Fireant Analytics. All rights reserved.</p>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border-base" />
        </section>
      </main>
    </div>
  );
}
