import { ArrowRight, Calendar, Newspaper } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';
import { ExpiringBond, Bond } from '../types';
import { formatInterestRate, normalizeInterestType } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { fireantApi } from '../api/fireant';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RightPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activePanelTab: 'maturity' | 'news';
  setActivePanelTab: (tab: 'maturity' | 'news') => void;
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
  onSeeMoreMaturity?: () => void;
  onSelectNews: (news: NewsItem) => void;
  onSeeMoreNews: () => void;
  newsSymbol?: string | null;
}

import { NewsItem } from '../types';

import { fetchNewsData, getCachedNews, getNewsLastUpdate } from '../services/newsService';
import { formatDate } from '../utils/format';

function NewsThumbnail({ news }: { news: NewsItem }) {
  const [hasError, setHasError] = useState(false);
  const [resolvedImage, setResolvedImage] = useState<string>(news.image || news.images?.[0] || '');
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setHasError(false);
    setResolvedImage(news.image || news.images?.[0] || '');
  }, [news.id, news.image, news.images]);

  useEffect(() => {
    if (resolvedImage || hasError || loadingDetail || !news.id) return;

    let cancelled = false;
    const resolveFromDetail = async () => {
      setLoadingDetail(true);
      try {
        const response = await fetch(`/api/news/${encodeURIComponent(news.id)}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = await response.json();
        if (cancelled) return;

        const finalImage = data?.image || data?.images?.[0] || '';
        if (finalImage) {
          setResolvedImage(finalImage);
        }
      } catch (error) {
        console.warn('Failed to resolve news thumbnail image', error);
      }
      finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };

    resolveFromDetail();
    return () => {
      cancelled = true;
    };
  }, [hasError, loadingDetail, news.id, resolvedImage]);

  if (!resolvedImage || hasError) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
        <Newspaper className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={resolvedImage}
      alt={news.title}
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}

export default function RightPanel({ 
  isOpen, 
  onToggle, 
  activePanelTab,
  setActivePanelTab,
  setSelectedBond, 
  setBondEnterpriseName,
  onSeeMoreMaturity,
  onSelectNews,
  onSeeMoreNews,
  newsSymbol
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
  const formatDaysLeft = (daysLeft: number) => `${daysLeft} ${t('daysUnit')}`;
  const handlePanelTabClick = (tab: 'maturity' | 'news') => {
    if (isOpen && activePanelTab === tab) {
      onToggle();
      return;
    }

    setActivePanelTab(tab);
    if (!isOpen) {
      onToggle();
    }
  };

  // Initialize from cache immediately
  useEffect(() => {
    const cached = getCachedNews(newsSymbol);
    if (cached) {
      setNewsList(cached);
    } else {
      setNewsList([]);
    }
  }, [newsSymbol]);

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
      const lastUpdate = getNewsLastUpdate(newsSymbol);
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
        const data = await fetchNewsData(newsSymbol);
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
        const data = await fireantApi.getMaturingSoon(3650);
        const allBonds: any[] = [];
        const seenCodes = new Set<string>();

        if (Array.isArray(data)) {
          for (const b of data) {
            const bondCode = String(b.bondCode || b.code || '');
            if (!bondCode || seenCodes.has(bondCode)) {
              continue;
            }
            seenCodes.add(bondCode);
            allBonds.push(b);
          }
        }

        // Sort all found bonds by maturity date and take top 10
        const sortedBonds = allBonds
          .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime())
          .slice(0, 10);

        const mappedData: ExpiringBond[] = sortedBonds.map((b: any) => {
          const bondCode = String(b.bondCode || b.code || '');
          return {
            id: bondCode,
            code: bondCode,
            ticker: b.issuerSymbol || bondCode.substring(0, 3),
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
          };
        });

      setExpiringBonds(mappedData);

      // Background fetch for EN names
      if (mappedData.length > 0) {
        const fetchNames = async () => {
          const currentENNames = { ...enterpriseNamesEN };
          let hasUpdates = false;

          for (const bond of mappedData) {
            if (bond.ticker && !currentENNames[bond.ticker]) {
              try {
                  const profile = await fireantApi.getIssuerProfile(bond.ticker);
                  if (profile.internationalName) {
                    currentENNames[bond.ticker] = profile.internationalName;
                    hasUpdates = true;
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
  }, [isOpen, t, newsSymbol]);

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
    <>
    <div className="fixed right-0 top-20 z-50 hidden flex-col gap-1.5 lg:flex">
      <button
        type="button"
        onClick={() => handlePanelTabClick('maturity')}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-l-lg border border-r-0 border-border-base bg-surface-bright text-text-muted shadow-lg transition-all hover:text-blue-600 active:scale-95",
          isOpen && activePanelTab === 'maturity' && "bg-blue-500 text-white hover:text-white"
        )}
        title={t('upcomingBonds')}
      >
        <Calendar className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handlePanelTabClick('news')}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-l-lg border border-r-0 border-border-base bg-surface-bright text-text-muted shadow-lg transition-all hover:text-blue-600 active:scale-95",
          isOpen && activePanelTab === 'news' && "bg-blue-500 text-white hover:text-white"
        )}
        title={t('relatedNews')}
      >
        <Newspaper className="h-4 w-4" />
      </button>
    </div>

    <aside className={cn(
      "w-full bg-surface-bright lg:border-l border-border-base flex h-full flex-col overflow-hidden transition-colors duration-300",
      !isOpen && "w-0 border-l-0"
    )}>
      <div className={cn("p-3 lg:p-2 transition-all duration-300 flex-1 min-h-0 flex flex-col", isOpen ? "w-full lg:w-64 lg:pr-10" : "w-0 p-0")}>

        {isOpen ? (
          <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto flex flex-col space-y-5 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 gap-1 rounded bg-surface-container-low p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setActivePanelTab('maturity')}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-bold transition-all active:scale-95",
                  activePanelTab === 'maturity'
                    ? "bg-surface-bright text-text-highlight shadow-sm"
                    : "text-text-muted hover:text-text-base"
                )}
              >
                {t('upcomingBonds')}
              </button>
              <button
                type="button"
                onClick={() => setActivePanelTab('news')}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-bold transition-all active:scale-95",
                  activePanelTab === 'news'
                    ? "bg-surface-bright text-text-highlight shadow-sm"
                    : "text-text-muted hover:text-text-base"
                )}
              >
                {t('news')}
              </button>
            </div>

            {/* Expiring Bonds */}
            {activePanelTab === 'maturity' && <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-base uppercase tracking-wider flex items-center gap-2 transition-colors">
                  {t('upcomingBonds')}
                </h3>
              </div>
              <div className="flex flex-col gap-3 pr-1">
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
                        className="p-3 bg-surface-container-low/60 rounded-lg border border-border-base hover:border-blue-500/30 transition-all group cursor-pointer active:scale-95"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 whitespace-nowrap text-xs font-bold leading-none text-text-highlight transition-colors">
                            {bond.code}
                          </span>
                          <span className={cn(
                            "shrink-0 rounded border border-border-base bg-surface-container-low px-2 py-1 text-xs font-semibold leading-none transition-colors",
                            "text-red-500"
                          )}>
                            {formatDaysLeft(daysLeft)}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold normal-case text-text-muted transition-colors">
                              {t('interestRate')}
                            </span>
                            <span className="text-xs font-semibold text-text-base transition-colors">
                              {formatInterestRate(bond.interestRate)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold normal-case text-text-muted transition-colors">
                              {t('maturityDate')}
                            </span>
                            <span className="text-xs font-semibold text-text-base transition-colors">
                              {formatDate(bond.maturityDate)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-text-muted text-center py-4 transition-colors">{t('noUpcomingBondsData')}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onSeeMoreMaturity}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-text-highlight transition-colors hover:underline cursor-pointer"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {t('seeMore')}
              </button>
            </section>}

            {activePanelTab === 'news' && <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-base uppercase tracking-wider flex items-center gap-2 transition-colors">
                  {t('relatedNews')}
                </h3>
              </div>
              <div className="flex flex-col gap-3 pr-1">
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
                  newsList.slice(0, 50).map((news) => (
                    <a
                      key={news.id}
                      href={news.originalUrl || news.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-container-low group cursor-pointer"
                    >
                      <NewsThumbnail news={news} />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-text-base leading-snug group-hover:text-text-highlight transition-colors line-clamp-2">
                          {news.title}
                        </h4>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="text-xs text-text-muted text-center py-4 transition-colors">{t('noLatestNews')}</p>
                )}
              </div>
            </section>}

          </div>
        ) : (
          <div className="flex flex-col items-stretch justify-start gap-2 text-text-muted transition-colors">
            <button
              type="button"
              onClick={() => handlePanelTabClick('maturity')}
              className="min-h-24 rounded-lg border border-border-base bg-surface-container-low/60 px-2 py-3 text-xs font-bold uppercase leading-snug text-text-muted hover:bg-blue-500/10 hover:text-blue-600 transition-all active:scale-95"
              title={t('upcomingBonds')}
            >
              <Calendar className="mx-auto mb-2 h-4 w-4" />
              <span className="block text-center">{t('upcomingBonds')}</span>
            </button>
            <button
              type="button"
              onClick={() => handlePanelTabClick('news')}
              className="min-h-24 rounded-lg border border-border-base bg-surface-container-low/60 px-2 py-3 text-xs font-bold uppercase leading-snug text-text-muted hover:bg-blue-500/10 hover:text-blue-600 transition-all active:scale-95"
              title={t('relatedNews')}
            >
              <Newspaper className="mx-auto mb-2 h-4 w-4" />
              <span className="block text-center">{t('relatedNews')}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
