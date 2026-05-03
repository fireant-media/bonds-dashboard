import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { X, Info, Calendar, TrendingUp, Activity, Briefcase, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { Bond } from "../types";
import { formatInterestRate, formatNumber, formatDate, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import BondComparisonPopup from './BondComparisonPopup';

interface BondDetailPopupProps {
  bond: Bond;
  enterpriseName: string;
  onClose: () => void;
}

import { getFireantToken, cleanTokenString } from '../utils/token';

export default function BondDetailPopup({ bond, enterpriseName, onClose }: BondDetailPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  
  const formatTerm = (rawTerm: any) => {
    if (!rawTerm || rawTerm === 'N/A') return 'N/A';
    const clean = String(rawTerm).replace(/tháng|months/gi, '').trim();
    return `${clean} ${t('monthUnit')}`;
  };

  const [bondDetails, setBondDetails] = useState<Bond | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    // Disable scrolling on the body when the popup is open
    document.body.style.overflow = 'hidden';
    
    /**
     * Lấy thông tin chi tiết của một mã trái phiếu cụ thể, bao gồm:
     * - Thông tin cơ bản (giá trị phát hành, niêm yết, trạng thái)
     * - Dòng tiền dự kiến (lịch trả gốc và lãi)
     * API: /bonds/{bondCode}
     */
    const fetchDetails = async () => {
      try {
        const token = getFireantToken();
        if (!token) throw new Error(t('missingToken'));

        const cleanToken = cleanTokenString(token);
        const response = await fetch(`/api/fireant/bonds/${bond.code}`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const detail = data.detail || {};
        const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
        const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;
        const interestRate = detail.bondRate || detail.interestRate || detail.couponRate || cashFlowRate || bond.interestRate;
        const rawInterestType = detail.bondRateType || detail.interestRateType || detail.couponRateType || detail.interestType || bond.interestType || '';
        const paymentMethod = detail.interestPaymentMethod || detail.paymentMethod || detail.bondType || detail.bondName || '';
        const interestType = normalizeInterestType(rawInterestType, paymentMethod, Array.isArray(data.cashFlows) ? data.cashFlows : []);
        const listedVolume = detail.currentListedVolume || historyItem?.volume || bond.listedVolume;
        const issueValue = detail.totalIssuedValue
          ? detail.totalIssuedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.issueValue;
        const listedValue = detail.currentListedValue
          ? detail.currentListedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : bond.listedValue;

        const mappedDetails: Bond = {
          ...bond,
          term: detail.tenorPeriod ? formatTerm(detail.tenorPeriod) : formatTerm(bond.term),
          issueDate: detail.issueDate ? detail.issueDate.split('T')[0] : bond.issueDate,
          interestType,
          interestRate,
          listedVolume,
          issueValue,
          listedValue,
          status: detail.status || bond.status,
          cashFlows: (data.cashFlows || []).map((cf: any) => ({
              paymentDate: cf.paymentDate,
              interestAmount: (cf.interestAmount || 0) / 1000000000,
              principalAmount: (cf.principalAmount || 0) / 1000000000,
              totalCashflow: (cf.totalCashflow || 0) / 1000000000,
              bondRate: cf.bondRate || 0
            }))
          };
          setBondDetails(mappedDetails);
        } else {
          throw new Error(`${t('bondFetchError')}: ${response.status}`);
        }
      } catch (error) {
        console.error('Error fetching bond details:', error);
        if (error instanceof Error && error.message.includes('401')) {
          setError(t('tokenError401'));
        } else {
          setError(error instanceof Error ? error.message : t('bondDetailError'));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();

    // Re-enable scrolling when the component is unmounted
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [bond]);

  const getCashFlowOptions = () => {
    if (!bondDetails?.cashFlows) return {};

    const sortedCashFlows = [...bondDetails.cashFlows].sort((a, b) => 
      new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
    );

    const dates = sortedCashFlows.map(cf => {
      const date = new Date(cf.paymentDate);
      return `T${date.getMonth() + 1}/${date.getFullYear()}`;
    });
    const interestData = sortedCashFlows.map(cf => cf.interestAmount);
    const principalData = sortedCashFlows.map(cf => cf.principalAmount);

    return {
      tooltip: { 
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
        }
      },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10 } },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: { 
        name: t('unitBillionVND'), 
        type: 'value', 
        axisLabel: { 
          fontSize: 10,
          formatter: (value: number) => formatNumber(value, 0)
        } 
      },
      series: [
        { name: t('principal'), type: 'bar', stack: 'total', data: principalData, itemStyle: { color: isDark ? '#60a5fa' : '#3634B3' } },
        { name: t('interest'), type: 'bar', stack: 'total', data: interestData, itemStyle: { color: '#ff7043' } }
      ]
    };
  };

  const currentBond = bondDetails || bond;

  // Calculate days until maturity for warning
  const getMaturityInfo = () => {
    if (!currentBond.maturityDate) return null;
    const maturity = new Date(currentBond.maturityDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = maturity.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { days: diffDays, isNear: diffDays >= 0 && diffDays <= 90 };
  };

  const maturityInfo = getMaturityInfo();

  const details = [
    { label: t('bondCode'), value: currentBond.code, icon: Activity },
    { label: t('bondIssuer'), value: t(enterpriseName as any), icon: Briefcase },
    { label: t('term'), value: formatTerm(currentBond.term), icon: Calendar },
    { label: t('issueDate'), value: formatDate(currentBond.issueDate), icon: Calendar },
    { label: t('maturityDate'), value: formatDate(currentBond.maturityDate), icon: Calendar },
    { label: t('interestRate'), value: `${formatInterestRate(currentBond.interestRate)}%`, icon: TrendingUp },
    { label: t('interestType'), value: (() => {
      const rawType = String(currentBond.interestType || '').trim();
      const normalized = rawType.toLowerCase();
      if (!normalized) return '-';
      if (normalized.includes('cố định') || normalized.includes('fixed')) return t('fixed');
      if (normalized.includes('thả nổi') || normalized.includes('floating')) return t('floating');
      return rawType;
    })(), icon: Info },
    { label: t('listedVolume'), value: formatNumber(currentBond.listedVolume || 0, 0), icon: Activity },
    { label: t('issueValue'), value: `${formatNumber(currentBond.issueValue || 0, 2)} ${t('unitBillionShort')}`, icon: Briefcase },
    { label: t('listedValueTitle'), value: `${formatNumber(currentBond.listedValue || 0, 2)} ${t('unitBillionShort')}`, icon: Briefcase },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-bg-surface w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 transition-colors"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the popup
      >
        <div className="p-6 border-b border-border-base flex items-center justify-between bg-bg-base/50 transition-colors">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-[#3634B3] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#3634B3]/20 transition-colors">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-base tracking-tight transition-colors">{t('bondDetailTitle')}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-text-highlight/10 text-text-highlight hover:bg-text-highlight/20 rounded-xl text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setShowComparison(true)}
              disabled={loading || !bondDetails}
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span>{t('compareBond')}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-bg-base rounded-full transition-colors text-text-muted hover:text-text-base"
            >
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

        <div className="grid grid-cols-12 h-[550px]">
          {/* Left: Info List */}
          <div className="col-span-12 lg:col-span-5 p-8 border-r border-border-base bg-bg-surface overflow-y-auto transition-colors">
            <div className="space-y-3">
              {details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-3 group">
                  <div className="p-2 bg-bg-base rounded-lg group-hover:bg-text-highlight/5 dark:group-hover:bg-text-highlight/20 transition-colors">
                    <detail.icon className="h-4 w-4 text-text-muted group-hover:text-text-highlight transition-colors" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5 transition-colors">{detail.label}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-bold leading-tight transition-colors ${detail.label === t('maturityDate') && maturityInfo?.isNear ? 'text-rose-600 dark:text-rose-400' : 'text-text-base'}`}>
                        {detail.value}
                      </p>
                      {detail.label === t('maturityDate') && maturityInfo?.isNear && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-400/30 rounded-full text-rose-600 dark:text-rose-400 animate-pulse shadow-sm h-[18px]">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="text-[9px] font-black uppercase tracking-tighter shrink-0">{t('statusNear')} ({maturityInfo.days} {t('daysUnit').toLowerCase()})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Cash Flow Chart & AI Insight */}
          <div className="col-span-12 lg:col-span-7 p-8 bg-bg-base/30 flex flex-col h-full transition-colors">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-text-base tracking-tight text-center transition-colors">{t('expectedCashFlow')}</h3>
            </div>
            
            {/* Chart Container */}
            <div className="h-[280px] flex items-center justify-center transition-colors">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-text-highlight border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-bold text-text-muted uppercase tracking-widest">{t('loadingCashFlow')}</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-3 text-center p-4">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{error}</p>
                  {error.includes('401') && (
                    <p className="text-[10px] text-text-muted font-medium italic">
                      {t('tokenUpdateMessage')}
                    </p>
                  )}
                </div>
              ) : (
                <ReactECharts option={getCashFlowOptions()} style={{ height: '100%', width: '100%' }} />
              )}
            </div>

            {/* Insight Container */}
            <div className="mt-4 flex-1 bg-bg-surface rounded-2xl border border-border-base shadow-sm p-5 flex flex-col justify-center transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <Activity className="h-4 w-4 text-text-highlight" />
                <p className="text-xs font-bold text-text-base uppercase tracking-wider transition-colors">{t('summary')}</p>
              </div>
              <div className="flex-1 flex items-center">
                <p className="text-xs text-text-muted leading-relaxed italic transition-colors">
                  "{t('insightPlaceholder')}"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
