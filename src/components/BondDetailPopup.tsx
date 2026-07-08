import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Activity, Bookmark, BookmarkCheck, Briefcase, Calendar, Info, Landmark, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import ChartWithToolbar from './ChartWithToolbar';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';
import { getLocalizedBondStatus, getLocalizedBondType, getLocalizedInterestType } from '../utils/bondPresentation';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { sendChat } from '../api/ai';
import { getFireantToken, cleanTokenString } from '../utils/token';
import { buildFireantUrl } from '../api/fireant';
import { readJsonResponse } from '../utils/http';
import { loadBondDetail, loadIssuerProfile } from '../services/bondData';
import { loadBondIndustryByFilter, loadIndustryBondGroupData, type IndustryBondGroupData } from '../services/industryBondData';
import { resolveIndustryKeyFromCandidates } from '../constants/industries';
import { CHART_PALETTE, getChartTooltip, highlightChartTooltipValue } from '../utils/chart';
import { readDailyAIInsight, sanitizeAIInsightText, writeDailyAIInsight } from '../utils/aiInsight';
import { buildParagraphDirective } from '../utils/aiInsightStructured';
import { clearBondDetailChatContext, setBondDetailChatContext } from '../utils/bondDetailChatContext';
import { isBondTracked, onWatchlistUpdated, removeWatchlistItem, upsertWatchlistItemWithStatus } from '../utils/watchlist';
import { useAIStore } from '../store/aiStore';
import { setCache, getCache } from '../utils/cache';
import { Card, MetricCard } from './ui/Card';
import AdaptiveInsightContent from './ui/AdaptiveInsightContent';

interface BondDetailPopupProps {
  bond: Bond;
  enterpriseName: string;
  onClose: () => void;
  onCompare?: () => void;
  sidebarDisplayMode?: 'none' | 'collapsed' | 'expanded';
  embedded?: boolean;
}

type BondCashFlow = {
  paymentDate: string;
  interestAmount: number;
  principalAmount: number;
  totalCashflow: number;
  bondRate: number;
};

type BondDetailView = Bond & {
  bondRateType?: string;
  bondType?: string;
  industryId?: string;
  industryName?: string;
  industryCode?: string;
  icbCodeLv1?: string;
  icbCodeLv2?: string;
  icbNameLv1?: string;
  icbNameLv2?: string;
  interestPaymentMethod?: string;
  paymentMethod?: string;
  totalIssuedVolume?: number;
  parValue?: number;
  faceValue?: number;
  cashFlows?: BondCashFlow[];
};

const AI_INSIGHT_CACHE_KEY = 'bond_detail_remarks_prose';

const normalizeText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeAscii = (value: unknown) =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const containsVietnameseLetters = (value: unknown) =>
  /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụýỳỷỹỵ]/i.test(normalizeText(value));

const stripEnglishSuffixFromName = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return '';

  const parenthesisMatch = text.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (parenthesisMatch) {
    const head = normalizeText(parenthesisMatch[1]);
    const tail = normalizeText(parenthesisMatch[2]);
    if (head && containsVietnameseLetters(head) && !containsVietnameseLetters(tail)) {
      return head;
    }
  }

  const separators = [' / ', ' | ', ' - ', ' – ', ' — '];
  for (const separator of separators) {
    if (!text.includes(separator)) continue;
    const [head, tail] = text.split(separator);
    if (head && tail && containsVietnameseLetters(head) && !containsVietnameseLetters(tail)) {
      return normalizeText(head);
    }
  }

  return text;
};

const resolveIssuerDisplayName = (...candidates: unknown[]) => {
  const normalizedCandidates = candidates
    .map(stripEnglishSuffixFromName)
    .filter(Boolean);

  const vietnameseCandidate = normalizedCandidates.find((value) => containsVietnameseLetters(value));
  if (vietnameseCandidate) return vietnameseCandidate;

  return normalizedCandidates[0] || '-';
};

