import { useState, useEffect } from 'react';
import { Search, Filter, Calendar, Activity, Briefcase, AlertCircle, Zap, Eye, CheckCircle2, ChevronLeft, ChevronRight, ArrowUpDown, Settings } from 'lucide-react';
import { Bond } from '../types';
import { formatInterestRate, formatNumber, formatDate, normalizeInterestType } from '../utils/format';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { ExportExcelButton } from './ui/ExportExcelButton';
import { exportRowsToExcel } from '../utils/excel';

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
import { fireantApi } from '../api/fireant';

export default function MaturityListView({ setSelectedBond, setBondEnterpriseName }: MaturityListViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [selectedTimeRange, setSelectedTimeRange] = useState(30); // Default 1 month
  const cacheKey = `maturity_list_${selectedTimeRange}`;
  const cachedData = getCache(cacheKey);
  const [bonds, setBonds] = useState<MaturityBond[]>(cachedData || []);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState(t('allIndustries'));
  const [warningFilter, setWarningFilter] = useState(t('allStatuses'));
  const [valueFilter, setValueFilter] = useState(t('allValues'));
  const [exportLoading, setExportLoading] = useState(false);
  const [sortType, setSortType] = useState<'default' | 'maturity-near' | 'maturity-far' | 'value-high' | 'value-low'>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(() => {
    return getCache('enterprise_names_en') || {};
  });

  useEffect(() => {
    let isMounted = true;
    const fetchBonds = async () => {
      if (!cachedData) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await fireantApi.getMaturingSoon(selectedTimeRange);

        if (!isMounted) return;

          if (Array.isArray(data)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const mapped: MaturityBond[] = data.map((b: any) => {
              const maturity = new Date(b.maturityDate);
              maturity.setHours(0, 0, 0, 0);
              const diffTime = maturity.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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
                industry: b.infoObj?.icbNameLv2 || t('others')
              };
            });
            setBonds(mapped);
            setCache(cacheKey, mapped);

            // Trigger background fetch for international names if in English mode
            if (language === 'en') {
              const bondsToFetch = mapped.filter(b => !enterpriseNamesEN[b.ticker || ''] || !b.ticker);
              
              if (bondsToFetch.length > 0) {
                const fetchInChunks = async () => {
                  const chunkSize = 5;
                  const currentENNames = { ...enterpriseNamesEN };
                  
                  for (let i = 0; i < bondsToFetch.length; i += chunkSize) {
                    if (!isMounted) break;
                    
                    const chunk = bondsToFetch.slice(i, i + chunkSize);
                    const results = await Promise.all(
                      chunk.map(async (bond) => {
                        try {
                          let ticker = bond.ticker;
                          
                          // Step 1: If ticker is missing, fetch bond details to get issuerSymbol
                          if (!ticker) {
                            const bondDetail = await fireantApi.getBond(bond.code);
                            ticker = bondDetail.detail?.issuerSymbol;
                          }

                          // Step 2 & 3: Fetch profile and get internationalName
                          if (ticker) {
                            const profile = await fireantApi.getIssuerProfile(ticker);
                            return { code: bond.code, ticker, name: profile.internationalName };
                          }
                        } catch (e) {
                          console.error(`Failed to fetch EN name for ${bond.code}`, e);
                        }
                        return null;
                      })
                    );

                    let hasUpdates = false;
                    results.forEach(res => {
                      if (res && res.name && res.ticker) {
                        currentENNames[res.ticker] = res.name;
                        hasUpdates = true;
                      }
                    });

                    if (hasUpdates && isMounted) {
                      setEnterpriseNamesEN({ ...currentENNames });
                      setCache('enterprise_names_en', { ...currentENNames });
                      
                      // Also update the currently displayed bonds list if they match the ticker
                      setBonds(prev => prev.map(b => {
                        const res = results.find(r => r?.code === b.code);
                        if (res && res.name) {
                          return { ...b, ticker: res.ticker, issuerName: res.name };
                        }
                        // Even if it didn't just update, if we now have it in currentENNames, apply it
                        if (b.ticker && currentENNames[b.ticker]) {
                          return { ...b, issuerName: currentENNames[b.ticker] };
                        }
                        return b;
                      }));
                    }

                    if (i + chunkSize < bondsToFetch.length) {
                      await new Promise(resolve => setTimeout(resolve, 200));
                    }
                  }
                };
                fetchInChunks();
              }
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

    fetchBonds();
    return () => { isMounted = false; };
  }, [selectedTimeRange]);

  const getWarningStatus = (days: number) => {
    if (days < 30) return { label: t('statusVeryNear'), color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-400/30', icon: AlertCircle, iconColor: 'text-red-600' };
    if (days <= 90) return { label: t('statusNear'), color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-400/30', icon: Zap, iconColor: 'text-orange-600' };
    if (days <= 180) return { label: t('statusMonitor'), color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-100 dark:border-yellow-400/30', icon: Eye, iconColor: 'text-yellow-600' };
    if (days <= 270) return { label: t('statusMediumTerm'), color: 'bg-blue-600/5 text-blue-600 border-blue-600/10', icon: Activity, iconColor: 'text-blue-600' };
    return { label: t('statusLongTerm'), color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-400/30', icon: CheckCircle2, iconColor: 'text-green-600' };
  };

  const filteredBonds = bonds.filter(bond => {
    const matchesSearch = bond.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         bond.issuerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = industryFilter === t('allIndustries') || bond.industry === industryFilter;
    const status = getWarningStatus(bond.daysLeft);
    const matchesWarning = warningFilter === t('allStatuses') || status.label === warningFilter;
    
    let matchesValue = true;
    if (valueFilter === t('rangeLess100')) matchesValue = bond.listedValue < 100;
    else if (valueFilter === t('range100to500')) matchesValue = bond.listedValue >= 100 && bond.listedValue <= 500;
    else if (valueFilter === t('rangeMore500')) matchesValue = bond.listedValue > 500;

    return matchesSearch && matchesIndustry && matchesWarning && matchesValue;
  });

  const sortedBonds = [...filteredBonds].sort((a, b) => {
    if (sortType === 'maturity-far') {
      const dateA = new Date(a.maturityDate).getTime();
      const dateB = new Date(b.maturityDate).getTime();
      return dateB - dateA;
    } else if (sortType === 'value-high') {
      return b.listedValue - a.listedValue;
    } else if (sortType === 'value-low') {
      return a.listedValue - b.listedValue;
    } else {
      // Default and maturity-near both sort by maturity asc
      const dateA = new Date(a.maturityDate).getTime();
      const dateB = new Date(b.maturityDate).getTime();
      return dateA - dateB;
    }
  });

  const totalPages = Math.ceil(sortedBonds.length / itemsPerPage);
  const paginatedBonds = sortedBonds.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const industries = [t('allIndustries'), ...new Set(bonds.map(b => b.industry).filter(Boolean) as string[])];
  const warningLevels = [t('allStatuses'), t('statusVeryNear'), t('statusNear'), t('statusMonitor'), t('statusMediumTerm'), t('statusLongTerm')];

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
          { header: `${t('daysLeftLabel')} (${t('daysUnit')})`, value: (bond) => bond.daysLeft },
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
    <div className="p-0 md:p-4 animate-in fade-in duration-500 transition-colors">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-blue-600 tracking-tight transition-colors">{t('maturityTitle')}</h1>
        <ExportExcelButton loading={exportLoading} onClick={handleExportExcel} />
      </div>

      {/* Time Range Selector */}
      <div className="flex justify-center mb-8 overflow-x-auto pb-1">
        <div className="bg-bg-base p-1 rounded-lg flex gap-1 transition-colors min-w-max">
          {[
            { label: t('range1Month'), days: 30 },
            { label: t('range3Months'), days: 90 },
            { label: t('range6Months'), days: 180 },
            { label: t('range9Months'), days: 270 },
            { label: t('range12Months'), days: 365 },
          ].map((range) => (
            <button
              key={range.days}
              onClick={() => {
                setSelectedTimeRange(range.days);
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 md:px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap",
                selectedTimeRange === range.days 
                  ? "bg-bg-surface text-blue-600 shadow-sm" 
                  : "text-text-muted hover:text-text-base"
              )}
            >
              {range.label}
            </button>
          ))}
          <button className="px-4 py-2.5 text-text-muted hover:text-text-base transition-colors">
            <Calendar className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-surface p-4 rounded-lg shadow-sm border border-border-base mb-4 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Row 1 */}
          {/* Search Item */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
            <input
              type="text"
              placeholder={t('searchPlaceholderMaturity')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-12 pr-4 py-3 bg-bg-base/50 focus:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 transition-all placeholder:text-text-muted outline-none"
            />
          </div>

          {/* Maturity Date Sort */}
          <div className="relative">
            <ArrowUpDown className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              value={sortType === 'maturity-near' ? 'near' : (sortType === 'maturity-far' ? 'far' : 'default')}
              onChange={(e) => {
                if (e.target.value === 'default') {
                  setSortType('default');
                } else if (e.target.value === 'near') {
                  setSortType('maturity-near');
                } else if (e.target.value === 'far') {
                  setSortType('maturity-far');
                }
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-bg-base/50 hover:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 outline-none cursor-pointer transition-all appearance-none"
            >
              <option value="default">{t('maturityDateSort')}</option>
              <option value="near">{t('nearest')}</option>
              <option value="far">{t('farthest')}</option>
            </select>
          </div>

          {/* Issue Value Sort */}
          <div className="relative">
            <ArrowUpDown className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              value={sortType === 'value-high' ? 'high' : (sortType === 'value-low' ? 'low' : 'default')}
              onChange={(e) => {
                if (e.target.value === 'default') {
                  setSortType('default');
                } else if (e.target.value === 'high') {
                  setSortType('value-high');
                } else if (e.target.value === 'low') {
                  setSortType('value-low');
                }
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-bg-base/50 hover:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 outline-none cursor-pointer transition-all appearance-none"
            >
              <option value="default">{t('issuedValue')}</option>
              <option value="high">{t('highToLow')}</option>
              <option value="low">{t('lowToHigh')}</option>
            </select>
          </div>

          {/* Row 2 */}
          {/* Industry Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              value={industryFilter}
              onChange={(e) => {
                setIndustryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-bg-base/50 hover:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 outline-none cursor-pointer transition-all appearance-none"
            >
              {industries.map(ind => <option key={ind} value={ind}>{t(ind as any)}</option>)}
            </select>
          </div>

          {/* Value Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              value={valueFilter}
              onChange={(e) => {
                setValueFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-bg-base/50 hover:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 outline-none cursor-pointer transition-all appearance-none"
            >
              {[t('allValues'), t('rangeLess100'), t('range100to500'), t('rangeMore500')].map(val => <option key={val} value={val}>{val}</option>)}
            </select>
          </div>

          {/* Warning Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              value={warningFilter}
              onChange={(e) => {
                setWarningFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-bg-base/50 hover:bg-bg-base border-none rounded-lg text-sm font-medium text-text-base focus:ring-2 focus:ring-blue-600/20 outline-none cursor-pointer transition-all appearance-none"
            >
              {warningLevels.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-bg-surface rounded-lg shadow-sm border border-border-base overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white transition-colors">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('bondCode')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('enterprise')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('maturityDate')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('daysLeftLabel')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('daysUnit')})</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('issuedValue')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('unitBillionShort')})</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('interestRate')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('unitPercentLabel')})</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('situation')}</th>
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
                      <td className="px-6 py-5 whitespace-nowrap text-left border-none">
                        <span className="text-xs font-bold text-text-highlight group-hover:underline transition-colors">{bond.code}</span>
                      </td>
                      <td className="px-6 py-5 text-left border-none">
                        <div className="max-w-[200px]">
                          <p className="text-xs font-bold text-text-base truncate group-hover:text-text-highlight transition-colors">
                            {language === 'en' && bond.ticker && enterpriseNamesEN[bond.ticker] 
                              ? enterpriseNamesEN[bond.ticker] 
                              : t(bond.issuerName as any, bond.ticker)}
                          </p>
                          <p className="text-xs text-text-muted truncate font-semibold group-hover:text-text-highlight transition-colors">
                            {t(bond.industry as any)}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-text-muted text-right border-none group-hover:text-text-highlight transition-colors">
                        {formatDate(bond.maturityDate)}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-right border-none">
                        <div className="flex items-center gap-1 justify-end">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-xs font-bold transition-colors",
                            status.color,
                            "group-hover:text-text-highlight group-hover:bg-white/50"
                          )}>
                            {bond.daysLeft}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-text-base text-right border-none group-hover:text-text-highlight transition-colors">
                        {formatNumber(bond.listedValue, 2)}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-xs font-bold text-green-600 dark:text-green-500 text-right border-none transition-colors">
                        {formatInterestRate(bond.interestRate)}%
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-left border-none">
                        <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase border transition-colors", status.color)}>
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
          <div className="px-4 md:px-6 py-4 border-t border-border-base flex items-center justify-end bg-bg-base/30 transition-colors overflow-x-auto">
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
