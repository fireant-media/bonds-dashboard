import { Calendar, ChevronRight, Newspaper, TrendingUp, PanelRight, Settings } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';
import { ExpiringBond, Bond } from '../types';
import { formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RightPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
  onSeeMoreMaturity?: () => void;
  onSelectNews: (news: NewsItem) => void;
  onSeeMoreNews: () => void;
}

import { getFireantToken, cleanTokenString } from '../utils/token';
import { NewsItem } from '../types';

import { fetchNewsData, getCachedNews, getNewsLastUpdate } from '../services/newsService';
import { formatDate } from '../utils/format';

export default function RightPanel({ 
  isOpen, 
  onToggle, 
  setSelectedBond, 
  setBondEnterpriseName,
  onSeeMoreMaturity,
  onSelectNews,
  onSeeMoreNews
}: RightPanelProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [expiringBonds, setExpiringBonds] = useState<ExpiringBond[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingNews, setLoadingNews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Initialize from cache immediately
  useEffect(() => {
    const cached = getCachedNews();
    if (cached) {
      setNewsList(cached);
    }
  }, []);

  const [enterpriseNamesEN, setEnterpriseNamesEN] = useState<Record<string, string>>(() => {
    try {
      const cached = localStorage.getItem('sentinel_cache_enterprise_names_en');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data || {};
      }
    } catch (e) {}
    return {};
  });

  useEffect(() => {
    const fetchNews = async (force = false) => {
      // Cooldown check: Only fetch if forced or > 2 minutes since last update
      const lastUpdate = getNewsLastUpdate();
      const now = Date.now();
      if (!force && lastUpdate && now - lastUpdate < 120000) {
        return;
      }

      // If we already have news, do a silent update (no loading spinner)
      const hasExistingNews = newsList.length > 0;
      if (!hasExistingNews) {
        setLoadingNews(true);
      }
      
      setNewsError(null);
      try {
        const data = await fetchNewsData();
        setNewsList(data);
      } catch (err) {
        console.error('Error fetching news:', err);
        if (!hasExistingNews) {
          setNewsError(t('newsError'));
        }
      } finally {
        setLoadingNews(false);
      }
    };

    const fetchExpiringBonds = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getFireantToken();
        const cleanToken = token ? cleanTokenString(token) : undefined;
        const daysArr = [15, 30, 60, 90, 180];
        
        // Fetch all in parallel for better performance
        const responses = await Promise.all(daysArr.map(days => {
          const headers: any = {
            'Accept': 'application/json'
          };
          if (cleanToken) {
            headers['Authorization'] = `Bearer ${cleanToken}`;
          }
          
          return fetch(`/api/fireant/bonds/stats/bonds/maturing-soon?days=${days}`, {
            headers
          });
        }));

        const allBonds: any[] = [];
        const seenCodes = new Set<string>();

        for (const response of responses) {
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              for (const b of data) {
                if (!seenCodes.has(b.bondCode)) {
                  seenCodes.add(b.bondCode);
                  allBonds.push(b);
                }
              }
            }
          } else if (response.status === 401) {
            throw new Error('401');
          }
        }

        // Sort all found bonds by maturity date and take top 5
        const sortedBonds = allBonds
          .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime())
          .slice(0, 5);

        const mappedData: ExpiringBond[] = sortedBonds.map((b: any) => ({
        id: b.bondCode,
        code: b.bondCode,
        ticker: b.issuerSymbol || b.bondCode.substring(0, 3),
        maturityDate: b.maturityDate?.split('T')[0] || '',
        interestRate: b.bondRate || b.interestRate || 0,
        listedVolume: b.currentListedVolume || b.listedVolume || 0,
        issuerName: b.issuerName,
        term: (b.tenorPeriod || b.term) ? `${b.tenorPeriod || b.term} ${t('monthUnit')}` : 'N/A',
        issueDate: (b.issueDate || b.releaseDate) ? (b.issueDate || b.releaseDate).split('T')[0] : 'N/A',
        interestType: normalizeInterestType(
          b.bondRateType || b.interestRateType || b.interestType || '',
          b.interestPaymentMethod || b.paymentMethod || b.bondType || b.bondName || '',
          []
        ) || 'N/A'
      }));

      setExpiringBonds(mappedData);

      // Background fetch for EN names
      if (mappedData.length > 0) {
        const fetchNames = async () => {
          const currentENNames = { ...enterpriseNamesEN };
          let hasUpdates = false;

          for (const bond of mappedData) {
            if (bond.ticker && !currentENNames[bond.ticker]) {
              try {
                const res = await fetch(`/api/fireant/symbols/${encodeURIComponent(bond.ticker)}/profile`, { 
                  headers: cleanTokenString ? { 'Authorization': `Bearer ${cleanTokenString(getFireantToken() || '')}` } : {} 
                });
                if (res.ok) {
                  const profile = await res.json();
                  if (profile.internationalName) {
                    currentENNames[bond.ticker] = profile.internationalName;
                    hasUpdates = true;
                  }
                }
              } catch (e) {}
            }
          }

          if (hasUpdates) {
            setEnterpriseNamesEN(currentENNames);
            const cacheObj = { data: currentENNames, timestamp: Date.now() };
            localStorage.setItem('sentinel_cache_enterprise_names_en', JSON.stringify(cacheObj));
            
            // Force update display names in RightPanel
            setExpiringBonds(prev => prev.map(b => {
              if (b.ticker && currentENNames[b.ticker]) {
                return { ...b, issuerName: currentENNames[b.ticker] };
              }
              return b;
            }));
          }
        };
        fetchNames();
      }
    } catch (error) {
      console.error('Error fetching expiring bonds:', error);
      if (error instanceof Error && error.message.includes('401')) {
        setError(t('tokenError401'));
      } else {
        setError(t('dataError'));
      }
    } finally {
      setLoading(false);
    }
  };

    if (isOpen) {
      fetchExpiringBonds();
      fetchNews();

      const newsInterval = setInterval(fetchNews, 300000); // 5 minutes
      return () => clearInterval(newsInterval);
    }
  }, [isOpen, t]);

  const calculateDaysLeft = (maturityDate: string) => {
    if (!maturityDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maturity = new Date(maturityDate);
    maturity.setHours(0, 0, 0, 0);
    const diffTime = maturity.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  return (
    <aside className="w-full bg-bg-surface md:border-l border-border-base flex flex-col overflow-hidden transition-colors duration-300">
      <div className={cn("p-3 md:p-6 transition-all duration-300 flex-1 flex flex-col", isOpen ? "w-full md:w-[320px]" : "w-full md:w-[64px] md:px-3")}>
        <div className={cn("flex items-center mb-4 md:mb-8", isOpen ? "justify-between" : "justify-center")}>
          <button 
            onClick={onToggle}
            className="p-2 text-text-muted hover:text-[#3634B3] hover:bg-bg-base rounded-lg transition-colors"
            title={isOpen ? t('hideSidebar') : t('showSidebar')}
          >
            <PanelRight className={cn("h-5 w-5 transition-transform duration-300", !isOpen && "rotate-180")} />
          </button>
        </div>

        {isOpen ? (
          <div className="flex-1 flex flex-col space-y-6 md:space-y-8 animate-in fade-in duration-500">
            {/* Expiring Bonds */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-base uppercase tracking-wider flex items-center gap-2 transition-colors">
                  <Calendar className="h-4 w-4 text-text-highlight" /> {t('upcomingBonds')}
                </h3>
                <button 
                  onClick={onSeeMoreMaturity}
                  className="text-[10px] font-bold text-text-highlight hover:underline transition-colors"
                >
                  {t('seeMore')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:block md:space-y-3 gap-3">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-text-highlight"></div>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <p className="text-[10px] text-red-500 text-center font-bold uppercase">{error}</p>
                    {error.includes('401') && (
                      <p className="text-[10px] text-text-muted font-medium italic">
                        {t('settings')}
                      </p>
                    )}
                  </div>
                ) : expiringBonds.length > 0 ? (
                  expiringBonds.map((bond) => {
                    const daysLeft = calculateDaysLeft(bond.maturityDate);
                    return (
                      <div 
                        key={bond.id} 
                        onClick={() => {
                          setBondEnterpriseName(bond.issuerName || 'N/A');
                          setSelectedBond({
                            id: bond.id,
                            code: bond.code,
                            enterpriseId: '',
                            term: bond.term || 'N/A',
                            interestRate: bond.interestRate,
                            listedVolume: bond.listedVolume,
                            issuedValue: 0,
                            listedValue: 0,
                            issueDate: bond.issueDate || 'N/A',
                            maturityDate: bond.maturityDate,
                            interestType: bond.interestType || 'N/A',
                            status: t('active')
                          });
                        }}
                        className="p-4 bg-bg-base/50 dark:bg-bg-base/20 rounded-xl border border-border-base hover:border-text-highlight/30 transition-all group cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-text-highlight transition-colors">{bond.code}</span>
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors",
                            daysLeft <= 30 ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" : "bg-[#3634B3]/5 text-[#3634B3]"
                          )}>
                            {daysLeft} {t('daysUnit')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-2">
                          <div>
                            <p className="text-[10px] text-text-muted uppercase font-semibold transition-colors">{t('volume')}</p>
                            <p className="text-xs font-bold text-text-base transition-colors">{formatNumber(bond.listedVolume, 0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-text-muted uppercase font-semibold transition-colors">{t('interestRate')}</p>
                            <p className="text-xs font-bold text-green-600 dark:text-green-500 transition-colors">{formatInterestRate(bond.interestRate)}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-muted uppercase font-semibold transition-colors">{t('maturityDate')}</p>
                            <p className="text-xs font-bold text-text-base transition-colors">{formatDate(bond.maturityDate)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-text-muted text-center py-4 transition-colors">{t('noUpcomingBondsData')}</p>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-base uppercase tracking-wider flex items-center gap-2 transition-colors">
                  <Newspaper className="h-4 w-4 text-text-highlight" /> {t('relatedNews')}
                </h3>
                <button 
                  onClick={onSeeMoreNews}
                  className="text-[10px] font-bold text-text-highlight hover:underline transition-colors"
                >
                  {t('seeMore')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:block md:space-y-4 gap-4">
                {loadingNews ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-text-highlight"></div>
                  </div>
                ) : newsError ? (
                  <div className="flex flex-col items-center gap-2 py-4 transition-colors">
                    <p className="text-[10px] text-red-500 text-center font-bold uppercase">
                      {newsError === '401' ? t('authError401') : newsError}
                    </p>
                  </div>
                ) : newsList.length > 0 ? (
                  newsList.slice(0, 5).map((news) => (
                    <div 
                      key={news.id} 
                      onClick={() => onSelectNews(news)}
                      className="flex gap-3 group cursor-pointer"
                    >
                      <img 
                        src={news.image || `https://picsum.photos/seed/${news.id}/200/200`} 
                        alt={news.title} 
                        className="h-16 w-16 rounded-lg object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          // fallback ảnh random nếu ảnh chính lỗi
                          if (!target.src.includes('picsum.photos')) {
                          target.src = `https://picsum.photos/seed/${news.id}/200/200`;
                          }
                        }}
                      />
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-text-highlight uppercase tracking-wider transition-colors">{news.source}</span>
                        <h4 className="text-xs font-bold text-text-base leading-snug group-hover:text-text-highlight transition-colors line-clamp-2">
                          {news.title}
                        </h4>
                        <p className="text-[10px] text-text-muted font-medium transition-colors">{formatDate(news.date)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-muted text-center py-4 transition-colors">{t('noLatestNews')}</p>
                )}
              </div>
            </section>

            {/* Expert Analysis */}
            <section className="bg-[#3634B3] rounded-2xl p-5 text-white mt-auto mb-4 border border-transparent transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">{t('expertAnalysis')}</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-80 mb-4 italic">
                {t('expertQuote')}
              </p>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">RS</div>
                <div>
                  <p className="text-[10px] font-bold">{t('researchTeam')?.toUpperCase() || 'RESEARCH TEAM'}</p>
                  <p className="text-[8px] opacity-60">{t('financialSentinel') || 'Financial Sentinel'}</p>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-row md:flex-col items-center justify-center gap-8 mt-4 text-text-muted transition-colors">
            <Calendar className="h-5 w-5" />
            <Newspaper className="h-5 w-5" />
            <TrendingUp className="h-5 w-5" />
          </div>
        )}
      </div>
    </aside>
  );
}