const parseTermMonths = (rawTerm: unknown) => {
  const match = normalizeText(rawTerm).match(/-?\d+(\.\d+)?/);
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

const getComparableTermMonths = (bondLike: any) =>
  getRemainingTermMonths(bondLike?.maturityDate)
  ?? parseTermMonths(bondLike?.term)
  ?? parseTermMonths(bondLike?.tenorPeriod)
  ?? null;

const getTermGroupKey = (bondLike: any) => {
  const months = getComparableTermMonths(bondLike);
  if (months === null) return '';
  return months < 36 ? 'short_term' : 'long_term';
};

const getRateTypeKey = (value: unknown) => {
  const text = normalizeAscii(value);
  if (!text) return '';
  if (text.includes('floating') || text.includes('tha noi')) return 'floating';
  if (text.includes('fixed') || text.includes('co dinh')) return 'fixed';
  return '';
};

const getBondRateTypeKey = (bondLike: any) => {
  const rawRateType =
    bondLike?.bondRateType
    || bondLike?.interestRateType
    || bondLike?.couponRateType
    || bondLike?.interestType
    || '';
  const paymentMethod =
    bondLike?.interestPaymentMethod
    || bondLike?.paymentMethod
    || bondLike?.bondType
    || bondLike?.bondName
    || '';
  const normalizedType = normalizeInterestType(rawRateType, paymentMethod, Array.isArray(bondLike?.cashFlows) ? bondLike.cashFlows : []);
  return getRateTypeKey(normalizedType || rawRateType);
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

let pendingBondDetailAIStatusRequest: Promise<void> | null = null;

function ensureBondDetailAIStatus(refreshStatus: () => Promise<void>) {
  if (!pendingBondDetailAIStatusRequest) {
    pendingBondDetailAIStatusRequest = refreshStatus().finally(() => {
      pendingBondDetailAIStatusRequest = null;
    });
  }

  return pendingBondDetailAIStatusRequest;
}

export default function BondDetailPopup({
  bond,
  enterpriseName,
  onClose,
  onCompare,
  sidebarDisplayMode = 'none',
  embedded = false,
}: BondDetailPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const { configured, baseUrl, defaultModel, defaultSystemPrompt, selectedModel, systemPrompt, isLoadingStatus, statusError, refreshStatus } = useAIStore();
  const isDark = effectiveTheme === 'dark';
  const chartPalette = CHART_PALETTE;
  const aiRequestIdRef = useRef(0);

  const [bondDetails, setBondDetails] = useState<BondDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState(false);
  const [watchlistNotice, setWatchlistNotice] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('month');
  const [issuerProfile, setIssuerProfile] = useState<any>(null);
  const [issuerFinancial, setIssuerFinancial] = useState<any>(null);
  const [bondIndustryId, setBondIndustryId] = useState<string | null>(null);
  const [industryBondGroup, setIndustryBondGroup] = useState<IndustryBondGroupData | null>(null);
  const [aiRemark, setAiRemark] = useState<string>('');
  const [aiRemarkUpdatedAt, setAiRemarkUpdatedAt] = useState('');
  const [aiRemarkLoading, setAiRemarkLoading] = useState(false);
  const [aiRemarkError, setAiRemarkError] = useState<string | null>(null);
  // Measured capacity of the remark box (fixed height, responsive width) → how many sentences the
  // AI should write so the paragraph fills the card at the current screen size without being cut
  // short or leaving empty space. The client fitter still trims any slight overflow.
  const [aiRemarkLengthTarget, setAiRemarkLengthTarget] = useState(0);
  const aiRemarkResizeObserverRef = useRef<ResizeObserver | null>(null);
  const measureAiRemarkBox = useCallback((node: HTMLDivElement | null) => {
    aiRemarkResizeObserverRef.current?.disconnect();
    aiRemarkResizeObserverRef.current = null;
    if (!node) return;

    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (!width || !height) return;
      const lines = Math.max(3, Math.floor(height / 24)); // leading-6 ≈ 24px per line
      const charsPerLine = Math.max(24, Math.floor(width / 7.2)); // ≈ text-sm avg char width
      // Divisor matches AIInsightPanel (120): higher divisor → fewer sentences requested, so the
      // model doesn't heavily over-write and lean on the client fitter to trim (which is what left
      // the last sentence clipped mid-way). The fitter still guarantees no overflow.
      const sentences = Math.min(14, Math.max(3, Math.round((lines * charsPerLine) / 120)));
      setAiRemarkLengthTarget((previous) => (previous === sentences ? previous : sentences));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    aiRemarkResizeObserverRef.current = observer;
  }, []);

  const formatTerm = (rawTerm: unknown) => {
    const months = parseTermMonths(rawTerm);
    if (months === undefined) return normalizeText(rawTerm) || '-';
    return `${formatNumber(months, 0)} ${t('monthUnit')}`;
  };

  useEffect(() => {
    setBondDetails(null);
    setLoading(true);
    setError(null);

    const fetchDetails = async () => {
      try {
        const [defaultData, betaData] = await Promise.all([
          loadBondDetail(bond.code),
          loadBondDetail(bond.code, false, 'beta').catch(() => null),
        ]);

        const sourceData = defaultData || betaData;
        const detail = sourceData?.detail || {};
        const betaDetail = betaData?.detail || {};
        const mergedDetail = {
          ...detail,
          interestPaymentMethod: betaDetail?.interestPaymentMethod || detail?.interestPaymentMethod,
          paymentMethod: betaDetail?.paymentMethod || detail?.paymentMethod,
          totalIssuedVolume: betaDetail?.totalIssuedVolume || detail?.totalIssuedVolume || detail?.TotalIssuedVolume,
          parValue: betaDetail?.parValue || detail?.parValue || detail?.ParValue,
          faceValue: betaDetail?.faceValue || detail?.faceValue || detail?.FaceValue,
        };
        const historyItem = Array.isArray(sourceData?.history) ? sourceData.history[0] : undefined;
        const rawCashFlows = Array.isArray(sourceData?.cashFlows) ? sourceData.cashFlows : [];
        const cashFlowRate = rawCashFlows[0]?.bondRate;

        const interestRate =
          mergedDetail.bondRate || mergedDetail.interestRate || mergedDetail.couponRate || cashFlowRate || bond.interestRate;
        const rawInterestType =
          mergedDetail.bondRateType ||
          mergedDetail.interestRateType ||
          mergedDetail.couponRateType ||
          mergedDetail.interestType ||
          bond.interestType ||
          '';
        const paymentMethod = mergedDetail.interestPaymentMethod || mergedDetail.paymentMethod || mergedDetail.bondType || mergedDetail.bondName || '';
        const interestType = normalizeInterestType(rawInterestType, paymentMethod, rawCashFlows);
        const listedVolume = mergedDetail.currentListedVolume || historyItem?.volume || bond.listedVolume;
        const issuedValue = mergedDetail.totalIssuedValue
          ? mergedDetail.totalIssuedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.issuedValue;
        const listedValue = mergedDetail.currentListedValue
          ? mergedDetail.currentListedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.listedValue;

        setBondDetails({
          ...bond,
          enterpriseId: mergedDetail.issuerSymbol || mergedDetail.issuer || mergedDetail.symbol || bond.enterpriseId,
          term: mergedDetail.tenorPeriod ? formatTerm(mergedDetail.tenorPeriod) : formatTerm(bond.term),
          issueDate: mergedDetail.issueDate ? String(mergedDetail.issueDate).split('T')[0] : bond.issueDate,
          maturityDate: mergedDetail.maturityDate ? String(mergedDetail.maturityDate).split('T')[0] : bond.maturityDate,
          industryId:
            mergedDetail.industryId ||
            mergedDetail.industryID ||
            mergedDetail.industryCode ||
            mergedDetail.IndustryCode ||
            mergedDetail.issuerICBCode ||
            mergedDetail.IssuerICBCode ||
            mergedDetail.icbCodeLv2 ||
            mergedDetail.ICBCodeLv2 ||
            mergedDetail.icbNameLv2 ||
            mergedDetail.ICBNameLv2 ||
            mergedDetail.industryName ||
            mergedDetail.IndustryName,
          industryName:
            mergedDetail.industryName ||
            mergedDetail.IndustryName ||
            mergedDetail.icbName ||
            mergedDetail.ICBName ||
            mergedDetail.icbNameLv2 ||
            mergedDetail.ICBNameLv2 ||
            mergedDetail.icbNameLv1 ||
            mergedDetail.ICBNameLv1,
          industryCode:
            mergedDetail.industryCode ||
            mergedDetail.IndustryCode ||
            mergedDetail.issuerICBCode ||
            mergedDetail.IssuerICBCode ||
            mergedDetail.icbCodeLv2 ||
            mergedDetail.ICBCodeLv2 ||
            mergedDetail.icbCodeLv1 ||
            mergedDetail.ICBCodeLv1,
          icbCodeLv1: mergedDetail.icbCodeLv1 || mergedDetail.ICBCodeLv1,
          icbCodeLv2: mergedDetail.icbCodeLv2 || mergedDetail.ICBCodeLv2,
          icbNameLv1: mergedDetail.icbNameLv1 || mergedDetail.ICBNameLv1,
          icbNameLv2: mergedDetail.icbNameLv2 || mergedDetail.ICBNameLv2,
          interestType,
          bondType: mergedDetail.bondType || mergedDetail.BondType || bond.bondType,
          bondRateType: mergedDetail.bondRateType || mergedDetail.interestRateType || mergedDetail.couponRateType,
          interestPaymentMethod: mergedDetail.interestPaymentMethod,
          paymentMethod: mergedDetail.paymentMethod,
          totalIssuedVolume: Number(mergedDetail.totalIssuedVolume || historyItem?.volume || 0),
          parValue: Number(mergedDetail.parValue || 0),
          faceValue: Number(mergedDetail.faceValue || 0),
          interestRate,
          listedVolume,
          issuedValue,
          listedValue,
          status: mergedDetail.status || bond.status,
          cashFlows: rawCashFlows.map((cf: any) => ({
            paymentDate: cf.paymentDate,
            interestAmount: (cf.interestAmount || 0) / 1000000000,
            principalAmount: (cf.principalAmount || 0) / 1000000000,
            totalCashflow: (cf.totalCashflow || 0) / 1000000000,
            bondRate: cf.bondRate || 0,
          })),
        });
      } catch (fetchError) {
        console.error('Error fetching bond details:', fetchError);
        setError(fetchError instanceof Error ? fetchError.message : t('bondDetailError'));
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
      } catch (profileError) {
        console.error('Error fetching issuer profile for bond detail:', profileError);
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
    const symbol = String(bondDetails?.enterpriseId || bond.enterpriseId || '').trim();

    if (!symbol) {
      setIssuerFinancial(null);
      return () => {
        isActive = false;
      };
    }

    const cacheKey = `enterprise_financial_${symbol}`;
    const cached = getCache(cacheKey);
    if (cached) {
      setIssuerFinancial(cached);
      return () => {
        isActive = false;
      };
    }

    const fetchFinancial = async () => {
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : '';
        if (!cleanToken) {
          setIssuerFinancial(null);
          return;
        }

        const response = await fetch(
          buildFireantUrl(`symbols/${encodeURIComponent(symbol)}/financial-data`, { type: 'Q', count: 4 }),
          {
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${cleanToken}`,
            },
          },
        );

        if (!response.ok) {
          setIssuerFinancial(null);
          return;
        }

        const quarters = await readJsonResponse<any[]>(response, `Financial data ${symbol}`);
        if (!Array.isArray(quarters) || quarters.length === 0) {
          setIssuerFinancial(null);
          return;
        }

        const findLatestValue = (field: string) => {
          for (const q of quarters) {
            const val = q.financialValues?.[field];
            if (val !== null && val !== undefined) return val;
          }
          return null;
        };

        const latestQ = quarters[0];
        const indicators = [
          'TotalAsset', 'TotalAssets', 'Assets',
          'TotalStockHolderEquity', 'StockHolderEquity', 'OwnerEquity', 'Equity',
        ];

        const consolidatedData: any = {
          __symbol: symbol,
          __period: `${latestQ.quarter}/${latestQ.year}`,
          __companyType: latestQ.companyType,
        };

        indicators.forEach((ind) => {
          consolidatedData[ind] = findLatestValue(ind);
        });

        if (isActive) {
          setIssuerFinancial(consolidatedData);
          setCache(cacheKey, consolidatedData);
        }
      } catch (financialError) {
        console.error('Error fetching issuer financial data for bond detail:', financialError);
        if (isActive) {
          setIssuerFinancial(null);
        }
      }
    };

    void fetchFinancial();

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
      } catch (industryError) {
        console.error('Error resolving bond industry from filter flow:', industryError);
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

  const maturityInfo = useMemo(() => {
    if (!currentBond.maturityDate) return null;
    const maturity = new Date(currentBond.maturityDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { days: Math.max(diffDays, 0), isNear: diffDays >= 0 && diffDays <= 90 };
  }, [currentBond.maturityDate]);

  const resolvedIndustryId = useMemo(
    () =>
      resolveIndustryKeyFromCandidates(
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
      ),
    [bondIndustryId, bondDetails, currentBond.enterpriseId, enterpriseName, issuerProfile],
  );

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
        const data = await loadIndustryBondGroupData(resolvedIndustryId);
        if (isActive) {
          setIndustryBondGroup(data);
        }
      } catch (industryPeersError) {
        console.error('Error fetching industry peer bonds for assessment:', industryPeersError);
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

  const industryInterestRateAssessment = useMemo(() => {
    const bondForAssessment = bondDetails || currentBond;
    const rate = Number(bondForAssessment.interestRate || currentBond.interestRate || 0);
    const rateTypeKey = getBondRateTypeKey(bondForAssessment);
    const currentTermGroup = getTermGroupKey(bondForAssessment);
    const industryBonds = Array.isArray(industryBondGroup?.bonds) ? industryBondGroup.bonds : [];
    const industryStats = industryBondGroup?.industryStats;

    if (!resolvedIndustryId || rate <= 0) {
      return {
        level: 'unknown' as const,
        confidence: null as 'low' | null,
      };
    }

    const sameRateTypePeers = industryBonds.filter((bondRow: any) => {
      const code = normalizeText(bondRow?.bondCode || bondRow?.code).toUpperCase();
      if (code && code === normalizeText(currentBond.code).toUpperCase()) return false;
      return rateTypeKey ? getBondRateTypeKey(bondRow) === rateTypeKey : true;
    });

    const withTermGroup = sameRateTypePeers.filter((bondRow: any) => {
      if (!currentTermGroup) return false;
      return getTermGroupKey(bondRow) === currentTermGroup;
    });

    const industryPeers = industryBonds.filter((bondRow: any) => {
      const code = normalizeText(bondRow?.bondCode || bondRow?.code).toUpperCase();
      return !code || code !== normalizeText(currentBond.code).toUpperCase();
    });

    const industryWithTermGroup = industryPeers.filter((bondRow: any) => {
      if (!currentTermGroup) return false;
      return getTermGroupKey(bondRow) === currentTermGroup;
    });

    const extractPeerRates = (rows: any[]) =>
      rows
        .map((bondRow: any) => Number(bondRow?.bondRate || bondRow?.couponRate || 0))
        .filter((value) => value > 0);

    const termGroupValues = extractPeerRates(withTermGroup);
    const sameRateValues = extractPeerRates(sameRateTypePeers);
    const industryTermGroupValues = extractPeerRates(industryWithTermGroup);
    const industryValues = extractPeerRates(industryPeers);

    const evaluateWithPercentiles = (values: number[]) => {
      const p25 = percentile(values, 25);
      const p75 = percentile(values, 75);
      return {
        level: rate < p25 ? 'low' : rate > p75 ? 'high' : 'medium',
        confidence: null as 'low' | null,
      };
    };

    const evaluateWithMedian = (values: number[]) => {
      const medianValue = median(values);
      const epsilon = Math.max(0.15, medianValue * 0.03);
      return {
        level: rate < medianValue - epsilon ? 'low' : rate > medianValue + epsilon ? 'high' : 'medium',
        confidence: 'low' as const,
      };
    };

    const evaluateWithBenchmark = (benchmark: number) => {
      if (!Number.isFinite(benchmark) || benchmark <= 0) {
        return {
          level: 'unknown' as const,
          confidence: null as 'low' | null,
        };
      }

      const tolerance = Math.max(0.15, benchmark * 0.03);
      return {
        level: rate < benchmark - tolerance ? 'low' : rate > benchmark + tolerance ? 'high' : 'medium',
        confidence: 'low' as const,
      };
    };

    if (termGroupValues.length >= 5) return evaluateWithPercentiles(termGroupValues);
    if (sameRateValues.length >= 5) return evaluateWithPercentiles(sameRateValues);
    if (industryTermGroupValues.length >= 5) return evaluateWithPercentiles(industryTermGroupValues);
    if (industryValues.length >= 5) return evaluateWithPercentiles(industryValues);
    if (industryValues.length >= 2) return evaluateWithMedian(industryValues);
    if (industryValues.length >= 1) return evaluateWithMedian(industryValues);
    if (rateTypeKey === 'floating' && Number(industryStats?.floatingRate) > 0) {
      return evaluateWithBenchmark(Number(industryStats?.floatingRate));
    }
    if (Number(industryStats?.avgCouponRate) > 0) {
      return evaluateWithBenchmark(Number(industryStats?.avgCouponRate));
    }
    if (Number(industryStats?.avgRate) > 0) {
      return evaluateWithBenchmark(Number(industryStats?.avgRate));
    }
    if (rateTypeKey === 'fixed' || rateTypeKey === 'floating') {
      return {
        level: 'medium' as const,
        confidence: 'low' as const,
      };
    }

    return {
      level: 'medium' as const,
      confidence: 'low' as const,
    };
  }, [
    bondDetails,
    currentBond,
    industryBondGroup?.bonds,
    industryBondGroup?.industryStats,
    resolvedIndustryId,
  ]);

  const quickAnalysis = useMemo(() => {
    const getLevelMeta = (level: 'high' | 'medium' | 'low' | 'large' | 'small' | 'unknown') => {
      const fallbackLabels = {
        high: language === 'vi' ? 'Cao' : 'High',
        medium: language === 'vi' ? 'Trung bình' : 'Medium',
        small: language === 'vi' ? 'Nhỏ' : 'Small',
        low: language === 'vi' ? 'Thấp' : 'Low',
        large: language === 'vi' ? 'Lớn' : 'Large',
      };
      if (level === 'high') return { label: t('levelHigh') === 'levelHigh' ? fallbackLabels.high : t('levelHigh'), className: 'text-rose-600 dark:text-rose-400' };
      if (level === 'medium') return { label: t('levelMedium') === 'levelMedium' ? fallbackLabels.medium : t('levelMedium'), className: 'text-amber-600 dark:text-amber-400' };
      if (level === 'small') return { label: t('levelSmall') === 'levelSmall' ? fallbackLabels.small : t('levelSmall'), className: 'text-orange-500 dark:text-orange-300' };
      if (level === 'low') return { label: t('levelLow') === 'levelLow' ? fallbackLabels.low : t('levelLow'), className: 'text-emerald-600 dark:text-emerald-400' };
      if (level === 'large') return { label: t('levelLarge') === 'levelLarge' ? fallbackLabels.large : t('levelLarge'), className: 'text-blue-600 dark:text-blue-400' };
      return { label: '-', className: 'text-text-muted' };
    };

    const daysLeft = maturityInfo?.days;
    const maturityPressure = daysLeft === undefined ? 'unknown' : daysLeft < 90 ? 'high' : daysLeft <= 180 ? 'medium' : 'low';
    const issuedValue = Number(currentBond.issuedValue || 0);
    const issueScaleLevel = issuedValue < 300 ? 'small' : issuedValue <= 1000 ? 'medium' : 'large';

    return [
      {
        label: t('riskLevel'),
        evidence: daysLeft === undefined ? '-' : `${daysLeft} ${t('daysUnit').toLowerCase()}`,
        icon: ShieldCheck,
        meta: getLevelMeta(maturityPressure),
        confidence: null as 'low' | null,
      },
      {
        label: t('interestRateLevel'),
        evidence: `${formatInterestRate(Number(currentBond.interestRate || 0))}%`,
        icon: TrendingUp,
        meta: getLevelMeta(industryInterestRateAssessment.level),
        confidence: industryInterestRateAssessment.confidence,
      },
      {
        label: t('issueScaleLevel'),
        evidence: `${formatNumber(issuedValue, 2)} ${t('unitBillionShort')}`,
        icon: Landmark,
        meta: getLevelMeta(issueScaleLevel),
        confidence: null as 'low' | null,
      },
    ];
  }, [currentBond.interestRate, currentBond.issuedValue, industryInterestRateAssessment.confidence, industryInterestRateAssessment.level, language, maturityInfo?.days, t]);

  const formatBondValue = (value: unknown) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return '-';
    const billionValue = Math.abs(numericValue) > 1000000 ? numericValue / 1000000000 : numericValue;
    return `${formatNumber(billionValue, 2)} ${t('unitBillionVND')}`;
  };

  const formatIssueScaleParValue = (value: unknown) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return '-';

    if (numericValue >= 1_000_000_000) {
      return `${formatNumber(numericValue / 1_000_000_000, 2)} Tỷ VNĐ`;
    }

    if (numericValue >= 1_000_000) {
      return `${formatNumber(numericValue / 1_000_000, 2)} Triệu VNĐ`;
    }

    if (numericValue >= 1_000) {
      return `${formatNumber(numericValue / 1_000, 2)} Nghìn VNĐ`;
    }

    return `${formatNumber(numericValue, 0)} VNĐ`;
  };

  const formatFinancialBillionValue = (...values: unknown[]) => {
    const numericValue = values
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0);

    if (!numericValue) return '-';
    return `${formatNumber(numericValue / 1_000_000_000, 2)} ${t('unitBillionVND')}`;
  };

  const formatLocalizedParValue = (value: unknown) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return '-';

    if (numericValue >= 1_000_000_000) {
      return `${formatNumber(numericValue / 1_000_000_000, 2)} ${t('unitBillionVND')}`;
    }

    if (numericValue >= 1_000_000) {
      return `${formatNumber(numericValue / 1_000_000, 2)} ${language === 'en' ? 'Million VND' : 'Triệu VNĐ'}`;
    }

    if (numericValue >= 1_000) {
      return `${formatNumber(numericValue / 1_000, 2)} ${language === 'en' ? 'Thousand VND' : 'Nghìn VNĐ'}`;
    }

    return `${formatNumber(numericValue, 0)} ${language === 'en' ? 'VND' : 'VNĐ'}`;
  };

  const parseInterestPaymentDetails = (value: unknown) => {
    const rawValue = normalizeText(value);
    if (!rawValue) {
      return { period: '-', method: '-' };
    }

    const normalized = normalizeAscii(rawValue);
    let period = '-';

    const monthMatch = normalized.match(/(\d+)\s*thang/);
    if (monthMatch) {
      period = `${monthMatch[1]} ${t('monthUnit')}`;
    } else if (normalized.includes('hang thang') || normalized.includes('monthly')) {
      period = `1 ${t('monthUnit')}`;
    } else if (normalized.includes('hang quy') || normalized.includes('quarterly') || normalized.includes('quy')) {
      period = `3 ${t('monthUnit')}`;
    } else if (normalized.includes('semi') || normalized.includes('half-year') || normalized.includes('6 month')) {
      period = `6 ${t('monthUnit')}`;
    } else if (normalized.includes('hang nam') || normalized.includes('annually') || normalized.includes('yearly') || normalized.includes('12 month')) {
      period = `12 ${t('monthUnit')}`;
    } else if (normalized.includes('dao han') || normalized.includes('maturity') || normalized.includes('cuoi ky')) {
      period = t('maturityPayment');
    }

    const isPeriodicMethod =
      normalized.includes('dinh ky')
      || normalized.includes('periodic')
      || normalized.includes('thanh toan lai dinh ky')
      || normalized.includes('tra lai dinh ky')
      || normalized.includes('hang thang')
      || normalized.includes('hang quy')
      || normalized.includes('hang nam')
      || normalized.includes('monthly')
      || normalized.includes('quarterly')
      || normalized.includes('annually')
      || normalized.includes('yearly');
    const isMaturityMethod =
      normalized.includes('dao han')
      || normalized.includes('maturity')
      || normalized.includes('cuoi ky')
      || normalized.includes('bullet');
    const isAdvanceMethod =
      normalized.includes('tra truoc')
      || normalized.includes('in advance')
      || normalized.includes('advance')
      || normalized.includes('prepaid')
      || normalized.includes('prepay');
    const isOneTimeMethod =
      normalized.includes('mot lan')
      || normalized.includes('one-time')
      || normalized.includes('one time')
      || normalized.includes('single payment');

    let method = rawValue;
    if (isPeriodicMethod) {
      method = t('periodicPayment');
    } else if (isMaturityMethod) {
      method = t('maturityPayment');
    } else if (isAdvanceMethod) {
      method = t('advancePayment');
    } else if (isOneTimeMethod) {
      method = t('oneTimePayment');
    } else if (period !== '-') {
      method = t('periodicPayment');
    }

    return { period, method };
  };

  const resolveInterestTypeLabel = (value: unknown) => {
    const rawValue = normalizeText(value);
    if (!rawValue) return '-';
    return getLocalizedInterestType(rawValue, t) || rawValue;
  };

  const issuerDisplayName = useMemo(
    () => {
      const resolvedName = resolveIssuerDisplayName(
        issuerProfile?.name,
        issuerProfile?.companyName,
        issuerProfile?.shortName,
        enterpriseName,
        currentBond.enterpriseId,
      );

      if (language === 'en') {
        return normalizeText(
          issuerProfile?.internationalName
          || t(resolvedName as any, issuerProfile?.symbol || issuerProfile?.ticker || currentBond.enterpriseId)
          || resolvedName,
        ) || '-';
      }

      return resolvedName;
    },
    [currentBond.enterpriseId, enterpriseName, issuerProfile, language, t],
  );

  const issuerStockCode = useMemo(
    () => normalizeText(issuerProfile?.symbol || issuerProfile?.ticker || issuerProfile?.code || currentBond.enterpriseId) || '-',
    [currentBond.enterpriseId, issuerProfile],
  );

  const issuerIndustry = useMemo(
    () => {
      const resolvedLabelKey = resolveIndustryKeyFromCandidates(
        resolvedIndustryId,
        issuerProfile?.industryId,
        issuerProfile?.industryName,
        issuerProfile?.IndustryName,
        issuerProfile?.industry,
        issuerProfile?.Industry,
        issuerProfile?.icbName,
        issuerProfile?.ICBName,
        issuerProfile?.icbNameLv2,
        issuerProfile?.ICBNameLv2,
        issuerProfile?.icbNameLv1,
        issuerProfile?.ICBNameLv1,
        issuerProfile?.icbCode,
        issuerProfile?.ICBCode,
        issuerProfile?.icbCodeLv2,
        issuerProfile?.ICBCodeLv2,
        issuerProfile?.icbCodeLv1,
        issuerProfile?.ICBCodeLv1,
        bondDetails?.industryId,
        bondDetails?.industryName,
        bondDetails?.industryCode,
      );

      if (resolvedLabelKey) {
        return normalizeText(t(resolvedLabelKey as any) || resolvedLabelKey) || '-';
      }

      return normalizeText(
        issuerProfile?.industryName ||
          issuerProfile?.IndustryName ||
          issuerProfile?.industry ||
          issuerProfile?.Industry ||
          issuerProfile?.icbName ||
          issuerProfile?.ICBName ||
          issuerProfile?.icbNameLv2 ||
          issuerProfile?.ICBNameLv2 ||
          issuerProfile?.icbNameLv1 ||
          issuerProfile?.ICBNameLv1 ||
          bondDetails?.industryName,
      ) || '-';
    },
    [bondDetails?.industryCode, bondDetails?.industryId, bondDetails?.industryName, issuerProfile, resolvedIndustryId, t],
  );

  const interestPaymentInfo = useMemo(
    () => parseInterestPaymentDetails(bondDetails?.interestPaymentMethod || bondDetails?.paymentMethod),
    [bondDetails?.interestPaymentMethod, bondDetails?.paymentMethod, t],
  );

  const summaryCards = useMemo(
    () => [
      { label: t('interestRate'), value: `${formatInterestRate(Number(currentBond.interestRate || 0))}%`, icon: TrendingUp, tone: 'blue' as const },
      { label: t('term'), value: formatTerm(currentBond.term), icon: Calendar, tone: 'purple' as const },
      {
        label: t('maturityDate'),
        value: formatDate(currentBond.maturityDate),
        icon: Calendar,
        tone: maturityInfo?.isNear ? ('orange' as const) : ('cyan' as const),
      },
      { label: t('listedValueTitle'), value: formatBondValue(currentBond.listedValue), icon: Landmark, tone: 'green' as const },
    ],
    [currentBond.interestRate, currentBond.listedValue, currentBond.maturityDate, currentBond.term, maturityInfo?.isNear, t],
  );

  const bondInfoRows = useMemo(
    () => [
      { label: t('bondCode'), value: currentBond.code || '-' },
      { label: t('bondTypeLabel'), value: getLocalizedBondType(currentBond.bondType, language) || '-' },
      { label: t('status'), value: getLocalizedBondStatus(currentBond.status, language, t) || '-' },
      { label: t('issueDate'), value: formatDate(currentBond.issueDate) },
      { label: t('maturityDate'), value: formatDate(currentBond.maturityDate) },
    ],
    [currentBond.bondType, currentBond.code, currentBond.issueDate, currentBond.maturityDate, currentBond.status, language, t],
  );

  const issuerInfoRows = useMemo(
    () => [
      { label: t('organizationName'), value: issuerDisplayName },
      { label: t('ticker'), value: issuerStockCode },
      { label: t('industryLabel'), value: issuerIndustry },
      { label: t('financialTotalAssets'), value: formatFinancialBillionValue(issuerFinancial?.TotalAsset, issuerFinancial?.TotalAssets, issuerFinancial?.Assets) },
      { label: t('financialEquity'), value: formatFinancialBillionValue(issuerFinancial?.TotalStockHolderEquity, issuerFinancial?.StockHolderEquity, issuerFinancial?.OwnerEquity, issuerFinancial?.Equity) },
    ],
    [issuerDisplayName, issuerFinancial, issuerIndustry, issuerStockCode, t],
  );

  const bondRateRows = useMemo(
    () => [
      { label: t('interestRate'), value: `${formatInterestRate(Number(currentBond.interestRate || 0))}%` },
      { label: t('interestType'), value: resolveInterestTypeLabel(currentBond.interestType) },
      { label: t('paymentPeriodLabel'), value: interestPaymentInfo.period },
      { label: t('paymentMethodLabel'), value: interestPaymentInfo.method },
    ],
    [currentBond.interestRate, currentBond.interestType, interestPaymentInfo.method, interestPaymentInfo.period, t],
  );

  const issueScaleRows = useMemo(
    () => [
      {
        label: t('issuedVolume'),
        value: formatNumber(Number(bondDetails?.totalIssuedVolume || 0), 0),
      },
      {
        label: t('parValueLabel'),
        value: formatLocalizedParValue(bondDetails?.parValue || bondDetails?.faceValue),
      },
      { label: t('issuedValue'), value: formatBondValue(currentBond.issuedValue) },
      { label: t('listedValueTitle'), value: formatBondValue(currentBond.listedValue) },
    ],
    [bondDetails?.faceValue, bondDetails?.parValue, bondDetails?.totalIssuedVolume, currentBond.issuedValue, currentBond.listedValue, currentBond.listedVolume, language, t],
  );

  const isAiRemarkDataReady = useMemo(
    () => !loading && !error && Boolean(currentBond.code) && Boolean(bondDetails),
    [bondDetails, currentBond.code, error, loading],
  );

  const aiRemarkPayload = useMemo(
    () => ({
      bondCode: currentBond.code || '-',
      issuer: {
        name: issuerDisplayName,
        ticker: issuerStockCode,
        industry: issuerIndustry,
        totalAssets: formatFinancialBillionValue(
          issuerFinancial?.TotalAsset,
          issuerFinancial?.TotalAssets,
          issuerFinancial?.Assets,
        ),
        equity: formatFinancialBillionValue(
          issuerFinancial?.TotalStockHolderEquity,
          issuerFinancial?.StockHolderEquity,
          issuerFinancial?.OwnerEquity,
          issuerFinancial?.Equity,
        ),
      },
      bondSummary: {
        bondCode: currentBond.code || '-',
        bondType: getLocalizedBondType(currentBond.bondType, language) || '-',
        status: getLocalizedBondStatus(currentBond.status, language, t) || '-',
        interestRate: `${formatInterestRate(Number(currentBond.interestRate || 0))}%`,
        interestType: resolveInterestTypeLabel(currentBond.interestType),
        term: formatTerm(currentBond.term),
        issueDate: formatDate(currentBond.issueDate),
        maturityDate: formatDate(currentBond.maturityDate),
        issuedValue: formatBondValue(currentBond.issuedValue),
        listedValue: formatBondValue(currentBond.listedValue),
        listedVolume: formatNumber(Number(currentBond.listedVolume || 0), 0),
      },
      bondInfo: bondInfoRows,
      issuerInfo: issuerInfoRows,
      bondRateInfo: bondRateRows,
      issueScaleInfo: issueScaleRows,
      summaryCards: summaryCards.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      industryRateComparison: {
        assessment: quickAnalysis[1]?.meta.label || '-',
        evidence: quickAnalysis[1]?.evidence || '-',
        confidence: industryInterestRateAssessment.confidence || 'normal',
      },
      summarySignals: quickAnalysis.map((item) => ({
        label: item.label,
        evidence: item.evidence,
        assessment: item.meta.label,
        confidence: item.confidence || 'normal',
      })),
      cashFlows: Array.isArray(bondDetails?.cashFlows)
        ? bondDetails.cashFlows.map((cashFlow) => ({
            paymentDate: formatDate(cashFlow.paymentDate),
            interestAmount: formatBondValue(cashFlow.interestAmount),
            principalAmount: formatBondValue(cashFlow.principalAmount),
            totalCashflow: formatBondValue(cashFlow.totalCashflow),
            bondRate: `${formatInterestRate(Number(cashFlow.bondRate || 0))}%`,
          }))
        : [],
    }),
    [
      bondDetails?.cashFlows,
      bondInfoRows,
      bondRateRows,
      currentBond.code,
      currentBond.interestRate,
      currentBond.interestType,
      currentBond.issueDate,
      currentBond.issuedValue,
      currentBond.listedValue,
      currentBond.listedVolume,
      currentBond.maturityDate,
      currentBond.status,
      currentBond.term,
      currentBond.bondType,
      formatBondValue,
      formatFinancialBillionValue,
      formatNumber,
      formatTerm,
      language,
      industryInterestRateAssessment.confidence,
      issueScaleRows,
      issuerDisplayName,
      issuerFinancial,
      issuerIndustry,
      issuerInfoRows,
      issuerStockCode,
      quickAnalysis,
      summaryCards,
      t,
    ],
  );

  const aiRemarkSignature = useMemo(
    () => (isAiRemarkDataReady ? JSON.stringify(aiRemarkPayload) : ''),
    [aiRemarkPayload, isAiRemarkDataReady],
  );
  const localizedAiRemarkCacheKey = useMemo(
    () => `${AI_INSIGHT_CACHE_KEY}-${language}-len${aiRemarkLengthTarget}`,
    [language, aiRemarkLengthTarget],
  );
  const aiRemarkUpdatedLabel = useMemo(() => {
    if (!aiRemarkUpdatedAt) return '';

    const date = new Date(aiRemarkUpdatedAt);
    if (Number.isNaN(date.getTime())) return '';

    return `${t('updated')}: ${new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
      timeZone: 'Asia/Saigon',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)}`;
  }, [aiRemarkUpdatedAt, language, t]);

  const bondDetailChatDataset = useMemo(
    () => ({
      route: `/${currentBond.code || ''}`,
      page: 'bond-detail',
      bondCode: currentBond.code || '-',
      issuer: {
        symbol: issuerStockCode,
        name: issuerDisplayName,
        industry: issuerIndustry,
        totalAssets: formatFinancialBillionValue(
          issuerFinancial?.TotalAsset,
          issuerFinancial?.TotalAssets,
          issuerFinancial?.Assets,
        ),
        equity: formatFinancialBillionValue(
          issuerFinancial?.TotalStockHolderEquity,
          issuerFinancial?.StockHolderEquity,
          issuerFinancial?.OwnerEquity,
          issuerFinancial?.Equity,
        ),
      },
      bond: {
        code: currentBond.code || '-',
        type: getLocalizedBondType(currentBond.bondType, language) || '-',
        status: getLocalizedBondStatus(currentBond.status, language, t) || '-',
        term: formatTerm(currentBond.term),
        issueDate: formatDate(currentBond.issueDate),
        maturityDate: formatDate(currentBond.maturityDate),
        interestRate: `${formatInterestRate(Number(currentBond.interestRate || 0))}%`,
        interestType: resolveInterestTypeLabel(currentBond.interestType),
        paymentPeriod: interestPaymentInfo.period,
        paymentMethod: interestPaymentInfo.method,
        issuedVolume: formatNumber(Number(bondDetails?.totalIssuedVolume || 0), 0),
        parValue: formatIssueScaleParValue(bondDetails?.parValue || bondDetails?.faceValue),
        issuedValue: formatBondValue(currentBond.issuedValue),
        listedValue: formatBondValue(currentBond.listedValue),
        listedVolume: formatNumber(Number(currentBond.listedVolume || 0), 0),
      },
      summaryCards: summaryCards.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      quickAnalysis: quickAnalysis.map((item) => ({
        label: item.label,
        evidence: item.evidence,
        assessment: item.meta.label,
        confidence: item.confidence,
      })),
      cashFlows: Array.isArray(bondDetails?.cashFlows)
        ? bondDetails.cashFlows.map((cashFlow) => ({
            paymentDate: formatDate(cashFlow.paymentDate),
            interestAmount: formatBondValue(cashFlow.interestAmount),
            principalAmount: formatBondValue(cashFlow.principalAmount),
            totalCashflow: formatBondValue(cashFlow.totalCashflow),
            bondRate: `${formatInterestRate(Number(cashFlow.bondRate || 0))}%`,
          }))
        : [],
      aiRemark: aiRemark || '',
    }),
    [
      aiRemark,
      bondDetails?.cashFlows,
      bondDetails?.faceValue,
      bondDetails?.parValue,
      bondDetails?.totalIssuedVolume,
      currentBond.bondType,
      currentBond.code,
      currentBond.interestRate,
      currentBond.interestType,
      currentBond.issueDate,
      currentBond.issuedValue,
      currentBond.listedValue,
      currentBond.listedVolume,
      currentBond.maturityDate,
      currentBond.status,
      currentBond.term,
      formatBondValue,
      formatFinancialBillionValue,
      formatTerm,
      interestPaymentInfo.method,
      interestPaymentInfo.period,
      language,
      issuerDisplayName,
      issuerFinancial,
      issuerIndustry,
      issuerStockCode,
      quickAnalysis,
      summaryCards,
      t,
    ],
  );

  useEffect(() => {
    if (!currentBond.code) return;

    setBondDetailChatContext({
      kind: 'bond-detail',
      routePathname: `/${currentBond.code}`,
      label: t('bondDetailTitle'),
      bondCode: currentBond.code,
      issuerSymbol: issuerStockCode === '-' ? '' : issuerStockCode,
      issuerName: issuerDisplayName,
      dataset: bondDetailChatDataset,
      updatedAt: new Date().toISOString(),
    });

    return () => {
      clearBondDetailChatContext(currentBond.code);
    };
  }, [bondDetailChatDataset, currentBond.code, issuerDisplayName, issuerStockCode, t]);

  useEffect(() => {
    if (!isAiRemarkDataReady || configured || baseUrl || isLoadingStatus || statusError) return;
    void ensureBondDetailAIStatus(refreshStatus);
  }, [baseUrl, configured, isAiRemarkDataReady, isLoadingStatus, refreshStatus, statusError]);

  // Generate (or refresh) the bond remark. Callable directly by the refresh button (`force = true`
  // → skip cache, always regenerate) and by the auto-generate effect (`force = false` → serve cache
  // when present). Staleness is guarded by `aiRequestIdRef` so an outdated in-flight response (e.g.
  // after switching bonds or clicking refresh again) is discarded instead of overwriting the latest.
  const generateBondRemark = async (force = false) => {
    // Only the signature (bond data) is required. Do NOT gate on `aiRemarkLengthTarget`: a forced
    // refresh must always fire even if the box measurement is momentarily 0 — `buildParagraphDirective`
    // handles a 0 target by falling back to a default sentence range. (Gating on it here made the
    // refresh button silently no-op.) The auto-generate effect still waits for the measurement.
    if (!aiRemarkSignature) return;

    if (!configured) {
      // Only surface "not configured" once the status check has resolved.
      if (!isLoadingStatus) {
        setAiRemark('');
        setAiRemarkUpdatedAt('');
        setAiRemarkLoading(false);
        setAiRemarkError(baseUrl ? null : t('aiNotConfiguredShort'));
      }
      return;
    }

    if (!force) {
      const cachedRemark = readDailyAIInsight(localizedAiRemarkCacheKey, aiRemarkSignature);
      if (cachedRemark) {
        setAiRemark(cachedRemark.text);
        setAiRemarkUpdatedAt(cachedRemark.updatedAt);
        setAiRemarkError(null);
        setAiRemarkLoading(false);
        return;
      }
    }

    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setAiRemarkLoading(true);
    setAiRemarkError(null);

    try {
      const model = selectedModel || defaultModel;
      const activeSystemPrompt = systemPrompt || defaultSystemPrompt;
      const basePrompt = language === 'en'
        ? 'You are a professional bond analyst. Respond in English only. Use only the provided dataset for this specific bond. Read the full bond dataset, issuer information, rate structure, issue scale, industry-relative assessment, and cash-flow data when available. Every point must surface bond-specific numbers together with their meaning. Do not mention APIs, JSON, code, internal implementation details, or say that data is missing unless it is truly absent from the dataset.'
        : 'Ban la chuyen gia phan tich trai phieu. Chi tra loi bang tieng Viet co dau. Chi su dung bo du lieu duoc cung cap cho chinh ma trai phieu nay. Hay doc day du du lieu cua ma trai phieu, thong tin to chuc phat hanh, cau truc lai suat, quy mo phat hanh, danh gia tuong quan voi nganh va du lieu dong tien neu co. Moi y phai neu so lieu cua chinh ma trai phieu kem y nghia. Khong nhac toi API, JSON, ma nguon hay cau truc noi bo.';
      const prompt = `${basePrompt}\n\n${buildParagraphDirective(language === 'en' ? 'en' : 'vi', aiRemarkLengthTarget)}`;

      const response = await sendChat({
        model,
        systemPrompt: `${activeSystemPrompt ? `${activeSystemPrompt}\n\n` : ''}${prompt}`,
        userMessage: language === 'en'
          ? `Write a short AI remark in English for bond "${aiRemarkPayload.bondCode}" based on the full provided dataset for that bond, not just the summary signals.`
          : `Hay viet nhan xet AI ngan bang tieng Viet cho trai phieu "${aiRemarkPayload.bondCode}" dua tren toan bo bo du lieu cua ma trai phieu nay, khong chi dua vao cac tin hieu tom tat.`,
        pageContext: JSON.stringify(aiRemarkPayload),
      });

      if (aiRequestIdRef.current !== requestId) return;

      const nextRemark = sanitizeAIInsightText(String(response.text || ''), language === 'en' ? 'en' : 'vi');
      const generatedAt = new Date().toISOString();
      setAiRemark(nextRemark);
      setAiRemarkUpdatedAt(generatedAt);
      setAiRemarkError(null);
      writeDailyAIInsight(localizedAiRemarkCacheKey, {
        signature: aiRemarkSignature,
        text: nextRemark,
        model: response.model || model,
        updatedAt: generatedAt,
      });
    } catch (remarkError) {
      if (aiRequestIdRef.current !== requestId) return;
      console.error('Error generating bond detail AI remark:', remarkError);
      setAiRemark('');
      setAiRemarkUpdatedAt('');
      setAiRemarkError(t('aiError'));
    } finally {
      if (aiRequestIdRef.current === requestId) {
        setAiRemarkLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!aiRemarkSignature) {
      setAiRemark('');
      setAiRemarkUpdatedAt('');
      setAiRemarkError(null);
      setAiRemarkLoading(false);
      return;
    }

    // Wait until the card has been measured so the requested length matches its capacity.
    if (!aiRemarkLengthTarget) return;

    if (isLoadingStatus) {
      setAiRemarkLoading(true);
      setAiRemarkError(null);
      return;
    }

    void generateBondRemark(false);
    // generateBondRemark is intentionally omitted: it is recreated each render and the listed deps
    // already cover every input it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aiRemarkPayload,
    aiRemarkSignature,
    aiRemarkLengthTarget,
    baseUrl,
    configured,
    defaultModel,
    defaultSystemPrompt,
    isAiRemarkDataReady,
    isLoadingStatus,
    language,
    localizedAiRemarkCacheKey,
    selectedModel,
    statusError,
    systemPrompt,
    t,
  ]);

  const cashFlowOptions = useMemo(() => {
    if (!bondDetails?.cashFlows || bondDetails.cashFlows.length === 0) return null;

    const groupedCashFlows = new Map<string, { label: string; sortValue: number; principalAmount: number; interestAmount: number }>();

    [...bondDetails.cashFlows]
      .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
      .forEach((cashFlow) => {
        const date = new Date(cashFlow.paymentDate);
        const year = date.getFullYear();
        const month = date.getMonth();
        const key = cashFlowPeriod === 'month' ? `${year}-${String(month + 1).padStart(2, '0')}` : String(year);
        const label = cashFlowPeriod === 'month' ? `T${month + 1}/${year}` : String(year);
        const sortValue = cashFlowPeriod === 'month' ? year * 100 + month : year;
        const existing = groupedCashFlows.get(key);

        if (existing) {
          existing.principalAmount += cashFlow.principalAmount || 0;
          existing.interestAmount += cashFlow.interestAmount || 0;
          return;
        }

        groupedCashFlows.set(key, {
          label,
          sortValue,
          principalAmount: cashFlow.principalAmount || 0,
          interestAmount: cashFlow.interestAmount || 0,
        });
      });

    const chartData = Array.from(groupedCashFlows.values()).sort((left, right) => left.sortValue - right.sortValue);
    const tooltip = getChartTooltip(isDark);
    const useBarDefault = chartData.length === 1;
    const barWidth = useBarDefault ? '18%' : undefined;
    const barMaxWidth = useBarDefault ? 24 : undefined;

    return {
      color: chartPalette,
      tooltip: {
        ...tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          let content = `${params[0].name}<br/>`;
          params.forEach((param: any) => {
            content += `${param.marker} ${param.seriesName}: ${highlightChartTooltipValue(formatNumber(param.value || 0, 2), ` ${t('unitBillionShort')}`)}<br/>`;
          });
          const total = params.reduce((sum: number, param: any) => sum + (param.value || 0), 0);
          content += `<strong>${t('total')}: ${highlightChartTooltipValue(formatNumber(total, 2), ` ${t('unitBillionShort')}`)}</strong>`;
          return content;
        },
      },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 11 },
      },
      grid: { left: '3%', right: '4%', top: '8%', bottom: '16%', containLabel: true },
      xAxis: {
        type: 'category',
        data: chartData.map((item) => item.label),
        axisLabel: { fontSize: 11, rotate: 0, hideOverlap: false },
      },
      yAxis: {
        name: t('unitBillionVND'),
        type: 'value',
        splitLine: { show: false },
        axisLabel: {
          fontSize: 11,
          formatter: (value: number) => formatNumber(value, 0),
        },
      },
      series: [
        {
          type: useBarDefault ? 'bar' : 'line',
          name: t('principal'),
          data: chartData.map((item) => item.principalAmount),
          smooth: !useBarDefault,
          symbol: useBarDefault ? undefined : 'circle',
          symbolSize: useBarDefault ? 0 : 6,
          lineStyle: useBarDefault ? undefined : { width: 2 },
          barWidth,
          barMaxWidth,
          barGap: useBarDefault ? '30%' : undefined,
        },
        {
          type: useBarDefault ? 'bar' : 'line',
          name: t('interest'),
          data: chartData.map((item) => item.interestAmount),
          smooth: !useBarDefault,
          symbol: useBarDefault ? undefined : 'circle',
          symbolSize: useBarDefault ? 0 : 6,
          lineStyle: useBarDefault ? undefined : { width: 2 },
          barWidth,
          barMaxWidth,
          barGap: useBarDefault ? '30%' : undefined,
        },
      ],
    };
  }, [bondDetails?.cashFlows, cashFlowPeriod, chartPalette, isDark, t]);

  useEffect(() => {
    if (!watchlistNotice) return;
    const timeout = window.setTimeout(() => setWatchlistNotice(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [watchlistNotice]);

  const handleTrackBond = () => {
    const result = upsertWatchlistItemWithStatus({
      ...currentBond,
      issuerName: issuerDisplayName,
      ticker: currentBond.enterpriseId || '',
      bondType: currentBond.bondType || '',
    });

    if (!result.persistedToLocalStorage && !result.usedFallback) {
      setWatchlistNotice({ tone: 'error', text: t('watchlistSaveFailed') });
      return;
    }

    setWatchlistNotice({
      tone: !result.persistedToLocalStorage && result.usedFallback ? 'warning' : 'success',
      text: !result.persistedToLocalStorage && result.usedFallback ? t('watchlistSavedTemporary') : t('addToWatchlistSuccess'),
    });

    setIsTracked(result.items.some((item) => item.code === currentBond.code));
  };

  const handleUntrackBond = () => {
    removeWatchlistItem(currentBond.code);
    setIsTracked(false);
  };

  const handleCompareBond = () => {
    onCompare?.();
  };

  const renderInfoRows = (rows: Array<{ label: string; value: string }>) => (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 border-b border-border-base/70 pb-3 last:border-b-0 last:pb-0">
          <p className="text-sm font-medium text-text-muted">{row.label}</p>
          <p className="text-sm font-semibold text-text-base">{row.value || '-'}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className={
        embedded
          ? 'flex w-full justify-end bg-bg-base'
          : `fixed inset-0 z-40 flex justify-end bg-bg-base animate-in fade-in duration-300 ${
              sidebarDisplayMode === 'expanded'
                ? 'lg:left-72'
                : sidebarDisplayMode === 'collapsed'
                  ? 'lg:left-16'
                  : 'lg:left-0'
            }`
      }
      onClick={embedded ? undefined : onClose}
    >
      <div
        className={
          embedded
            ? 'relative flex min-h-full w-full flex-col bg-bg-base'
            : 'relative flex h-full w-screen flex-col overflow-y-auto overflow-x-hidden border-l border-border-base bg-bg-base custom-scrollbar animate-in slide-in-from-right duration-300'
        }
        onClick={embedded ? undefined : (event) => event.stopPropagation()}
      >
        {watchlistNotice ? (
          <div
            className={
              watchlistNotice.tone === 'success'
                ? 'absolute right-6 top-20 z-40 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg'
                : watchlistNotice.tone === 'warning'
                  ? 'absolute right-6 top-20 z-40 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-lg'
                  : 'absolute right-6 top-20 z-40 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-lg'
            }
          >
            {watchlistNotice.text}
          </div>
        ) : null}

        <div className="w-full">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-4 py-4 md:px-6 lg:py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('back')}
                  title={t('back')}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="truncate text-lg font-bold text-text-base md:text-xl">
                  {t('bondDetailTitle')}
                  {currentBond.code ? <span className="ml-2 font-semibold text-blue-600">{currentBond.code}</span> : null}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCompareBond}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border-base bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-base shadow-sm shadow-blue-950/10 transition-colors hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600 hover:shadow-md dark:bg-surface-bright dark:text-text-base dark:hover:bg-surface-container-low"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>{t('compareBond')}</span>
                </button>
                <button
                  type="button"
                  onClick={isTracked ? handleUntrackBond : handleTrackBond}
                  className={
                    isTracked
                      ? 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-600 transition-colors'
                      : 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-95'
                  }
                >
                  {isTracked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  <span>{isTracked ? t('followed') : t('follow')}</span>
                </button>
              </div>
            </div>

            <section className="grid gap-4 lg:grid-cols-4">
              {summaryCards.map((item) => (
                <MetricCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  icon={item.icon}
                  tone={item.tone}
                  className="hover:-translate-y-1"
                  valueClassName="text-xl md:text-2xl"
                />
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <Info className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-text-base">{t('bondInfoSection')}</h2>
                </div>
                {renderInfoRows(bondInfoRows)}
              </div>

              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-text-base">{t('issuerInfoSection')}</h2>
                </div>
                {renderInfoRows(issuerInfoRows)}
              </div>

              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-text-base">{t('bondRateSection')}</h2>
                </div>
                {renderInfoRows(bondRateRows)}
              </div>

              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-text-base">{t('issueScaleSection')}</h2>
                </div>
                {renderInfoRows(issueScaleRows)}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2 xl:items-start">
              <div className="h-[320px] rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-text-highlight border-t-transparent" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('loadingCashFlow')}</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex h-full items-center justify-center p-4 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-500">{error}</p>
                      {error.includes('401') ? (
                        <p className="text-sm text-text-muted">{t('tokenUpdateMessage')}</p>
                      ) : null}
                    </div>
                  </div>
                ) : cashFlowOptions ? (
                  <ChartWithToolbar
                    option={cashFlowOptions}
                    style={{ height: '100%', width: '100%' }}
                    allowMagicType
                    showToolbar
                    title={cashFlowPeriod === 'month' ? t('expectedCashFlowByMonth') : t('expectedCashFlowByYear')}
                    titleIcon={Activity}
                    actions={
                      <div className="inline-flex w-fit shrink-0 rounded-xl border border-border-base bg-bg-base p-1">
                        {(['month', 'year'] as const).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setCashFlowPeriod(period)}
                            className={
                              cashFlowPeriod === period
                                ? 'rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition-colors'
                                : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-bg-surface hover:text-text-base'
                            }
                          >
                            {period === 'month' ? t('month') : t('year')}
                          </button>
                        ))}
                      </div>
                    }
                    actionsPlacement="below"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-medium text-text-muted">
                    {t('noData')}
                  </div>
                )}
              </div>

              <Card className="group flex flex-col rounded-2xl border-blue-100/80 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-5 shadow-sm shadow-blue-500/10 transition-all duration-300 dark:border-blue-900/40 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20 dark:shadow-black/20">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-surface text-blue-600 shadow-sm ring-1 ring-blue-100 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-6 motion-reduce:transform-none dark:bg-slate-900/40 dark:ring-blue-900/40">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-text-base">{t('aiInsightTitle')}</h2>
                      {aiRemarkUpdatedLabel ? (
                        <div className="mt-0.5 text-xs font-medium text-text-muted/80">{aiRemarkUpdatedLabel}</div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateBondRemark(true)}
                    disabled={!isAiRemarkDataReady || aiRemarkLoading}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-base bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0"
                    title={t('refresh')}
                    aria-label={t('refresh')}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${aiRemarkLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div ref={measureAiRemarkBox} className="h-[220px] overflow-hidden">
                  {aiRemarkLoading ? (
                    <div className="flex items-center gap-3 py-2 text-sm font-semibold text-text-muted">
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                      <span>{t('aiGeneratingInsight')}</span>
                    </div>
                  ) : aiRemarkError ? (
                    <p className="text-sm font-medium text-amber-600">{aiRemarkError}</p>
                  ) : aiRemark ? (
                    <AdaptiveInsightContent
                      content={aiRemark}
                      boldTerms={[currentBond.code, issuerDisplayName].filter(Boolean) as string[]}
                      className="h-full overflow-hidden"
                    />
                  ) : (
                    <p className="text-sm text-text-muted">{t('aiNoInsight')}</p>
                  )}
                </div>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
