import { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight, ChevronLeft, ArrowUpDown, Download, Share2, Info } from 'lucide-react';
import { Enterprise, Bond } from '../types';
import BondDetailPopup from './BondDetailPopup';
import ReactECharts from 'echarts-for-react';
import { formatInterestRate, formatNumber, formatDate } from '../utils/format';
import { useTheme } from '../ThemeContext';

interface EnterpriseViewProps {
  selectedEnterprise: Enterprise | null;
  setSelectedEnterprise: (enterprise: Enterprise | null) => void;
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

import { getFireantToken, cleanTokenString } from '../utils/token';
import { Settings } from 'lucide-react';
import { getCache, setCache } from '../utils/cache';
import { useLanguage } from '../LanguageContext';

export default function EnterpriseView({ 
  selectedEnterprise, 
  setSelectedEnterprise,
  setSelectedBond,
  setBondEnterpriseName
}: EnterpriseViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const cachedData = getCache('enterprise_list');
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All');
  const [issueValueSort, setIssueValueSort] = useState('None');
  const [enterprises, setEnterprises] = useState<Enterprise[]>(cachedData || []);
  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(getCache('enterprise_names_en') || {});
  const [issuerBonds, setIssuerBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [loadingBonds, setLoadingBonds] = useState(false);
  const [bondError, setBondError] = useState<string | null>(null);
  const [bondPage, setBondPage] = useState(1);
  const [enterprisePage, setEnterprisePage] = useState(1);
  const [bondTermFilter, setBondTermFilter] = useState('All');
  const [bondInterestSort, setBondInterestSort] = useState('None');
  const [financialData, setFinancialData] = useState<any>(null);
  const [enterpriseProfile, setEnterpriseProfile] = useState<any>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const bondsPerPage = 10;
  const enterprisesPerPage = 10;

  const chartColors = isDark 
    ? ['#5c6bc0', '#ff8a65', '#4d5bbd', '#8e99f3', '#c5cae9', '#3949ab', '#64b5f6', '#ffb199', '#ffab91']
    : ['#3634B3', '#ff7043', '#4fc3f7', '#7986cb', '#c5cae9', '#5c6bc0', '#8e99f3', '#ffab91', '#ff8a65'];

  const legendStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
  };

  const axisLabelStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Inter',
  };

  const chartTitleStyle = {
    fontSize: 10,
    color: isDark ? '#e5e7eb' : '#374151',
    fontWeight: 'bold' as const,
    fontFamily: 'Inter',
  };

