import { useState, useRef, useEffect, Component, ReactNode } from 'react';
import ChartWithToolbar from './ChartWithToolbar';
import { X, ArrowLeft, RotateCcw, Plus, Check, Search, Loader2, Bookmark, Activity, Landmark, TrendingUp, Info } from 'lucide-react';
import { Enterprise } from '../types';
import { Bond } from "../types";
import { formatNumber, formatInterestRate, formatDate, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { getFireantToken, cleanTokenString } from '../utils/token';
import { getCache, setCache } from '../utils/cache';
import { CHART_PALETTE, getChartTooltip, highlightChartTooltipValue } from '../utils/chart';
import { readJsonResponse } from '../utils/http';
import { buildFireantUrl, fireantApi } from '../api/fireant';
import { exportRowsToExcel } from '../utils/excel';
import { upsertWatchlistItemWithStatus } from '../utils/watchlist';
import { loadBondDetail, loadIssuerBondsByFilter, loadIssuerProfile, loadMaturingBonds } from '../services/bondData';

const MAX_SELECTED_BONDS = 10;

// Error Boundary for this component
class BondComparisonErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[BondComparisonErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 max-w-md text-center">
            <p className="text-red-400 font-bold mb-2">Display Error</p>
            <p className="text-red-300 text-sm mb-4">{this.state.error?.message}</p>
            <p className="text-red-300 text-xs">Please refresh the page (F5)</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface BondComparisonPopupProps {
  primaryBond: Bond;
  primaryEnterpriseName?: string;
  onClose: () => void;
  onBack: () => void;
}

function BondComparisonPopup({ primaryBond, primaryEnterpriseName, onClose, onBack }: BondComparisonPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';

  const chartPalette = CHART_PALETTE;

  const [comparisonBonds, setComparisonBonds] = useState<Bond[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Bond[]>([]);
  const [searching, setSearching] = useState(false);
  const [allBondsPool, setAllBondsPool] = useState<Bond[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);
  const [watchlistSelections, setWatchlistSelections] = useState<Record<string, boolean>>({});
  const [watchlistNotice, setWatchlistNotice] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Validate selectedBonds to prevent render errors
  const validateBond = (bond: Bond): boolean => {
    if (!bond || !bond.code) return false;
    return parseDateToTimestamp(bond.maturityDate) !== null;
  };

  const isMissingInterestType = (value: any) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || /^(n\/a|na|unknown|undefined|null|\-)$/.test(normalized);
  };

  const validatedComparisonBonds = comparisonBonds.filter(validateBond);
  const selectedBonds = [primaryBond, ...validatedComparisonBonds].filter(validateBond);
  const canAddMoreBonds = selectedBonds.length < MAX_SELECTED_BONDS;
  const selectedWatchlistCount = selectedBonds.filter((bond) => watchlistSelections[bond.code]).length;
  const allWatchlistSelected = selectedBonds.length > 0 && selectedWatchlistCount === selectedBonds.length;
  const selectedBondsSignature = selectedBonds.map((bond) => bond.code).join('|');
  
  useEffect(() => {
    // Log any invalid bonds that were filtered out
    if (comparisonBonds.length !== validatedComparisonBonds.length) {
      console.warn('[BondComparisonPopup] Some invalid comparison bonds were filtered:', 
        comparisonBonds.filter(b => !validateBond(b)));
    }
  }, [validatedComparisonBonds.length]);

  // Use search to find bonds
  useEffect(() => {
    if (isSearching && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearching]);

  useEffect(() => {
    if (!canAddMoreBonds && isSearching) {
      setIsSearching(false);
      setSearchTerm('');
      setSuggestions([]);
    }
  }, [canAddMoreBonds, isSearching]);

  useEffect(() => {
    if (!showWatchlistPicker) return;

    setWatchlistSelections((prev) => {
      const next: Record<string, boolean> = {};
      selectedBonds.forEach((bond) => {
        next[bond.code] = prev[bond.code] ?? true;
      });
      return next;
    });
  }, [showWatchlistPicker, selectedBondsSignature]);

  useEffect(() => {
    if (!watchlistNotice) return;

    const timeout = window.setTimeout(() => setWatchlistNotice(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [watchlistNotice]);

  // Load initial pool of bonds from cache or fetch if empty
  useEffect(() => {
    const loadPool = async () => {
        // 1. Load from all maturity list caches to get a good initial set
        const cacheRanges = [30, 90, 180, 270, 365];
        let pooledBonds: Bond[] = [];
        
        for (const range of cacheRanges) {
          const cached = getCache(`maturity_list_${range}`);
          if (cached && Array.isArray(cached)) {
            pooledBonds = [...pooledBonds, ...cached];
          }
        }

        // 2. Load from enterprise/industry list caches if they contain bonds
        const cachedDetailedBonds = getCache('comparison_pool_bonds');
        if (cachedDetailedBonds && Array.isArray(cachedDetailedBonds)) {
          pooledBonds = [...pooledBonds, ...cachedDetailedBonds];
        }

        // 3. Remove duplicates
        const uniquePool = Array.from(new Map(pooledBonds.map(b => [b.code, b])).values());
        
        if (uniquePool.length > 0) {
          setAllBondsPool(uniquePool);
        }

        // 4. Fetch a very large set in background (last 10 years maturing)
        if (uniquePool.length < 200) {
          try {
            const token = getFireantToken();
            const cleanToken = token ? cleanTokenString(token) : undefined;
            const headers: Record<string, string> = { 'Accept': 'application/json' };
            if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

            const data = await loadMaturingBonds(3650);
            if (Array.isArray(data)) {
              const fetchedBonds: Bond[] = data.map((b: any) => ({
                id: b.bondCode,
                code: b.bondCode,
                enterpriseId: b.issuerSymbol || '',
                term: String(b.tenorPeriod || 'N/A'),
                interestRate: b.bondRate || 0,
                listedVolume: b.currentListedVolume || 0,
                issuedValue: b.totalIssuedValue || b.currentListedVolume || 0,
                listedValue: b.currentListedValue || b.currentListedVolume || 0,
                issueDate: b.issueDate?.split('T')[0] || '',
                maturityDate: b.maturityDate?.split('T')[0] || '',
                bondType: b.bondType || b.BondType || '',
                interestType: normalizeInterestType(
                  b.bondRateType || b.interestRateType || b.couponRateType || b.interestType || '',
                  b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
                  []
                ) || 'N/A',
                status: b.status || t('active')
              }));

              setAllBondsPool(prev => {
                const combined = [...prev, ...fetchedBonds];
                const final = Array.from(new Map(combined.map(b => [b.code, b])).values());
                setCache('comparison_pool_bonds', final);
                return final;
              });
            }
          } catch (e) {
            console.error("Failed to fetch background pool", e);
          }
        }
    };

    loadPool();
  }, []);

  useEffect(() => {
    const searchBonds = async () => {
      if (!searchTerm || searchTerm.trim().length < 1) {
        setSuggestions([]);
        return;
      }

      setSearching(true);
      const normalizedSearch = searchTerm.trim().toUpperCase();
      
      try {
        // 1. Search in our pre-fetched pool first
        const poolMatches = allBondsPool.filter(b => 
          b.code.toUpperCase().includes(normalizedSearch) &&
          !selectedBonds.some(sb => sb.code === b.code)
        );

        // 2. Supplement with API symbol search
        const token = getFireantToken();
        let apiMatches: Bond[] = [];
        
        const cleanToken = token ? cleanTokenString(token) : undefined;
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

        // Special case: If search term is short and matches a potential issuer, 
        // try to fetch all bonds for that issuer to get the full list (e.g., 174 bonds for BID)
        if (normalizedSearch.length >= 2 && normalizedSearch.length <= 5) {
          try {
            const issuerBonds = await loadIssuerBondsByFilter(normalizedSearch);
            if (Array.isArray(issuerBonds)) {
              const mappedIssuerBonds = issuerBonds.map((b: any) => ({
                id: b.bondCode,
                code: b.bondCode,
                enterpriseId: b.issuerSymbol || normalizedSearch,
                term: String(b.tenorPeriod || 'N/A'),
                interestRate: b.bondRate || 0,
                listedVolume: b.currentListedVolume || 0,
                issuedValue: b.totalIssuedValue || b.currentListedVolume || 0,
                listedValue: b.currentListedValue || b.currentListedVolume || 0,
                issueDate: b.issueDate?.split('T')[0] || '',
                maturityDate: b.maturityDate?.split('T')[0] || '',
                bondType: b.bondType || b.BondType || '',
                interestType: normalizeInterestType(
                  b.bondRateType || b.interestRateType || b.couponRateType || b.interestType || '',
                  b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
                  []
                ) || 'N/A',
                status: b.status || t('active')
              }));
              apiMatches = [...apiMatches, ...mappedIssuerBonds];
            }
          } catch (e) {
            console.error("Failed to fetch issuer specific bonds during search", e);
          }
        }

        const response = await fetch(buildFireantUrl('symbols/search', { q: searchTerm }), {
          cache: 'no-store',
          headers
        });

        if (response.ok) {
          const data = await readJsonResponse<any[]>(response, `Symbol search ${searchTerm}`);
          if (data && Array.isArray(data)) {
            const searchApiMatches = data.filter((s: any) => {
              const symType = String(s.symbolType || s.type || '').toLowerCase();
              const symbol = String(s.symbol || s.ticker || '');
              
              // Only include if explicitly a bond or matches pre-cached bond patterns
              // Avoid warrants (cw) or other types
              const isBondType = symType.includes('bond') || symType === '3';
              const looksLikeBond = symbol.length >= 6 && /\d/.test(symbol) && !symType.includes('cw') && !symType.includes('warrant');
              
              return (isBondType || looksLikeBond) &&
                !selectedBonds.some(sb => sb.code === symbol) &&
                !poolMatches.some(pm => pm.code === symbol) &&
                !apiMatches.some(am => am.code === symbol);
            }).map((s: any) => ({
              id: s.symbol,
              code: s.symbol,
              enterpriseId: '',
              term: '',
              interestRate: 0,
              listedVolume: 0,
              issuedValue: 0,
              listedValue: 0,
              issueDate: '',
              maturityDate: new Date().toISOString().split('T')[0],
              bondType: s.bondType || s.bondName || '',
              interestType: '',
              status: t('active')
            }));
            apiMatches = [...apiMatches, ...searchApiMatches];
          }
        }

        // 3. Combined results without restrictive slicing to ensure full list
        const combinedResults = [...poolMatches, ...apiMatches];
        
        // Final deduplication by code
        const finalResults = Array.from(new Map(combinedResults.map(b => [b.code, b])).values());
        
        setSuggestions(finalResults);
      } catch (error) {
        console.error('Error searching bonds:', error);
      } finally {
        setSearching(false);
      }
    };

    const timeout = setTimeout(searchBonds, 300);
    return () => clearTimeout(timeout);
  }, [searchTerm, allBondsPool, selectedBonds.length]);

  const handleAddBond = async (bond: Bond) => {
    console.log('[BondComparisonPopup] Attempting to add bond:', bond.code, bond);

    if (!canAddMoreBonds) {
      setIsSearching(false);
      setSearchTerm('');
      setSuggestions([]);
      return;
    }

    const addComparisonBond = (nextBond: Bond) => {
      setComparisonBonds(prev => {
        const current = [primaryBond, ...prev].filter(validateBond);
        if (current.length >= MAX_SELECTED_BONDS || current.some(item => item.code === nextBond.code)) {
          return prev;
        }
        return [...prev, nextBond];
      });
    };
    
    try {
      // If the bond is from pool, it already has data
      if (bond.term !== 'N/A' && bond.term !== undefined && bond.term !== '' && !isMissingInterestType(bond.interestType)) {
        console.log('[BondComparisonPopup] Bond from pool, adding directly:', bond.code);
        // Validate maturityDate before adding
        if (parseDateToTimestamp(bond.maturityDate) !== null) {
          addComparisonBond(bond);
        } else {
          // Fallback to today if date is invalid
          const validBond = {
            ...bond,
            maturityDate: new Date().toISOString().split('T')[0]
          };
          console.log('[BondComparisonPopup] Fixed invalid date:', validBond);
          addComparisonBond(validBond);
        }
        setIsSearching(false);
        setSearchTerm('');
        setSuggestions([]);
        return;
      }

      // Otherwise fetch details from API
      console.log('[BondComparisonPopup] Fetching bond details:', bond.code);
      setSearching(true);
      
      const token = getFireantToken();
      if (!token) {
        console.log('[BondComparisonPopup] No token, adding bond with fallback data');
        // Ensure valid maturityDate for fallback bond
        const validBond = {
          ...bond,
          maturityDate: new Date().toISOString().split('T')[0]
        };
        addComparisonBond(validBond);
        setIsSearching(false);
        setSearchTerm('');
        setSuggestions([]);
        return;
      }
      
      const cleanToken = cleanTokenString(token);
      void cleanToken;

      try {
        const data = await loadBondDetail(bond.code);
        if (!data) {
          throw new Error('Missing bond detail data');
        }

        const b = data.detail || data;
        const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
        const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;
        const issuerSymbol = String(b.issuerSymbol || bond.enterpriseId || '').trim();
        const profile = issuerSymbol ? await loadIssuerProfile(issuerSymbol) : null;

        const issueValue = b.totalIssuedValue
          ? b.totalIssuedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : 0;
        const listedValue = b.currentListedValue
          ? b.currentListedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : issueValue;
        const listedVolume = b.currentListedVolume || historyItem?.volume || 0;
        const interestRate = b.bondRate || b.interestRate || b.couponRate || cashFlowRate || 0;
        const interestType = deriveInterestType(b, data.cashFlows);

        let maturityDate = b.maturityDate?.split('T')[0] || new Date().toISOString().split('T')[0];
        if (parseDateToTimestamp(maturityDate) === null) {
          maturityDate = new Date().toISOString().split('T')[0];
        }

        const fullBond: Bond = {
          id: b.bondCode || bond.id,
          code: b.bondCode || bond.code,
          enterpriseId: issuerSymbol,
          term: String(b.tenorPeriod || 'N/A'),
          interestRate: Number(interestRate) || 0,
          listedVolume: Number(listedVolume) || 0,
          issuedValue: Number(issueValue) || 0,
          listedValue: Number(listedValue) || 0,
          issueDate: b.issueDate?.split('T')[0] || '',
          maturityDate,
          bondType: b.bondType || b.BondType || (bond as Bond & { bondType?: string }).bondType || '',
          interestType,
          status: b.status || t('active'),
          issuerName: String(profile?.internationalName || b.issuerName || bond.enterpriseId || ''),
        } as Bond;

        addComparisonBond(fullBond);
      } catch (parseError) {
        console.error('[BondComparisonPopup] Error parsing bond details:', parseError);
      }
    } catch (e) {
      console.error('[BondComparisonPopup] Error in handleAddBond:', e);
      // Ensure valid date for outer catch fallback
      const validBond = {
        ...bond,
        maturityDate: new Date().toISOString().split('T')[0]
      };
      addComparisonBond(validBond);
    } finally {
      setIsSearching(false);
      setSearchTerm('');
      setSuggestions([]);
      setSearching(false);
    }
  };

  const handleRemoveBond = (bondId: string) => {
    if (bondId === primaryBond.id) return;
    setComparisonBonds(prev => prev.filter(b => b.id !== bondId));
  };

  const deriveInterestType = (detail: any, cashFlows: any[] = []) => {
    const rawInterestType = detail?.bondRateType || detail?.interestRateType || detail?.couponRateType || detail?.interestType || '';
    const paymentMethod = detail?.interestPaymentMethod || detail?.paymentMethod || detail?.bondType || detail?.bondName || '';
    return normalizeInterestType(rawInterestType, paymentMethod, cashFlows);
  };

  const handleReset = () => {
    setComparisonBonds([]);
    setIsSearching(false);
    setSearchTerm('');
  };

  const saveSelectedBondsToWatchlist = (bondsToSave: Bond[]) => {
    if (bondsToSave.length === 0) {
      setWatchlistNotice({
        tone: 'error',
        text: t('watchlistSaveFailed'),
      });
      return;
    }

    const results = bondsToSave.map((bond) => upsertWatchlistItemWithStatus({
      ...bond,
      issuerName: bond.enterpriseId || bond.code,
      ticker: bond.enterpriseId || '',
      bondType: (bond as Bond & { bondType?: string }).bondType || '',
    }));

    const hasHardFailure = results.some((result) => !result.persistedToLocalStorage && !result.usedFallback);
    const hasFallbackOnly = results.some((result) => !result.persistedToLocalStorage && result.usedFallback);

    if (hasHardFailure) {
      setWatchlistNotice({
        tone: 'error',
        text: t('watchlistSaveFailed'),
      });
      return;
    }

    if (hasFallbackOnly) {
      setWatchlistNotice({
        tone: 'warning',
        text: t('watchlistSavedTemporary'),
      });
      return;
    }

    setWatchlistNotice({
      tone: 'success',
      text: t('addToWatchlistSuccess'),
    });
  };

  const handleOpenWatchlistPicker = () => {
    if (selectedBonds.length <= 1) {
      saveSelectedBondsToWatchlist(selectedBonds);
      return;
    }

    setWatchlistSelections(
      selectedBonds.reduce<Record<string, boolean>>((acc, bond) => {
        acc[bond.code] = true;
        return acc;
      }, {})
    );
    setShowWatchlistPicker(true);
  };

  const handleToggleAllWatchlist = () => {
    const nextChecked = !allWatchlistSelected;
    setWatchlistSelections(
      selectedBonds.reduce<Record<string, boolean>>((acc, bond) => {
        acc[bond.code] = nextChecked;
        return acc;
      }, {})
    );
  };

  const handleSaveWatchlist = () => {
    const bondsToSave = selectedBonds.filter((bond) => watchlistSelections[bond.code]);
    saveSelectedBondsToWatchlist(bondsToSave);
    setShowWatchlistPicker(false);
  };

  const chartColors = {
    primary: isDark ? '#3b82f6' : '#2563eb',
    secondary: isDark ? '#94a3b8' : '#64748b',
    tertiary: isDark ? '#10b981' : '#059669',
    quaternary: isDark ? '#444' : '#ccc'
  };

  const legendStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
  };

  const axisLabelStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
    fontWeight: 'bold'
  };

  const tooltipTextStyle = { ...getChartTooltip(isDark).textStyle, fontSize: 10 };
  const chartTooltip = getChartTooltip(isDark);

  const renderBondTimeline = () => {
    const bonds = selectedBonds
      .map((bond, sourceIndex) => {
        const timestamp = parseDateToTimestamp(bond.maturityDate);
        if (timestamp === null) return null;
        const date = new Date(timestamp);
        const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
        const diffDays = Math.ceil((timestamp - todayUtc) / (1000 * 60 * 60 * 24));
        const isUpcoming = diffDays <= 180;
        const statusAccent =
          diffDays < 30
            ? {
                chip: 'border-red-100 bg-red-50 text-red-600 dark:border-red-400/30 dark:bg-red-900/20 dark:text-red-400',
                connector: 'bg-red-200 dark:bg-red-400/50',
                marker: 'border-red-500 bg-red-500 shadow-sm shadow-red-200 dark:border-red-400 dark:bg-red-400',
                date: 'text-red-600 dark:text-red-400',
              }
            : diffDays <= 90
              ? {
                  chip: 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-400/30 dark:bg-orange-900/20 dark:text-orange-400',
                  connector: 'bg-orange-200 dark:bg-orange-400/50',
                  marker: 'border-orange-500 bg-orange-400 shadow-sm shadow-orange-200 dark:border-orange-400 dark:bg-orange-400',
                  date: 'text-orange-600 dark:text-orange-400',
                }
              : diffDays <= 180
                ? {
                    chip: 'border-yellow-100 bg-yellow-50 text-yellow-700 dark:border-yellow-400/30 dark:bg-yellow-900/20 dark:text-yellow-300',
                    connector: 'bg-yellow-200 dark:bg-yellow-400/50',
                    marker: 'border-yellow-500 bg-yellow-400 shadow-sm shadow-yellow-200 dark:border-yellow-400 dark:bg-yellow-400',
                    date: 'text-yellow-700 dark:text-yellow-300',
                  }
                : null;
        const codeLabelWidth = Math.min(132, Math.max(72, bond.code.length * 10 + 24));

        return {
          bond,
          timestamp,
          date,
          issuerName: (bond as any).issuerName || (bond as any).enterpriseName || bond.enterpriseId || primaryEnterpriseName || '',
          maturityLabel: formatDate(bond.maturityDate),
          highlight: isUpcoming,
          statusAccent,
          codeLabelWidth,
          sourceIndex,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (bonds.length === 0) {
      return (
        <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
          <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border-base bg-bg-base/40 text-sm font-medium text-text-muted">
            {t('noData')}
          </div>
        </div>
      );
    }

    const sortedByTime = [...bonds].sort((left, right) => left.timestamp - right.timestamp);
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const maxBondTimestamp = sortedByTime[sortedByTime.length - 1].timestamp;
    const currentTime = currentMonthStart.getTime();
    const currentYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const maxBondYear = new Date(maxBondTimestamp).getUTCFullYear();
    const endYear = Math.max(currentYearStart.getUTCFullYear() + 1, maxBondYear + 1);
    const endTime = Date.UTC(endYear, 0, 1);

    const minDate = currentMonthStart;
    const maxDate = new Date(endTime);
    const minYear = minDate.getUTCFullYear();
    const maxYear = maxDate.getUTCFullYear();
    const yearCount = Math.max(1, maxYear - minYear + 1);
    const axisPadding = 72;
    const width = Math.max(bonds.length <= 2 ? 880 : 1200, yearCount * 260, bonds.length * 220);
    const plotWidth = width - axisPadding * 2;
    const scale = plotWidth / Math.max(1, maxDate.getTime() - minDate.getTime());
    const labelGap = 18;
    const codeRowSpacing = 48;
    const dateRowSpacing = 22;
    const codeRows: Array<Array<{ start: number; end: number }>> = [];
    const dateRows: Array<Array<{ start: number; end: number }>> = [];

    const placeInRows = (
      rows: Array<Array<{ start: number; end: number }>>,
      start: number,
      end: number,
    ) => {
      let rowIndex = 0;
      while (true) {
        const row = rows[rowIndex] ?? [];
        const hasCollision = row.some(
          (interval) => end > interval.start - labelGap && start < interval.end + labelGap,
        );
        if (!hasCollision) {
          row.push({ start, end });
          rows[rowIndex] = row;
          return rowIndex;
        }
        rowIndex += 1;
      }
    };

    const timelineItems = bonds.map((item) => {
      const markerLeft = axisPadding + (item.timestamp - minDate.getTime()) * scale;
      const codeRowIndex = placeInRows(
        codeRows,
        markerLeft - item.codeLabelWidth / 2,
        markerLeft + item.codeLabelWidth / 2,
      );
      const markerDateLabel = `T${item.date.getUTCMonth() + 1}/${item.date.getUTCFullYear()}`;
      const dateLabelWidth = Math.max(48, markerDateLabel.length * 8);
      const dateRowIndex = placeInRows(
        dateRows,
        markerLeft - dateLabelWidth / 2,
        markerLeft + dateLabelWidth / 2,
      );

      return { ...item, markerLeft, codeRowIndex, dateRowIndex, markerDateLabel };
    });
    const maxCodeRowIndex = Math.max(...timelineItems.map((item) => item.codeRowIndex));
    const maxDateRowIndex = Math.max(...timelineItems.map((item) => item.dateRowIndex));
    const axisTop = 96 + maxCodeRowIndex * codeRowSpacing;
    const height = axisTop + 88 + maxDateRowIndex * dateRowSpacing;
    const timelineStartYearLabel = `${minDate.getUTCFullYear()}`;
    return (
      <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-base md:text-lg">{t('maturityTimeline')}</h2>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-visible custom-scrollbar">
          <div className="relative mx-auto" style={{ width: `${width}px`, height: `${height}px` }}>
            <div
              className="absolute border-t-2 border-blue-200 dark:border-blue-500/40"
              style={{ left: `${axisPadding}px`, right: `${axisPadding}px`, top: `${axisTop}px` }}
            />

            <div className="absolute" style={{ left: `${axisPadding}px`, top: `${axisTop}px` }}>
              <div className="h-3 w-px -translate-x-1/2 bg-border-base/80" />
              <div className="mt-2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-text-base">
                {timelineStartYearLabel}
              </div>
            </div>

            {timelineItems.map((item) => {
              const codeTop = axisTop - 34 - item.codeRowIndex * codeRowSpacing;
              const connectorTop = codeTop + 30;
              const connectorHeight = Math.max(14, axisTop - connectorTop);
              const dateTop = axisTop + 18 + item.dateRowIndex * dateRowSpacing;
              const isDecemberLabel = item.date.getUTCMonth() === 11;
              const isNearTimelineEnd = item.markerLeft > width - axisPadding - 120;
              const dateShiftLeft = isDecemberLabel && isNearTimelineEnd ? 14 : 0;

              return (
                <div
                  key={`${item.bond.code}-${item.sourceIndex}`}
                  className="absolute inset-y-0 z-0 hover:z-50"
                  style={{ left: `${item.markerLeft}px` }}
                >
                  <div
                    className={`group absolute left-1/2 -translate-x-1/2 cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1 text-center text-xs font-bold shadow-sm ${
                      item.statusAccent?.chip ?? 'border-border-base bg-bg-base text-text-base'
                    }`}
                    style={{ top: `${codeTop}px`, minWidth: `${item.codeLabelWidth}px` }}
                  >
                    {item.bond.code}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-xl border border-border-base bg-bg-surface p-3 text-left shadow-2xl group-hover:block">
                      <p className="text-sm font-bold text-text-base">{item.bond.code}</p>
                      <p className="mt-1 text-xs font-medium text-text-muted">Ngày đáo hạn: {item.maturityLabel}</p>
                    </div>
                  </div>

                  <div
                    className={`absolute left-1/2 w-px -translate-x-1/2 ${
                      item.statusAccent?.connector ?? 'bg-blue-200 dark:bg-blue-500/40'
                    }`}
                    style={{ top: `${connectorTop}px`, height: `${connectorHeight}px` }}
                  />

                  <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${axisTop}px` }}>
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        item.statusAccent?.marker ?? 'border-blue-500 bg-bg-surface'
                      }`}
                    />
                  </div>

                  <div
                    className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold ${
                      item.statusAccent?.date ?? 'text-text-muted'
                    }`}
                    style={{ top: `${dateTop}px`, marginLeft: `${-dateShiftLeft}px` }}
                  >
                    {item.markerDateLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const getScaleOptions = () => {
    if (!selectedBonds || selectedBonds.length === 0) {
      throw new Error('No bonds available for scale chart');
    }
    
    const labels = {
      volume: t('issuedVolume'),
      value: t('issuedValue'),
      listed: t('listedValue')
    };
    
    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: tooltipTextStyle,
        formatter: (params: any) => {
          let res = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].name}</div>`;
          params.forEach((p: any) => {
            let unit = '';

            if (p.seriesName === labels.value || p.seriesName === labels.listed) {
              unit = ` ${t('unitBillionVND')}`; // tá»· VNÄ
            } else if (p.seriesName === labels.volume) {
              unit = ` ${t('bondunits')}`; // trÃ¡i phiáº¿u
            }

            res += `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${p.color};"></span>
                  <span style="font-size: 11px;">${p.seriesName}</span>
                </span>
                <span style="font-weight: bold; font-family: 'Manrope';">
                  ${highlightChartTooltipValue(formatValue(p.value), unit)}
                </span>
              </div>`;
          });
          return res;
        }
      },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: legendStyle,
        data: [labels.volume, labels.value, labels.listed]
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: selectedBonds.map(b => b.code),
        axisLabel: { ...axisLabelStyle },
        axisLine: { lineStyle: { color: isDark ? '#333' : '#eee' } },
        axisTick: { show: false }
      },
      yAxis: [
        { 
          type: 'value',
          splitLine: { lineStyle: { color: isDark ? '#333' : '#eee', type: 'dashed' } },
          axisLabel: { ...axisLabelStyle, formatter: (val: number) => formatNumber(val, 2) },
          name: t('unitBillionVND'),
          nameLocation: 'end',
          nameGap: 14,
          nameTextStyle: { ...axisLabelStyle, fontWeight: 'bold' },
          axisLine: { show: false }
        },
        { 
          type: 'value',
          splitLine: { show: false },
          axisLabel: { ...axisLabelStyle, formatter: (val: number) => formatNumber(val, 2) },
          axisLine: { show: false }
        }
      ],
      series: [
        {
          name: labels.value,
          type: 'bar',
          barWidth: 15,
          data: selectedBonds.map(b => b.issuedValue),
          itemStyle: { borderRadius: [2, 2, 0, 0] }
        },
        {
          name: labels.listed,
          type: 'bar',
          barWidth: 15,
          data: selectedBonds.map(b => b.listedValue),
          itemStyle: { borderRadius: [2, 2, 0, 0] }
        },
        {
          name: labels.volume,
          type: 'line',
          yAxisIndex: 1,
          data: selectedBonds.map(b => b.listedVolume),
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3 },
          itemStyle: { }
        }
      ]
    };
  };

  const getCouponOptions = () => {
    if (!selectedBonds || selectedBonds.length === 0) {
      throw new Error('No bonds available for coupon chart');
    }
    
    return {
      color: chartPalette,
      tooltip: { 
        ...chartTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: tooltipTextStyle,
        formatter: (params: any) => `${params[0].name}: ${highlightChartTooltipValue(formatInterestRate(params[0].value), '%')}`
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: selectedBonds.map(b => b.code),
        axisLabel: { ...axisLabelStyle },
        axisLine: { lineStyle: { color: isDark ? '#333' : '#eee' } },
        axisTick: { show: false }
      },
      yAxis: { 
        type: 'value', 
        splitLine: { lineStyle: { color: isDark ? '#333' : '#eee', type: 'dashed' } },
        axisLabel: { ...axisLabelStyle, formatter: '{value}' },
        name: '%',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { ...axisLabelStyle, fontWeight: 'bold' },
        axisLine: { show: false }
      },
      series: [
        {
          name: t('interestRate'),
          type: 'bar',
          barWidth: 30,
          data: selectedBonds.map(b => b.interestRate),
          itemStyle: { 
            borderRadius: [4, 4, 0, 0] 
          },
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => `${formatInterestRate(params.value)}%`,
            fontWeight: 'bold',
            fontFamily: 'Manrope',
            fontSize: 11,
            color: isDark ? '#9ca3af' : '#64748b'
          }
        }
      ]
    };
  };

  const formatValue = (val: number) => {
    if (val === undefined || val === null) return '0';
    // If it's a whole number, don't show decimals
    if (val % 1 === 0) return formatNumber(val, 0);
    // Otherwise show up to 2 decimals
    const formatted = formatNumber(val, 2);
    // Remove trailing zeros after decimal if any
    if (formatted.includes(',')) {
       return formatted.replace(/,00$/, '').replace(/,(\d)0$/, ',$1');
    }
    return formatted;
  };

  const formatComparisonLabel = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return '-';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  const detailRows = [
    {
      key: 'code',
      label: formatComparisonLabel(t('bondCode')),
      value: (bond: Bond) => bond.code,
    },
    {
      key: 'issuerName',
      label: formatComparisonLabel(t('issuer')),
      value: (bond: Bond) => (bond as any).issuerName || (bond as any).enterpriseName || (bond.code === primaryBond.code ? primaryEnterpriseName : '') || bond.enterpriseId || '-',
    },
    {
      key: 'term',
      label: `${formatComparisonLabel(t('term'))} (tháng)`,
      value: (bond: Bond) => bond.term.replace(/[^0-9]/g, '') || '-',
    },
    {
      key: 'interestRate',
      label: `${formatComparisonLabel(t('interestRate'))} (%)`,
      value: (bond: Bond) => formatNumber(bond.interestRate, 2),
    },
    {
      key: 'issueDate',
      label: formatComparisonLabel(t('issueDate')),
      value: (bond: Bond) => formatDate(bond.issueDate),
    },
    {
      key: 'maturityDate',
      label: formatComparisonLabel(t('maturityDate')),
      value: (bond: Bond) => formatDate(bond.maturityDate),
    },
    {
      key: 'listedVolume',
      label: formatComparisonLabel(t('listedVolume')),
      value: (bond: Bond) => formatValue(bond.listedVolume),
    },
    {
      key: 'issuedValue',
      label: `${formatComparisonLabel(t('issuedValue'))} (tỷ VNĐ)`,
      value: (bond: Bond) => formatValue(bond.issuedValue),
    },
    {
      key: 'listedValue',
      label: `${formatComparisonLabel(t('listedValue'))} (tỷ VNĐ)`,
      value: (bond: Bond) => formatValue(bond.listedValue),
    },
  ];

  const handleExportComparison = async () => {
    if (selectedBonds.length === 0) return;

    setExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

        exportRowsToExcel({
        fileNameBase: 'Bond_Comparison',
        sheetName: t('bondComparisonTitle'),
        rows: detailRows,
        columns: [
          { header: t('information'), value: (row) => row.label },
          ...selectedBonds.map((bond) => ({
            header: bond.code,
            value: (row: (typeof detailRows)[number]) => row.value(bond),
          })),
        ],
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Safe wrapper for chart rendering with error boundary
  const safeRenderChart = (
    optionsGetter: () => any,
    fallbackMessage: string = 'Display Error',
    allowMagicType = false
  ) => {
    try {
      console.log(`[safeRenderChart] Rendering ${fallbackMessage}`);
      const options = optionsGetter();
      if (!options) throw new Error('Options generator returned null');
      return (
        <ChartWithToolbar
          option={options}
          style={{ height: '100%', width: '100%' }}
          allowMagicType={allowMagicType}
        />
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[safeRenderChart] ${fallbackMessage}:`, errorMsg, error);
      return (
        <div className="w-full h-full flex items-center justify-center flex-col gap-2 text-text-muted text-xs p-4">
          <span className="font-bold">{fallbackMessage}</span>
          <span className="text-xs text-text-muted/60">{errorMsg}</span>
        </div>
      );
    }
  };

  const renderChartCard = (
    optionsGetter: () => any,
    title: string,
    titleIcon: any,
    heightClass: string = 'h-[420px]',
    allowMagicType = false,
    showToolbar = true,
  ) => {
    try {
      const options = optionsGetter();
      if (!options) throw new Error('Options generator returned null');

      return (
        <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
          <div className={heightClass}>
            <ChartWithToolbar
              option={options}
              style={{ height: '100%', width: '100%' }}
              allowMagicType={allowMagicType}
              showToolbar={showToolbar}
              title={title}
              titleIcon={titleIcon}
            />
          </div>
        </div>
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[renderChartCard] ${title}:`, errorMsg, error);
      return (
        <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
          <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-border-base bg-bg-base/40 text-center">
            <div>
              <p className="text-sm font-bold text-text-base">{title}</p>
              <p className="mt-1 text-xs text-text-muted">{errorMsg}</p>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div 
      className="fixed inset-x-0 top-16 bottom-0 z-[110] flex justify-end bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="relative flex h-full w-screen flex-col overflow-hidden border-l border-border-base bg-bg-base shadow-2xl transition-colors animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {watchlistNotice && (
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
        )}

        <div className="sticky top-0 z-20 border-b border-border-base bg-bg-surface/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button 
                onClick={onBack}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t('back')}</span>
              </button>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold leading-tight text-text-base transition-colors md:text-xl">
                  {t('bondComparisonTitle')}
                </h3>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-xl border border-border-base bg-bg-base px-3 py-2 text-xs font-bold uppercase tracking-wide text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{t('reset')}</span>
              </button>
              <button 
                type="button"
                onClick={handleOpenWatchlistPicker}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-700"
              >
                <Bookmark className="h-4 w-4" />
                {t('follow')}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10 px-4 py-4 transition-colors md:px-6 md:py-6">
            <div className="flex flex-wrap items-center gap-3">
              {selectedBonds.map((b) => (
                <div 
                  key={b.id}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-all ${
                    b.code === primaryBond.code 
                      ? 'border-blue-600 bg-blue-600 text-white' 
                      : 'border-border-base bg-bg-base text-text-base'
                  }`}
                >
                  <span className="text-sm font-bold tracking-tight">{b.code}</span>
                  {b.code === primaryBond.code ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <button 
                      onClick={() => handleRemoveBond(b.id)}
                      className="transition-colors hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              
              {!isSearching ? (
                <button 
                  onClick={() => canAddMoreBonds && setIsSearching(true)}
                  disabled={!canAddMoreBonds}
                  className="flex items-center gap-2 rounded-full border border-dashed border-border-base bg-transparent px-4 py-2 text-text-muted transition-all hover:border-blue-600 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-base disabled:hover:text-text-muted"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-bold">{canAddMoreBonds ? t('addBond') : t('maxTenBonds')}</span>
                </button>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-full border border-blue-600 bg-bg-base px-4 py-1.5">
                    <Search className="h-3.5 w-3.5 text-text-muted" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('searchBondPlaceholder') || "Enter code..."}
                      className="w-28 border-none bg-transparent text-sm font-bold text-text-base outline-none sm:w-40 md:w-48"
                    />
                    {searching && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
                    <button
                      onClick={() => {
                        setIsSearching(false);
                        setSearchTerm('');
                        setSuggestions([]);
                      }}
                    >
                      <X className="h-3.5 w-3.5 text-text-muted hover:text-text-base" />
                    </button>
                  </div>
                  
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-border-base bg-bg-surface shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 sm:min-w-0">
                      <div className="border-b border-border-base bg-bg-base/30 p-2">
                        <span className="text-[10px] px-2 font-bold uppercase tracking-wider text-text-muted">{t('searchResult') || "Search Results"}</span>
                      </div>
                      {suggestions.map((bond) => (
                        <button
                          key={bond.id}
                          onClick={() => handleAddBond(bond)}
                          className="group flex w-full items-center justify-between border-b border-border-base px-4 py-3 text-left transition-colors hover:bg-bg-base last:border-none"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-text-base transition-colors group-hover:text-blue-600">{bond.code}</span>
                            <span className="text-[10px] font-bold uppercase text-text-muted">{t('bond').toUpperCase()}</span>
                          </div>
                          <Plus className="h-4 w-4 text-text-muted transition-all group-hover:text-blue-600" />
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {searchTerm.length >= 2 && suggestions.length === 0 && !searching && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-full rounded-2xl border border-border-base bg-bg-surface p-4 text-center shadow-xl sm:min-w-0">
                      <p className="text-xs font-bold italic text-text-muted">{t('noResults') || "No results found"}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {renderBondTimeline()}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {renderChartCard(
                () => getScaleOptions(),
                formatComparisonLabel(t('issueScale')),
                Landmark,
                'h-[420px]',
                true,
              )}
              {renderChartCard(
                () => getCouponOptions(),
                formatComparisonLabel(t('interestRate')),
                TrendingUp,
                'h-[420px]',
                true,
              )}
            </div>

            <div className="rounded-2xl border border-border-base bg-bg-surface p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                  <Info className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-text-base md:text-lg">{formatComparisonLabel(t('detailedSpecs'))}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full border-collapse text-left">
                  <tbody>
                    {detailRows.map((row, idx) => (
                      <tr key={row.key} className={idx % 2 === 0 ? 'bg-bg-base/10' : ''}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-text-muted">
                          {row.label}
                        </td>
                        {selectedBonds.map((bond) => (
                          <td key={bond.code} className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-text-base">
                            {row.value(bond)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {showWatchlistPicker && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setShowWatchlistPicker(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-border-base bg-bg-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-base font-bold text-text-base">{t('selectBondsToWatch')}</h4>
                <button
                  type="button"
                  onClick={() => setShowWatchlistPicker(false)}
                  className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-base hover:text-text-base"
                  aria-label={t('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-text-base transition-colors hover:bg-bg-base">
                  <input
                    type="checkbox"
                    checked={allWatchlistSelected}
                    onChange={handleToggleAllWatchlist}
                    className="h-4 w-4 rounded border-border-base text-blue-600 focus:ring-blue-500"
                  />
                  <span>{t('selectAll')}</span>
                </label>

                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {selectedBonds.map((bond) => (
                    <label
                      key={bond.code}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-text-base transition-colors hover:bg-bg-base"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(watchlistSelections[bond.code])}
                        onChange={() => {
                          setWatchlistSelections((prev) => ({
                            ...prev,
                            [bond.code]: !prev[bond.code],
                          }));
                        }}
                        className="h-4 w-4 rounded border-border-base text-blue-600 focus:ring-blue-500"
                      />
                      <span>{bond.code}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveWatchlist}
                  disabled={selectedWatchlistCount === 0}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export wrapped with error boundary
export default function BondComparisonPopupWrapper(props: any) {
  return (
    <BondComparisonErrorBoundary>
      <BondComparisonPopup {...props} />
    </BondComparisonErrorBoundary>
  );
}


