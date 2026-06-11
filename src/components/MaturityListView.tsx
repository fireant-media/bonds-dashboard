import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Filter, Calendar, Activity, AlertCircle, Zap, Eye, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown } from 'lucide-react';
import { Bond } from '../types';
import { formatInterestRate, formatNumber, formatDate, normalizeInterestType } from '../utils/format';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { ExportExcelButton } from './ui/ExportExcelButton';
import { exportRowsToExcel } from '../utils/excel';
import {
  buildEnterpriseIndustryOptions,
  buildIndustrySymbolLookup,
  resolveIndustryKeyFromCandidates,
  resolveIndustryKeyFromSymbolGroups,
} from '../constants/industries';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MaturityBond extends Bond {
  issuerName: string;
  ticker?: string;
  daysLeft: number;
  industry?: string;
}

interface MaturityListViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { loadBondDetail, loadIssuerProfile } from '../services/bondData';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';
import { useMaturingBondsQuery } from '../query/dashboardQueries';
import { SortControl } from './ui/SortControl';

const getMaturityIndustryKey = (bond: any, enterpriseIndustry?: string) =>
  resolveIndustryKeyFromCandidates(
    bond?.industry,
    bond?.industryLabel,
    bond?.infoObj?.icbNameLv2,
    bond?.infoObj?.icbNameLv1,
    bond?.infoObj?.icbCodeLv2,
    bond?.infoObj?.icbCodeLv1,
    bond?.infoObj?.industryName,
    bond?.infoObj?.industryCode,
    bond?.icbNameLv2,
    bond?.icbNameLv1,
    bond?.icbCodeLv2,
    bond?.icbCodeLv1,
    bond?.industryName,
    bond?.industryCode,
    enterpriseIndustry
  );

const normalizeMaturityBond = (bond: any, enterpriseIndustry?: string): MaturityBond => ({
  ...bond,
  industry: bond?.industry || getMaturityIndustryKey(bond, enterpriseIndustry),
});

