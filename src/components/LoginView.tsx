import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Building2,
  ChartColumn,
  Languages,
  ListChecks,
  Moon,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import Logo from './Logo';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';
import { Language } from '../translations';
import { useIndustryBaseDashboardQuery, useMarketOverviewIndustryDataQuery } from '../query/dashboardQueries';
import {
  loadBondDetailsMapByCodes,
  loadBondFilterRows,
  loadGovernmentBondRows,
  loadUnlistedEnterpriseBondRows,
  type BondDataRow,
} from '../services/bondData';
import { applyChartTheme, CHART_PALETTE, getChartTheme, splitLegendItems } from '../utils/chart';
import { formatDate, formatInterestRate, formatNumber, parseDateToTimestamp } from '../utils/format';

interface LoginViewProps {
  onSignIn: () => Promise<void> | void;
  isSigningIn?: boolean;
}

type FeatureCardId = 'market-overview' | 'banking-industry' | 'market-bond-list';

interface PreviewTableColumn {
  title: string;
  unit?: string;
  widthClassName?: string;
  align?: 'left' | 'right' | 'center';
}

interface PreviewTableRow {
  code: string;
  rate: string;
  maturity: string;
  value: string;
}

interface FeatureCard {
  id: FeatureCardId;
  title: string;
  description: string;
  icon: LucideIcon;
  previewTitle: string;
}

interface BenefitCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface LoginCopy {
  errorTitle: string;
  errorHint: string;
  signIn: string;
  getStarted: string;
  section2Title: string;
  section2Subtitle: string;
  previewEmpty: string;
  section3Cards: FeatureCard[];
  section4Title: string;
  section4Cards: BenefitCard[];
  tableColumns: PreviewTableColumn[];
}

interface BankingIssuerSummary {
  issuerSymbol?: string;
  issuerName?: string;
  totalRemainingDebt: number;
}

const MARKET_BOND_FETCH_FALLBACK_LIMIT = 10000;
const LOGIN_PREVIEW_ROW_COUNT = 8;
const LOGIN_CARD_SURFACE_CLASSNAME = 'rounded-lg border border-border-base bg-bg-surface/95 shadow-md shadow-blue-950/5 transition-colors dark:shadow-black/20';

const getCurrentLanguageLabel = (language: Language) => (language === 'vi' ? 'VI' : 'EN');

const mergePreviewBondRowWithDetail = (row: BondDataRow, detailPayload: any): BondDataRow => {
  const detail = detailPayload?.detail || detailPayload || {};
  const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;

  return {
    ...row,
    bondRate: row.bondRate || Number(detail?.bondRate || detail?.BondRate || detail?.interestRate || detail?.InterestRate || 0),
    maturityDate: row.maturityDate || String(detail?.maturityDate || detail?.MaturityDate || ''),
    totalIssuedValue:
      row.totalIssuedValue > 0
        ? row.totalIssuedValue
        : Number(detail?.totalIssuedValue || detail?.TotalIssuedValue || historyItem?.value || 0),
    raw: {
      ...row.raw,
      detail,
    },
  };
};

const sortPreviewBondRows = (rows: BondDataRow[]) =>
  [...rows].sort((left, right) => {
    const leftTimestamp = parseDateToTimestamp(left.maturityDate) || 0;
    const rightTimestamp = parseDateToTimestamp(right.maturityDate) || 0;
    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }

    return String(left.bondCode || '').localeCompare(String(right.bondCode || ''));
  });

function PreviewLoadingState() {
  return (
    <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
      <div className="flex h-6 items-center">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container-low" />
      </div>
      <div className="mt-3 min-h-0 flex-1 animate-pulse rounded-2xl bg-bg-base" />
    </div>
  );
}

function PreviewEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
      <div className="flex h-6 items-center">
        {title ? <p className="text-sm font-semibold text-text-base">{title}</p> : <span className="invisible text-sm font-semibold">.</span>}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-bg-base px-4 text-center text-sm font-medium text-text-muted">
        {message}
      </div>
    </div>
  );
}

