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
import {
  useIndustryBaseDashboardQuery,
  useMarketOverviewIndustryDataQuery,
} from '../query/dashboardQueries';
import { applyChartTheme, getChartTheme, splitLegendItems } from '../utils/chart';
import { formatDate, formatInterestRate, formatNumber } from '../utils/format';
import { loadMarketOverviewTopInterestData } from '../services/marketOverviewData';

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

interface HighYieldBondPreviewRow {
  bondCode: string;
  maturityDate: string;
  bondRate: number;
  currentListedVolume: number;
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

const LOGIN_PREVIEW_ROW_COUNT = 6;
const LOGIN_COLOR_SYSTEM = {
  page: '#F8FAFC',
  pageMuted: '#F1F5F9',
  card: '#FFFFFF',
  heroTitle: '#0F172A',
  cardTitle: '#1E293B',
  bodyText: '#64748B',
  ctaStart: '#4F46E5',
  ctaEnd: '#06B6D4',
  tableHeader: '#475569',
  bondLink: '#3B82F6',
} as const;
const LOGIN_CARD_SURFACE_CLASSNAME =
  'rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5 ring-1 ring-white/80 transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/95 dark:ring-slate-800/80 dark:shadow-black/20';
const LOGIN_PREVIEW_PANEL_CLASSNAME =
  'mt-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-slate-50/90 ring-1 ring-slate-200/70 dark:bg-slate-950/40 dark:ring-slate-800/70';
const LOGIN_CTA_WRAPPER_CLASSNAME =
  'inline-flex rounded-full bg-white/90 p-1 shadow-sm shadow-slate-900/10 ring-1 ring-slate-200/80 backdrop-blur dark:bg-slate-900/90 dark:ring-slate-700/80';
const LOGIN_CTA_BUTTON_CLASSNAME =
  'group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950';
const LOGIN_HEADER_BUTTON_CLASSNAME =
  'group relative inline-flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950';
const LOGIN_PIE_PALETTE = ['#1E293B', '#334155', '#0F766E', '#0F9BA8', '#06B6D4', '#38BDF8', '#7DD3FC', '#99F6E4', '#CFFAFE', '#E2E8F0'];
const LOGIN_BAR_GRADIENTS = [
  ['#2563EB', '#67E8F9'],
  ['#0EA5E9', '#5EEAD4'],
] as const;

const createLinearGradient = (start: string, end: string, horizontal = false) => ({
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: horizontal ? 1 : 0,
  y2: horizontal ? 0 : 1,
  colorStops: [
    { offset: 0, color: start },
    { offset: 1, color: end },
  ],
});

const getCurrentLanguageLabel = (language: Language) => (language === 'vi' ? 'VI' : 'EN');

const normalizeHighYieldBondRow = (row: any): HighYieldBondPreviewRow | null => {
  const bondCode = String(row?.bondCode || row?.BondCode || row?.code || row?.Code || '').trim();
  if (!bondCode) return null;

  return {
    bondCode,
    maturityDate: String(row?.maturityDate || row?.MaturityDate || row?.dueDate || row?.DueDate || '').split('T')[0],
    bondRate: Number(row?.bondRate || row?.BondRate || row?.interestRate || row?.InterestRate || row?.couponRate || row?.CouponRate || 0),
    currentListedVolume: Number(
      row?.currentListedVolume || row?.CurrentListedVolume || row?.listedVolume || row?.ListedVolume || 0,
    ),
  };
};

const sortPreviewBondRows = (rows: HighYieldBondPreviewRow[]) =>
  [...rows].sort((left, right) => {
    const rateDiff = Number(right.bondRate || 0) - Number(left.bondRate || 0);
    if (rateDiff !== 0) {
      return rateDiff;
    }

    return String(left.bondCode || '').localeCompare(String(right.bondCode || ''));
  });

function PreviewLoadingState() {
  return (
    <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
      <div className="flex h-6 items-center">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className={`${LOGIN_PREVIEW_PANEL_CLASSNAME} animate-pulse`} />
    </div>
  );
}

function PreviewEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
      <div className="flex h-6 items-center">
        {title ? <p className="text-xs font-bold uppercase tracking-wider text-slate-950">{title}</p> : <span className="invisible text-sm font-bold">.</span>}
      </div>
      <div className={`${LOGIN_PREVIEW_PANEL_CLASSNAME} flex items-center justify-center px-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400`}>
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
          <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-950 dark:text-slate-300">{previewTitle || ' '}</p>
        </div>
        <div className={`${LOGIN_PREVIEW_PANEL_CLASSNAME} p-2`}>
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
        </div>
      </div>
    );
  }

  if (tableColumns && tableRows && tableRows.length > 0) {
    return (
      <div className={`flex h-80 flex-col p-4 ${LOGIN_CARD_SURFACE_CLASSNAME}`}>
        <div className={LOGIN_PREVIEW_PANEL_CLASSNAME}>
          <table className="h-full w-full table-fixed">
            <thead className="border-b border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white">
              <tr>
                {tableColumns.map((column) => (
                  <th
                    key={column.title}
                    className={`px-2 py-2 text-xs font-bold uppercase tracking-normal whitespace-nowrap leading-none ${
                      column.widthClassName || ''
                    } ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    <span className="block origin-center whitespace-nowrap scale-90">{column.title}</span>
                    {column.unit ? <span className="mt-1 block origin-center scale-90 text-xs font-bold text-white/80">{column.unit}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {tableRows.map((row, index) => (
                <tr
                  key={row.code}
                  className={`text-xs font-medium text-slate-700 transition-colors dark:text-slate-200 ${
                    index % 2 === 0 ? 'bg-slate-50/80 dark:bg-slate-950/40' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-2.5 font-bold text-blue-500 dark:text-cyan-400">{row.code}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">{row.rate}</td>
                  <td className="whitespace-nowrap px-1 py-2.5 text-center text-slate-500 dark:text-slate-400">{row.maturity}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{row.value}</td>
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
  const [marketBondRows, setMarketBondRows] = useState<HighYieldBondPreviewRow[]>([]);
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

  useEffect(() => {
    let cancelled = false;

    const loadPreviewMarketBonds = async () => {
      setIsMarketBondPreviewLoading(true);

      try {
        const response = await loadMarketOverviewTopInterestData();
        const mergedRows = Array.isArray(response)
          ? response
              .map(normalizeHighYieldBondRow)
              .filter((row): row is HighYieldBondPreviewRow => Boolean(row?.bondCode))
          : [];

        if (cancelled) return;

        setMarketBondRows(mergedRows);
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
  }, []);

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
            description: 'Kho dữ liệu trái phiếu được cập nhật liên tục, giúp nhà đầu tư tiếp cận thông tin chính xác.',
            icon: ShieldCheck,
          },
          {
            title: 'Phân tích toàn diện',
            description: 'Cung cấp góc nhìn đa chiều về doanh nghiệp, ngành và chất lượng trái phiếu phát hành.',
            icon: ChartColumn,
          },
          {
            title: 'Quản lý linh hoạt',
            description: 'Tùy chỉnh danh sách theo dõi và quản lý thông tin đầu tư theo nhu cầu riêng.',
            icon: ListChecks,
          },
          {
            title: 'AI hỗ trợ thông minh',
            description: 'Ứng dụng AI để tổng hợp, phân tích và giải đáp nhanh các câu hỏi về trái phiếu.',
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

  const bondListColumns: PreviewTableColumn[] = isVietnamese
    ? [
        { title: 'MÃ TRÁI PHIẾU', widthClassName: 'w-3/12', align: 'left' },
        { title: 'LÃI SUẤT', unit: '(%)', widthClassName: 'w-2/12', align: 'right' },
        { title: 'NGÀY ĐÁO HẠN', widthClassName: 'w-3/12', align: 'center' },
        { title: 'KL NIÊM YẾT', widthClassName: 'w-4/12', align: 'right' },
      ]
    : [
        { title: 'BOND CODE', widthClassName: 'w-3/12', align: 'left' },
        { title: 'RATE', unit: '(%)', widthClassName: 'w-2/12', align: 'right' },
        { title: 'MATURITY DATE', widthClassName: 'w-3/12', align: 'center' },
        { title: 'LISTED VOLUME', widthClassName: 'w-4/12', align: 'right' },
      ];

  const previewBondRows = useMemo<PreviewTableRow[]>(() => {
    return sortPreviewBondRows(marketBondRows)
      .slice(0, LOGIN_PREVIEW_ROW_COUNT)
      .map((row) => ({
        code: row.bondCode,
        rate: formatInterestRate(row.bondRate),
        maturity: formatDate(row.maturityDate),
        value: formatNumber(row.currentListedVolume || 0, 0),
      }));
  }, [marketBondRows]);

  const overviewVolumeChartOption = useMemo(() => {
    if (marketOverviewIndustryData.length === 0) return null;

    return applyChartTheme(
      {
        color: LOGIN_BAR_GRADIENTS.map(([start]) => start),
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
            color: isDark ? chartTheme.text : LOGIN_COLOR_SYSTEM.cardTitle,
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
              color: createLinearGradient(LOGIN_BAR_GRADIENTS[0][0], LOGIN_BAR_GRADIENTS[0][1]),
              shadowBlur: 12,
              shadowColor: 'rgba(37,99,235,0.18)',
            },
          },
          {
            name: language === 'vi' ? 'Niêm yết' : 'Listed',
            type: 'bar',
            data: marketOverviewIndustryData.map((item) => Number(item.totalCurrentListedVolume || 0) / 1_000_000),
            barWidth: '28%',
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: createLinearGradient(LOGIN_BAR_GRADIENTS[1][0], LOGIN_BAR_GRADIENTS[1][1]),
              shadowBlur: 12,
              shadowColor: 'rgba(6,182,212,0.16)',
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
        color: LOGIN_PIE_PALETTE[index % LOGIN_PIE_PALETTE.length],
      },
    }));

    if (othersDebt > 0) {
      chartData.push({
        value: othersDebt,
        name: t('others'),
        itemStyle: {
          color: LOGIN_PIE_PALETTE[9 % LOGIN_PIE_PALETTE.length],
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
        color: LOGIN_PIE_PALETTE,
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
    <div className="relative min-h-dvh overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-cyan-100/70 via-indigo-50/40 to-transparent dark:from-cyan-500/10 dark:via-indigo-500/10 dark:to-transparent" />
        <div className="absolute -left-12 top-20 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute right-0 top-16 h-80 w-80 rounded-full bg-indigo-100/60 blur-3xl dark:bg-indigo-500/10" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sky-100/60 blur-3xl dark:bg-sky-500/10" />
      </div>

      <div className="relative z-10">
        <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
            <Logo />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-900/5 transition-colors hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                title={effectiveTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                aria-label={effectiveTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {effectiveTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setLanguage((isVietnamese ? 'en' : 'vi') as Language)}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-500 shadow-sm shadow-slate-900/5 transition-colors hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
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
                className={`${LOGIN_HEADER_BUTTON_CLASSNAME} h-10 px-4 text-sm`}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1/2 rounded-lg bg-gradient-to-b from-white/35 to-transparent opacity-90 transition-opacity duration-200 group-hover:opacity-100"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg ring-1 ring-white/20"
                />
                <span className="relative z-10">{copy.signIn}</span>
              </button>
            </div>
          </div>
        </header>

        {loginError ? (
          <div className="mx-auto max-w-screen-2xl px-4 pt-4 lg:px-6">
            <div className="rounded-3xl border border-red-200 bg-white p-4 shadow-sm shadow-red-100 dark:border-red-900/60 dark:bg-slate-900">
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
          <section className="px-4 py-12 lg:px-6 lg:py-16">
            <div className="mx-auto max-w-screen-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mx-auto max-w-3xl text-center"
              >
                <h1 className="mt-6 text-4xl font-bold leading-tight text-slate-950 sm:text-5xl dark:text-slate-50">
                  {copy.section2Title}
                </h1>
                <p className="mt-5 text-base font-medium leading-8 text-slate-500 sm:text-lg dark:text-slate-300">
                  {copy.section2Subtitle}
                </p>
                <div className={`${LOGIN_CTA_WRAPPER_CLASSNAME} mt-8`}>
                  <button
                    type="button"
                    onClick={() => void handleLogin()}
                    disabled={isSigningIn}
                    className={`${LOGIN_CTA_BUTTON_CLASSNAME} px-6 py-3.5 text-sm`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-transparent opacity-90 transition-opacity duration-200 group-hover:opacity-100"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full ring-1 ring-white/20"
                    />
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {copy.getStarted}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                </div>
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
                        tableColumns={isBondListCard ? bondListColumns : undefined}
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
                          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-cyan-100 text-indigo-600 ring-1 ring-indigo-100 dark:from-indigo-500/15 dark:to-cyan-500/15 dark:text-cyan-300 dark:ring-indigo-900/40">
                            <card.icon className="h-6 w-6" />
                          </div>
                          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{card.title}</h2>
                        </div>
                        <p className="mt-3 text-sm font-medium leading-7 text-slate-500 dark:text-slate-300">
                          {card.description}
                        </p>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200/80 bg-slate-100/70 px-4 py-16 dark:border-slate-800/80 dark:bg-slate-950/60 lg:px-6">
            <div className="mx-auto max-w-screen-2xl">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold text-slate-950 dark:text-slate-50">{copy.section4Title}</h2>
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
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-cyan-100 text-indigo-600 ring-1 ring-indigo-100 dark:from-indigo-500/15 dark:to-cyan-500/15 dark:text-cyan-300 dark:ring-indigo-900/40">
                        <card.icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{card.title}</h3>
                        <p className="mt-2 text-sm font-medium leading-7 text-slate-500 dark:text-slate-300">{card.description}</p>
                      </div>
                    </div>
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
