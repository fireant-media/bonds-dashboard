import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Activity, Bookmark, BookmarkCheck, Briefcase, Calendar, Info, Landmark, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import ChartWithToolbar from './ChartWithToolbar';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';
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
import { clearBondDetailChatContext, setBondDetailChatContext } from '../utils/bondDetailChatContext';
import { isBondTracked, onWatchlistUpdated, removeWatchlistItem, upsertWatchlistItemWithStatus } from '../utils/watchlist';
import { useAIStore } from '../store/aiStore';
import { setCache, getCache } from '../utils/cache';
import { Card } from './ui/Card';

interface BondDetailPopupProps {
  bond: Bond;
  enterpriseName: string;
  onClose: () => void;
  onCompare?: () => void;
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

const AI_INSIGHT_CACHE_KEY = 'bond_detail_remarks';

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

export default function BondDetailPopup({ bond, enterpriseName, onClose, onCompare }: BondDetailPopupProps) {
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
  const [aiRemarkLoading, setAiRemarkLoading] = useState(false);
  const [aiRemarkError, setAiRemarkError] = useState<string | null>(null);

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
    const rate = Number(currentBond.interestRate || 0);
    const rateTypeKey = getBondRateTypeKey(currentBond);
    const remainingTermMonths = getRemainingTermMonths(currentBond.maturityDate) ?? parseTermMonths(currentBond.term) ?? null;
    const industryBonds = Array.isArray(industryBondGroup?.bonds) ? industryBondGroup.bonds : [];

    if (!resolvedIndustryId || !rateTypeKey || remainingTermMonths === null || rate <= 0) {
      return {
        level: 'unknown' as const,
        confidence: null as 'low' | null,
      };
    }

    const sameRateTypePeers = industryBonds.filter((bondRow: any) => {
      const code = normalizeText(bondRow?.bondCode || bondRow?.code).toUpperCase();
      if (code && code === normalizeText(currentBond.code).toUpperCase()) return false;
      return getBondRateTypeKey(bondRow) === rateTypeKey;
    });

    const currentTermGroup = remainingTermMonths < 36 ? 'short_term' : 'long_term';
    const withTermGroup = sameRateTypePeers.filter((bondRow: any) => {
      const peerTermMonths = getRemainingTermMonths(bondRow?.maturityDate);
      if (peerTermMonths === null) return false;
      return (peerTermMonths < 36 ? 'short_term' : 'long_term') === currentTermGroup;
    });

    const industryPeers = industryBonds.filter((bondRow: any) => {
      const code = normalizeText(bondRow?.bondCode || bondRow?.code).toUpperCase();
      return !code || code !== normalizeText(currentBond.code).toUpperCase();
    });

    const industryWithTermGroup = industryPeers.filter((bondRow: any) => {
      const peerTermMonths = getRemainingTermMonths(bondRow?.maturityDate);
      if (peerTermMonths === null) return false;
      return (peerTermMonths < 36 ? 'short_term' : 'long_term') === currentTermGroup;
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
      const epsilon = 0.0001;
      return {
        level: rate < medianValue - epsilon ? 'low' : rate > medianValue + epsilon ? 'high' : 'medium',
        confidence: 'low' as const,
      };
    };

    if (termGroupValues.length >= 5) return evaluateWithPercentiles(termGroupValues);
    if (sameRateValues.length >= 5) return evaluateWithPercentiles(sameRateValues);
    if (industryTermGroupValues.length >= 5) return evaluateWithPercentiles(industryTermGroupValues);
    if (industryValues.length >= 5) return evaluateWithPercentiles(industryValues);
    if (industryValues.length >= 2) return evaluateWithMedian(industryValues);

    return {
      level: 'unknown' as const,
      confidence: null as 'low' | null,
    };
  }, [bondDetails?.bondRateType, currentBond.code, currentBond.interestRate, currentBond.interestType, currentBond.maturityDate, currentBond.term, industryBondGroup?.bonds, resolvedIndustryId]);