  useEffect(() => {
    /**
     * Lấy danh sách tất cả các mã trái phiếu được phát hành bởi doanh nghiệp đang được chọn.
     * API: /bonds/issuer/{ticker}
     */
    const fetchBonds = async () => {
      if (!selectedEnterprise) {
        setIssuerBonds([]);
        setBondPage(1);
        return;
      }

      setLoadingBonds(true);
      setBondError(null);
      setBondPage(1);
      setBondTermFilter('All');
      setBondInterestSort('None');
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;

        const headers: Record<string, string> = {
          'Accept': 'application/json'
        };
        
        if (cleanToken) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }

        const response = await fetch(`/api/fireant/bonds/issuer/${selectedEnterprise.ticker}`, {
          headers
        });

        if (response.ok) {
          const data = await response.json();
          const mappedBonds: Bond[] = data.map((b: any) => ({
            id: b.bondCode,
            code: b.bondCode,
            enterpriseId: selectedEnterprise.id,
            term: String(b.tenorPeriod || 'N/A'),
            interestRate: b.bondRate,
            listedVolume: b.currentListedVolume,
            issueValue: b.currentListedVolume, // Assuming face value 1B
            listedValue: b.currentListedVolume, // Assuming face value 1B
            issueDate: b.issueDate?.split('T')[0] || '',
            maturityDate: b.maturityDate?.split('T')[0] || '',
            interestType: b.bondRateType,
            status: b.status
          }));
          setIssuerBonds(mappedBonds);
        } else {
          throw new Error(`${language === 'vi' ? 'Lỗi khi lấy dữ liệu trái phiếu:' : 'Error fetching bond data:'} ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching issuer bonds:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setBondError(t('authError401'));
        } else {
          setBondError(error instanceof Error ? error.message : t('error'));
        }
      } finally {
        setLoadingBonds(false);
      }
    };

    fetchBonds();
  }, [selectedEnterprise]);

  useEffect(() => {
    const fetchFinancialData = async () => {
      if (!selectedEnterprise?.ticker) {
        setFinancialData(null);
        return;
      }

      // Immediately clear old data to avoid showing stale badges for a new enterprise
      setFinancialData(null);
      setLoadingFinancial(true);

      try {
        const token = getFireantToken();
        if (!token) {
          console.warn('Financial data fetch skipped: Missing token');
          return;
        }

        const cleanToken = cleanTokenString(token);
        const symbol = selectedEnterprise.ticker;

        // Fetch multiple quarters to handle null values by falling back to previous periods
        const response = await fetch(`/api/fireant/symbols/${encodeURIComponent(symbol)}/financial-data?type=Q&count=4`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });

        if (response.ok) {
          const quarters = await response.json();
          if (Array.isArray(quarters) && quarters.length > 0) {
            // Helper to find the latest non-null value for a given field across quarters
            const findLatestValue = (field: string) => {
              for (const q of quarters) {
                const val = q.financialValues?.[field];
                if (val !== null && val !== undefined) return val;
              }
              return null;
            };

            const latestQ = quarters[0];
            
            // Consolidate non-null data from recent quarters
            const indicators = [
              'TotalAsset', 'TotalAssets', 'Assets',
              'TotalStockHolderEquity', 'StockHolderEquity', 'OwnerEquity', 'Equity',
              'TotalRevenue_TTM', 'TotalRevenue', 'NetSale_TTM', 'NetSale',
              'ProfitAfterTax_TTM', 'ProfitAfterTax', 'ParentCompanyShareholderProfitAfterTax_TTM',
              'EBITDA_TTM', 'EBITDA',
              'CashAndCashEquivalentAtTheEndOfPeriod', 'CashAndCashEquivalent', 'Cash', 'CashEquivalent',
              'TotalDebt', 'Liabilities',
              'ROE', 'PB', 'CAR', 'NPL', 'TotalDebtOverEquity', 'CurrentRatio'
            ];

            const consolidatedData: any = {
              __symbol: symbol,
              __period: `${latestQ.quarter}/${latestQ.year}`,
              __companyType: latestQ.companyType
            };

            indicators.forEach(ind => {
              consolidatedData[ind] = findLatestValue(ind);
            });

            setFinancialData(consolidatedData);
          } else {
            console.warn(`No financial values found for ${symbol}`);
          }
        } else {
          if (response.status === 401) {
            console.error('Unauthorized (401): Invalid or expired token for financial data.');
          } else {
            console.error(`Financial data fetch failed for ${symbol}: ${response.status}`);
          }
        }
      } catch (error) {
        console.error('Error fetching financial data:', error);
      } finally {
        setLoadingFinancial(false);
      }
    };

    fetchFinancialData();
  }, [selectedEnterprise?.ticker]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!selectedEnterprise?.ticker) {
        setEnterpriseProfile(null);
        return;
      }

      const symbol = selectedEnterprise.ticker;
      try {
        const token = getFireantToken();
        if (!token) return;

        const cleanToken = cleanTokenString(token);
        const response = await fetch(`/api/fireant/symbols/${encodeURIComponent(symbol)}/profile`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });

        if (response.ok) {
          const profile = await response.json();
          setEnterpriseProfile(profile);
        }
      } catch (error) {
        console.error('Error fetching enterprise profile:', error);
      }
    };

    fetchProfile();
  }, [selectedEnterprise?.ticker]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!cachedData) {
        setLoading(true);
      }
      setError(null);
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;
        
        const headers: Record<string, string> = {
          'Accept': 'application/json'
        };

        if (cleanToken) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }

        // Fetch top debtors
        let issuers = getCache('top_debt_200');
        if (!issuers) {
          const issuersRes = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=200', { headers });
          if (issuersRes.ok) {
            issuers = await issuersRes.json();
            setCache('top_debt_200', issuers);
          } else {
            // Fallback to empty instead of throwing if we don't have token
            if (issuersRes.status === 401 && !cleanToken) {
              console.warn('Unauthorized and no token provided. Using empty list or cached data.');
              issuers = [];
            } else {
              throw new Error(`${language === 'vi' ? 'Lỗi tải danh sách doanh nghiệp:' : 'Error loading enterprise list:'} ${issuersRes.status}`);
            }
          }
        }

        if (!isMounted) return;

        if (issuers) {
          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

          // Map issuers immediately. Use existing industries if available.
          const mappedEnterprises: Enterprise[] = issuers.map((issuer: any) => {
            const currentEnt = enterprises.find(e => e.ticker === issuer.issuerSymbol);
            return {
              id: issuer.issuerSymbol,
              ticker: issuer.issuerSymbol,
              name: issuer.issuerName,
              industry: currentEnt?.industry || 'N/A', 
              bondCount: issuer.bondCount,
              issueValue: issuer.totalIssuedValue / 1000000000,
              initialDebt: (issuer.totalDebtFull || issuer.totalIssuedValue) / 1000000000,
              remainingDebt: issuer.totalRemainingDebt / 1000000000
            };
          });

          setEnterprises(mappedEnterprises);
          if (isMounted) setLoading(false); 

          // Fetch industries background mapping
          const icbCodes = ['3010', '3510', '30202005'];
          const industriesMap: Record<string, string> = {
            '3010': 'Banking',
            '3510': 'RealEstate',
            '30202005': 'Securities'
          };

          const industryBatches = await Promise.all(icbCodes.map(async (code) => {
             try {
               const res = await fetch(`/api/fireant/icb/${code}/symbols`, { headers });
               if (res.ok) {
                 const symbols = await res.json();
                 return { code, symbols };
               }
             } catch(e) {}
             return { code, symbols: [] };
          }));

          if (!isMounted) return;

          const symbolToIndustry: Record<string, string> = {};
          industryBatches.forEach(batch => {
            batch.symbols.forEach((s: string) => {
              symbolToIndustry[s] = industriesMap[batch.code];
            });
          });

          const finalEnterprises = mappedEnterprises.map(ent => ({
            ...ent,
            industry: symbolToIndustry[ent.ticker] || 'Other'
          }));

          setEnterprises(finalEnterprises);
          setCache('enterprise_list', finalEnterprises);

          // Background fetch international names for English mode
          const tickersToFetch = finalEnterprises
            .map(e => e.ticker)
            .filter(ticker => !enterpriseNamesEN[ticker]);
          
          if (tickersToFetch.length > 0) {
            const fetchInChunks = async () => {
              const chunkSize = 5;
              const currentENNames = { ...enterpriseNamesEN };
              let totalUpdated = 0;

              for (let i = 0; i < tickersToFetch.length; i += chunkSize) {
                if (!isMounted) break;
                
                const chunk = tickersToFetch.slice(i, i + chunkSize);
                const results = await Promise.all(
                  chunk.map(async (ticker) => {
                    try {
                      const res = await fetch(`/api/fireant/symbols/${encodeURIComponent(ticker)}/profile`, { headers });
                      if (res.ok) {
                        const profile = await res.json();
                        return { ticker, name: profile.internationalName };
                      }
                    } catch (e) {
                      console.error(`Failed to fetch EN name for ${ticker}`, e);
                    }
                    return null;
                  })
                );

                let chunkUpdated = false;
                results.forEach(res => {
                  if (res && res.name) {
                    currentENNames[res.ticker] = res.name;
                    chunkUpdated = true;
                    totalUpdated++;
                  }
                });

                if (chunkUpdated && isMounted) {
                  setEnterpriseNamesEN({ ...currentENNames });
                  setCache('enterprise_names_en', { ...currentENNames });
                }

                // Small delay between chunks
                if (i + chunkSize < tickersToFetch.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            };

            fetchInChunks();
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching enterprise data:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('error'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    setEnterprisePage(1);
  }, [searchTerm, industryFilter, issueValueSort]);

  useEffect(() => {
    setBondPage(1);
  }, [bondTermFilter, bondInterestSort]);

  const filteredEnterprises = enterprises.filter(e => 
    (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.ticker.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (industryFilter === 'All' || e.industry === industryFilter)
  );

  const sortedEnterprises = [...filteredEnterprises].sort((a, b) => {
    if (issueValueSort === 'HighToLow') return b.issueValue - a.issueValue;
    if (issueValueSort === 'LowToHigh') return a.issueValue - b.issueValue;
    return 0;
  });

  const totalEnterprisePages = Math.ceil(sortedEnterprises.length / enterprisesPerPage);
  const paginatedEnterprises = sortedEnterprises.slice((enterprisePage - 1) * enterprisesPerPage, enterprisePage * enterprisesPerPage);

  const enterpriseBonds = selectedEnterprise 
    ? (issuerBonds.length > 0 ? issuerBonds : [])
    : [];

  const filteredSortedBonds = [...enterpriseBonds]
    .filter(bond => bondTermFilter === 'All' || bond.term === bondTermFilter)
    .sort((a, b) => {
      if (bondInterestSort === 'HighToLow') return b.interestRate - a.interestRate;
      if (bondInterestSort === 'LowToHigh') return a.interestRate - b.interestRate;
      return 0;
    });

  const totalBondPages = Math.ceil(filteredSortedBonds.length / bondsPerPage);
  const paginatedBonds = filteredSortedBonds.slice((bondPage - 1) * bondsPerPage, bondPage * bondsPerPage);

  // Get unique terms for the filter
  const uniqueTerms = Array.from(new Set(enterpriseBonds.map(b => b.term))).sort((a, b) => {
      const valA = parseInt(a as string) || 0;
      const valB = parseInt(b as string) || 0;
      return valA - valB;
    });

  // Data for charts
  const termData = enterpriseBonds.reduce((acc: any, bond) => {
    acc[bond.term] = (acc[bond.term] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(termData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const valA = parseInt(a.name) || 0;
      const valB = parseInt(b.name) || 0;
      return valA - valB;
    });

  const interestTypeData = enterpriseBonds.reduce((acc: any, bond) => {
    const type = (bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                 ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : t('others'));
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const interestTypePieData = Object.entries(interestTypeData)
    .map(([name, value]) => ({ name, value }));

  const bubbleGroups = enterpriseBonds.reduce((acc: any, bond) => {
    const type = (bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                 ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : t('others'));
    if (!acc[type]) acc[type] = [];
    // Use months directly for the chart
    const termMonths = parseFloat(bond.term) || 0;
    acc[type].push([termMonths, bond.interestRate, bond.listedVolume, bond.code]);
    return acc;
  }, {});

  const maxVolume = Math.max(...enterpriseBonds.map(b => b.listedVolume), 1);

  const bubbleSeries = Object.entries(bubbleGroups).map(([name, data]) => ({
    name,
    data,
    type: 'scatter',
    symbolSize: (data: any) => {
      const size = (Math.sqrt(data[2]) / Math.sqrt(maxVolume)) * 40;
      return Math.max(8, size);
    },
    itemStyle: { 
      color: name === t('fixed') ? '#3634B3' : (name === t('floating') ? '#ff7043' : undefined),
      opacity: 0.7 
    }
  }));

  const maturityYearData = enterpriseBonds.reduce((acc: any, bond) => {
    const year = bond.maturityDate.split('-')[0];
    acc[year] = (acc[year] || 0) + bond.listedValue;
    return acc;
  }, {});
  const sortedYears = Object.keys(maturityYearData).sort();
  const columnData = sortedYears.map(year => maturityYearData[year]);

  const pieOptions = {
    tooltip: { 
      trigger: 'item', 
      formatter: (params: any) => `${params.name}: ${formatNumber(params.value, 0)} ${t('bondCode')} (${params.percent}%)`
    },
    legend: { 
      bottom: 0, 
      left: 'center',
      width: 300,
      itemWidth: 26,
      itemHeight: 14,
      itemGap: 10,
      textStyle: { 
        ...legendStyle,
        width: 88,
        overflow: 'truncate',
        align: 'left',
        padding: [0, 10, 0, 5]
      } 
    },
    series: [{
      type: 'pie',
      radius: ['30%', '60%'],
      center: ['50%', '36%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: '12', fontWeight: 'bold' } },
      data: pieData,
      color: chartColors
    }]
  };

  const interestTypePieOptions = {
    tooltip: { 
      trigger: 'item', 
      formatter: (params: any) => `${params.name}: ${formatNumber(params.value, 0)} ${t('bondCode')} (${params.percent}%)`
    },
    legend: { 
      bottom: 0, 
      left: 'center',
      textStyle: legendStyle
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: isDark ? '#1f2937' : '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: '12', fontWeight: 'bold' } },
      data: interestTypePieData,
      color: chartColors.slice(0, 3)
    }]
  };

  const bubbleOptions = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => `${params.data[3]} (${params.seriesName})<br/>${t('term')}: ${params.data[0]} ${t('monthUnit')}<br/>${t('interestRate')}: ${formatInterestRate(params.data[1])}%<br/>${t('listedVolume')}: ${formatNumber(params.data[2] || 0, 0)}`
    },
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: legendStyle
    },
    grid: { top: '15%', bottom: '20%', left: '15%', right: '10%' },
    xAxis: { 
      name: `${t('term')} (${t('monthUnit')})`, 
      nameLocation: 'middle', 
      nameGap: 25, 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: axisLabelStyle 
    },
    yAxis: { 
      name: `${t('interestRate')} (${t('unitPercentLabel')})`, 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: { 
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: bubbleSeries
  };

  const columnOptions = {
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => `${params[0].name}<br/>${params[0].marker} ${params[0].seriesName}: ${formatNumber(params[0].value, 2)} ${t('unitBillionShort')}`
    },
    grid: { top: '15%', bottom: '15%', left: '15%', right: '5%' },
    xAxis: { type: 'category', data: sortedYears, axisLabel: axisLabelStyle },
    yAxis: { 
      name: t('unitBillionShort'), 
      nameTextStyle: chartTitleStyle, 
      splitLine: { show: false }, 
      axisLabel: { 
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      } 
    },
    series: [{
      name: t('listedValueTitle'),
      type: 'bar',
      data: columnData,
      itemStyle: { 
        color: chartColors[0], 
        borderRadius: [4, 4, 0, 0] 
      },
      barWidth: '40%'
    }]
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3634B3]"></div>
        <p className="text-gray-500 font-medium">{t('loadingEnterprisesMessage')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
        <div className="bg-red-50 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('failedToLoadData')}</h3>
        <p className="text-gray-500 max-w-md">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#3634B3] text-white rounded-xl font-bold hover:opacity-90 transition-colors"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (selectedEnterprise) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
        <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
          <button onClick={() => setSelectedEnterprise(null)} className="hover:text-text-highlight">{t('enterprise').toUpperCase()}</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text-highlight">{t('enterpriseDetail').toUpperCase()}</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h2 className="text-4xl font-bold text-text-base tracking-tight">
              {language === 'en' && enterpriseProfile?.internationalName 
                ? enterpriseProfile.internationalName 
                : t(selectedEnterprise.name as any, selectedEnterprise.ticker)} ({selectedEnterprise.ticker})
            </h2>
            
            {/* Financial Badges Section */}
            <div key={`financial-badges-${selectedEnterprise.ticker}`} className="flex flex-wrap gap-2 pt-1">
              {!loadingFinancial ? (() => {
                const ind = selectedEnterprise.industry?.toLowerCase() || '';
                const type = (financialData?.__companyType || '').toLowerCase();
                const d = financialData && financialData.__symbol === selectedEnterprise.ticker ? financialData : {};
                
                // Formatting helpers
                const fmtM = (val: number | null | undefined) => {
                  if (val == null || val === 0) return '';
                  const ty = val / 1000000000;
                  
                  if (ty >= 1000000) return `${formatNumber(ty / 1000000, 3)} ${t('unitMillionTrillion')}`; 
                  if (ty >= 1000) return `${formatNumber(ty / 1000, 1)}${t('unitKTy')}`;
                  return `${formatNumber(ty, 1)} ${t('unitTy')}`;
                };

                const fmtP = (val: number | null | undefined) => (val != null ? `${formatNumber(val * 100, 1)}%` : '');
                const fmtX = (val: number | null | undefined) => (val != null ? `${formatNumber(val, 2)}x` : '');

                // Field Fallbacks Logic
                const totalAsset = d.TotalAsset ?? d.TotalAssets ?? d.Assets;
                const equity = d.TotalStockHolderEquity ?? d.StockHolderEquity ?? d.OwnerEquity ?? d.Equity;
                const revenue = d.TotalRevenue_TTM ?? d.TotalRevenue ?? d.NetSale_TTM ?? d.NetSale;
                const profit = d.ProfitAfterTax_TTM ?? d.ProfitAfterTax ?? d.ParentCompanyShareholderProfitAfterTax_TTM;
                const ebitda = d.EBITDA_TTM ?? d.EBITDA;
                const cash = d.CashAndCashEquivalentAtTheEndOfPeriod ?? d.CashAndCashEquivalent ?? (d.Cash ?? 0) + (d.CashEquivalent ?? 0);
                const debt = d.TotalDebt ?? d.Liabilities;
                
                let roe = d.ROE;
                let pb = d.PB;
                let car = d.CAR;
                let de = d.TotalDebtOverEquity;
                let cr = d.CurrentRatio;
                
                // Define badge specs
                let badgeSpecs: { label: string; value: string | null; tooltip: string }[] = [];

                if (ind === 'banking' || type === 'bank') {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialCAR'), value: fmtP(car), tooltip: t('tooltipCAR') }
                  ];
                } else if (ind === 'securities' || ind.includes('tài chính') || ind.includes('finance')) {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind === 'realestate') {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') }
                  ];
                } else if (ind.includes('năng lượng') || ind.includes('energy') || ind.includes('hạ tầng') || ind.includes('infrastructure') || ind.includes('utility') || ind.includes('tiện ích')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEbitdaTTM'), value: fmtM(ebitda), tooltip: t('tooltipEbitdaTTM') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else if (ind.includes('công nghiệp') || ind.includes('industry') || ind.includes('sản xuất') || ind.includes('manufacturing')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEbitdaTTM'), value: fmtM(ebitda), tooltip: t('tooltipEbitdaTTM') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else if (ind.includes('công nghệ') || ind.includes('tech') || ind.includes('thông tin') || ind.includes('info')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind.includes('tiêu dùng') || ind.includes('consumer') || ind.includes('bán lẻ') || ind.includes('retail') || ind.includes('thực phẩm') || ind.includes('food')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialCash'), value: cash && cash > 0 ? fmtM(cash) : '', tooltip: t('tooltipCash') },
                    { label: t('financialROE'), value: fmtP(roe), tooltip: t('tooltipROE') },
                    { label: t('financialPB'), value: fmtX(pb), tooltip: t('tooltipPB') }
                  ];
                } else if (ind.includes('xây dựng') || ind.includes('construction') || ind.includes('vật liệu') || ind.includes('material')) {
                  badgeSpecs = [
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialTotalDebt'), value: fmtM(debt), tooltip: t('tooltipDebt') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') },
                    { label: t('financialCurrentRatio'), value: fmtX(cr), tooltip: t('tooltipCurrentRatio') }
                  ];
                } else {
                  badgeSpecs = [
                    { label: t('financialTotalAssets'), value: fmtM(totalAsset), tooltip: t('tooltipTotalAssets') },
                    { label: t('financialEquity'), value: fmtM(equity), tooltip: t('tooltipEquity') },
                    { label: t('financialRevenueTTM'), value: fmtM(revenue), tooltip: t('tooltipRevenueTTM') },
                    { label: t('financialProfitTTM'), value: fmtM(profit), tooltip: t('tooltipProfitTTM') },
                    { label: t('financialDebtEquity'), value: fmtX(de), tooltip: t('tooltipDebtEquity') }
                  ];
                }

                // Filtering and rendering - slice to ensure exactly 5 if available, but do not filter nulls
                const activeBadges = badgeSpecs.slice(0, 5);

                if (activeBadges.length === 0) return null;

                return activeBadges.map((badge, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center px-4 py-1.5 bg-indigo-50/40 dark:bg-indigo-900/20 border border-indigo-100/50 dark:border-indigo-400/30 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all cursor-help h-[32px] shadow-sm select-none"
                    title={badge.tooltip}
                  >
                    <span className="text-[10px] font-medium text-[#3634B3] mr-2 uppercase tracking-tight opacity-80">{badge.label}:</span>
                    <span className="text-xs font-bold text-[#3634B3] leading-none">{badge.value}</span>
                  </div>
                ));
              })() : loadingFinancial ? (
                <div className="flex gap-2 animate-pulse">
                  {[1, 2, 3, 4, 5].map(idx => (
                    <div key={idx} className="h-[32px] w-24 bg-bg-surface border border-border-base rounded-full"></div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {loadingBonds ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-[#3634B3] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-text-muted uppercase tracking-widest">{t('loadingBondsMessage')}</p>
          </div>
        ) : bondError ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full">
              <Info className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm font-bold text-text-muted uppercase tracking-widest">{bondError}</p>
            <button 
              onClick={() => setSelectedEnterprise(selectedEnterprise)}
              className="text-xs font-bold text-text-highlight hover:underline transition-colors"
            >
              {t('tryAgain')}
            </button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-bg-surface p-5 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-[140px] transition-colors">
                <p className="text-base font-bold text-text-muted mb-2">{t('bondCodeCount')}</p>
                <span className="text-3xl font-bold text-text-base mb-1 transition-colors">{issuerBonds.length > 0 ? issuerBonds.length : selectedEnterprise.bondCount}</span>
                <span className="text-sm font-bold text-gray-400">{t('unitBondCode')}</span>
              </div>
              <div className="bg-bg-surface p-5 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-[140px] transition-colors">
                <p className="text-base font-bold text-text-muted mb-2">{t('totalIssuedValueTitle')}</p>
                <span className="text-3xl font-bold text-text-base mb-1 transition-colors">{formatNumber(selectedEnterprise.issueValue, 2)}</span>
                <span className="text-sm font-bold text-gray-400">{t('unitBillionShort')}</span>
              </div>
              <div className="bg-bg-surface p-5 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-[140px] transition-colors">
                <p className="text-base font-bold text-text-muted mb-2">{t('initialDebtFull')}</p>
                <span className="text-3xl font-bold text-text-base mb-1 transition-colors">{formatNumber(selectedEnterprise.initialDebt, 2)}</span>
                <span className="text-sm font-bold text-gray-400">{t('unitBillionShort')}</span>
              </div>
              <div className="bg-bg-surface p-5 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group text-center flex flex-col items-center justify-center min-h-[140px] transition-colors">
                <p className="text-base font-bold text-text-muted mb-2">{t('remainingDebtTitle')}</p>
                <span className="text-3xl font-bold text-text-base mb-1 transition-colors">{formatNumber(selectedEnterprise.remainingDebt, 2)}</span>
                <span className="text-sm font-bold text-gray-400">{t('unitBillionShort')}</span>
              </div>
            </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div 
            className="bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <h3 className="text-base font-bold text-text-base mb-4 text-center transition-colors">{t('bondStructureByTerm')}</h3>
            <ReactECharts option={pieOptions} style={{ height: '320px' }} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <h3 className="text-base font-bold text-text-base mb-4 text-center transition-colors">{t('bondStructureByInterestType')}</h3>
            <ReactECharts option={interestTypePieOptions} style={{ height: '300px' }} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <h3 className="text-base font-bold text-text-base mb-4 text-center transition-colors">{t('interestRateVsTerm')}</h3>
            <ReactECharts option={bubbleOptions} style={{ height: '300px' }} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm transition-colors"
          >
            <h3 className="text-base font-bold text-text-base mb-4 text-center transition-colors">{t('totalListedValueByMaturityYear')}</h3>
            <ReactECharts option={columnOptions} style={{ height: '300px' }} />
          </div>
        </div>

        {/* Bond List Table */}
        <div className="bg-bg-surface rounded-2xl border border-border-base shadow-sm overflow-hidden transition-colors">
          <div className="p-6 border-b border-border-base flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-base uppercase tracking-wider transition-colors">{t('bondList')}</h3>
            <div className="flex gap-4">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <select 
                  className="pl-9 pr-4 py-2 text-xs font-bold text-text-base bg-bg-base border-none rounded-lg focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
                  value={bondTermFilter}
                  onChange={(e) => setBondTermFilter(e.target.value)}
                >
                  <option value="All">{t('term')}</option>
                  {uniqueTerms.map(term => (
                    <option key={term} value={term} className="bg-bg-surface">{term}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <select 
                  className="pl-9 pr-4 py-2 text-xs font-bold text-text-base bg-bg-base border-none rounded-lg focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
                  value={bondInterestSort}
                  onChange={(e) => setBondInterestSort(e.target.value)}
                >
                  <option value="None">{t('interestRate')}</option>
                  <option value="HighToLow" className="bg-bg-surface">{t('highToLow')}</option>
                  <option value="LowToHigh" className="bg-bg-surface">{t('lowToHigh')}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#3634B3] text-white">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('bondCode').toUpperCase()}</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center leading-tight">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap">{t('term').toUpperCase()}</span>
                      <span className="whitespace-nowrap">({t('monthUnit').toUpperCase()})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('issueDate').toUpperCase()}</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('maturityDate').toUpperCase()}</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center leading-tight">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap">{t('interestRate').toUpperCase()}</span>
                      <span className="whitespace-nowrap">({t('unitPercentLabel')})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('interestType').toUpperCase()}</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('listedVolume').toUpperCase()}</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center leading-tight">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap">{t('totalIssuedValueTitle').toUpperCase()}</span>
                      <span className="whitespace-nowrap">({t('unitBillionShort').toUpperCase()})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center leading-tight">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap">{t('listedValueTitle').toUpperCase()}</span>
                      <span className="whitespace-nowrap">({t('unitBillionShort').toUpperCase()})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('status').toUpperCase()}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedBonds.map((bond, idx) => (
                  <tr 
                    key={bond.id} 
                    onClick={() => {
                      setBondEnterpriseName(language === 'en' && enterpriseProfile?.internationalName ? enterpriseProfile.internationalName : selectedEnterprise.name);
                      setSelectedBond(bond);
                    }}
                    className={`cursor-pointer transition-colors group ${idx % 2 === 1 ? 'bg-bg-base/30' : 'bg-bg-surface'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-left">
                      <span className="text-xs font-bold text-text-highlight group-hover:underline">{bond.code}</span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-border-base transition-colors group-hover:bg-text-highlight/10 group-hover:text-text-highlight group-hover:border-text-highlight/20">{bond.term}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-text-muted font-bold whitespace-nowrap text-right transition-colors">{formatDate(bond.issueDate)}</td>
                    <td className="px-6 py-4 text-xs text-text-muted font-bold whitespace-nowrap text-right transition-colors">{formatDate(bond.maturityDate)}</td>
                    <td className="px-6 py-4 text-xs font-bold text-green-600 whitespace-nowrap text-right">{formatInterestRate(bond.interestRate)}%</td>
                    <td className={`px-6 py-4 text-xs font-bold whitespace-nowrap text-left transition-colors ${
                      bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed') ? 'text-blue-600' : 'text-orange-600'
                    }`}>
                      {(bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                       ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : bond.interestType)}
                    </td>
                    <td className="px-6 py-4 text-xs text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.listedVolume || 0, 0)}</td>
                    <td className="px-6 py-4 text-xs text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.issueValue || 0, 2)}</td>
                    <td className="px-6 py-4 text-xs text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.listedValue || 0, 2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-left">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        bond.status?.toLowerCase().includes('hiệu lực') || bond.status?.toLowerCase().includes('active') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {(bond.status?.toLowerCase().includes('hiệu lực') || bond.status?.toLowerCase().includes('active')) ? t('active') : 
                         ((bond.status?.toLowerCase().includes('hết hiệu lực') || bond.status?.toLowerCase().includes('inactive')) ? t('inactive') : bond.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalBondPages > 1 && (
            <div className="p-4 border-t border-border-base flex items-center justify-end bg-bg-surface transition-colors">
              <div className="flex gap-2">
                <button 
                  onClick={() => setBondPage(prev => Math.max(1, prev - 1))}
                  disabled={bondPage === 1}
                  className="p-2 text-xs font-bold text-text-base bg-bg-base rounded-lg hover:bg-bg-surface border border-border-base disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                {totalBondPages <= 4 ? (
                  [...Array(totalBondPages)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setBondPage(i + 1)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                        bondPage === i + 1 
                          ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                          : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))
                ) : (
                  <>
                    <button
                      onClick={() => setBondPage(1)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                        bondPage === 1 
                          ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                          : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => setBondPage(2)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                        bondPage === 2 
                          ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                          : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                      }`}
                    >
                      2
                    </button>
                    
                    {bondPage <= 3 ? (
                      <>
                        <button
                          onClick={() => setBondPage(3)}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                            bondPage === 3 
                              ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                              : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                          }`}
                        >
                          3
                        </button>
                        <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                      </>
                    ) : (
                      <>
                        <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                        {bondPage < totalBondPages && (
                          <>
                            <button
                              className="px-3 py-1 text-xs font-bold rounded-lg bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20"
                            >
                              {bondPage}
                            </button>
                            <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                          </>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => setBondPage(totalBondPages)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                        bondPage === totalBondPages 
                          ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                          : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                      }`}
                    >
                      {totalBondPages}
                    </button>
                  </>
                )}

                <button 
                  onClick={() => setBondPage(prev => Math.min(totalBondPages, prev + 1))}
                  disabled={bondPage === totalBondPages}
                  className="p-2 text-xs font-bold text-text-base bg-bg-base rounded-lg hover:bg-bg-surface border border-border-base disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bond Detail Popup removed from here, now handled in App.tsx */}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-text-base tracking-tight transition-colors">{t('enterprise')}</h2>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-bg-surface p-4 rounded-2xl border border-border-base shadow-sm transition-colors">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input 
            type="text" 
            placeholder={t('searchPlaceholderEnterprises')}
            className="w-full pl-10 pr-4 py-2 bg-bg-base border-border-base border rounded-xl text-sm text-text-base focus:ring-2 focus:ring-[#3634B3]/20 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select 
              className="pl-9 pr-4 py-2 text-xs font-bold text-text-base bg-bg-base border-border-base border rounded-xl focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
              value={issueValueSort}
              onChange={(e) => setIssueValueSort(e.target.value)}
            >
              <option value="None" className="bg-bg-surface">{t('issuedValue')}</option>
              <option value="HighToLow" className="bg-bg-surface">{t('highToLow')}</option>
              <option value="LowToHigh" className="bg-bg-surface">{t('lowToHigh')}</option>
            </select>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select 
              className="pl-9 pr-4 py-2 text-xs font-bold text-text-base bg-bg-base border-border-base border rounded-xl focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="All" className="bg-bg-surface">{t('allIndustries')}</option>
              {Array.from(new Set(enterprises.map(e => e.industry)))
                .sort()
                .map(industry => (
                  <option key={industry} value={industry} className="bg-bg-surface">{t(industry as any)}</option>
                ))
              }
            </select>
          </div>
        </div>
      </div>

      {/* Enterprise Table */}
      <div className="bg-bg-surface rounded-2xl border border-border-base shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#3634B3] text-white transition-colors">
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('ticker').toUpperCase()}</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('issuerName').toUpperCase()}</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('bondCodeCount').toUpperCase()}</th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap leading-tight">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap">{t('issuedValue').toUpperCase()}</span>
                    <span className="whitespace-nowrap">({t('unitBillionShort').toUpperCase()})</span>
                  </div>
                </th>
                <th className="px-6 py-5 text-[10px] font-bold uppercase tracking-wider text-center whitespace-nowrap leading-tight">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap">{t('remainingDebtTitle').toUpperCase()}</span>
                    <span className="whitespace-nowrap">({t('unitBillionShort').toUpperCase()})</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted font-medium transition-colors">{t('loading')}</td>
                </tr>
              ) : paginatedEnterprises.map((enterprise, idx) => (
                <tr 
                  key={enterprise.id} 
                  onClick={() => setSelectedEnterprise(enterprise)}
                  className={`cursor-pointer transition-colors group ${idx % 2 === 1 ? 'bg-bg-base/50' : 'bg-bg-surface'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                >
                  <td className="px-6 py-5 text-left">
                    <span className="text-sm font-bold text-text-highlight">{enterprise.ticker}</span>
                  </td>
                  <td className="px-6 py-5 text-left">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">
                        {language === 'en' && enterpriseNamesEN[enterprise.ticker] 
                          ? enterpriseNamesEN[enterprise.ticker] 
                          : t(enterprise.name as any, enterprise.ticker)}
                      </p>
                      <p className="text-[10px] font-bold text-text-muted tracking-wider group-hover:text-text-highlight transition-colors">
                        {t(enterprise.industry as any)}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">{formatNumber(enterprise.bondCount, 0)}</span>
                  </td>
                  <td className="px-6 py-5 text-right whitespace-nowrap">
                    <span className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">
                      {formatNumber(enterprise.issueValue, 2)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right whitespace-nowrap">
                    <span className="text-sm font-bold text-text-highlight">
                      {formatNumber(enterprise.remainingDebt, 2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Enterprise Pagination Controls */}
        {totalEnterprisePages > 1 && (
          <div className="p-4 border-t border-border-base flex items-center justify-end bg-bg-surface transition-colors">
            <div className="flex gap-2">
              <button 
                onClick={() => setEnterprisePage(prev => Math.max(1, prev - 1))}
                disabled={enterprisePage === 1}
                className="p-2 text-xs font-bold text-text-base bg-bg-base border border-border-base rounded-lg hover:bg-bg-surface disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              {totalEnterprisePages <= 4 ? (
                [...Array(totalEnterprisePages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setEnterprisePage(i + 1)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === i + 1 
                        ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))
              ) : (
                <>
                  <button
                    onClick={() => setEnterprisePage(1)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === 1 
                        ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    1
                  </button>
                  <button
                    onClick={() => setEnterprisePage(2)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === 2 
                        ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    2
                  </button>
                  
                  {enterprisePage <= 3 ? (
                    <>
                      <button
                        onClick={() => setEnterprisePage(3)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                          enterprisePage === 3 
                            ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                            : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                        }`}
                      >
                        3
                      </button>
                      <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                      {enterprisePage < totalEnterprisePages && (
                        <>
                          <button
                            className="px-3 py-1 text-xs font-bold rounded-lg bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20"
                          >
                            {enterprisePage}
                          </button>
                          <span className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                        </>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => setEnterprisePage(totalEnterprisePages)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === totalEnterprisePages 
                        ? "bg-[#3634B3] text-white border-transparent shadow-md shadow-[#3634B3]/20" 
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    {totalEnterprisePages}
                  </button>
                </>
              )}

              <button 
                onClick={() => setEnterprisePage(prev => Math.min(totalEnterprisePages, prev + 1))}
                disabled={enterprisePage === totalEnterprisePages}
                className="p-2 text-xs font-bold text-text-base bg-bg-base border border-border-base rounded-lg hover:bg-bg-surface disabled:opacity-50 transition-colors"
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
