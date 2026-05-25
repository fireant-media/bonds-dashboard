import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ChevronRight, ChevronLeft, ArrowUpDown, Download, Share2, Info } from 'lucide-react';
import { Enterprise } from '../types';
import { Bond } from "../types";
import BondDetailPopup from './BondDetailPopup';
import ChartWithToolbar from './ChartWithToolbar';
import { formatInterestRate, formatNumber, formatDate, normalizeInterestType } from '../utils/format';
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
import { CHART_PALETTE, getChartTooltip } from '../utils/chart';
import { readJsonResponse } from '../utils/http';
import { buildFireantUrl } from '../api/fireant';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { ExportExcelButton } from './ui/ExportExcelButton';
import { MetricCard } from './ui/Card';
import { exportRowsToExcel } from '../utils/excel';
import { fireantApi } from '../api/fireant';
import {
  buildEnterpriseIndustryOptions,
  buildIndustrySymbolLookup,
  resolveIndustryKeyFromCandidates as resolveIndustryFromShared,
  resolveIndustryKeyFromSymbolGroups,
} from '../constants/industries';
import { loadDedupedIndustrySymbols, loadIssuerStatsSummary } from '../services/industryBondData';
import { loadBondDetail, loadIssuerBondsByFilter, loadIssuerProfile } from '../services/bondData';

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
  const [remainingDebtSort, setRemainingDebtSort] = useState('None');
  const [enterprises, setEnterprises] = useState<Enterprise[]>(
    Array.isArray(cachedData)
      ? cachedData.map((enterprise: Enterprise) => ({
          ...enterprise,
          industry: resolveIndustryFromShared(enterprise.industry),
        }))
      : []
  );
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
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'month' | 'year'>('year');
  const [loadingCashFlows, setLoadingCashFlows] = useState(false);
  const [financialData, setFinancialData] = useState<any>(null);
  const [enterpriseProfile, setEnterpriseProfile] = useState<any>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const bondsPerPage = 10;
  const enterprisesPerPage = 10;

  const chartColors = isDark 
    ? ['#3b82f6', '#94a3b8', '#2563eb', '#60a5fa', '#bfdbfe', '#1d4ed8', '#93c5fd', '#cbd5e1', '#e2e8f0']
    : ['#2563eb', '#64748b', '#3b82f6', '#60a5fa', '#bfdbfe', '#1d4ed8', '#93c5fd', '#cbd5e1', '#e2e8f0'];

  const legendStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
  };

  const axisLabelStyle = {
    fontSize: 10,
    color: isDark ? '#9ca3af' : '#666',
    fontFamily: 'Manrope',
  };

  const tooltipTextStyle = { ...getChartTooltip(isDark).textStyle, fontSize: 10 };
  const chartTooltip = getChartTooltip(isDark);

  const chartTitleStyle = {
    fontSize: 10,
    color: isDark ? '#e5e7eb' : '#374151',
    fontWeight: 'bold' as const,
    fontFamily: 'Manrope',
  };

  const chartPalette = CHART_PALETTE;

  const enterpriseIndustryOptions = useMemo(() => {
    return buildEnterpriseIndustryOptions(enterprises).map((item) => ({
      ...item,
      label: t(item.label as any),
    }));
  }, [enterprises, t]);

  useEffect(() => {
    /**
     * Lấy danh sách tất cả các mã trái phiếu được phát hành bởi doanh nghiệp đang được chọn.
     * API: /bonds/issuer/{ticker}
     */
    const fetchBonds = async () => {
      if (!selectedEnterprise) {
        setIssuerBonds([]);
        setBondPage(1);
        setLoadingCashFlows(false);
        return;
      }

      setLoadingBonds(true);
      setBondError(null);
      setBondPage(1);
      setBondTermFilter('All');
      setBondInterestSort('None');
      setCashFlowPeriod('year');
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;

        const headers: Record<string, string> = {
          'Accept': 'application/json'
        };
        
        if (cleanToken) {
          headers['Authorization'] = `Bearer ${cleanToken}`;
        }

        const data = await loadIssuerBondsByFilter(selectedEnterprise.ticker);

        if (Array.isArray(data)) {
          const mappedBonds: Bond[] = data.map((b: any) => ({
            id: b.bondCode,
            code: b.bondCode,
            enterpriseId: selectedEnterprise.id,
            term: String(b.tenorPeriod || 'N/A'),
            interestRate: b.bondRate,
            listedVolume: b.currentListedVolume,
            issuedValue: b.currentListedVolume, // Assuming face value 1B
            listedValue: b.currentListedVolume, // Assuming face value 1B
            issueDate: b.issueDate?.split('T')[0] || '',
            maturityDate: b.maturityDate?.split('T')[0] || '',
            interestType: normalizeInterestType(
              b.bondRateType || b.interestRateType || b.interestType || '',
              b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
              []
            ) || 'N/A',
            status: b.status
          }));
          setIssuerBonds(mappedBonds);
          setCache(`enterprise_bonds_${selectedEnterprise.ticker}`, mappedBonds);

          if (!cleanToken || mappedBonds.length === 0) return;

          setLoadingCashFlows(true);

          const fetchBondCashFlows = async (bond: Bond): Promise<Bond> => {
            const cacheKey = `bond_cash_flows_${bond.code}`;
            const cachedCashFlows = getCache(cacheKey);
            if (cachedCashFlows) {
              return { ...bond, cashFlows: cachedCashFlows };
            }

            const detailData = await loadBondDetail(bond.code);
            if (!detailData) return bond;
            const cashFlows = Array.isArray(detailData.cashFlows)
              ? detailData.cashFlows.map((cf: any) => ({
                  paymentDate: cf.paymentDate,
                  interestAmount: (cf.interestAmount || 0) / 1000000000,
                  principalAmount: (cf.principalAmount || 0) / 1000000000,
                  totalCashflow: (cf.totalCashflow || 0) / 1000000000,
                  bondRate: cf.bondRate || 0
                }))
              : [];

            setCache(cacheKey, cashFlows);
            return { ...bond, cashFlows };
          };

          const results = await mapWithConcurrency(mappedBonds, 8, fetchBondCashFlows);
          const detailedBonds = results.map((result, index) =>
            result.status === 'fulfilled' ? result.value : mappedBonds[index]
          );
          setIssuerBonds(detailedBonds);
          setCache(`enterprise_bonds_${selectedEnterprise.ticker}`, detailedBonds);
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
        setLoadingCashFlows(false);
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
        const response = await fetch(buildFireantUrl(`symbols/${encodeURIComponent(symbol)}/financial-data`, { type: 'Q', count: 4 }), {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });

        if (response.ok) {
          const quarters = await readJsonResponse<any[]>(response, `Financial data ${symbol}`);
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
            setCache(`enterprise_financial_${symbol}`, consolidatedData);
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
        const profile = await loadIssuerProfile(symbol);
        if (profile) {
          setEnterpriseProfile(profile);
          setCache(`enterprise_profile_${symbol}`, profile);
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

        const issuers = await loadIssuerStatsSummary(200);
        setCache('top_debt_200', issuers);

        if (!isMounted) return;

        if (issuers) {
          const symbolGroups = await loadDedupedIndustrySymbols();
          const symbolToIndustryKey = buildIndustrySymbolLookup(symbolGroups);

          const mappedEnterprises: Enterprise[] = issuers.map((issuer: any) => {
            const currentEnt = enterprises.find(e => e.ticker === issuer.issuerSymbol);
            return {
              id: issuer.issuerSymbol,
              ticker: issuer.issuerSymbol,
              name: issuer.issuerName,
              industry: resolveIndustryKeyFromSymbolGroups(
                issuer.issuerSymbol,
                symbolToIndustryKey,
                issuer?.infoObj?.icbNameLv2,
                issuer?.infoObj?.icbNameLv1,
                issuer?.infoObj?.icbCodeLv2,
                issuer?.infoObj?.icbCodeLv1,
                issuer?.icbNameLv2,
                issuer?.icbNameLv1,
                issuer?.icbCodeLv2,
                issuer?.icbCodeLv1,
                issuer?.industryName,
                issuer?.industryCode,
                issuer?.industry,
                currentEnt?.industry
              ),
              bondCount: issuer.bondCount,
              issuedValue: issuer.totalIssuedValue / 1000000000,
              initialDebt: (issuer.totalDebtFull || issuer.totalIssuedValue) / 1000000000,
              remainingDebt: issuer.totalRemainingDebt / 1000000000
            };
          });

          setEnterprises(mappedEnterprises);
          if (isMounted) setLoading(false); 

          setCache('enterprise_list', mappedEnterprises);

          // Background fetch international names for English mode
          const tickersToFetch = mappedEnterprises
            .map(e => e.ticker)
            .filter(ticker => !enterpriseNamesEN[ticker]);
          
          if (tickersToFetch.length > 0) {
            const fetchNames = async () => {
              const currentENNames = { ...enterpriseNamesEN };
              const results = await mapWithConcurrency(tickersToFetch, 5, async (ticker) => {
                const profile = await loadIssuerProfile(ticker);
                if (!profile) return null;
                return { ticker, name: profile.internationalName };
              });

              if (!isMounted) return;

              let hasUpdates = false;
              getFulfilledValues(results).forEach(res => {
                if (res && res.name) {
                  currentENNames[res.ticker] = res.name;
                  hasUpdates = true;
                }
              });

              if (hasUpdates) {
                setEnterpriseNamesEN({ ...currentENNames });
                setCache('enterprise_names_en', { ...currentENNames });
              }
            };

            fetchNames();
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching enterprise data:', error);
        if (!cachedData) {
          if (error instanceof Error && error.message.includes('401')) {
            setError(t('tokenError401'));
          } else {
            setError(error instanceof Error ? error.message : t('error'));
          }
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

  useEffect(() => {
    setEnterprisePage(1);
  }, [remainingDebtSort]);

  const filteredEnterprises = enterprises.filter(e => 
    (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.ticker.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (industryFilter === 'All' || e.industry === industryFilter)
  );

  const sortedEnterprises = [...filteredEnterprises].sort((a, b) => {
    if (remainingDebtSort === 'HighToLow') return b.remainingDebt - a.remainingDebt;
    if (remainingDebtSort === 'LowToHigh') return a.remainingDebt - b.remainingDebt;
    if (issueValueSort === 'HighToLow') return b.issuedValue - a.issuedValue;
    if (issueValueSort === 'LowToHigh') return a.issuedValue - b.issuedValue;
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
    .sort((a, b) => {
      const order: any = { [t('fixed')]: 1, [t('floating')]: 2, [t('others')]: 3 };
      return (order[a[0]] || 99) - (order[b[0]] || 99);
    })
    .map(([name, value]) => ({ 
      name, 
      value
    }));

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

  const bubbleSeries = Object.entries(bubbleGroups)
    .sort((a, b) => {
      const order: any = { [t('fixed')]: 1, [t('floating')]: 2, [t('others')]: 3 };
      return (order[a[0]] || 99) - (order[b[0]] || 99);
    })
    .map(([name, data]) => ({
      name,
      data,
      type: 'scatter',
      symbolSize: (data: any) => {
        const size = (Math.sqrt(data[2]) / Math.sqrt(maxVolume)) * 40;
        return Math.max(8, size);
      },
      itemStyle: { 
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

  const projectedCashFlowData = useMemo(() => {
    const buckets = new Map<string, { label: string; interest: number; principal: number }>();

    const ensureBucket = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = cashFlowPeriod === 'month'
        ? `${year}-${String(month).padStart(2, '0')}`
        : String(year);
      const label = cashFlowPeriod === 'month' ? `T${month}/${year}` : String(year);

      if (!buckets.has(key)) {
        buckets.set(key, { label, interest: 0, principal: 0 });
      }

      return buckets.get(key)!;
    };

    enterpriseBonds.forEach((bond) => {
      const cashFlows = Array.isArray(bond.cashFlows) ? bond.cashFlows : [];

      cashFlows.forEach((cashFlow) => {
        if (!cashFlow.paymentDate) return;

        const paymentDate = new Date(cashFlow.paymentDate);
        if (Number.isNaN(paymentDate.getTime())) return;

        const bucket = ensureBucket(paymentDate);
        bucket.interest += cashFlow.interestAmount || 0;
        bucket.principal += cashFlow.principalAmount || 0;
      });

      if (cashFlows.length === 0 && bond.maturityDate && bond.listedValue) {
        const maturityDate = new Date(bond.maturityDate);
        if (!Number.isNaN(maturityDate.getTime())) {
          const bucket = ensureBucket(maturityDate);
          bucket.principal += bond.listedValue || 0;
        }
      }
    });

    const sortedEntries = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
    const labels = sortedEntries.map(([, value]) => value.label);
    const interest = sortedEntries.map(([, value]) => value.interest);
    const principal = sortedEntries.map(([, value]) => value.principal);
    const total = sortedEntries.map(([, value]) => value.interest + value.principal);

    return { labels, interest, principal, total };
  }, [enterpriseBonds, cashFlowPeriod]);

  const hasProjectedCashFlowData = projectedCashFlowData.total.some(value => value > 0);
  const projectedCashFlowTitle = language === 'vi'
    ? `${t('projectedCashFlowChart')} theo ${cashFlowPeriod === 'month' ? t('month').toLowerCase() : t('year').toLowerCase()}`
    : `${t('projectedCashFlowChart')} by ${cashFlowPeriod === 'month' ? 'month' : 'year'}`;

  const handleExportEnterprises = async () => {
    setExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      exportRowsToExcel({
        fileNameBase: 'Enterprise_List',
        sheetName: t('enterprise'),
        rows: sortedEnterprises,
        columns: [
          { header: t('ticker'), value: (enterprise) => enterprise.ticker },
          { header: t('issuerName'), value: (enterprise) => language === 'en' && enterpriseNamesEN[enterprise.ticker] ? enterpriseNamesEN[enterprise.ticker] : t(enterprise.name as any, enterprise.ticker) },
          { header: t('bondCodeCount'), value: (enterprise) => formatNumber(enterprise.bondCount, 0) },
          { header: `${t('issuedValue')} (${t('unitBillionVND')})`, value: (enterprise) => formatNumber(enterprise.issuedValue, 2) },
          { header: `${t('remainingDebtTitle')} (${t('unitBillionVND')})`, value: (enterprise) => formatNumber(enterprise.remainingDebt, 2) },
        ],
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportBonds = async () => {
    if (!selectedEnterprise) return;

    setExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      exportRowsToExcel({
        fileNameBase: `Bond_List_${selectedEnterprise.ticker}`,
        sheetName: t('bondList'),
        rows: filteredSortedBonds,
        columns: [
          { header: t('bondCode'), value: (bond) => bond.code },
          { header: `${t('term')} (${t('monthUnit')})`, value: (bond) => bond.term },
          { header: t('issueDate'), value: (bond) => formatDate(bond.issueDate) },
          { header: t('maturityDate'), value: (bond) => formatDate(bond.maturityDate) },
          { header: `${t('interestRate')} (${t('unitPercentLabel')})`, value: (bond) => `${formatInterestRate(bond.interestRate)}%` },
          {
            header: t('interestType'),
            value: (bond) => (bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed'))
              ? t('fixed')
              : (bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating'))
                ? t('floating')
                : bond.interestType,
          },
          { header: t('listedVolume'), value: (bond) => formatNumber(bond.listedVolume || 0, 0) },
          { header: `${t('totalIssuedValueTitle')} (${t('unitBillionVND')})`, value: (bond) => formatNumber(bond.issuedValue || 0, 2) },
          { header: `${t('listedValueTitle')} (${t('unitBillionVND')})`, value: (bond) => formatNumber(bond.listedValue || 0, 2) },
          {
            header: t('status'),
            value: (bond) => (bond.status?.toLowerCase().includes('hiệu lực') || bond.status?.toLowerCase().includes('active'))
              ? t('active')
              : (bond.status?.toLowerCase().includes('hết hiệu lực') || bond.status?.toLowerCase().includes('inactive'))
                ? t('inactive')
                : bond.status,
          },
        ],
      });
    } finally {
      setExportLoading(false);
    }
  };

  const pieOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
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
      data: pieData
    }]
  };

  const interestTypePieOptions = {
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
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
      data: interestTypePieData
    }]
  };

  const bubbleOptions = {
    color: chartPalette,
    tooltip: {
      ...chartTooltip,
      trigger: 'item',
      confine: true,
      textStyle: tooltipTextStyle,
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
    color: chartPalette,
    tooltip: { 
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      textStyle: tooltipTextStyle,
      formatter: (params: any) => `${params[0].name}<br/>${params[0].marker} ${params[0].seriesName}: ${formatNumber(params[0].value, 2)} ${t('unitBillionVND')}`
    },
    grid: { top: '15%', bottom: '15%', left: '15%', right: '5%' },
    xAxis: { type: 'category', data: sortedYears, axisLabel: axisLabelStyle },
    yAxis: { 
      name: t('unitBillion'), 
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
        borderRadius: [4, 4, 0, 0] 
      },
      barWidth: '40%'
    }]
  };

  const projectedCashFlowOptions = {
    color: chartPalette,
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      textStyle: tooltipTextStyle,
      formatter: (params: any) => {
        let content = `${params[0].name}<br/>`;
        let total = 0;
        params.forEach((param: any) => {
          total += param.value || 0;
          content += `${param.marker} ${param.seriesName}: ${formatNumber(param.value || 0, 2)} ${t('unitBillionVND')}<br/>`;
        });
        content += `<strong>${t('totalCashFlow')}: ${formatNumber(total, 2)} ${t('unitBillionVND')}</strong>`;
        return content;
      }
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: legendStyle
    },
    grid: { top: '12%', bottom: '20%', left: '10%', right: '8%' },
    xAxis: {
      type: 'category',
      data: projectedCashFlowData.labels,
      axisLabel: {
        ...axisLabelStyle,
        rotate: cashFlowPeriod === 'month' && projectedCashFlowData.labels.length > 10 ? 45 : 0
      }
    },
    yAxis: {
      type: 'value',
      name: t('unitBillionVND'),
      nameTextStyle: chartTitleStyle,
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle,
        formatter: (value: number) => formatNumber(value, 0)
      }
    },
    series: [
      {
        name: t('totalInterestPayable'),
        type: 'bar',
        stack: 'cashFlow',
        data: projectedCashFlowData.interest,
        itemStyle: { borderRadius: 0 },
        barWidth: '45%'
      },
      {
        name: t('totalPrincipalPayable'),
        type: 'bar',
        stack: 'cashFlow',
        data: projectedCashFlowData.principal,
        itemStyle: { borderRadius: 0 },
        barWidth: '45%'
      }
    ]
  };

  if (loading) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-text-muted font-medium">{t('loadingEnterprisesMessage')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-96 space-y-3 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-text-base">{t('failedToLoadData')}</h3>
        <p className="text-text-muted max-w-md">{error}</p>
        <div className="flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (selectedEnterprise) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
        <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest">
          <button onClick={() => setSelectedEnterprise(null)} className="hover:text-text-highlight">{t('enterprise').toUpperCase()}</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text-highlight">{t('enterpriseDetail').toUpperCase()}</span>
        </div>

      <div className="sticky top-0 z-20 -mx-2 -mt-2 mb-3 flex items-start justify-between border-b border-border-base bg-surface-container-low px-2 py-3 md:-mx-4 md:px-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-blue-600 dark:text-white tracking-tight md:text-4xl">
              {language === 'en' && enterpriseProfile?.internationalName 
                ? enterpriseProfile.internationalName 
                : t(selectedEnterprise.name as any, selectedEnterprise.ticker)} ({selectedEnterprise.ticker})
            </h2>
            
            {/* Financial Badges Section */}
            <div key={`financial-badges-${selectedEnterprise.ticker}`} className="flex flex-wrap gap-2 pt-1">
              {!loadingFinancial ? (() => {
                const ind = selectedEnterprise.industry ? t(selectedEnterprise.industry as any).toLowerCase() : '';
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
                    <span className="text-[10px] font-medium text-blue-600 mr-2 uppercase tracking-tight opacity-80">{badge.label}:</span>
                    <span className="text-xs font-bold text-blue-600 leading-none">{badge.value}</span>
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
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label={t('bondCodeCount')}
                value={String(issuerBonds.length > 0 ? issuerBonds.length : selectedEnterprise.bondCount)}
                unit={t('unitBondCode')}
              />
              <MetricCard
                label={t('totalIssuedValueTitle')}
                value={formatNumber(selectedEnterprise.issuedValue, 2)}
                unit={t('unitBillionVND')}
              />
              <MetricCard
                label={t('initialDebtFull')}
                value={formatNumber(selectedEnterprise.initialDebt, 2)}
                unit={t('unitBillionVND')}
              />
              <MetricCard
                label={t('remainingDebtTitle')}
                value={formatNumber(selectedEnterprise.remainingDebt, 2)}
                unit={t('unitBillionVND')}
              />
            </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors"
          >
            <ChartWithToolbar option={pieOptions} style={{ height: '320px' }} title={t('bondStructureByTerm')} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors"
          >
            <ChartWithToolbar option={interestTypePieOptions} style={{ height: '300px' }} title={t('bondStructureByInterestType')} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors"
          >
            <ChartWithToolbar option={bubbleOptions} style={{ height: '300px' }} title={t('interestRateVsTerm')} />
          </div>
          <div 
            className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors"
          >
            <ChartWithToolbar option={columnOptions} style={{ height: '300px' }} allowMagicType title={t('totalListedValueByMaturityYear')} />
          </div>
        </div>

        <div className="bg-bg-surface p-4 rounded-lg border border-border-base shadow-sm transition-colors">
          {loadingCashFlows && !hasProjectedCashFlowData ? (
            <div className="h-80 flex items-center justify-center">
              <div className="flex items-center gap-3 text-xs font-bold text-text-muted uppercase tracking-wider">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                {t('loading')}
              </div>
            </div>
          ) : hasProjectedCashFlowData ? (
            <ChartWithToolbar
              option={projectedCashFlowOptions}
              style={{ height: '360px' }}
              allowMagicType
              title={projectedCashFlowTitle}
              actions={(
                <div className="flex items-center justify-center gap-1 rounded-lg border border-border-base bg-bg-base p-1 sm:justify-self-end">
                  <button
                    type="button"
                    onClick={() => setCashFlowPeriod('month')}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      cashFlowPeriod === 'month'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-text-muted hover:text-text-base'
                    }`}
                  >
                    {t('month')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashFlowPeriod('year')}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      cashFlowPeriod === 'year'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-text-muted hover:text-text-base'
                    }`}
                  >
                    {t('year')}
                  </button>
                </div>
              )}
            />
          ) : (
            <div className="h-80 flex items-center justify-center text-sm font-medium text-text-muted">
              {t('noData')}
            </div>
          )}
        </div>

        {/* Bond List Table */}
        <div className="bg-bg-surface rounded-lg border border-border-base shadow-sm overflow-hidden transition-colors">
          <div className="p-4 border-b border-border-base flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-sm font-bold text-blue-600 dark:text-white uppercase tracking-wider transition-colors">{t('bondList')}</h3>
            <div className="flex flex-col gap-3 w-full lg:w-auto lg:flex-row lg:items-center">
              <ExportExcelButton loading={exportLoading} onClick={handleExportBonds} />
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <select 
                  className="w-full lg:w-auto pl-9 pr-4 py-2 text-sm font-semibold text-text-base bg-bg-base border-none rounded-lg focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
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
                  className="w-full lg:w-auto pl-9 pr-4 py-2 text-sm font-semibold text-text-base bg-bg-base border-none rounded-lg focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
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
            <table className="w-full min-w-[920px] text-left border-collapse">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('bondCode')}</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap leading-none">{t('term')}</span>
                      <span className="whitespace-nowrap mt-1 leading-none">({t('monthUnit')})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('issueDate')}</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('maturityDate')}</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap leading-none">{t('interestRate')}</span>
                      <span className="whitespace-nowrap mt-1 leading-none">({t('unitPercentLabel')})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('interestType')}</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('listedVolume')}</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap leading-none">{t('totalIssuedValueTitle')}</span>
                      <span className="whitespace-nowrap mt-1 leading-none">({t('unitBillionVND')})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">
                    <div className="flex flex-col items-center">
                      <span className="whitespace-nowrap leading-none">{t('listedValueTitle')}</span>
                      <span className="whitespace-nowrap mt-1 leading-none">({t('unitBillionVND')})</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center">{t('status')}</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-text-highlight group-hover:underline">{bond.code}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-1 rounded-lg text-sm font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-border-base transition-colors group-hover:bg-text-highlight/10 group-hover:text-text-highlight group-hover:border-text-highlight/20">{bond.term}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted font-bold whitespace-nowrap text-center transition-colors">{formatDate(bond.issueDate)}</td>
                    <td className="px-6 py-4 text-sm text-text-muted font-bold whitespace-nowrap text-center transition-colors">{formatDate(bond.maturityDate)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600 whitespace-nowrap text-right">{formatInterestRate(bond.interestRate)}%</td>
                    <td className={`px-6 py-4 text-sm font-bold whitespace-nowrap text-center transition-colors ${
                      bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed') ? 'text-blue-600' : 'text-orange-600'
                    }`}>
                      {(bond.interestType?.toLowerCase().includes('cố định') || bond.interestType?.toLowerCase().includes('fixed')) ? t('fixed') : 
                       ((bond.interestType?.toLowerCase().includes('thả nổi') || bond.interestType?.toLowerCase().includes('floating')) ? t('floating') : bond.interestType)}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.listedVolume || 0, 0)}</td>
                    <td className="px-6 py-4 text-sm text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.issuedValue || 0, 2)}</td>
                    <td className="px-6 py-4 text-sm text-text-base dark:text-white font-bold whitespace-nowrap text-right transition-colors">{formatNumber(bond.listedValue || 0, 2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 rounded-full text-sm font-bold uppercase ${
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
                          ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                          ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
                          : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => setBondPage(2)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                        bondPage === 2 
                          ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                              ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                              className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20"
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
                          ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="sticky top-0 z-20 -mx-2 -mt-2 mb-8 flex flex-col gap-3 border-b border-border-base bg-surface-container-low px-2 py-3 sm:flex-row sm:items-center sm:justify-between md:-mx-4 md:px-4">
        <div>
          <h2 className="text-2xl font-bold text-blue-600 dark:text-white text-center transition-colors">{t('enterprise')}</h2>
        </div>
        <ExportExcelButton loading={exportLoading} onClick={handleExportEnterprises} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-center bg-bg-surface p-3 md:p-4 rounded-lg border border-border-base shadow-sm transition-colors">
        <div className="relative flex-1 min-w-0 sm:min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input 
            type="text" 
            placeholder={t('searchPlaceholderEnterprises')}
            className="w-full pl-10 pr-4 py-2 bg-bg-base border-border-base border rounded-xl text-sm text-text-base focus:ring-2 focus:ring-blue-600/20 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select 
              className="w-full pl-9 pr-4 py-2 text-sm font-semibold text-text-base bg-bg-base border-border-base border rounded-xl focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="All" className="bg-bg-surface">{t('allIndustries')}</option>
              {enterpriseIndustryOptions.map((industry) => (
                <option key={industry.value} value={industry.value} className="bg-bg-surface">
                  {industry.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 sm:flex-none">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              className="w-full pl-9 pr-4 py-2 text-sm font-semibold text-text-base bg-bg-base border-border-base border rounded-xl focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
              value={issueValueSort}
              onChange={(e) => {
                setIssueValueSort(e.target.value);
                if (e.target.value !== 'None') setRemainingDebtSort('None');
              }}
            >
              <option value="None" className="bg-bg-surface">{t('issuedValue')}</option>
              <option value="HighToLow" className="bg-bg-surface">{t('highToLow')}</option>
              <option value="LowToHigh" className="bg-bg-surface">{t('lowToHigh')}</option>
            </select>
          </div>
          <div className="relative flex-1 sm:flex-none">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <select
              className="w-full pl-9 pr-4 py-2 text-sm font-semibold text-text-base bg-bg-base border-border-base border rounded-xl focus:ring-0 outline-none appearance-none cursor-pointer transition-colors"
              value={remainingDebtSort}
              onChange={(e) => {
                setRemainingDebtSort(e.target.value);
                if (e.target.value !== 'None') setIssueValueSort('None');
              }}
            >
              <option value="None" className="bg-bg-surface">{t('remainingDebtTitle')}</option>
              <option value="HighToLow" className="bg-bg-surface">{t('highToLow')}</option>
              <option value="LowToHigh" className="bg-bg-surface">{t('lowToHigh')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Enterprise Table */}
      <div className="bg-bg-surface rounded-lg border border-border-base shadow-sm overflow-hidden transition-colors">
        <div className="divide-y divide-border-base lg:hidden">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted font-medium transition-colors">{t('loading')}</div>
          ) : paginatedEnterprises.length > 0 ? (
            paginatedEnterprises.map((enterprise) => (
              <button
                key={enterprise.id}
                type="button"
                onClick={() => setSelectedEnterprise(enterprise)}
                className="w-full p-4 text-left transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-blue-600">{enterprise.ticker}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">
                      {language === 'en' && enterpriseNamesEN[enterprise.ticker]
                        ? enterpriseNamesEN[enterprise.ticker]
                        : t(enterprise.name as any, enterprise.ticker)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-text-muted">{t(enterprise.industry as any) || enterprise.industry || 'N/A'}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-bg-base p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-text-muted/80">{t('bondCodeCount')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base dark:text-white">{formatNumber(enterprise.bondCount, 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-text-muted/80">{t('issuedValue')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base dark:text-white">{formatNumber(enterprise.issuedValue, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-text-muted/80">{t('remainingDebtTitle')}</p>
                    <p className="mt-1 text-sm font-bold text-blue-600 dark:text-white">{formatNumber(enterprise.remainingDebt, 2)}</p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-text-muted font-medium transition-colors">{t('noData')}</div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="bg-blue-600 text-white transition-colors">
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('ticker')}</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('issuerName')}</th>
                <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">{t('bondCodeCount')}</th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('issuedValue')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('unitBillionVND')})</span>
                  </div>
                </th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('remainingDebtTitle')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('unitBillionVND')})</span>
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
                  <td className="px-6 py-5 text-center">
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
                        {t(enterprise.industry as any) || enterprise.industry || 'N/A'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">{formatNumber(enterprise.bondCount, 0)}</span>
                  </td>
                  <td className="px-6 py-5 text-right whitespace-nowrap">
                    <span className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">
                      {formatNumber(enterprise.issuedValue, 2)}
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
                        ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                        ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
                        : "text-text-base bg-bg-base border-border-base hover:bg-bg-surface"
                    }`}
                  >
                    1
                  </button>
                  <button
                    onClick={() => setEnterprisePage(2)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                      enterprisePage === 2 
                        ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                            ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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
                            className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20"
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
                        ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20" 
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