  const quickAnalysis = useMemo(() => {
    const getLevelMeta = (level: 'high' | 'medium' | 'low' | 'large' | 'small' | 'unknown') => {
      if (level === 'high') return { label: t('levelHigh'), className: 'text-rose-600 dark:text-rose-400' };
      if (level === 'medium') return { label: t('levelMedium'), className: 'text-amber-600 dark:text-amber-400' };
      if (level === 'small') return { label: t('levelSmall'), className: 'text-orange-500 dark:text-orange-300' };
      if (level === 'low') return { label: t('levelLow'), className: 'text-emerald-600 dark:text-emerald-400' };
      if (level === 'large') return { label: t('levelLarge'), className: 'text-blue-600 dark:text-blue-400' };
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
  }, [currentBond.interestRate, currentBond.issuedValue, industryInterestRateAssessment.confidence, industryInterestRateAssessment.level, maturityInfo?.days, t]);

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

    let method = rawValue;
    if (normalized.includes('dinh ky') || normalized.includes('periodic')) {
      method = t('periodicPayment');
    } else if (normalized.includes('dao han') || normalized.includes('maturity') || normalized.includes('cuoi ky')) {
      method = t('maturityPayment');
    } else if (normalized.includes('tra truoc') || normalized.includes('in advance')) {
      method = t('advancePayment');
    } else if (normalized.includes('mot lan') || normalized.includes('one-time') || normalized.includes('one time')) {
      method = t('oneTimePayment');
    }

    return { period, method };
  };

  const resolveInterestTypeLabel = (value: unknown) => {
    const rawValue = normalizeText(value);
    const normalized = normalizeAscii(rawValue);
    if (!rawValue) return '-';
    if (normalized.includes('fixed') || normalized.includes('co dinh')) return t('fixed');
    if (normalized.includes('floating') || normalized.includes('tha noi')) return t('floating');
    return rawValue;
  };