function FeaturePreview({
  chartOption,
  tableColumns,
  tableRows,
  isLoading,
  emptyMessage,
  previewTitle,
}: {
  chartOption?: any | null;
  tableColumns?: PreviewTableColumn[];
  tableRows?: PreviewTableRow[];
  isLoading?: boolean;
  emptyMessage: string;
  previewTitle?: string;
}) {
  if (isLoading) {
    return <PreviewLoadingState />;
  }

  if (chartOption) {
    return (
      <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
        <div className="flex h-6 items-center">
          <p className="truncate text-sm font-semibold text-text-base">{previewTitle || ' '}</p>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
        </div>
      </div>
    );
  }

  if (tableColumns && tableRows && tableRows.length > 0) {
    return (
      <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
        <div className="flex h-6 items-center">
          <span className="invisible text-sm font-semibold">.</span>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl">
          <table className="h-full w-full table-fixed">
            <thead className="border-b border-blue-500/30 bg-blue-600 text-white">
              <tr>
                {tableColumns.map((column) => (
                  <th
                    key={column.title}
                    className={`px-2 py-3 text-xs font-bold uppercase tracking-wider ${
                      column.widthClassName || ''
                    } ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    <span className="block whitespace-nowrap">{column.title}</span>
                    {column.unit ? <span className="mt-1 block text-xs font-semibold text-white/80">{column.unit}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {tableRows.map((row) => (
                <tr key={row.code} className="text-xs font-medium text-text-base">
                  <td className="whitespace-nowrap px-2 py-2.5 font-bold text-text-highlight">{row.code}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">{row.rate}</td>
                  <td className="whitespace-nowrap px-1 py-2.5 text-center">{row.maturity}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <PreviewEmptyState title={previewTitle || ''} message={emptyMessage} />;
}

export default function LoginView({ onSignIn, isSigningIn = false }: LoginViewProps) {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [marketBondRows, setMarketBondRows] = useState<BondDataRow[]>([]);
  const [isMarketBondPreviewLoading, setIsMarketBondPreviewLoading] = useState(true);
  const { language, setLanguage, t } = useLanguage();
  const { effectiveTheme, setTheme } = useTheme();

  const currentLanguageLabel = getCurrentLanguageLabel(language);
  const isVietnamese = language === 'vi';
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);

  const marketOverviewIndustryQuery = useMarketOverviewIndustryDataQuery();
  const bankingIndustryQuery = useIndustryBaseDashboardQuery('Banking');

  const marketOverviewIndustryData = Array.isArray(marketOverviewIndustryQuery.data)
    ? marketOverviewIndustryQuery.data
    : [];

  const bankingRankingData = useMemo<BankingIssuerSummary[]>(() => {
    const payload = bankingIndustryQuery.data as
      | {
          issuerSummaries?: BankingIssuerSummary[];
          rankingData?: BankingIssuerSummary[];
        }
      | null
      | undefined;

    const source = Array.isArray(payload?.issuerSummaries)
      ? payload.issuerSummaries
      : Array.isArray(payload?.rankingData)
        ? payload.rankingData
        : [];

    return [...source]
      .filter((item) => Number(item?.totalRemainingDebt || 0) > 0)
      .sort((left, right) => Number(right.totalRemainingDebt || 0) - Number(left.totalRemainingDebt || 0));
  }, [bankingIndustryQuery.data]);

  const marketBondFetchLimit = useMemo(() => {
    const marketBondCount = marketOverviewIndustryData.reduce(
      (total, item) => total + Number(item?.bondCount || 0),
      0,
    );

    return marketBondCount > 0 ? marketBondCount + 100 : MARKET_BOND_FETCH_FALLBACK_LIMIT;
  }, [marketOverviewIndustryData]);

  useEffect(() => {
    let cancelled = false;

    const loadPreviewMarketBonds = async () => {
      setIsMarketBondPreviewLoading(true);

      try {
        const [marketRows, governmentRows, unlistedEnterpriseRows] = await Promise.all([
          loadBondFilterRows(
            {
              StatusID: 1,
              IsListing: 1,
              Top: marketBondFetchLimit,
            },
            { enrichWithDetails: false },
          ),
          loadGovernmentBondRows(),
          loadUnlistedEnterpriseBondRows(),
        ]);

        const mergedRows = Array.from(
          new Map(
            [...marketRows, ...governmentRows, ...unlistedEnterpriseRows]
              .filter((row) => Boolean(row?.bondCode))
              .map((row) => [row.bondCode, row] as const),
          ).values(),
        );

        const previewCodes = sortPreviewBondRows(mergedRows)
          .slice(0, 5)
          .map((row) => row.bondCode)
          .filter(Boolean);

        const detailMap = previewCodes.length > 0
          ? await loadBondDetailsMapByCodes(previewCodes, { concurrency: 5, forceRefresh: false })
          : {};

        if (cancelled) return;

        setMarketBondRows(
          mergedRows.map((row) => {
            const detailPayload = detailMap[row.bondCode];
            return detailPayload ? mergePreviewBondRowWithDetail(row, detailPayload) : row;
          }),
        );
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load login market bond preview', error);
          setMarketBondRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsMarketBondPreviewLoading(false);
        }
      }
    };

    void loadPreviewMarketBonds();

    return () => {
      cancelled = true;
    };
  }, [marketBondFetchLimit]);

  const copy: LoginCopy = isVietnamese
    ? {
        errorTitle: 'Lỗi đăng nhập',
        errorHint: 'Kiểm tra console (F12) để xem chi tiết lỗi.',
        signIn: 'Đăng nhập',
        getStarted: 'Bắt đầu ngay',
        section2Title: 'Nền Tảng Dữ Liệu và Phân Tích Trái Phiếu Toàn Diện',
        section2Subtitle:
          'Cung cấp dữ liệu thị trường, thông tin tổ chức phát hành, công cụ phân tích chuyên sâu và hệ thống theo dõi trực quan, giúp nhà đầu tư đánh giá cơ hội và rủi ro một cách nhanh chóng, chính xác.',
        previewEmpty: 'Chưa có dữ liệu để hiển thị.',
        section3Cards: [
          {
            id: 'market-overview',
            title: 'Tổng quan thị trường',
            description: 'Theo dõi toàn cảnh thị trường trái phiếu với dữ liệu về lãi suất, quy mô phát hành.',
            icon: ChartColumn,
            previewTitle: 'Khối lượng trái phiếu theo ngành',
          },
          {
            id: 'banking-industry',
            title: 'Ngành & Tổ chức phát hành',
            description:
              'Phân tích theo ngành, tra cứu thông tin tổ chức phát hành và đánh giá cơ hội đầu tư.',
            icon: Building2,
            previewTitle: 'Thị phần dư nợ trong ngành ngân hàng',
          },
          {
            id: 'market-bond-list',
            title: 'Danh sách trái phiếu',
            description:
              'Quản lý toàn bộ danh sách trái phiếu, theo dõi trái phiếu sắp đáo hạn và các mã quan tâm.',
            icon: ListChecks,
            previewTitle: '',
          },
        ],
        section4Title: 'Tại sao lựa chọn FireAnt Bonds?',
        section4Cards: [
          {
            title: 'Dữ liệu tin cậy',
            description: 'Cập nhật thông tin trái phiếu đầy đủ, hỗ trợ theo dõi thị trường hiệu quả.',
            icon: ShieldCheck,
          },
          {
            title: 'Phân tích toàn diện',
            description: 'Đánh giá trái phiếu theo thị trường, ngành và tổ chức phát hành.',
            icon: ChartColumn,
          },
          {
            title: 'Quản lý linh hoạt',
            description: 'Theo dõi danh sách quan tâm và biến động các mã trái phiếu dễ dàng.',
            icon: ListChecks,
          },
          {
            title: 'AI hỗ trợ thông minh',
            description: 'Tra cứu nhanh, phân tích dữ liệu và hỗ trợ quyết định đầu tư.',
            icon: Bot,
          },
        ],
        tableColumns: [
          { title: 'Mã trái phiếu', widthClassName: 'w-3/12', align: 'left' },
          { title: 'Lãi suất', unit: '(%)', widthClassName: 'w-2/12', align: 'right' },
          { title: 'Ngày đáo hạn', widthClassName: 'w-3/12', align: 'center' },
          { title: 'Giá trị phát hành', unit: '(Tỷ VNĐ)', widthClassName: 'w-4/12', align: 'right' },
        ],
      }
    : {
        errorTitle: 'Login error',
        errorHint: 'Check the console (F12) for error details.',
        signIn: 'Sign in',
        getStarted: 'Get started',
        section2Title: 'A Complete Corporate Bond Data and Analytics Platform',
        section2Subtitle:
          'Access market data, issuer intelligence, deep analysis tools, and clear monitoring views so investors can assess opportunities and risks quickly and accurately.',
        previewEmpty: 'No preview data available.',
        section3Cards: [
          {
            id: 'market-overview',
            title: 'Market overview',
            description: 'Track the full bond market with data on interest rates and issuance scale.',
            icon: ChartColumn,
            previewTitle: 'Bond volume by industry',
          },
          {
            id: 'banking-industry',
            title: 'Industries & issuers',
            description:
              'Analyze by industry, review issuer profiles, and evaluate investment opportunities.',
            icon: Building2,
            previewTitle: 'Banking outstanding balance share',
          },
          {
            id: 'market-bond-list',
            title: 'Bond list',
            description:
              'Manage the full bond universe, monitor upcoming maturities, and track saved bonds.',
            icon: ListChecks,
            previewTitle: '',
          },
        ],
        section4Title: 'Why choose FireAnt Bonds?',
        section4Cards: [
          {
            title: 'Reliable data',
            description: 'Stay current with complete bond information and monitor the market effectively.',
            icon: ShieldCheck,
          },
          {
            title: 'Comprehensive analysis',
            description: 'Evaluate bonds by market, industry, and issuer perspective.',
            icon: ChartColumn,
          },
          {
            title: 'Flexible management',
            description: 'Track watchlists and bond movements with a more practical workflow.',
            icon: ListChecks,
          },
          {
            title: 'Smart AI support',
            description: 'Search quickly, analyze data, and support faster investment decisions.',
            icon: Bot,
          },
        ],
        tableColumns: [
          { title: 'Bond code', widthClassName: 'w-3/12', align: 'left' },
          { title: 'Rate', unit: '(%)', widthClassName: 'w-2/12', align: 'right' },
          { title: 'Maturity date', widthClassName: 'w-3/12', align: 'center' },
          { title: 'Issue value', unit: '(Billion VND)', widthClassName: 'w-4/12', align: 'right' },
        ],
      };

  const previewBondRows = useMemo<PreviewTableRow[]>(() => {
    return sortPreviewBondRows(marketBondRows)
      .slice(0, LOGIN_PREVIEW_ROW_COUNT)
      .map((row) => ({
        code: row.bondCode,
        rate: formatInterestRate(row.bondRate),
        maturity: formatDate(row.maturityDate),
        value: formatNumber((row.totalIssuedValue || 0) / 1_000_000_000, 2),
      }));
  }, [marketBondRows]);

  const overviewVolumeChartOption = useMemo(() => {
    if (marketOverviewIndustryData.length === 0) return null;

    return applyChartTheme(
      {
        color: CHART_PALETTE,
        tooltip: {
          show: false,
        },
        legend: {
          top: 0,
          right: 8,
          data: [
            language === 'vi' ? 'Phát hành' : 'Issued',
            language === 'vi' ? 'Niêm yết' : 'Listed',
          ],
        },
        grid: {
          left: '5%',
          right: '5%',
          top: '16%',
          bottom: '0%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: marketOverviewIndustryData.map((item) => t(item.icbName as any)),
          axisLabel: {
            interval: 0,
            rotate: 35,
            fontSize: 10,
          },
        },
        yAxis: {
          type: 'value',
          name: t('unitMillionShares'),
          nameGap: 10,
          nameTextStyle: {
            fontSize: 10,
            color: chartTheme.text,
            fontWeight: 'bold',
            fontFamily: 'Manrope',
          },
          axisLabel: {
            margin: 12,
            formatter: (value: number) => formatNumber(value, 2),
          },
          splitLine: {
            show: false,
          },
        },
        series: [
          {
            name: language === 'vi' ? 'Phát hành' : 'Issued',
            type: 'bar',
            data: marketOverviewIndustryData.map((item) => Number(item.totalIssuedVolume || 0) / 1_000_000),
            barWidth: '28%',
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
            },
          },
          {
            name: language === 'vi' ? 'Niêm yết' : 'Listed',
            type: 'bar',
            data: marketOverviewIndustryData.map((item) => Number(item.totalCurrentListedVolume || 0) / 1_000_000),
            barWidth: '28%',
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
            },
          },
        ],
      },
      isDark,
    );
  }, [isDark, language, marketOverviewIndustryData, t]);

  const bankingMarketShareOption = useMemo(() => {
    if (bankingRankingData.length === 0) return null;

    const totalRemainingDebt = bankingRankingData.reduce(
      (sum, item) => sum + Number(item?.totalRemainingDebt || 0),
      0,
    );
    const topNine = bankingRankingData.slice(0, 9);
    const topNineDebt = topNine.reduce((sum, item) => sum + Number(item?.totalRemainingDebt || 0), 0);
    const othersDebt = totalRemainingDebt - topNineDebt;

    const chartData = topNine.map((item, index) => ({
      value: Number(item.totalRemainingDebt || 0),
      name: item.issuerSymbol || '',
      itemStyle: {
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      },
    }));

    if (othersDebt > 0) {
      chartData.push({
        value: othersDebt,
        name: t('others'),
        itemStyle: {
          color: CHART_PALETTE[9 % CHART_PALETTE.length],
        },
      });
    }

    const legendGroups = splitLegendItems(chartData.map((item) => item.name), 5, 2);
    const legendBase = {
      orient: 'vertical' as const,
      itemWidth: 8,
      itemHeight: 8,
    };
    const legendConfig = legendGroups.length > 1
      ? [
          {
            ...legendBase,
            right: '18%',
            top: 'middle',
            data: legendGroups[0],
          },
          {
            ...legendBase,
            right: '2%',
            top: 'middle',
            data: legendGroups[1],
          },
        ]
      : {
          ...legendBase,
          right: '4%',
          top: 'middle',
          data: legendGroups[0],
        };

    return applyChartTheme(
      {
        color: CHART_PALETTE,
        tooltip: {
          show: false,
        },
        legend: legendConfig,
        series: [
          {
            name: t('marketShare'),
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['34%', '50%'],
            avoidLabelOverlap: true,
            label: {
              show: false,
            },
            labelLine: {
              show: false,
            },
            itemStyle: {
              borderRadius: 8,
            },
            emphasis: {
              label: {
                show: false,
              },
            },
            data: chartData,
          },
        ],
      },
      isDark,
    );
  }, [bankingRankingData, isDark, t]);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      await onSignIn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('OIDC sign-in failed:', errorMessage);
      setLoginError(
        errorMessage ||
          (isVietnamese
            ? 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.'
            : 'An error occurred while signing in. Please try again.'),
      );
    }
  };

  return (
    <div className="min-h-dvh bg-bg-base text-text-base">
      <div className="relative z-10">
        <header className="border-b border-border-base bg-surface-bright/95 backdrop-blur">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
            <Logo />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
                title={effectiveTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                aria-label={effectiveTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {effectiveTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setLanguage((isVietnamese ? 'en' : 'vi') as Language)}
                className="flex h-10 items-center gap-2 rounded-lg border border-border-base bg-bg-surface px-3 text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
                title="Language"
                aria-label="Language"
              >
                <Languages className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">{currentLanguageLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={isSigningIn}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-action-accent px-4 text-sm font-semibold text-slate-950 shadow-md shadow-cyan-500/20 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.signIn}
              </button>
            </div>
          </div>
        </header>

        {loginError ? (
          <div className="mx-auto max-w-screen-2xl px-4 pt-4 lg:px-6">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-semibold text-red-800">{copy.errorTitle}</p>
                  <p className="mt-1 text-sm text-red-700">{loginError}</p>
                  <p className="mt-2 text-xs text-red-600">{copy.errorHint}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <main>
          <section className="bg-bg-base px-4 py-12 lg:px-6 lg:py-16">
            <div className="mx-auto max-w-screen-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mx-auto max-w-3xl text-center"
              >
                <h1 className="text-4xl font-bold leading-tight text-text-base sm:text-5xl">
                  {copy.section2Title}
                </h1>
                <p className="mt-5 text-base font-medium leading-8 text-text-muted sm:text-lg">
                  {copy.section2Subtitle}
                </p>
                <button
                  type="button"
                  onClick={() => void handleLogin()}
                  disabled={isSigningIn}
                  className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-action-accent px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copy.getStarted}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>

              <div className="mt-12 grid gap-6 xl:grid-cols-3">
                {copy.section3Cards.map((card, index) => {
                  const isOverviewCard = card.id === 'market-overview';
                  const isBankingCard = card.id === 'banking-industry';
                  const isBondListCard = card.id === 'market-bond-list';

                  return (
                    <motion.article
                      key={card.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.35, delay: index * 0.06 }}
                      className={`flex h-full flex-col p-5 ${LOGIN_CARD_SURFACE_CLASSNAME}`}
                    >
                      <FeaturePreview
                        chartOption={isOverviewCard ? overviewVolumeChartOption : isBankingCard ? bankingMarketShareOption : null}
                        tableColumns={isBondListCard ? copy.tableColumns : undefined}
                        tableRows={isBondListCard ? previewBondRows : undefined}
                        previewTitle={card.previewTitle}
                        isLoading={
                          isOverviewCard
                            ? marketOverviewIndustryQuery.isLoading && marketOverviewIndustryData.length === 0
                            : isBankingCard
                              ? bankingIndustryQuery.isLoading && bankingRankingData.length === 0
                              : isBondListCard
                                ? isMarketBondPreviewLoading
                                : false
                        }
                        emptyMessage={copy.previewEmpty}
                      />
                      <div className="mt-5 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                            <card.icon className="h-6 w-6" />
                          </div>
                          <h2 className="text-xl font-bold text-text-base">{card.title}</h2>
                        </div>
                        <p className="mt-3 text-sm font-medium leading-7 text-text-muted">
                          {card.description}
                        </p>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-t border-border-base bg-bg-base px-4 py-16 lg:px-6">
            <div className="mx-auto max-w-screen-2xl">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold text-text-base">{copy.section4Title}</h2>
              </div>

              <div className="mt-8 grid gap-6 md:grid-cols-2">
                {copy.section4Cards.map((card, index) => (
                  <motion.article
                    key={card.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className={`p-5 ${LOGIN_CARD_SURFACE_CLASSNAME}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                        <card.icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-bold text-text-base">{card.title}</h3>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-7 text-text-muted">{card.description}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
