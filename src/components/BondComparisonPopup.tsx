import { useState, useRef, useEffect, Component, ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import { X, ArrowLeft, RotateCcw, Plus, Check, Search, Loader2 } from 'lucide-react';
import { Enterprise } from '../types';
import { Bond } from "../types";
import { formatNumber, formatInterestRate, formatDate, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { getFireantToken, cleanTokenString } from '../utils/token';
import { getCache, setCache } from '../utils/cache';

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
  onClose: () => void;
  onBack: () => void;
}

function BondComparisonPopup({ primaryBond, onClose, onBack }: BondComparisonPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [comparisonBonds, setComparisonBonds] = useState<Bond[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Bond[]>([]);
  const [searching, setSearching] = useState(false);
  const [allBondsPool, setAllBondsPool] = useState<Bond[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Validate selectedBonds to prevent render errors
  const validateBond = (bond: Bond): boolean => {
    if (!bond || !bond.code) return false;
    const maturityDate = new Date(bond.maturityDate);
    return !isNaN(maturityDate.getTime());
  };

  const isMissingInterestType = (value: any) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || /^(n\/a|na|unknown|undefined|null|\-)$/.test(normalized);
  };

  const validatedComparisonBonds = comparisonBonds.filter(validateBond);
  const selectedBonds = [primaryBond, ...validatedComparisonBonds].filter(validateBond);
  
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

            // Fetch a larger window to get more symbols into the pool
            const response = await fetch('/api/fireant/bonds/stats/bonds/maturing-soon?days=3650', { headers });
            if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data)) {
                const fetchedBonds: Bond[] = data.map((b: any) => {
                  const normalizeVal = (val: number | undefined | null) => {
                    if (!val) return 0;
                    if (val > 1000000) return val / 1000000000;
                    return val;
                  };
                  const normalizeVol = (val: number | undefined | null) => {
                    if (!val) return 0;
                    if (val > 100000) return val / 10000;
                    return val;
                  };

                  const issueValue = b.totalIssuedValue 
                    ? normalizeVal(b.totalIssuedValue)
                    : normalizeVol(b.currentListedVolume);
                  const listedValue = b.currentListedValue 
                    ? normalizeVal(b.currentListedValue)
                    : normalizeVol(b.currentListedVolume);

                  return {
                    id: b.bondCode,
                    code: b.bondCode,
                    enterpriseId: b.issuerSymbol || '',
                    term: String(b.tenorPeriod || 'N/A'),
                    interestRate: b.bondRate || 0,
                    listedVolume: normalizeVol(b.currentListedVolume),
                    issuedValue: issueValue,
                    listedValue: listedValue,
                    issueDate: b.issueDate?.split('T')[0] || '',
                    maturityDate: b.maturityDate?.split('T')[0] || '',
                    interestType: normalizeInterestType(
                      b.bondRateType || b.interestRateType || b.couponRateType || b.interestType || '',
                      b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
                      []
                    ) || 'N/A',
                    status: b.status || t('active')
                  };
                });
                
                setAllBondsPool(prev => {
                  const combined = [...prev, ...fetchedBonds];
                  const final = Array.from(new Map(combined.map(b => [b.code, b])).values());
                  setCache('comparison_pool_bonds', final);
                  return final;
                });
              }
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
            // Try different endpoints for issuer bonds
            const issuerRes = await fetch(`/api/fireant/bonds/get-bonds-by-issuer?issuerSymbol=${normalizedSearch}`, { headers });
            if (issuerRes.ok) {
              const data = await issuerRes.json();
              const issuerBonds = Array.isArray(data) ? data : (data.items || []);
              if (Array.isArray(issuerBonds)) {
                const mappedIssuerBonds = issuerBonds.map((b: any) => {
                  const normalizeVal = (val: number | undefined | null) => {
                    if (!val) return 0;
                    if (val > 1000000) return val / 1000000000;
                    return val;
                  };
                  const normalizeVol = (val: number | undefined | null) => {
                    if (!val) return 0;
                    if (val > 100000) return val / 10000;
                    return val;
                  };

                  const issueValue = b.totalIssuedValue 
                    ? normalizeVal(b.totalIssuedValue)
                    : normalizeVol(b.currentListedVolume);
                  const listedValue = b.currentListedValue 
                    ? normalizeVal(b.currentListedValue)
                    : normalizeVol(b.currentListedVolume);

                  return {
                    id: b.bondCode,
                    code: b.bondCode,
                    enterpriseId: b.issuerSymbol || normalizedSearch,
                    term: String(b.tenorPeriod || 'N/A'),
                    interestRate: b.bondRate || 0,
                    listedVolume: normalizeVol(b.currentListedVolume),
                    issuedValue: issueValue,
                    listedValue: listedValue,
                    issueDate: b.issueDate?.split('T')[0] || '',
                    maturityDate: b.maturityDate?.split('T')[0] || '',
                    interestType: normalizeInterestType(
                      b.bondRateType || b.interestRateType || b.couponRateType || b.interestType || '',
                      b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
                      []
                    ) || 'N/A',
                    status: b.status || t('active')
                  };
                });
                apiMatches = [...apiMatches, ...mappedIssuerBonds];
              }
            }
          } catch (e) {
            console.error("Failed to fetch issuer specific bonds during search", e);
          }
        }

        const response = await fetch(`/api/fireant/symbols/search?q=${encodeURIComponent(searchTerm)}`, {
          headers
        });

        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data)) {
            const searchApiMatches = data.filter((s: any) => 
              // Include anything that looks like a bond or matches search well
              (s.symbolType?.toLowerCase() === 'bond' || s.symbol.length >= 6 || s.symbol.toUpperCase().includes(normalizedSearch)) &&
              !selectedBonds.some(sb => sb.code === s.symbol) &&
              !poolMatches.some(pm => pm.code === s.symbol) &&
              !apiMatches.some(am => am.code === s.symbol)
            ).map((s: any) => ({
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
    
    try {
      // If the bond is from pool, it already has data
      if (bond.term !== 'N/A' && bond.term !== undefined && bond.term !== '' && !isMissingInterestType(bond.interestType)) {
        console.log('[BondComparisonPopup] Bond from pool, adding directly:', bond.code);
        // Validate maturityDate before adding
        const date = new Date(bond.maturityDate);
        if (!isNaN(date.getTime())) {
          setComparisonBonds(prev => [...prev, bond]);
        } else {
          // Fallback to today if date is invalid
          const validBond = {
            ...bond,
            maturityDate: new Date().toISOString().split('T')[0]
          };
          console.log('[BondComparisonPopup] Fixed invalid date:', validBond);
          setComparisonBonds(prev => [...prev, validBond]);
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
        setComparisonBonds(prev => [...prev, validBond]);
        setIsSearching(false);
        setSearchTerm('');
        setSuggestions([]);
        return;
      }
      
      const cleanToken = cleanTokenString(token);
      
      const detailRes = await fetch(`/api/fireant/bonds/${bond.code}`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${cleanToken}`
        }
      });

      console.log('[BondComparisonPopup] Fetch response status:', detailRes.status);

      if (detailRes.ok) {
        try {
          const data = await detailRes.json();
          console.log('[BondComparisonPopup] API response data:', data);
          
          const b = data.detail || data;
          if (!b) {
            throw new Error('No bond data in response');
          }
          
          const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
          const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

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
          // Validate the maturityDate
          const dateCheck = new Date(maturityDate);
          if (isNaN(dateCheck.getTime())) {
            console.log('[BondComparisonPopup] Invalid maturity date, using today');
            maturityDate = new Date().toISOString().split('T')[0];
          }

          const fullBond: Bond = {
            id: b.bondCode || bond.id,
            code: b.bondCode || bond.code,
            enterpriseId: b.issuerSymbol || '', 
            term: String(b.tenorPeriod || 'N/A'),
            interestRate: Number(interestRate) || 0,
            listedVolume: Number(listedVolume) || 0,
            issuedValue: Number(issueValue) || 0,
            listedValue: Number(listedValue) || 0,
            issueDate: b.issueDate?.split('T')[0] || '',
            maturityDate,
            interestType,
            status: b.status || t('active')
          };
          
          console.log('[BondComparisonPopup] Adding full bond:', fullBond);
          setComparisonBonds(prev => [...prev, fullBond]);
        } catch (parseError) {
          console.error('[BondComparisonPopup] Error parsing bond details:', parseError);
          // Ensure valid date for fallback
          const validBond = {
            ...bond,
            maturityDate: new Date().toISOString().split('T')[0]
          };
          console.log('[BondComparisonPopup] Adding fallback bond after parse error:', validBond);
          setComparisonBonds(prev => [...prev, validBond]);
        }
      } else {
        console.warn('[BondComparisonPopup] Fetch failed with status:', detailRes.status);
        // Ensure valid date for error fallback
        const validBond = {
          ...bond,
          maturityDate: new Date().toISOString().split('T')[0]
        };
        setComparisonBonds(prev => [...prev, validBond]);
      }
    } catch (e) {
      console.error('[BondComparisonPopup] Error in handleAddBond:', e);
      // Ensure valid date for outer catch fallback
      const validBond = {
        ...bond,
        maturityDate: new Date().toISOString().split('T')[0]
      };
      setComparisonBonds(prev => [...prev, validBond]);
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

  const chartColors = {
    primary: isDark ? '#5c6bc0' : '#3634B3',
    secondary: isDark ? '#ff8a65' : '#ff7043',
    tertiary: isDark ? '#4db6ac' : '#00897b',
    quaternary: isDark ? '#444' : '#ccc'
  };

  const legendStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
  };

  const axisLabelStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
    fontWeight: 'bold'
  };

  const getTimelineOptions = () => {
    if (!selectedBonds || selectedBonds.length === 0) {
      throw new Error('No bonds available for timeline');
    }
    
    // Validate and parse years, filtering out invalid dates
    const years = selectedBonds
      .filter(b => b && b.maturityDate)
      .map(b => {
        try {
          const date = new Date(b.maturityDate);
          const year = date.getFullYear();
          return isNaN(year) ? null : year;
        } catch (e) {
          console.warn('[getTimelineOptions] Failed to parse date for bond:', b.code, e);
          return null;
        }
      })
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b);
    
    // Fallback if no valid years
    if (years.length === 0) {
      const currentYear = new Date().getFullYear();
      years.push(currentYear, currentYear + 1);
    }
    
    const minYear = Math.min(...years) - 1;
    const maxYear = Math.max(...years) + 1;
    
    // Group by year to handle overlapping
    const yearGroups: Record<number, number> = {};
    const data = selectedBonds.map(b => {
      const date = new Date(b.maturityDate);
      const yr = date.getFullYear();
      if (isNaN(yr)) {
        return {
          name: b.code,
          value: [new Date().getFullYear(), 0],
          isPrimary: b.code === primaryBond.code,
          labelOffset: -12,
          labelPosition: 'top' as const
        };
      }
      const count = yearGroups[yr] || 0;
      yearGroups[yr] = count + 1;
      
      return {
        name: b.code,
        value: [yr, 0],
        isPrimary: b.code === primaryBond.code,
        // Alternate position for overlapping years
        labelOffset: count % 2 === 0 ? -12 : 12,
        labelPosition: count % 2 === 0 ? 'top' : 'bottom'
      };
    });

    return {
      grid: { top: 60, bottom: 60, left: 50, right: 50 },
      xAxis: {
        type: 'value',
        min: minYear,
        max: maxYear,
        interval: 1,
        axisLine: { lineStyle: { color: isDark ? '#333' : '#eee' } },
        splitLine: { show: false },
        axisLabel: { 
          formatter: (value: number) => value.toString(),
          color: isDark ? '#888' : '#333',
          fontWeight: 'bold',
          margin: 15,
          fontFamily: 'Inter'
        }
      },
      yAxis: { show: false, min: -1, max: 1 },
      series: [
        {
          type: 'line',
          data: [[minYear, 0], [maxYear, 0]],
          lineStyle: { color: isDark ? '#333' : '#eee', width: 2 },
          symbol: 'none',
          silent: true
        },
        {
          type: 'scatter',
          data: data.map(d => ({
            ...d,
            itemStyle: { color: d.isPrimary ? '#3634B3' : (isDark ? '#444' : '#ccc') },
            label: {
              show: true,
              position: d.labelPosition,
              formatter: '{b}',
              fontWeight: 'bold',
              fontSize: 10,
              fontFamily: 'Inter',
              backgroundColor: d.isPrimary ? '#3634B3' : (isDark ? '#222' : '#f0f0f0'),
              color: d.isPrimary ? '#fff' : (isDark ? '#eee' : '#555'),
              padding: [4, 8],
              borderRadius: 4,
              offset: [0, d.labelOffset]
            }
          })),
          symbolSize: 12,
          emphasis: { scale: 1.2 }
        }
      ]
    };
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
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#f1f5f9' : '#1e293b', fontFamily: 'Inter', fontSize: 12 },
        formatter: (params: any) => {
          let res = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].name}</div>`;
          params.forEach((p: any) => {
            let unit = '';

            if (p.seriesName === labels.value || p.seriesName === labels.listed) {
              unit = ` ${t('unitBillionVND')}`; // tỷ VNĐ
            } else if (p.seriesName === labels.volume) {
              unit = ` ${t('bondunits')}`; // trái phiếu
            }

            res += `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${p.color};"></span>
                  <span style="font-size: 11px;">${p.seriesName}</span>
                </span>
                <span style="font-weight: bold; font-family: 'JetBrains Mono';">
                  ${formatValue(p.value)}${unit}
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
          itemStyle: { color: isDark ? '#5c6bc0' : '#3634B3', borderRadius: [2, 2, 0, 0] }
        },
        {
          name: labels.listed,
          type: 'bar',
          barWidth: 15,
          data: selectedBonds.map(b => b.listedValue),
          itemStyle: { color: isDark ? '#ff8a65' : '#ff7043', borderRadius: [2, 2, 0, 0] }
        },
        {
          name: labels.volume,
          type: 'line',
          yAxisIndex: 1,
          data: selectedBonds.map(b => b.listedVolume),
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3, color: isDark ? '#4db6ac' : '#00897b' },
          itemStyle: { color: isDark ? '#4db6ac' : '#00897b' }
        }
      ]
    };
  };

  const getCouponOptions = () => {
    if (!selectedBonds || selectedBonds.length === 0) {
      throw new Error('No bonds available for coupon chart');
    }
    
    return {
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#f1f5f9' : '#1e293b', fontFamily: 'Inter', fontSize: 12 },
        formatter: (params: any) => `${params[0].name}: <b>${formatInterestRate(params[0].value)}%</b>`
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
        axisLabel: { ...axisLabelStyle, formatter: '{value}%' },
        axisLine: { show: false }
      },
      series: [
        {
          name: t('interestRate'),
          type: 'bar',
          barWidth: 30,
          data: selectedBonds.map(b => b.interestRate),
          itemStyle: { 
            color: isDark ? '#5c6bc0' : '#3634B3',
            borderRadius: [4, 4, 0, 0] 
          },
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => `${formatInterestRate(params.value)}%`,
            fontWeight: 'bold',
            fontFamily: 'JetBrains Mono',
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

  // Safe wrapper for chart rendering with error boundary
  const safeRenderChart = (optionsGetter: () => any, fallbackMessage: string = 'Display Error') => {
    try {
      console.log(`[safeRenderChart] Rendering ${fallbackMessage}`);
      const options = optionsGetter();
      if (!options) throw new Error('Options generator returned null');
      return (
        <ReactECharts option={options} style={{ height: '100%', width: '100%' }} />
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[safeRenderChart] ${fallbackMessage}:`, errorMsg, error);
      return (
        <div className="w-full h-full flex items-center justify-center flex-col gap-2 text-text-muted text-xs p-4">
          <span className="font-bold">{fallbackMessage}</span>
          <span className="text-[10px] text-text-muted/60">{errorMsg}</span>
        </div>
      );
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-bg-surface w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border-base flex items-center justify-between transition-colors">
          <div className="flex items-center gap-6">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-bold">{t('back')}</span>
            </button>
            <div>
              <h3 className="text-xl font-bold text-text-base leading-tight transition-colors">{t('bondComparisonTitle')}</h3>
              <p className="text-xs text-text-muted transition-colors">{t('bondComparisonSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-sm font-bold">{t('reset')}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-bg-base rounded-full transition-colors text-text-muted hover:text-text-base"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-12 transition-colors">
          {/* Selected Pills */}
          <div className="flex flex-wrap gap-3 items-center">
            {selectedBonds.map((b) => (
              <div 
                key={b.id}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                  b.code === primaryBond.code 
                    ? 'bg-[#3634B3] border-[#3634B3] text-white' 
                    : 'bg-bg-base border-border-base text-text-base'
                }`}
              >
                <span className="text-sm font-bold tracking-tight">{b.code}</span>
                {b.code === primaryBond.code ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <button 
                    onClick={() => handleRemoveBond(b.id)}
                    className="hover:text-rose-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            
            {!isSearching ? (
              <button 
                onClick={() => setIsSearching(true)}
                className="flex items-center gap-2 px-4 py-2 bg-transparent border border-dashed border-border-base text-text-muted rounded-full hover:border-[#3634B3] hover:text-[#3634B3] transition-all"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-bold">{t('addBond')}</span>
              </button>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-bg-base border border-[#3634B3] rounded-full">
                  <Search className="h-3.5 w-3.5 text-text-muted" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('searchBondPlaceholder') || "Enter code..."}
                    className="bg-transparent border-none outline-none text-sm font-bold w-32 md:w-48 text-text-base"
                  />
                  {searching && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
                  <button onClick={() => {
                    setIsSearching(false);
                    setSearchTerm('');
                    setSuggestions([]);
                  }}>
                    <X className="h-3.5 w-3.5 text-text-muted hover:text-text-base" />
                  </button>
                </div>
                
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-bg-surface border border-border-base rounded-2xl shadow-2xl z-20 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-border-base bg-bg-base/30">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-2">{t('searchResult') || "Search Results"}</span>
                    </div>
                    {suggestions.map(bond => (
                      <button
                        key={bond.id}
                        onClick={() => handleAddBond(bond)}
                        className="w-full text-left px-4 py-3 hover:bg-bg-base flex items-center justify-between border-b border-border-base last:border-none group transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-text-base group-hover:text-[#3634B3] transition-colors">{bond.code}</span>
                          <span className="text-[10px] text-text-muted font-bold uppercase">{t('bond').toUpperCase()}</span>
                        </div>
                        <Plus className="h-4 w-4 text-text-muted group-hover:text-[#3634B3] transition-all" />
                      </button>
                    ))}
                  </div>
                )}
                
                {searchTerm.length >= 2 && suggestions.length === 0 && !searching && (
                   <div className="absolute top-full left-0 mt-2 w-full min-w-[240px] bg-bg-surface border border-border-base rounded-2xl shadow-xl z-20 p-4 text-center">
                     <p className="text-xs font-bold text-text-muted italic">{t('noResults') || "No results found"}</p>
                   </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-text-base tracking-widest transition-colors uppercase">{t('maturityTimeline')}</h4>
            <div className="h-[120px] bg-bg-base/20 rounded-2xl p-4 transition-colors">
              {safeRenderChart(() => getTimelineOptions(), t('errorTimeline'))}
            </div>
          </div>

          {/* Issue Scale & Coupon */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-border-base pb-2">
                <h4 className="text-sm font-bold text-text-base tracking-widest transition-colors uppercase uppercase">{t('issueScale')}</h4>
                <span className="text-[10px] text-text-muted font-bold tracking-tighter">{t('unitBillionVND')}</span>
              </div>
              <div className="h-[250px] transition-colors">
                {safeRenderChart(() => getScaleOptions(), t('errorIssueScale'))}
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-border-base pb-2">
                <h4 className="text-sm font-bold text-text-base tracking-widest transition-colors uppercase uppercase uppercase">{t('interestRate')}</h4>
                <span className="text-[10px] text-text-muted font-bold tracking-tighter">%</span>
              </div>
              <div className="h-[250px] transition-colors">
                {safeRenderChart(() => getCouponOptions(), t('errorInterestRate'))}
              </div>
            </div>
          </div>

          {/* Detail Table */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-text-base tracking-widest transition-colors uppercase uppercase">{t('detailedSpecs')}</h4>
            <div className="rounded-2xl border border-border-base bg-bg-surface overflow-hidden shadow-sm transition-colors overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <tbody>
                  {[
                    { label: t('bondCode'), key: 'code' },
                    { label: t('termMonths'), key: 'term', isTerm: true },
                    { label: t('interestRate'), key: 'interestRate', isRate: true },
                    { label: t('interestType'), key: 'interestType', isInterestType: true },
                    { label: t('issueDate'), key: 'issueDate', isDate: true },
                    { label: t('maturityDate'), key: 'maturityDate', isDate: true },
                    { label: t('issuedValue'), key: 'issuedValue', isValue: true }
                  ].map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-bg-base/10' : ''}>
                      <td className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors w-[20%]">{row.label}</td>
                      {selectedBonds.map((b) => (
                        <td key={b.id} className="px-6 py-4 text-sm font-bold text-text-base transition-colors">
                          {row.isRate ? formatNumber(b.interestRate, 2) : 
                           row.isValue ? formatValue(b.issuedValue) :
                           row.isTerm ? b.term.replace(/[^0-9]/g, '') :
                           row.isDate ? formatDate((b as any)[row.key]) :
                           row.isInterestType 
                            ? (['Fixed', 'Cố định'].includes(b.interestType) 
                                ? t('fixed') 
                                : ['Floating', 'Thả nổi', 'Thả Nổi'].includes(b.interestType) 
                                ? t('floating') 
                                : b.interestType) :
                           (b as any)[row.key]}
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