export default function MaturityListView({ setSelectedBond, setBondEnterpriseName }: MaturityListViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [selectedTimeRange, setSelectedTimeRange] = useState(30); // Default 1 month
  const cacheKey = `maturity_list_${selectedTimeRange}`;
  const cachedData = getCache(cacheKey);
  const [bonds, setBonds] = useState<MaturityBond[]>(() =>
    Array.isArray(cachedData) ? cachedData.map((bond: any) => normalizeMaturityBond(bond)) : []
  );
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All');
  const [warningFilter, setWarningFilter] = useState('All');
  const [exportLoading, setExportLoading] = useState(false);
  const [sortField, setSortField] = useState<'maturityDate' | 'daysLeft' | 'listedValue' | 'interestRate' | 'status' | null>(null);
  const [appliedSortField, setAppliedSortField] = useState<'maturityDate' | 'daysLeft' | 'listedValue' | 'interestRate' | 'status' | null>(null);
  const [appliedSortDirection, setAppliedSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<'range' | 'industry' | 'warning' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemsPerPage = 10;
  const maturityBondsQuery = useMaturingBondsQuery(selectedTimeRange);

  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(() => {
    return getCache('enterprise_names_en') || {};
  });
  const enterpriseList = (getCache('enterprise_list') || []) as Array<{ ticker?: string; industry?: string; issuedValue?: number }>;

  useEffect(() => {
    let isMounted = true;

    const hydrateBonds = async () => {
      const data = Array.isArray(maturityBondsQuery.data) ? maturityBondsQuery.data : [];
      if (!data.length) {
        if (maturityBondsQuery.isError) {
          const queryError = maturityBondsQuery.error;
          setError(queryError instanceof Error ? queryError.message : t('dataError'));
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const symbolGroups = await loadDedupedIndustrySymbols();
        if (!isMounted) return;

        const symbolToIndustryKey = buildIndustrySymbolLookup(symbolGroups);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: MaturityBond[] = data.map((b: any) => {
          const enterpriseIndustry = enterpriseList.find((item) => item.ticker === b.issuerSymbol)?.industry;
          const maturity = new Date(b.maturityDate);
          maturity.setHours(0, 0, 0, 0);
          const diffTime = maturity.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          const industry = resolveIndustryKeyFromSymbolGroups(
            b.issuerSymbol,
            symbolToIndustryKey,
            getMaturityIndustryKey(b, enterpriseIndustry)
          );

          return {
            id: b.bondCode,
            code: b.bondCode,
            enterpriseId: b.issuerSymbol || '',
            ticker: b.issuerSymbol,
            issuerName: b.issuerName,
            maturityDate: b.maturityDate?.split('T')[0] || '',
            daysLeft: diffDays > 0 ? diffDays : 0,
            listedVolume: b.currentListedVolume || 0,
            listedValue: (b.currentListedVolume * 100000) / 1000000000,
            interestRate: b.bondRate || 0,
            interestType: normalizeInterestType(
              b.bondRateType || b.interestRateType || b.interestType || '',
              b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
              []
            ) || 'N/A',
            term: `${b.tenorPeriod} ${t('monthUnit')}`,
            issueDate: b.issueDate?.split('T')[0] || '',
            issuedValue: 0,
            status: b.status || t('active'),
            industry,
          };
        }).map((bond) => normalizeMaturityBond(bond, enterpriseList.find((item) => item.ticker === bond.ticker)?.industry));

        setBonds(mapped);
        setCache(cacheKey, mapped);

        const refreshIndustries = async () => {
          const bondsToRefresh = mapped.filter((bond) => !bond.industry);
          if (bondsToRefresh.length === 0) return;

          const updates = new Map<string, string>();
          const results = await mapWithConcurrency(bondsToRefresh, 6, async (bond) => {
            let ticker = bond.ticker;

            if (!ticker) {
              const bondDetail = await loadBondDetail(bond.code);
              ticker = bondDetail?.detail?.issuerSymbol;
            }

            if (!ticker) return null;

            const profile = await loadIssuerProfile(ticker);
            const enterpriseIndustry = (getCache('enterprise_list') || [])
              .find((item: any) => item.ticker === ticker)?.industry;

            const industry = resolveIndustryKeyFromSymbolGroups(
              ticker,
              symbolToIndustryKey,
              getMaturityIndustryKey(profile || bond, enterpriseIndustry)
            );

            return {
              code: bond.code,
              industry,
            };
          });

          getFulfilledValues(results).forEach((result) => {
            if (result?.code && result.industry) {
              updates.set(result.code, result.industry);
            }
          });

          if (!isMounted || updates.size === 0) return;

          setBonds((prev) => {
            const next = prev.map((bond) => {
              const industry = updates.get(bond.code);
              return industry && industry !== bond.industry ? { ...bond, industry } : bond;
            });
            setCache(cacheKey, next);
            return next;
          });
        };

        refreshIndustries().catch((resolveError) => {
          console.error('Failed to resolve maturity industries', resolveError);
        });

        if (language === 'en') {
          const bondsToFetch = mapped.filter((b) => !enterpriseNamesEN[b.ticker || ''] || !b.ticker);

          if (bondsToFetch.length > 0) {
            const fetchNames = async () => {
              const currentENNames = { ...enterpriseNamesEN };
              const results = await mapWithConcurrency(bondsToFetch, 5, async (bond) => {
                let ticker = bond.ticker;

                if (!ticker) {
                  const bondDetail = await loadBondDetail(bond.code);
                  ticker = bondDetail?.detail?.issuerSymbol;
                }

                if (ticker) {
                  const profile = await loadIssuerProfile(ticker);
                  return { code: bond.code, ticker, name: profile?.internationalName || '' };
                }
                return null;
              });

              if (!isMounted) return;

              const validResults = getFulfilledValues(results).filter(Boolean);
              let hasUpdates = false;
              validResults.forEach((res) => {
                if (res && res.name && res.ticker) {
                  currentENNames[res.ticker] = res.name;
                  hasUpdates = true;
                }
              });

              if (hasUpdates && isMounted) {
                setEnterpriseNamesEN({ ...currentENNames });
                setCache('enterprise_names_en', { ...currentENNames });

                setBonds((prev) => prev.map((b) => {
                  const res = validResults.find((r) => r?.code === b.code);
                  if (res && res.name) {
                    return { ...b, ticker: res.ticker, issuerName: res.name };
                  }
                  if (b.ticker && currentENNames[b.ticker]) {
                    return { ...b, issuerName: currentENNames[b.ticker] };
                  }
                  return b;
                }));
              }
            };
            void fetchNames();
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching maturity bonds:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('dataError'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void hydrateBonds();
    return () => { isMounted = false; };
  }, [selectedTimeRange, maturityBondsQuery.data, maturityBondsQuery.error, maturityBondsQuery.isError, language]);

  const getWarningStatus = (days: number) => {
    if (days < 30) return { value: 'very-near', label: t('statusVeryNear'), color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-400/30', icon: AlertCircle, iconColor: 'text-red-600' };
    if (days <= 90) return { value: 'near', label: t('statusNear'), color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-400/30', icon: Zap, iconColor: 'text-orange-600' };
    if (days <= 180) return { value: 'monitor', label: t('statusMonitor'), color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-100 dark:border-yellow-400/30', icon: Eye, iconColor: 'text-yellow-600' };
    if (days <= 270) return { value: 'medium-term', label: t('statusMediumTerm'), color: 'bg-blue-600/5 text-blue-600 border-blue-600/10', icon: Activity, iconColor: 'text-blue-600' };
    return { value: 'long-term', label: t('statusLongTerm'), color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-400/30', icon: CheckCircle2, iconColor: 'text-green-600' };
  };
  const getStatusSortRank = (days: number) => {
    const status = getWarningStatus(days).value;
    if (status === 'very-near') return 1;
    if (status === 'near') return 2;
    if (status === 'monitor') return 3;
    if (status === 'medium-term') return 4;
    return 5;
  };

  const filteredBonds = bonds.filter(bond => {
    const matchesSearch = bond.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         bond.issuerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = industryFilter === 'All' || bond.industry === industryFilter;
    const status = getWarningStatus(bond.daysLeft);
    const matchesWarning = warningFilter === 'All' || status.value === warningFilter;

    return matchesSearch && matchesIndustry && matchesWarning;
  });

  const sortedBonds = [...filteredBonds].sort((a, b) => {
    const defaultSort = new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime();
    if (!appliedSortField || !appliedSortDirection) return defaultSort;

    const direction = appliedSortDirection === 'asc' ? 1 : -1;

    if (appliedSortField === 'maturityDate') {
      return (new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()) * direction;
    }

    if (appliedSortField === 'daysLeft') {
      return ((a.daysLeft || 0) - (b.daysLeft || 0)) * direction;
    }

    if (appliedSortField === 'listedValue') {
      return ((a.listedValue || 0) - (b.listedValue || 0)) * direction;
    }

    if (appliedSortField === 'interestRate') {
      return ((a.interestRate || 0) - (b.interestRate || 0)) * direction;
    }

    if (appliedSortField === 'status') {
      return (getStatusSortRank(a.daysLeft) - getStatusSortRank(b.daysLeft)) * direction;
    }

    return defaultSort;
  });

  const totalPages = Math.ceil(sortedBonds.length / itemsPerPage);
  const paginatedBonds = sortedBonds.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const hasUsefulEnterpriseIndustries = enterpriseList.some((item) => {
    const industry = String(item.industry || '').trim();
    return Boolean(industry) && industry !== 'N/A';
  });

  const enterpriseIndustryOptions = buildEnterpriseIndustryOptions(
    hasUsefulEnterpriseIndustries
      ? enterpriseList
      : bonds.map((bond) => ({
          industry: bond.industry,
          issuedValue: bond.listedValue,
        }))
  );
  const warningLevels = [
    { value: 'All', label: t('allStatuses') },
    { value: 'very-near', label: t('statusVeryNear') },
    { value: 'near', label: t('statusNear') },
    { value: 'monitor', label: t('statusMonitor') },
    { value: 'medium-term', label: t('statusMediumTerm') },
    { value: 'long-term', label: t('statusLongTerm') },
  ];
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedIndustryLabel = useMemo(() => {
    if (industryFilter === 'All') return t('allIndustries');
    return t(industryFilter as any);
  }, [industryFilter, t]);

  const selectedRangeLabel = useMemo(() => {
    switch (selectedTimeRange) {
      case 30: return t('range1MonthShort');
      case 90: return t('range3MonthsShort');
      case 180: return t('range6MonthsShort');
      case 270: return t('range9MonthsShort');
      case 365: return t('range12MonthsShort');
      default: return t('range1MonthShort');
    }
  }, [selectedTimeRange, t]);

  const selectedWarningLabel = useMemo(() => {
    return warningLevels.find((level) => level.value === warningFilter)?.label || t('allStatuses');
  }, [t, warningFilter]);

  const remainingTermLabel = t('remainingTermLabel');

  const sortOptions = useMemo(() => ([
    { value: '__default__', label: t('sortBy'), isDefault: true },
    { value: 'maturityDate', label: t('maturityDateSort') },
    { value: 'daysLeft', label: remainingTermLabel },
    { value: 'listedValue', label: t('issuedValueShort') },
    { value: 'interestRate', label: t('interestRate') },
    { value: 'status', label: t('situation') },
  ]), [remainingTermLabel, t]);

  const handleTableSort = (field: 'maturityDate' | 'daysLeft' | 'listedValue' | 'interestRate' | 'status') => {
    if (appliedSortField === field) {
      const nextDirection = appliedSortDirection === 'asc' ? 'desc' : 'asc';
      setSortField(field);
      setAppliedSortField(field);
      setAppliedSortDirection(nextDirection);
      return;
    }

    setSortField(field);
    setAppliedSortField(field);
    setAppliedSortDirection('asc');
  };

  const renderSortHeader = (
    field: 'maturityDate' | 'daysLeft' | 'listedValue' | 'interestRate' | 'status',
    label: string,
    unit?: string,
  ) => {
    const isActive = appliedSortField === field;
    const direction = isActive ? appliedSortDirection : null;

    return (
      <button
        type="button"
        onClick={() => handleTableSort(field)}
        className="inline-flex w-full items-center justify-center gap-2 text-center transition-opacity hover:opacity-90"
      >
        <div className="flex flex-col items-center">
          <span className="whitespace-nowrap leading-none">{label}</span>
          {unit ? <span className="whitespace-nowrap mt-1 leading-none">({unit})</span> : null}
        </div>
        <ArrowUpDown className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
        {direction ? <span className="sr-only">{direction}</span> : null}
      </button>
    );
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSortDirection, appliedSortField]);

  const handleIndustryButtonClick = () => {
    setOpenMenu((current) => (current === 'industry' ? null : 'industry'));
  };

  const handleWarningButtonClick = () => {
    setOpenMenu((current) => (current === 'warning' ? null : 'warning'));
  };

  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      exportRowsToExcel({
        fileNameBase: 'Maturity_List',
        sheetName: t('maturityTitle'),
        rows: sortedBonds,
        columns: [
          { header: t('bondCode'), value: (bond) => bond.code },
          { header: t('enterprise'), value: (bond) => language === 'en' && bond.ticker && enterpriseNamesEN[bond.ticker] ? enterpriseNamesEN[bond.ticker] : t(bond.issuerName as any, bond.ticker) },
          { header: t('maturityDate'), value: (bond) => formatDate(bond.maturityDate) },
          { header: `${remainingTermLabel} (${t('daysUnit')})`, value: (bond) => bond.daysLeft },
          { header: `${t('issuedValue')} (${t('unitBillionVND')})`, value: (bond) => formatNumber(bond.listedValue, 2) },
          { header: `${t('interestRate')} (${t('unitPercentLabel')})`, value: (bond) => `${formatInterestRate(bond.interestRate)}%` },
          { header: t('situation'), value: (bond) => getWarningStatus(bond.daysLeft).label },
        ],
      });
    } finally {
      setExportLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 text-center transition-colors">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-xl font-bold text-text-base mb-2 transition-colors">{t('failedToLoadData')}</h3>
        <p className="text-text-muted max-w-sm mb-4 transition-colors">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="sticky top-0 z-20 -mx-2 -mt-2 mb-3 flex min-w-0 items-center justify-between border-b border-border-base bg-bg-base/95 px-2 py-3 shadow-sm backdrop-blur md:-mx-4 md:px-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight break-words transition-colors dark:text-text-base">
            {t('maturityTitle')}
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-surface p-4 rounded-lg shadow-sm border border-border-base mb-4 transition-colors">
        <div ref={menuRef} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600 pointer-events-none" />
              <input
                type="text"
                placeholder={t('searchPlaceholderMaturity')}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-border-base bg-bg-surface py-2.5 pl-10 pr-4 text-sm font-semibold text-text-base outline-none transition-colors placeholder:text-text-muted focus:border-blue-200 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="relative w-full lg:w-64">
              <button
                type="button"
                onClick={() => setOpenMenu((current) => (current === 'range' ? null : 'range'))}
                className="inline-flex w-full h-11 items-center justify-between gap-2 rounded-lg border border-border-base bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:bg-surface-container-low"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'range'}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{`${t('maturityWithin')} ${selectedRangeLabel}`}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
              </button>
              {openMenu === 'range' && (
                <div className="absolute left-0 top-full z-20 mt-2 w-full min-w-0 overflow-hidden rounded-lg border border-border-base bg-bg-surface p-2 text-left shadow-xl shadow-blue-950/10">
                  {[
                    { value: 30, label: t('range1MonthShort') },
                    { value: 90, label: t('range3MonthsShort') },
                    { value: 180, label: t('range6MonthsShort') },
                    { value: 270, label: t('range9MonthsShort') },
                    { value: 365, label: t('range12MonthsShort') },
                  ].map((range) => (
                    <button
                      key={range.value}
                      type="button"
                      onClick={() => {
                        setSelectedTimeRange(range.value);
                        setCurrentPage(1);
                        setOpenMenu(null);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        selectedTimeRange === range.value
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400'
                          : 'text-text-base hover:bg-surface-container-low'
                      )}
                    >
                      <span>{range.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex w-full items-center lg:justify-end">
              <ExportExcelButton loading={exportLoading} onClick={handleExportExcel} showIcon={false} />
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center">
            <div className="relative w-full lg:w-82 lg:shrink-0">
              <button
                type="button"
                onClick={handleIndustryButtonClick}
                className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border-base bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:bg-surface-container-low"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'industry'}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{selectedIndustryLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
              </button>
              {openMenu === 'industry' && (
                <div className="absolute right-0 top-full z-20 mt-2 w-full min-w-0 overflow-hidden rounded-lg border border-border-base bg-bg-surface p-2 text-left shadow-xl shadow-blue-950/10">
                  <button
                    type="button"
                    onClick={() => {
                      setIndustryFilter('All');
                      setCurrentPage(1);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      industryFilter === 'All'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400'
                        : 'text-text-base hover:bg-surface-container-low'
                    )}
                  >
                    <span>{t('allIndustries')}</span>
                  </button>
                  {enterpriseIndustryOptions.map((industry) => (
                    <button
                      key={industry.value}
                      type="button"
                      onClick={() => {
                        setIndustryFilter(industry.value);
                        setCurrentPage(1);
                        setOpenMenu(null);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        industryFilter === industry.value
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400'
                          : 'text-text-base hover:bg-surface-container-low'
                      )}
                    >
                      <span className="truncate">{t(industry.value as any)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative w-full lg:w-68 lg:shrink-0">
              <button
                type="button"
                onClick={handleWarningButtonClick}
                className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border-base bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:bg-surface-container-low"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'warning'}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{selectedWarningLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
              </button>
              {openMenu === 'warning' && (
                <div className="absolute right-0 top-full z-20 mt-2 w-full min-w-0 overflow-hidden rounded-lg border border-border-base bg-bg-surface p-2 text-left shadow-xl shadow-blue-950/10">
                  {warningLevels.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => {
                        setWarningFilter(level.value);
                        setCurrentPage(1);
                        setOpenMenu(null);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        warningFilter === level.value
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400'
                          : 'text-text-base hover:bg-surface-container-low'
                      )}
                    >
                      <span>{level.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <SortControl
              className="w-full lg:w-84 lg:shrink-0"
              label={t('sortBy')}
              options={sortOptions}
              value={sortField}
              appliedValue={appliedSortField}
              appliedDirection={appliedSortDirection}
              onChange={(value) => {
                setSortField(value as typeof sortField);
                setAppliedSortField(null);
                setAppliedSortDirection(null);
              }}
              onDirectionChange={(direction) => {
                if (!direction || !sortField) return;
                setAppliedSortField(sortField);
                setAppliedSortDirection(direction);
              }}
              ascendingLabel={t('ascending')}
              descendingLabel={t('descending')}
            />
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 lg:hidden">
        {loading ? (
          <div className="rounded-lg border border-border-base bg-bg-surface px-4 py-10 text-center text-sm font-bold uppercase text-text-muted transition-colors">
            {t('loading')}
          </div>
        ) : paginatedBonds.length > 0 ? (
          paginatedBonds.map((bond) => {
            const status = getWarningStatus(bond.daysLeft);
            return (
              <button
                key={bond.id}
                type="button"
                onClick={() => {
                  setBondEnterpriseName(bond.issuerName);
                  setSelectedBond(bond);
                }}
                className="w-full rounded-lg border border-border-base bg-bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-text-highlight">{bond.code}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{language === 'en' && bond.ticker && enterpriseNamesEN[bond.ticker] ? enterpriseNamesEN[bond.ticker] : t(bond.issuerName as any, bond.ticker)}</p>
                    <p className="mt-1 text-xs font-semibold text-text-muted">{t(bond.industry as any) || bond.industry || 'N/A'}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase", status.color)}>
                    {status.label}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-bg-base p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{t('maturityDate')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{formatDate(bond.maturityDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{remainingTermLabel}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{bond.daysLeft} {t('daysUnit').toLowerCase()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{t('issuedValue')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{formatNumber(bond.listedValue, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{t('interestRate')}</p>
                    <p className="mt-1 text-sm font-bold text-green-600">{formatInterestRate(bond.interestRate)}%</p>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-lg border border-border-base bg-bg-surface px-4 py-10 text-center text-sm font-bold uppercase text-text-muted transition-colors">
            {t('noBondsFound')}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-base bg-bg-surface px-4 py-3 text-sm lg:hidden">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-border-base px-3 py-2 font-bold text-text-muted transition-colors disabled:opacity-40"
          >
            {t('prev')}
          </button>
          <span className="font-bold text-text-base">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="rounded-lg border border-border-base px-3 py-2 font-bold text-text-muted transition-colors disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="hidden overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-sm transition-colors lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white transition-colors">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('bondCode')}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('enterprise')}</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {renderSortHeader('maturityDate', t('maturityDate'))}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {renderSortHeader('daysLeft', remainingTermLabel, t('daysUnit'))}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {renderSortHeader('listedValue', t('issuedValue'), t('unitBillionShort'))}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {renderSortHeader('interestRate', t('interestRate'), t('unitPercentLabel'))}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {renderSortHeader('status', t('situation'))}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base transition-colors">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <p className="text-sm text-text-muted font-bold uppercase transition-colors">{t('loading')}</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedBonds.length > 0 ? (
                paginatedBonds.map((bond, idx) => {
                  const status = getWarningStatus(bond.daysLeft);
                  return (
                    <tr 
                      key={bond.id} 
                      onClick={() => {
                        setBondEnterpriseName(bond.issuerName);
                        setSelectedBond(bond);
                      }}
                      className={cn(
                        "cursor-pointer transition-colors group",
                        idx % 2 === 1 ? 'bg-bg-base/30' : 'bg-bg-surface',
                        "hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      )}
                    >
                      <td className="px-6 py-5 whitespace-nowrap text-center border-none">
                        <span className="text-sm font-bold text-text-highlight group-hover:underline transition-colors">{bond.code}</span>
                      </td>
                      <td className="px-6 py-5 text-left border-none">
                        <div className="max-w-[300px]">
                          <p className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">
                            {language === 'en' && bond.ticker && enterpriseNamesEN[bond.ticker] 
                              ? enterpriseNamesEN[bond.ticker] 
                              : t(bond.issuerName as any, bond.ticker)}
                          </p>
                          <p className="text-[10px] text-text-muted font-semibold group-hover:text-text-highlight transition-colors">
                            {t(bond.industry as any) || bond.industry || 'N/A'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-text-muted text-center border-none group-hover:text-text-highlight transition-colors">
                        {formatDate(bond.maturityDate)}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-right border-none">
                        <div className="flex items-center gap-1 justify-end">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-sm font-bold transition-colors",
                            status.color,
                            "group-hover:text-text-highlight group-hover:bg-white/50"
                          )}>
                            {bond.daysLeft}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-text-base text-right border-none group-hover:text-text-highlight transition-colors">
                        {formatNumber(bond.listedValue, 2)}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-500 text-right border-none transition-colors">
                        {formatInterestRate(bond.interestRate)}%
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-center border-none">
                        <span className={cn("px-3 py-1 rounded-full text-sm font-bold uppercase border transition-colors", status.color)}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted text-sm font-bold uppercase transition-colors">
                    {t('noBondsFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="hidden overflow-x-auto border-t border-border-base bg-bg-base/30 px-4 py-4 transition-colors md:px-6 lg:flex lg:items-center lg:justify-end">
            <div className="flex items-center gap-2 min-w-max">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-bg-surface text-text-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-bold transition-all",
                      currentPage === page 
                        ? "bg-text-highlight text-white shadow-lg shadow-indigo-500/20" 
                        : "hover:bg-bg-surface text-text-muted"
                    )}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-bg-surface text-text-muted disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
