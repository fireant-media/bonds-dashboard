import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  X,
  Info,
  Calendar,
  TrendingUp,
  Activity,
  Briefcase,
  AlertTriangle,
  ArrowLeftRight,
  LoaderCircle,
} from 'lucide-react';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import BondComparisonPopup from './BondComparisonPopup';
import { fireantApi } from '../api/fireant';
import { sendChat } from '../api/ai';
import { useAIStore } from '../store/aiStore';
import { CHART_PALETTE, getChartTooltip } from '../utils/chart';
import { isBondTracked, removeWatchlistItem, upsertWatchlistItem } from '../utils/watchlist';

interface BondDetailPopupProps {
  bond: Bond;
  enterpriseName: string;
  onClose: () => void;
}

function isModelTierError(message: string): boolean {
  const lower = (message || '').toLowerCase();
  return lower.includes('not allowed') || lower.includes('user tier') || lower.includes('model_not_allowed');
}

function extractAiError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Không thể tạo nhận xét AI';
  const anyErr = err as any;
  return anyErr?.response?.data?.details || anyErr?.response?.data?.error || anyErr?.message || 'Không thể tạo nhận xét AI';
}

export default function BondDetailPopup({ bond, enterpriseName, onClose }: BondDetailPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartPalette = CHART_PALETTE;
  const chartTooltip = getChartTooltip(isDark);
  const {
    configured,
    selectedModel,
    defaultModel,
    models,
    systemPrompt,
    defaultSystemPrompt,
    isLoadingStatus,
    isLoadingModels,
    statusError,
    refreshStatus,
    refreshModels,
  } = useAIStore();

  const [bondDetails, setBondDetails] = useState<Bond | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [aiCommentary, setAiCommentary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState(false);
  const aiRequestIdRef = useRef(0);
  const refreshedModelsOnOpenRef = useRef(false);

  const formatTerm = (rawTerm: any) => {
    if (!rawTerm || rawTerm === 'N/A') return 'N/A';
    const clean = String(rawTerm).replace(/thang|months/gi, '').trim();
    return `${clean} ${t('monthUnit')}`;
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    setIsTracked(isBondTracked(bond.code));

    const fetchDetails = async () => {
      try {
        const data = await fireantApi.getBond(bond.code);
        const detail = data.detail || {};
        const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
        const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

        const interestRate =
          detail.bondRate || detail.interestRate || detail.couponRate || cashFlowRate || bond.interestRate;
        const rawInterestType =
          detail.bondRateType ||
          detail.interestRateType ||
          detail.couponRateType ||
          detail.interestType ||
          bond.interestType ||
          '';
        const paymentMethod = detail.interestPaymentMethod || detail.paymentMethod || detail.bondType || detail.bondName || '';
        const interestType = normalizeInterestType(rawInterestType, paymentMethod, Array.isArray(data.cashFlows) ? data.cashFlows : []);
        const listedVolume = detail.currentListedVolume || historyItem?.volume || bond.listedVolume;
        const issueValue = detail.totalIssuedValue
          ? detail.totalIssuedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.issuedValue;
        const listedValue = detail.currentListedValue
          ? detail.currentListedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.listedValue;

        setBondDetails({
          ...bond,
          term: detail.tenorPeriod ? formatTerm(detail.tenorPeriod) : formatTerm(bond.term),
          issueDate: detail.issueDate ? detail.issueDate.split('T')[0] : bond.issueDate,
          maturityDate: detail.maturityDate ? detail.maturityDate.split('T')[0] : bond.maturityDate,
          interestType,
          interestRate,
          listedVolume,
          issuedValue: issueValue,
          listedValue,
          status: detail.status || bond.status,
          cashFlows: (data.cashFlows || []).map((cf: any) => ({
            paymentDate: cf.paymentDate,
            interestAmount: (cf.interestAmount || 0) / 1000000000,
            principalAmount: (cf.principalAmount || 0) / 1000000000,
            totalCashflow: (cf.totalCashflow || 0) / 1000000000,
            bondRate: cf.bondRate || 0,
          })),
        });
      } catch (err) {
        console.error('Error fetching bond details:', err);
        setError(err instanceof Error ? err.message : t('bondDetailError'));
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [bond, t]);

  useEffect(() => {
    if (!configured && !isLoadingStatus && !statusError) {
      void refreshStatus();
    }
  }, [configured, isLoadingStatus, refreshStatus, statusError]);

  useEffect(() => {
    if (!configured || isLoadingModels || refreshedModelsOnOpenRef.current) return;
    refreshedModelsOnOpenRef.current = true;
    void refreshModels(true);
  }, [configured, isLoadingModels, refreshModels]);

  useEffect(() => {
    setIsTracked(isBondTracked(bond.code));
  }, [bond.code]);

  const currentBond = bondDetails || bond;
  const allowedModelIds = useMemo(() => new Set(models.map((model) => model.id)), [models]);
  const validSelectedModel = selectedModel && allowedModelIds.has(selectedModel) ? selectedModel : '';
  const validDefaultModel = defaultModel && allowedModelIds.has(defaultModel) ? defaultModel : '';
  const activeModel = validSelectedModel || validDefaultModel || defaultModel || selectedModel || models[0]?.id || '';

  const maturityInfo = useMemo(() => {
    if (!currentBond.maturityDate) return null;
    const maturity = new Date(currentBond.maturityDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { days: diffDays, isNear: diffDays >= 0 && diffDays <= 90 };
  }, [currentBond.maturityDate]);

  const details = useMemo(() => {
    const rawType = String(currentBond.interestType || '').trim();
    const normalized = rawType.toLowerCase();
    const interestTypeValue = (() => {
      if (!normalized) return '-';
      if (normalized.includes('cố định') || normalized.includes('fixed')) return t('fixed');
      if (normalized.includes('thả nổi') || normalized.includes('floating')) return t('floating');
      return rawType;
    })();

    return [
      { label: t('bondCode'), value: currentBond.code, icon: Activity },
      { label: t('bondIssuer'), value: enterpriseName || currentBond.enterpriseId || '-', icon: Briefcase },
      { label: t('term'), value: formatTerm(currentBond.term), icon: Calendar },
      { label: t('issueDate'), value: formatDate(currentBond.issueDate), icon: Calendar },
      { label: t('maturityDate'), value: formatDate(currentBond.maturityDate), icon: Calendar },
      { label: t('interestRate'), value: `${formatInterestRate(currentBond.interestRate)}%`, icon: TrendingUp },
      { label: t('interestType'), value: interestTypeValue, icon: Info },
      { label: t('listedVolume'), value: formatNumber(currentBond.listedVolume || 0, 0), icon: Activity },
      { label: t('issuedValue'), value: `${formatNumber(currentBond.issuedValue || 0, 2)} ${t('unitBillionShort')}`, icon: Briefcase },
      { label: t('listedValueTitle'), value: `${formatNumber(currentBond.listedValue || 0, 2)} ${t('unitBillionShort')}`, icon: Briefcase },
    ];
  }, [currentBond, enterpriseName, t]);

  const aiPrompt = useMemo(() => {
    const daysToMaturity = currentBond.maturityDate
      ? Math.ceil((new Date(currentBond.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const rawType = String(currentBond.interestType || '').toLowerCase();
    const interestTypeLabel = rawType.includes('cố định') || rawType.includes('fixed')
      ? 'lãi suất cố định'
      : rawType.includes('thả nổi') || rawType.includes('floating')
        ? 'lãi suất thả nổi'
        : currentBond.interestType || 'không xác định';

    return [
      'Bạn là chuyên gia phân tích trái phiếu doanh nghiệp.',
      'Viết đúng 2 câu, bằng tiếng Việt, ngắn gọn, không bullet, không tiêu đề, không dùng câu chung chung.',
      'Nhận xét bắt buộc phải dựa trên các dữ liệu sau: lãi suất, loại lãi suất, thời gian đến đáo hạn, trạng thái trái phiếu.',
      'Không dùng các cụm như: "cần tiếp tục theo dõi", "cấu trúc cân bằng", "mức hấp dẫn thực tế", "nên cân nhắc".',
      `Mã trái phiếu: ${currentBond.code}`,
      `Doanh nghiệp phát hành: ${enterpriseName || currentBond.enterpriseId || 'N/A'}`,
      `Lãi suất: ${formatInterestRate(currentBond.interestRate)}%`,
      `Loại lãi suất: ${interestTypeLabel}`,
      `Ngày phát hành: ${currentBond.issueDate || 'N/A'}`,
      `Ngày đáo hạn: ${currentBond.maturityDate || 'N/A'}`,
      `Số ngày đến đáo hạn: ${daysToMaturity ?? 'N/A'}`,
      `Trạng thái: ${currentBond.status || 'N/A'}`,
      `Giá trị niêm yết: ${formatNumber(currentBond.listedValue || 0, 2)} ${t('unitBillionShort')}`,
    ].join('\n');
  }, [currentBond, enterpriseName, t]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++aiRequestIdRef.current;

    const sendWithModel = async (modelId: string) =>
      sendChat({
        userMessage: 'Hãy viết nhận xét ngắn gọn dựa trên dữ liệu trái phiếu được cung cấp, bám sát số liệu cụ thể.',
        model: modelId,
        systemPrompt: systemPrompt || defaultSystemPrompt || undefined,
        messages: [],
        pageContext: aiPrompt,
      });

    const generate = async () => {
      if (loading || isLoadingStatus || isLoadingModels) return;

      if (!configured) {
        setAiCommentary('');
        setAiError(statusError || 'AI service is not configured');
        return;
      }

      if (!activeModel) {
        setAiCommentary('');
        setAiError('No AI model selected');
        return;
      }

      setAiLoading(true);
      setAiError(null);

      try {
        const response = await sendWithModel(activeModel);
        if (cancelled || requestId !== aiRequestIdRef.current) return;

        const text = response.text.trim().replace(/\s+/g, ' ');
        if (!text) {
          setAiCommentary('');
          setAiError('AI trả về nội dung rỗng');
          return;
        }
        setAiCommentary(text);
      } catch (err) {
        const errorMessage = extractAiError(err);
        const normalized = errorMessage.toLowerCase();

        if (isModelTierError(normalized)) {
          await refreshModels(true);
          const refreshed = useAIStore.getState();
          const refreshedAllowedIds = new Set(refreshed.models.map((model) => model.id));
          const retryModel =
            (refreshed.selectedModel && refreshedAllowedIds.has(refreshed.selectedModel) ? refreshed.selectedModel : '') ||
            (refreshed.defaultModel && refreshedAllowedIds.has(refreshed.defaultModel) ? refreshed.defaultModel : '') ||
            refreshed.models[0]?.id ||
            '';

          if (retryModel && retryModel !== activeModel) {
            try {
              const retryResponse = await sendWithModel(retryModel);
              if (cancelled || requestId !== aiRequestIdRef.current) return;

              const text = retryResponse.text.trim().replace(/\s+/g, ' ');
              if (!text) {
                setAiCommentary('');
                setAiError('AI trả về nội dung rỗng');
                return;
              }
              setAiCommentary(text);
              return;
            } catch (retryErr) {
              if (cancelled || requestId !== aiRequestIdRef.current) return;
              setAiCommentary('');
              setAiError(extractAiError(retryErr));
              return;
            }
          }
        }

        if (!cancelled && requestId === aiRequestIdRef.current) {
          setAiCommentary('');
          setAiError(errorMessage);
        }
      } finally {
        if (!cancelled && requestId === aiRequestIdRef.current) {
          setAiLoading(false);
        }
      }
    };

    if (!loading) {
      setAiCommentary('');
      generate();
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeModel,
    aiPrompt,
    configured,
    defaultSystemPrompt,
    isLoadingModels,
    isLoadingStatus,
    loading,
    refreshModels,
    statusError,
    systemPrompt,
  ]);

  const getCashFlowOptions = () => {
    if (!bondDetails?.cashFlows) return {};
    const sortedCashFlows = [...bondDetails.cashFlows].sort(
      (a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime(),
    );
    const dates = sortedCashFlows.map((cf) => {
      const date = new Date(cf.paymentDate);
      return `T${date.getMonth() + 1}/${date.getFullYear()}`;
    });

    return {
      color: chartPalette,
      tooltip: {
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          let res = `${params[0].name}<br/>`;
          params.forEach((p: any) => {
            res += `${p.marker} ${p.seriesName}: ${formatNumber(p.value || 0, 2)} ${t('unitBillionShort')}<br/>`;
          });
          const total = params.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
          res += `<strong>${t('total')}: ${formatNumber(total || 0, 2)} ${t('unitBillionShort')}</strong>`;
          return res;
        },
      },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10 } },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: {
        name: t('unitBillionVND'),
        type: 'value',
        axisLabel: { fontSize: 10, formatter: (value: number) => formatNumber(value, 0) },
      },
      series: [
        { name: t('principal'), type: 'bar', stack: 'total', data: sortedCashFlows.map((cf) => cf.principalAmount) },
        { name: t('interest'), type: 'bar', stack: 'total', data: sortedCashFlows.map((cf) => cf.interestAmount) },
      ],
    };
  };

  const handleTrackBond = () => {
    const updated = upsertWatchlistItem({
      ...currentBond,
      issuerName: enterpriseName || currentBond.enterpriseId || currentBond.code,
      ticker: currentBond.enterpriseId || '',
    });
    setIsTracked(updated.some((item) => item.code === currentBond.code));
  };

  const handleUntrackBond = () => {
    removeWatchlistItem(currentBond.code);
    setIsTracked(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 backdrop-blur-sm md:p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="flex max-h-screen w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-bg-surface shadow-2xl transition-colors animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-base bg-bg-base/50 p-4 transition-colors md:p-6">
          <div className="flex min-w-0 items-center gap-3 md:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 md:h-12 md:w-12">
              <Activity className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold tracking-tight text-text-base md:text-xl">{t('bondDetailTitle')}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="hidden items-center gap-2 rounded-xl bg-text-highlight/10 px-4 py-2 text-xs font-bold text-text-highlight transition-all hover:bg-text-highlight/20 disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
              onClick={() => setShowComparison(true)}
              disabled={loading || !bondDetails}
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span>{t('compareBond')}</span>
            </button>
            <button onClick={onClose} className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-base hover:text-text-base">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {showComparison && (
          <BondComparisonPopup
            primaryBond={currentBond}
            onClose={onClose}
            onBack={() => setShowComparison(false)}
          />
        )}

        <div className="grid min-h-0 flex-1 grid-cols-12 overflow-hidden">
          <div className="col-span-12 border-border-base bg-bg-surface p-4 transition-colors lg:col-span-5 lg:border-r md:p-5">
            <div className="space-y-4">
              {details.map((detail) => {
                const isMaturityNear = detail.label === t('maturityDate') && maturityInfo?.isNear;
                return (
                  <div key={detail.label} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-base text-text-muted">
                      <detail.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/80">{detail.label}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className={`text-sm font-bold leading-tight ${isMaturityNear ? 'text-rose-600 dark:text-rose-400' : 'text-text-base'}`}>
                          {detail.value}
                        </p>
                        {isMaturityNear && (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-rose-600 dark:border-rose-400/30 dark:bg-rose-900/20 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-tight shrink-0">
                              {t('statusNear')} ({maturityInfo?.days} {t('daysUnit').toLowerCase()})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-span-12 flex min-h-0 flex-col bg-bg-base/30 p-4 transition-colors lg:col-span-7 md:p-5">
            <div className="mb-3">
              <h3 className="text-center text-base font-bold tracking-tight text-text-base transition-colors">
                {t('expectedCashFlow')}
              </h3>
            </div>

            <div className="flex h-80 items-center justify-center transition-colors">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-text-highlight border-t-transparent" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{t('loadingCashFlow')}</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-3 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">{error}</p>
                  {error.includes('401') && (
                    <p className="text-[10px] font-medium italic text-text-muted">{t('tokenUpdateMessage')}</p>
                  )}
                </div>
              ) : (
                <ReactECharts option={getCashFlowOptions()} style={{ height: '100%', width: '100%' }} />
              )}
            </div>

            <div className="mt-3 min-h-0 flex-1 rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm transition-colors">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-text-highlight" />
                <p className="text-xs font-semibold uppercase tracking-widest text-text-base">Nhận xét</p>
              </div>
              <div className="flex min-h-0 flex-1 items-center">
                {aiLoading ? (
                  <div className="flex items-center gap-3 text-text-muted">
                    <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                    <p className="text-xs font-medium uppercase tracking-widest">Đang tạo nhận xét...</p>
                  </div>
                ) : aiError ? (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-red-600">{aiError}</p>
                    <p className="text-xs text-text-muted">AI không tạo được nhận xét cho mã trái phiếu này.</p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-6 italic text-text-muted transition-colors">
                    {aiCommentary || 'Chưa có nhận xét cho mã trái phiếu này.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border-base bg-bg-base/40 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isTracked ? handleUntrackBond : handleTrackBond}
              className={
                isTracked
                  ? 'inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-600 transition-colors'
                  : 'inline-flex rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-700'
              }
            >
              {isTracked ? 'Đã theo dõi' : 'Theo dõi'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-border-base bg-bg-surface px-4 py-2 text-xs font-bold uppercase tracking-widest text-text-muted transition-colors hover:bg-bg-base hover:text-text-base"
            >
              Hủy
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700"
            >
              Giao dịch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
