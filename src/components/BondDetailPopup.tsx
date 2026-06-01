import { useEffect, useMemo, useState } from 'react';
import ChartWithToolbar from './ChartWithToolbar';
import {
  X,
  Info,
  Calendar,
  TrendingUp,
  Activity,
  Briefcase,
  AlertTriangle,
  ArrowLeftRight,
  Gauge,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import BondComparisonPopup from './BondComparisonPopup';
import { loadBondDetail, loadIssuerProfile } from '../services/bondData';
import { loadBondIndustryByFilter, loadIndustryBaseBondGroupData, type IndustryBondGroupData } from '../services/industryBondData';
import { resolveIndustryKeyFromCandidates } from '../constants/industries';
import { CHART_PALETTE, getChartTooltip, highlightChartTooltipValue } from '../utils/chart';
import { isBondTracked, onWatchlistUpdated, removeWatchlistItem, upsertWatchlistItemWithStatus } from '../utils/watchlist';

interface BondDetailPopupProps {
  bond: Bond;
  enterpriseName: string;
  onClose: () => void;
}

type BondDetailView = Bond & {
  bondRateType?: string;
  industryId?: string;
  industryName?: string;
  industryCode?: string;
  icbCodeLv1?: string;
  icbCodeLv2?: string;
  icbNameLv1?: string;
  icbNameLv2?: string;
};

export default function BondDetailPopup({ bond, enterpriseName, onClose }: BondDetailPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartPalette = CHART_PALETTE;
  const chartTooltip = getChartTooltip(isDark);

  const [bondDetails, setBondDetails] = useState<BondDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [watchlistNotice, setWatchlistNotice] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('month');
  const [issuerProfile, setIssuerProfile] = useState<any>(null);
  const [bondIndustryId, setBondIndustryId] = useState<string | null>(null);
  const [industryBondGroup, setIndustryBondGroup] = useState<IndustryBondGroupData | null>(null);

  const formatTerm = (rawTerm: any) => {
    if (!rawTerm || rawTerm === 'N/A') return 'N/A';
    const clean = String(rawTerm)
      .replace(/(tháng|thang|months?)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `${clean} ${t('monthUnit')}`;
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const fetchDetails = async () => {
      try {
        const data = await loadBondDetail(bond.code);
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
          industryId: detail.industryId || detail.icbNameLv2 || detail.industryName,
          industryName: detail.industryName || detail.icbNameLv2,
          industryCode: detail.industryCode || detail.icbCodeLv2,
          icbCodeLv1: detail.icbCodeLv1 || detail.ICBCodeLv1,
          icbCodeLv2: detail.icbCodeLv2 || detail.ICBCodeLv2,
          icbNameLv1: detail.icbNameLv1 || detail.ICBNameLv1,
          icbNameLv2: detail.icbNameLv2 || detail.ICBNameLv2,
          interestType,
          bondRateType: detail.bondRateType || detail.interestRateType || detail.couponRateType,
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

    const refreshTrackedState = () => {
      setIsTracked(isBondTracked(bond.code));
    };
    refreshTrackedState();
    const unsubscribe = onWatchlistUpdated(refreshTrackedState);

    return () => {
      document.body.style.overflow = 'unset';
      unsubscribe();
    };
  }, [bond, t]);

  useEffect(() => {
    let isActive = true;
    const symbol = String(bondDetails?.enterpriseId || bond.enterpriseId || '').trim();

    if (!symbol) {
      setIssuerProfile(null);
      return () => {
        isActive = false;
      };
    }

    const fetchProfile = async () => {
      try {
        const profile = await loadIssuerProfile(symbol);
        if (isActive) {
          setIssuerProfile(profile);
        }
      } catch (error) {
        console.error('Error fetching issuer profile for bond assessment:', error);
        if (isActive) {
          setIssuerProfile(null);
        }
      }
    };

    fetchProfile();

    return () => {
      isActive = false;
    };
  }, [bond.enterpriseId, bondDetails?.enterpriseId]);

  useEffect(() => {
    let isActive = true;

    const fetchBondIndustry = async () => {
      try {
        const resolved = await loadBondIndustryByFilter(bond.code);
        if (isActive) {
          setBondIndustryId(resolved);
        }
      } catch (error) {
        console.error('Error resolving bond industry from filter flow:', error);
        if (isActive) {
          setBondIndustryId(null);
        }
      }
    };

    fetchBondIndustry();

    return () => {
      isActive = false;
    };
  }, [bond.code]);

  const currentBond = bondDetails || bond;

  const resolvedIndustryId = useMemo(() => resolveIndustryKeyFromCandidates(
    bondIndustryId,
    bondDetails?.industryId,
    bondDetails?.industryName,
    bondDetails?.industryCode,
    issuerProfile?.industryId,
    issuerProfile?.industry,
    issuerProfile?.industryName,
    issuerProfile?.icbCodeLv2,
    issuerProfile?.icbNameLv2,
    issuerProfile?.icbCodeLv1,
    issuerProfile?.icbNameLv1,
    currentBond.enterpriseId,
    enterpriseName,
  ), [bondIndustryId, bondDetails, issuerProfile, currentBond.enterpriseId, enterpriseName]);

  useEffect(() => {
    let isActive = true;

    if (!resolvedIndustryId) {
      setIndustryBondGroup(null);
      return () => {
        isActive = false;
      };
    }

    const fetchIndustryPeers = async () => {
      try {
        const data = await loadIndustryBaseBondGroupData(resolvedIndustryId);
        if (isActive) {
          setIndustryBondGroup(data);
        }
      } catch (error) {
        console.error('Error fetching industry peer bonds for assessment:', error);
        if (isActive) {
          setIndustryBondGroup(null);
        }
      }
    };

    fetchIndustryPeers();

    return () => {
      isActive = false;
    };
  }, [resolvedIndustryId]);

  const parseTermMonths = (rawTerm: any) => {
    if (rawTerm === undefined || rawTerm === null) return undefined;
    const value = String(rawTerm)
      .replace(/(tháng|thang|months?)/gi, '')
      .trim();
    const match = value.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  };

  const getRemainingTermMonths = (maturityDate?: string) => {
    if (!maturityDate) return null;

    const maturity = new Date(maturityDate);
    if (Number.isNaN(maturity.getTime())) return null;

    const today = new Date();
    const months = (maturity.getFullYear() - today.getFullYear()) * 12 + (maturity.getMonth() - today.getMonth());
    return maturity.getDate() < today.getDate() ? months - 1 : months;
  };

  const getRateTypeKey = (value: unknown) => {
    const text = String(value || '').toLowerCase();
    if (!text) return '';
    if (text.includes('float') || text.includes('thả nổi') || text.includes('tha noi')) return 'floating';
    if (text.includes('fixed') || text.includes('cố định') || text.includes('co dinh')) return 'fixed';
    return '';
  };

  const percentile = (values: number[], p: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower];
    const weight = rank - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const median = (values: number[]) => percentile(values, 50);

  const maturityInfo = useMemo(() => {
    if (!currentBond.maturityDate) return null;
    const maturity = new Date(currentBond.maturityDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { days: Math.max(diffDays, 0), isNear: diffDays >= 0 && diffDays <= 90 };
  }, [currentBond.maturityDate]);

  const industryInterestRateAssessment = useMemo(() => {
    const rate = Number(currentBond.interestRate || 0);
    const rateTypeKey = getRateTypeKey(
      (bondDetails as BondDetailView | null)?.bondRateType ||
      currentBond.interestType ||
      '',
    );
    const remainingTermMonths = getRemainingTermMonths(currentBond.maturityDate) ?? parseTermMonths(currentBond.term) ?? null;
    const industryBonds = Array.isArray(industryBondGroup?.bonds) ? industryBondGroup.bonds : [];

    if (!resolvedIndustryId || !rateTypeKey || remainingTermMonths === null || rate <= 0) {
      return {
        level: 'unknown' as const,
        confidence: null as 'low' | null,
        peerCount: 0,
      };
    }

    const sameRateTypePeers = industryBonds.filter((bondRow: any) => {
      const code = String(bondRow?.bondCode || bondRow?.code || '').trim().toUpperCase();
      if (code && code === String(currentBond.code || '').trim().toUpperCase()) return false;
      return getRateTypeKey(bondRow?.bondRateType || bondRow?.interestRateType || bondRow?.couponRateType || bondRow?.interestType) === rateTypeKey;
    });

    const currentTermGroup = remainingTermMonths < 36 ? 'short_term' : 'long_term';
    const withTermGroup = sameRateTypePeers.filter((bondRow: any) => {
      const peerTermMonths = getRemainingTermMonths(bondRow?.maturityDate);
      if (peerTermMonths === null) return false;
      const peerTermGroup = peerTermMonths < 36 ? 'short_term' : 'long_term';
      return peerTermGroup === currentTermGroup;
    });

    const termGroupValues = withTermGroup
      .map((bondRow: any) => Number(bondRow?.bondRate || bondRow?.couponRate || 0))
      .filter((value) => value > 0);

    const sameRateValues = sameRateTypePeers
      .map((bondRow: any) => Number(bondRow?.bondRate || bondRow?.couponRate || 0))
      .filter((value) => value > 0);

    if (termGroupValues.length >= 5) {
      const p25 = percentile(termGroupValues, 25);
      const p75 = percentile(termGroupValues, 75);
      const level = rate < p25 ? 'low' : rate > p75 ? 'high' : 'medium';
      return {
        level,
        confidence: null,
        peerCount: termGroupValues.length,
      };
    }

    if (sameRateValues.length >= 5) {
      const p25 = percentile(sameRateValues, 25);
      const p75 = percentile(sameRateValues, 75);
      const level = rate < p25 ? 'low' : rate > p75 ? 'high' : 'medium';
      return {
        level,
        confidence: null,
        peerCount: sameRateValues.length,
      };
    }

    if (sameRateValues.length >= 2 && sameRateValues.length <= 4) {
      const medianValue = median(sameRateValues);
      const epsilon = 0.0001;
      const level = rate < medianValue - epsilon ? 'low' : rate > medianValue + epsilon ? 'high' : 'medium';
      return {
        level,
        confidence: 'low' as const,
        peerCount: sameRateValues.length,
      };
    }

    return {
      level: 'unknown' as const,
      confidence: null as 'low' | null,
      peerCount: sameRateValues.length,
    };
  }, [bondDetails, currentBond.code, currentBond.interestRate, currentBond.interestType, currentBond.maturityDate, industryBondGroup?.bonds, resolvedIndustryId]);

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

  const quickAnalysis = useMemo(() => {
    const getLevelMeta = (
      level: 'high' | 'medium' | 'low' | 'large' | 'small' | 'unknown',
      tone: 'dangerHigh' | 'dangerLow' | 'neutral' = 'neutral',
    ) => {
      if (level === 'high') {
        return {
          label: t('levelHigh'),
          className: 'text-rose-600 dark:text-rose-400',
        };
      }
      if (level === 'medium') {
        return {
          label: t('levelMedium'),
          className: 'text-amber-600 dark:text-amber-400',
        };
      }
      if (level === 'small') {
        return {
          label: t('levelSmall'),
          className: 'text-orange-400 dark:text-orange-300',
        };
      }
      if (level === 'low') {
        return {
          label: t('levelLow'),
          className: 'text-emerald-600 dark:text-emerald-400',
        };
      }
      if (level === 'large') {
        return {
          label: t('levelLarge'),
          className: 'text-blue-600 dark:text-blue-400',
        };
      }
      return {
        label: '-',
        className: 'text-text-muted',
      };
    };

    const daysLeft = maturityInfo?.days;
    const maturityPressure =
      daysLeft === undefined ? 'unknown' : daysLeft < 90 ? 'high' : daysLeft <= 180 ? 'medium' : 'low';
    const interestRate = Number(currentBond.interestRate || 0);
    const interestRateLevel = industryInterestRateAssessment.level as 'high' | 'medium' | 'low' | 'unknown';
    const interestRateConfidence = industryInterestRateAssessment.confidence;
    const issuedValue = Number(currentBond.issuedValue || 0);
    const issueScaleLevel = issuedValue < 300 ? 'small' : issuedValue <= 1000 ? 'medium' : 'large';

    return [
      {
        label: t('riskLevel'),
        evidence: daysLeft === undefined ? '-' : `${daysLeft} ${t('daysUnit').toLowerCase()}`,
        icon: ShieldCheck,
        meta: getLevelMeta(maturityPressure, 'dangerHigh'),
      },
      {
        label: t('interestRateLevel'),
        evidence: `${formatInterestRate(interestRate)}%`,
        icon: TrendingUp,
        meta: getLevelMeta(interestRateLevel),
        confidence: interestRateConfidence,
      },
      {
        label: t('issueScaleLevel'),
        evidence: `${formatNumber(issuedValue, 2)} ${t('unitBillionShort')}`,
        icon: Landmark,
        meta: getLevelMeta(issueScaleLevel),
      },
    ];
  }, [currentBond, industryInterestRateAssessment, maturityInfo?.days, t]);

  const cashFlowOptions = useMemo(() => {
    if (!bondDetails?.cashFlows) return null;

    const sortedCashFlows = [...bondDetails.cashFlows].sort(
      (a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime(),
    );

    const groupedCashFlows = new Map<
      string,
      {
        label: string;
        sortValue: number;
        principalAmount: number;
        interestAmount: number;
      }
    >();

    sortedCashFlows.forEach((cf) => {
      const date = new Date(cf.paymentDate);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = cashFlowPeriod === 'month' ? `${year}-${String(month + 1).padStart(2, '0')}` : String(year);
      const label = cashFlowPeriod === 'month' ? `T${month + 1}/${year}` : String(year);
      const sortValue = cashFlowPeriod === 'month' ? year * 100 + month : year;
      const existing = groupedCashFlows.get(key);

      if (existing) {
        existing.principalAmount += cf.principalAmount || 0;
        existing.interestAmount += cf.interestAmount || 0;
        return;
      }

      groupedCashFlows.set(key, {
        label,
        sortValue,
        principalAmount: cf.principalAmount || 0,
        interestAmount: cf.interestAmount || 0,
      });
    });

    const cashFlowData = Array.from(groupedCashFlows.values()).sort((a, b) => a.sortValue - b.sortValue);
    const dates = cashFlowData.map((cf) => cf.label);
    const chartTooltip = getChartTooltip(isDark);
    const baseLineSeries = {
      type: 'line',
      stack: 'total',
      symbol: 'circle',
      symbolSize: 5,
      smooth: true,
      lineStyle: {
        width: 2,
      },
    };

    return {
      color: chartPalette,
      tooltip: {
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          let res = `${params[0].name}<br/>`;
          params.forEach((p: any) => {
            res += `${p.marker} ${p.seriesName}: ${highlightChartTooltipValue(formatNumber(p.value || 0, 2), ` ${t('unitBillionShort')}`)}<br/>`;
          });
          const total = params.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
          res += `<strong>${t('total')}: ${highlightChartTooltipValue(formatNumber(total || 0, 2), ` ${t('unitBillionShort')}`)}</strong>`;
          return res;
        },
      },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10 } },
      grid: { left: '3%', right: '4%', bottom: '16%', containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: {
        name: t('unitBillionVND'),
        type: 'value',
        axisLabel: { fontSize: 10, formatter: (value: number) => formatNumber(value, 0) },
      },
      series: [
        { ...baseLineSeries, name: t('principal'), data: cashFlowData.map((cf) => cf.principalAmount) },
        { ...baseLineSeries, name: t('interest'), data: cashFlowData.map((cf) => cf.interestAmount) },
      ],
    };
  }, [bondDetails?.cashFlows, cashFlowPeriod, isDark, t]);

  useEffect(() => {
    if (!watchlistNotice) return;

    const timeout = window.setTimeout(() => setWatchlistNotice(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [watchlistNotice]);

  const handleTrackBond = () => {
    const result = upsertWatchlistItemWithStatus({
      ...currentBond,
      issuerName: enterpriseName || currentBond.enterpriseId || currentBond.code,
      ticker: currentBond.enterpriseId || '',
    });

    if (!result.persistedToLocalStorage && !result.usedFallback) {
      setWatchlistNotice({
        tone: 'error',
        text: t('watchlistSaveFailed'),
      });
      return;
    }

    if (!result.persistedToLocalStorage && result.usedFallback) {
      setWatchlistNotice({
        tone: 'warning',
        text: t('watchlistSavedTemporary'),
      });
    } else {
      setWatchlistNotice({
        tone: 'success',
        text: t('addToWatchlistSuccess'),
      });
    }

    setIsTracked(result.items.some((item) => item.code === currentBond.code));
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
        className="relative flex max-h-screen w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-bg-surface shadow-2xl transition-colors animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {watchlistNotice && (
          <div
            className={
              watchlistNotice.tone === 'success'
                ? 'absolute right-6 top-6 z-40 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg'
                : watchlistNotice.tone === 'warning'
                  ? 'absolute right-6 top-6 z-40 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-lg'
                  : 'absolute right-6 top-6 z-40 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-lg'
            }
          >
            {watchlistNotice.text}
          </div>
        )}
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
            onClose={() => setShowComparison(false)}
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
              ) : cashFlowOptions ? (
                <ChartWithToolbar
                  option={cashFlowOptions}
                  style={{ height: '100%', width: '100%' }}
                  allowMagicType
                  title={cashFlowPeriod === 'month' ? t('expectedCashFlowByMonth') : t('expectedCashFlowByYear')}
                  titleAlign="left"
                  actionsPlacement="inline"
                  actions={(
                    <div className="inline-flex shrink-0 rounded-xl border border-border-base bg-bg-surface p-1">
                      {(['month', 'year'] as const).map((period) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setCashFlowPeriod(period)}
                          className={
                            cashFlowPeriod === period
                              ? 'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors'
                              : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-bg-base hover:text-text-base'
                          }
                        >
                          {period === 'month' ? t('month') : t('year')}
                        </button>
                      ))}
                    </div>
                  )}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-medium text-text-muted transition-colors">
                  {t('noData')}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-border-base/60 bg-bg-surface/80 p-3 transition-colors">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-3 w-3 text-blue-600" />
                <p className="text-xs font-semibold uppercase tracking-widest text-text-base">
                  {t('quickAnalysisTitle')}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-border-base/60 bg-bg-surface/60">
                <table className="w-full table-fixed text-left">
                  <tbody>
                    {quickAnalysis.map((item) => (
                      <tr key={item.label} className="border-b border-border-base/60 last:border-b-0">
                        <td className="w-2/3 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-bg-base/70 text-text-muted">
                              <item.icon className="h-3 w-3" />
                            </div>
                            <span className="truncate text-xs font-semibold text-text-base">
                              {item.label}
                            </span>
                          </div>
                        </td>

                        <td className={`w-1/3 px-3 py-2 text-center text-xs font-semibold ${item.meta.className}`}>
                          <span className="block">{item.meta.label}</span>
                          {item.confidence ? (
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-widest text-text-muted/80">
                              {t('confidenceLow')}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              {isTracked ? t('followed') : t('follow')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-border-base bg-bg-surface px-4 py-2 text-xs font-bold uppercase tracking-widest text-text-muted transition-colors hover:bg-bg-base hover:text-text-base"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700"
            >
              {t('trade')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
