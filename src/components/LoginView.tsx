import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CirclePlay,
  LineChart,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { formatNumber } from '../utils/format';
import { loadIndustryStatsByLevel, loadIssuerStatsSummary } from '../services/industryBondData';
import { loadMaturingBonds } from '../services/bondData';
import Logo from './Logo';

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
};

const navItems = ['Features', 'Solutions', 'Pricing', 'About'];

const featureCards = [
  {
    icon: BarChart3,
    title: 'Phân Tích Chuyên Sâu',
    description: 'Quan sát danh mục, lãi suất, kỳ hạn và xu hướng thị trường trong một workflow thống nhất.',
  },
  {
    icon: ShieldCheck,
    title: 'Quản Trị Rủi Ro',
    description: 'Theo dõi trái phiếu sắp đáo hạn, dư nợ còn lại và các điểm nóng theo ngành phát hành.',
  },
  {
    icon: Network,
    title: 'Kết Nối Dữ Liệu',
    description: 'Liên kết trái phiếu, tổ chức phát hành và ngành ICB để truy vấn nhanh hơn.',
  },
];

const chartBars = [44, 58, 68, 82, 92, 100];

export default function LoginView({ onSignIn, isSigningIn = false }: LoginViewProps) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LoginSnapshot | null>(null);

  const handleLogin = async () => {
    setError(null);

    try {
      await onSignIn();
    } catch (err) {
      console.error('OIDC sign-in failed', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Sign in failed: ${message}`);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      const cachedOverview = getCache('market_overview') as {
        issuerStatsData?: Array<{ issuerName?: string; issuerSymbol?: string; totalRemainingDebt?: number; totalIssuedValue?: number; bondCount?: number }>;
        industryData?: Array<{ icbName?: string; totalRemainingDebt?: number }>;
      } | null;

      const cachedSnapshot = getCache('login_snapshot') as LoginSnapshot | null;
      if (cachedSnapshot) {
        setSnapshot(cachedSnapshot);
        return;
      }

      if (cachedOverview?.issuerStatsData?.length) {
        const issuerRows = cachedOverview.issuerStatsData;
        const industryRows = cachedOverview.industryData || [];
        const sortedIssuers = [...issuerRows].sort((a, b) => (b.totalRemainingDebt || 0) - (a.totalRemainingDebt || 0));
        const topIssuer = sortedIssuers[0];
        const topIndustry = [...industryRows].sort((a, b) => (b.totalRemainingDebt || 0) - (a.totalRemainingDebt || 0))[0];
        const derivedSnapshot: LoginSnapshot = {
          totalBonds: issuerRows.reduce((total, issuer) => total + Number(issuer.bondCount || 0), 0),
          totalIssuers: issuerRows.length,
          totalRemainingDebt: issuerRows.reduce((total, issuer) => total + Number(issuer.totalRemainingDebt || 0), 0),
          totalIssuedValue: issuerRows.reduce((total, issuer) => total + Number(issuer.totalIssuedValue || 0), 0),
          topIssuerName: topIssuer?.issuerName || topIssuer?.issuerSymbol || 'FireAnt',
          topIssuerSymbol: topIssuer?.issuerSymbol || '',
          topIssuerRemainingDebt: Number(topIssuer?.totalRemainingDebt || 0),
          topIndustryName: topIndustry?.icbName || 'Industry',
          topIndustryRemainingDebt: Number(topIndustry?.totalRemainingDebt || 0),
          upcoming30: 0,
          upcoming90: 0,
        };

        setSnapshot(derivedSnapshot);
        setCache('login_snapshot', derivedSnapshot);
        return;
      }

      try {
        const [issuers, industries, upcoming30, upcoming90] = await Promise.all([
          loadIssuerStatsSummary(200),
          loadIndustryStatsByLevel(1),
          loadMaturingBonds(30),
          loadMaturingBonds(90),
        ]);

        if (cancelled) return;

        const sortedIssuers = [...issuers].sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
        const topIssuer = sortedIssuers[0];
        const sortedIndustries = [...industries].sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
        const topIndustry = sortedIndustries[0];

        const nextSnapshot: LoginSnapshot = {
          totalBonds: issuers.reduce((total, issuer) => total + Number(issuer.bondCount || 0), 0),
          totalIssuers: issuers.length,
          totalRemainingDebt: issuers.reduce((total, issuer) => total + Number(issuer.totalRemainingDebt || 0), 0),
          totalIssuedValue: issuers.reduce((total, issuer) => total + Number(issuer.totalIssuedValue || 0), 0),
          topIssuerName: topIssuer?.issuerName || topIssuer?.issuerSymbol || 'FireAnt',
          topIssuerSymbol: topIssuer?.issuerSymbol || '',
          topIssuerRemainingDebt: Number(topIssuer?.totalRemainingDebt || 0),
          topIndustryName: topIndustry?.icbName || 'Industry',
          topIndustryRemainingDebt: Number(topIndustry?.totalRemainingDebt || 0),
          upcoming30: Array.isArray(upcoming30) ? upcoming30.length : 0,
          upcoming90: Array.isArray(upcoming90) ? upcoming90.length : 0,
        };

        setSnapshot(nextSnapshot);
        setCache('login_snapshot', nextSnapshot);
      } catch (loadError) {
        console.warn('Failed to load login snapshot', loadError);
      }
    };

    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, []);

  const heroStats = useMemo(() => {
    const totalBonds = snapshot?.totalBonds ?? 0;
    const totalIssuers = snapshot?.totalIssuers ?? 0;
    const remainingDebtBillion = (snapshot?.totalRemainingDebt ?? 0) / 1_000_000_000;

    return [
      { label: 'MÃ£ trÃ¡i phiáº¿u', value: totalBonds ? formatNumber(totalBonds, 0) : '0' },
      { label: 'Tá»• chá»©c phÃ¡t hÃ nh', value: totalIssuers ? formatNumber(totalIssuers, 0) : '0' },
      { label: 'DÆ° ná»£ cÃ²n láº¡i', value: remainingDebtBillion ? `${formatNumber(remainingDebtBillion, 2)} Tá»·` : '0 Tá»·' },
    ];
  }, [snapshot]);

  const topIssuerLabel = snapshot?.topIssuerSymbol
    ? `${snapshot.topIssuerName} (${snapshot.topIssuerSymbol})`
    : snapshot?.topIssuerName || 'FireAnt';

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-blue-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="leading-tight">
              <p className="text-lg font-bold text-slate-900">FireAnt</p>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Institutional Analytics
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogin}
              disabled={isSigningIn}
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900 sm:inline-flex"
            >
              Login
            </button>
            <button
              type="button"
              onClick={handleLogin}
              disabled={isSigningIn}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-blue-700">
              <Sparkles className="h-4 w-4" />
              Institutional Grade Analytics
            </div>

            <div className="space-y-5">
              <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Làm Chủ Thị Trường Trái Phiếu Với{' '}
                <span className="text-blue-600">FireAnt</span>
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Nền tảng quản lý danh mục trái phiếu chuyên sâu dành cho nhà đầu tư tổ chức. Dữ liệu hiển thị ở
                đây được đồng bộ trực tiếp với các nguồn đang dùng trong dashboard: tổ chức phát hành, ngành ICB,
                mã trái phiếu và dòng tiền dự kiến.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleLogin}
                disabled={isSigningIn}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSigningIn ? (t('signingIn') || 'Signing in...') : 'Bắt Đầu Ngay'}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-4 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
              >
                <CirclePlay className="h-4 w-4" />
                Xem Demo
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              {heroStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Yield Curve Analysis</h2>
                <LineChart className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex h-48 items-end gap-3 sm:h-56">
                {chartBars.map((height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t-2xl bg-blue-600 shadow-sm"
                    style={{ height: `${height}%`, opacity: 0.5 + index * 0.1 }}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Top Issuer</p>
                  <p className="mt-2 font-semibold text-slate-900">{topIssuerLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {snapshot ? `${formatNumber(snapshot.topIssuerRemainingDebt / 1_000_000_000, 2)} Tỷ dư nợ` : 'Loading...'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Top Industry</p>
                  <p className="mt-2 font-semibold text-slate-900">{snapshot?.topIndustryName || 'Industry'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {snapshot ? `${formatNumber(snapshot.topIndustryRemainingDebt / 1_000_000_000, 2)} Tỷ` : 'Loading...'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Credit Rating</p>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'AAA', value: snapshot?.upcoming30 ? '42%' : '34%' },
                  { name: 'AA+', value: snapshot?.upcoming90 ? '28%' : '24%' },
                ].map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="font-semibold text-blue-600">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: item.value }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-center">
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-8 border-blue-600">
                  <Building2 className="h-8 w-8 text-slate-900" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-slate-900">Government Bonds</p>
                <p className="mt-2 text-sm text-slate-500">
                  {snapshot ? `${formatNumber(snapshot.upcoming30, 0)} bonds due in 30 days` : 'Bond market overview'}
                </p>
              </div>
            </div>
          </motion.section>
        </div>

        <section className="mt-16 border-t border-slate-200 pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Tại Sao Chọn FireAnt?
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Bộ công cụ phân tích trái phiếu được xây dựng từ chính dữ liệu đang dùng trong dashboard: tổ chức phát
              hành, ngành ICB, danh sách mã đáo hạn và các thống kê thị trường chính.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {featureCards.map((card, index) => (
              <motion.article
                key={card.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <card.icon className="h-8 w-8 text-blue-600" />
                <h3 className="mt-6 text-xl font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{card.description}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-slate-200 bg-white px-6 py-10 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Trusted by Bond Analysts
              </p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                Dữ liệu tổ chức theo cách giúp bạn ra quyết định nhanh hơn.
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Các số liệu trên màn hình đăng nhập được lấy trực tiếp từ cache/service của dự án để đồng bộ với
                dashboard, giúp người dùng thấy đúng sản phẩm ngay từ lần chạm đầu tiên.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {[
                snapshot ? `${snapshot.totalIssuers} Issuers` : 'Top Issuers',
                'Industry View',
                'Cash Flow',
                'Maturity List',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-slate-200 pt-8 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                F
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">FireAnt</p>
                <p className="text-xs text-slate-500">Institutional bond analytics for modern investors.</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
              <a href="#" className="transition-colors hover:text-slate-900">LinkedIn</a>
              <a href="#" className="transition-colors hover:text-slate-900">Twitter</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