  const issuerDisplayName = useMemo(
    () =>
      resolveIssuerDisplayName(
        issuerProfile?.name,
        issuerProfile?.companyName,
        issuerProfile?.shortName,
        enterpriseName,
        currentBond.enterpriseId,
      ),
    [currentBond.enterpriseId, enterpriseName, issuerProfile],
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
      { label: t('interestRate'), value: `${formatInterestRate(Number(currentBond.interestRate || 0))}%`, icon: TrendingUp },
      { label: t('term'), value: formatTerm(currentBond.term), icon: Calendar },
      {
        label: t('maturityDate'),
        value: formatDate(currentBond.maturityDate),
        icon: Calendar,
        accent: maturityInfo?.isNear ? 'text-rose-600 dark:text-rose-400' : 'text-text-base',
      },
      { label: t('listedValueTitle'), value: formatBondValue(currentBond.listedValue), icon: Landmark },
    ],
    [currentBond.interestRate, currentBond.listedValue, currentBond.maturityDate, currentBond.term, maturityInfo?.isNear, t],
  );

  const bondInfoRows = useMemo(
    () => [
      { label: t('bondCode'), value: currentBond.code || '-' },
      { label: t('bondTypeLabel'), value: normalizeText(currentBond.bondType) || '-' },
      { label: t('status'), value: normalizeText(currentBond.status) || '-' },
      { label: t('issueDate'), value: formatDate(currentBond.issueDate) },
      { label: t('maturityDate'), value: formatDate(currentBond.maturityDate) },
    ],
    [currentBond.bondType, currentBond.code, currentBond.issueDate, currentBond.maturityDate, currentBond.status, t],
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
        value: formatIssueScaleParValue(bondDetails?.parValue || bondDetails?.faceValue),
      },
      { label: t('issuedValue'), value: formatBondValue(currentBond.issuedValue) },
      { label: t('listedValueTitle'), value: formatBondValue(currentBond.listedValue) },
    ],
    [bondDetails?.faceValue, bondDetails?.parValue, bondDetails?.totalIssuedVolume, currentBond.issuedValue, currentBond.listedValue, currentBond.listedVolume, t],
  );

  const aiRemarkPayload = useMemo(
    () => ({
      bondCode: currentBond.code || '-',
      issuerName: issuerDisplayName,
      interestRate: formatInterestRate(Number(currentBond.interestRate || 0)),
      interestType: resolveInterestTypeLabel(currentBond.interestType),
      term: formatTerm(currentBond.term),
      maturityDate: formatDate(currentBond.maturityDate),
      issuedValue: formatBondValue(currentBond.issuedValue),
      listedValue: formatBondValue(currentBond.listedValue),
      summarySignals: quickAnalysis.map((item) => ({
        label: item.label,
        evidence: item.evidence,
        assessment: item.meta.label,
      })),
    }),
    [
      currentBond.code,
      currentBond.interestRate,
      currentBond.interestType,
      currentBond.issuedValue,
      currentBond.listedValue,
      currentBond.maturityDate,
      currentBond.term,
      issuerDisplayName,
      quickAnalysis,
      t,
    ],
  );

  const aiRemarkSignature = useMemo(() => JSON.stringify(aiRemarkPayload), [aiRemarkPayload]);

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
        type: normalizeText(currentBond.bondType) || '-',
        status: normalizeText(currentBond.status) || '-',
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
    let isActive = true;

    if (!aiRemarkSignature) {
      setAiRemark('');
      setAiRemarkError(null);
      setAiRemarkLoading(false);
      return () => {
        isActive = false;
      };
    }

    const cachedRemark = readDailyAIInsight(AI_INSIGHT_CACHE_KEY, aiRemarkSignature);
    if (cachedRemark) {
      setAiRemark(cachedRemark.text);
      setAiRemarkError(null);
      setAiRemarkLoading(false);
      return () => {
        isActive = false;
      };
    }

    if (isLoadingStatus) {
      return () => {
        isActive = false;
      };
    }

    if (!configured && !baseUrl) {
      setAiRemark('');
      setAiRemarkError(t('aiNotConfiguredShort'));
      setAiRemarkLoading(false);
      return () => {
        isActive = false;
      };
    }

    const generateRemark = async () => {
      const requestId = aiRequestIdRef.current + 1;
      aiRequestIdRef.current = requestId;
      setAiRemarkLoading(true);
      setAiRemarkError(null);

      try {
        if (!configured) {
          if (isActive) {
            setAiRemark('');
            setAiRemarkError(t('aiNotConfiguredShort'));
            setAiRemarkLoading(false);
          }
          return;
        }

        const model = selectedModel || defaultModel;
        const activeSystemPrompt = systemPrompt || defaultSystemPrompt;
        const prompt = language === 'en'
          ? 'You are a professional bond analyst. Use only the provided data. Write 3 to 4 short sentences in a concise, professional tone. Focus on the bond code, interest rate, maturity pressure, issue scale, and the main point to monitor. Do not mention APIs, JSON, code, or internal implementation details.'
          : 'Ban la chuyen gia phan tich trai phieu. Chi su dung du lieu duoc cung cap. Hay viet 3 den 4 cau ngan, giu giong dieu chuyen nghiep. Tap trung vao ma trai phieu, lai suat, ap luc dao han, quy mo phat hanh va diem can theo doi. Khong nhac toi API, JSON, ma nguon hay cau truc noi bo.';

        const response = await sendChat({
          model,
          systemPrompt: `${activeSystemPrompt ? `${activeSystemPrompt}\n\n` : ''}${prompt}`,
          userMessage: language === 'en'
            ? `Write a short AI remark for bond "${aiRemarkPayload.bondCode}" using only the provided data.`
            : `Hay viet nhan xet AI ngan cho trai phieu "${aiRemarkPayload.bondCode}" chi dua tren du lieu duoc cung cap.`,
          pageContext: JSON.stringify(aiRemarkPayload),
        });

        if (!isActive || aiRequestIdRef.current !== requestId) return;

        const nextRemark = sanitizeAIInsightText(String(response.text || ''));
        setAiRemark(nextRemark);
        setAiRemarkLoading(false);
        setAiRemarkError(null);
        writeDailyAIInsight(AI_INSIGHT_CACHE_KEY, {
          signature: aiRemarkSignature,
          text: nextRemark,
          model: response.model || model,
          updatedAt: new Date().toISOString(),
        });
      } catch (remarkError) {
        if (!isActive || aiRequestIdRef.current !== requestId) return;
        console.error('Error generating bond detail AI remark:', remarkError);
        setAiRemark('');
        setAiRemarkLoading(false);
        setAiRemarkError(t('aiError'));
      }
    };

    void generateRemark();

    return () => {
      isActive = false;
    };
  }, [
    aiRemarkPayload,
    aiRemarkSignature,
    baseUrl,
    configured,
    defaultModel,
    defaultSystemPrompt,
    isLoadingStatus,
    language,
    selectedModel,
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
      grid: { left: '3%', right: '4%', bottom: '16%', containLabel: true },
      xAxis: {
        type: 'category',
        data: chartData.map((item) => item.label),
        axisLabel: { fontSize: 11, rotate: 0, hideOverlap: false },
      },
      yAxis: {
        name: t('unitBillionVND'),
        type: 'value',
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
      className="fixed inset-x-0 top-16 bottom-0 z-40 flex justify-end bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-screen flex-col overflow-hidden border-l border-border-base bg-bg-base shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(event) => event.stopPropagation()}
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

        <div className="sticky top-0 z-30 border-b border-border-base bg-bg-surface/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t('back')}</span>
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
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-base bg-bg-base px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
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
                    : 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-700'
                }
              >
                {isTracked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                <span>{isTracked ? t('followed') : t('follow')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-4 py-4 md:px-6 lg:py-6">
            <section className="grid gap-4 lg:grid-cols-4">
              {summaryCards.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.label} className="group relative p-3 transition-all duration-200 hover:-translate-y-1 hover:border-blue-500/25 hover:shadow-lg hover:shadow-blue-500/10">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100/80 via-blue-50/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:from-blue-500/15 dark:via-blue-500/5" />
                    <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-200/30 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-blue-500/10" />
                    <div className="relative flex min-h-28 flex-col gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-blue-500/15 group-hover:text-blue-700">
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="min-w-0 flex-1 break-words text-left text-xs font-semibold uppercase leading-snug tracking-wider text-text-muted/80 transition-colors group-hover:text-text-muted">
                          {item.label}
                        </p>
                      </div>
                      <div className="flex flex-1 items-center justify-center">
                        <p className={`break-words text-center text-2xl font-bold leading-tight transition-all duration-200 group-hover:scale-105 md:text-3xl ${item.accent || 'text-text-base'}`}>
                          {item.value}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
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

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                {loading ? (
                  <div className="flex h-96 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-text-highlight border-t-transparent" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('loadingCashFlow')}</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex h-96 items-center justify-center p-4 text-center">
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
                                ? 'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors'
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
                  <div className="flex h-96 items-center justify-center text-sm font-medium text-text-muted">
                    {t('noData')}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-bold text-text-base">{t('quickAnalysisTitle')}</h2>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {quickAnalysis.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border-base bg-bg-base/50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface text-blue-600">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <p className="min-w-0 flex-1 text-sm font-semibold text-text-base">
                          {item.label}
                        </p>
                      </div>
                      <div className="flex flex-col items-center text-center">
                        <p className="mt-2 text-sm font-medium text-text-muted">{item.evidence}</p>
                        <p className={`mt-3 text-sm font-bold ${item.meta.className}`}>{item.meta.label}</p>
                        {item.confidence ? (
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted/80">{t('confidenceLow')}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-bold text-text-base">{t('aiInsightTitle')}</p>
                    </div>
                    {aiRemarkLoading ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('aiAnalyzing')}</p>
                    ) : aiRemarkError ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">{aiRemarkError}</p>
                    ) : null}
                  </div>

                  <p className="text-sm leading-6 text-text-base">
                    {aiRemark || t('insightPlaceholder')}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
