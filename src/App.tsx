import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Header, { SearchSuggestion } from './components/Header';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import LoginView from './components/LoginView';
import { IndustryType, Enterprise, NewsItem, Bond } from './types';
import { useLanguage } from './LanguageContext';
import { getCache } from './utils/cache';
import { normalizeInterestType } from './utils/format';
import { SignInCallback, SignOutCallback, SilentRenewCallback, useOidcAuth } from './auth/oidc';
import { fireantApi } from './api/fireant';
import { warmDashboardCoreDataInBackground } from './services/dashboardPrefetch';
import { Calendar, Menu, Newspaper } from 'lucide-react';

const MarketOverview = lazy(() => import('./components/MarketOverview'));
const IndustryView = lazy(() => import('./components/IndustryView'));
const EnterpriseView = lazy(() => import('./components/EnterpriseView'));
const MaturityListView = lazy(() => import('./components/MaturityListView'));
const NewsListView = lazy(() => import('./components/NewsListView'));
const WatchlistView = lazy(() => import('./components/WatchlistView'));
const BondDetailPopup = lazy(() => import('./components/BondDetailPopup'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const HelpView = lazy(() => import('./components/HelpView'));
// AI chat removed from dashboard UI

const RESERVED_ROUTES = ['industry', 'enterprise', 'maturity', 'news', 'news-list', 'profile', 'help', 'watchlist', 'login'];

const isBondCode = (s: string) => {
  if (!s) return false;
  const lower = s.toLowerCase();
  if (RESERVED_ROUTES.includes(lower)) return false;
  return s.length >= 6;
};

export default function App() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, signIn, signOut } = useOidcAuth();
  
  // Derive activeTab from location.pathname
  const { activeTab, activeIndustry, ticker, bondCode } = (() => {
    // If we have a background location (from state), use that to determine the active tab
    const currentPath = location.state?.backgroundLocation?.pathname || location.pathname;
    const parts = currentPath.split('/').filter(Boolean);
    
    // Check if the actual URL is a bond code first to handle deep links
    const directParts = location.pathname.split('/').filter(Boolean);
    const urlBondCode = (directParts.length === 1 && isBondCode(directParts[0])) ? directParts[0] : null;

    if (currentPath === '/' || currentPath === '') return { activeTab: 'overview', bondCode: urlBondCode };
    
    if (currentPath.startsWith('/industry')) {
      return { 
        activeTab: 'industry', 
        activeIndustry: (parts[1] || 'Banking') as IndustryType,
        bondCode: urlBondCode
      };
    }
    
    if (currentPath.startsWith('/enterprise')) {
      return { 
        activeTab: 'enterprise', 
        ticker: parts[1] || null,
        bondCode: urlBondCode
      };
    }
    
    if (currentPath === '/maturity') return { activeTab: 'maturity-list', bondCode: urlBondCode };
    if (currentPath === '/news-list' || currentPath === '/news') return { activeTab: 'news-list', bondCode: urlBondCode };
    if (currentPath === '/watchlist') return { activeTab: 'watchlist', bondCode: urlBondCode };
    
    if (currentPath.startsWith('/news/')) return { activeTab: 'news-list', bondCode: urlBondCode };
    
    if (currentPath === '/profile') return { activeTab: 'profile', bondCode: urlBondCode };
    if (currentPath === '/help') return { activeTab: 'help', bondCode: urlBondCode };
    
    // If it's a direct bond link and no background
    if (directParts.length === 1 && isBondCode(directParts[0])) {
      return { activeTab: 'bond-detail', bondCode: directParts[0] };
    }
    
    return { activeTab: 'overview', bondCode: urlBondCode };
  })();

  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'maturity' | 'news'>('maturity');
  const [selectedBond, setSelectedBond] = useState<Bond | null>(null);
  const [bondEnterpriseName, setBondEnterpriseName] = useState<string>('');
  
  const setActiveTab = (tab: string) => {
    switch (tab) {
      case 'overview': navigate('/'); break;
      case 'industry': {
        navigate(`/industry/${activeIndustry || 'Banking'}`);
        break;
      }
      case 'enterprise': navigate('/enterprise'); break;
      case 'maturity-list': navigate('/maturity'); break;
      case 'news-list': navigate('/news'); break;
      case 'watchlist': navigate('/watchlist'); break;
      case 'profile': navigate('/profile'); break;
      case 'help': navigate('/help'); break;
      default: navigate('/');
    }
  };

  const setActiveIndustry = (industry: string) => {
    navigate(`/industry/${industry}`);
  };

  const handleSetSelectedBond = (bond: Bond | null) => {
    if (bond) {
      setSelectedBond(bond);
      // Pass the current location as state so we can keep it as background
      navigate(`/${bond.code}`, { state: { backgroundLocation: location } });
    } else {
      setSelectedBond(null);
      // If we are currently on a bond page, go back to the background location
      if (location.state?.backgroundLocation) {
        navigate(-1);
      } else if (bondCode) {
        navigate('/');
      }
    }
  };

  const appFrameRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleRightPanelTabClick = (tab: 'maturity' | 'news') => {
    if (isRightPanelOpen && rightPanelTab === tab) {
      setIsRightPanelOpen(false);
      return;
    }

    setRightPanelTab(tab);
    setIsRightPanelOpen(true);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const syncPanels = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
      if (event.matches) {
        setIsSidebarOpen(false);
        setIsRightPanelOpen(false);
      } else {
        setIsSidebarOpen(true);
        setIsRightPanelOpen(true);
      }
    };

    syncPanels(mediaQuery);
    mediaQuery.addEventListener('change', syncPanels);
    return () => mediaQuery.removeEventListener('change', syncPanels);
  }, []);

  useEffect(() => {
    // Reset scroll position only when the main logical view changes
    // Opening a modal (bond popup) should not reset the scroll of the background content
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab, activeIndustry, ticker]);

  const handleSetSelectedEnterprise = (enterprise: Enterprise | null) => {
    if (enterprise) {
      navigate(`/enterprise/${enterprise.ticker}`);
    } else {
      navigate('/enterprise');
    }
  };

  // Sync selectedEnterprise with URL ticker
  useEffect(() => {
    if (activeTab === 'enterprise' && ticker) {
      if (!selectedEnterprise || selectedEnterprise.ticker !== ticker) {
        const cachedEnterprises = (getCache('enterprise_list') || []) as Enterprise[];
        const cached = cachedEnterprises.find((e) => e.ticker === ticker);
        if (cached) {
          setSelectedEnterprise(cached);
        } else {
          setSelectedEnterprise({
            id: ticker,
            ticker: ticker,
            name: ticker,
            industry: 'N/A',
            bondCount: 0,
            issuedValue: 0,
            initialDebt: 0,
            remainingDebt: 0
          });
        }
      }
    } else if (activeTab === 'enterprise' && !ticker && selectedEnterprise) {
      setSelectedEnterprise(null);
    }
  }, [activeTab, ticker, selectedEnterprise]);

  // Sync selectedBond from URL bondCode
  useEffect(() => {
    if (bondCode && (!selectedBond || selectedBond.code !== bondCode)) {
      const fetchBond = async () => {
        try {
            const data = await fireantApi.getBond(bondCode);
            const detail = data.detail || {};
            const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
            const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

            let enterpriseName = detail.issuerSymbol || '';
            try {
              if (detail.issuerSymbol) {
                const profile = await fireantApi.getIssuerProfile(detail.issuerSymbol);
                enterpriseName = profile.internationalName || profile.name || detail.issuerSymbol;
              }
            } catch (err) {}

            const interestRate = detail.bondRate || detail.interestRate || detail.couponRate || cashFlowRate || 0;
            const rawInterestType = detail.bondRateType || detail.interestRateType || detail.couponRateType || detail.interestType || '';
            const paymentMethod = detail.interestPaymentMethod || detail.paymentMethod || detail.bondType || detail.bondName || '';
            const interestType = normalizeInterestType(rawInterestType, paymentMethod, Array.isArray(data.cashFlows) ? data.cashFlows : []);
            
            const fullBond: Bond = {
              id: bondCode,
              code: bondCode,
              enterpriseId: detail.issuerSymbol || '',
              term: detail.tenorPeriod ? String(detail.tenorPeriod) : '',
              interestRate,
              listedVolume: detail.currentListedVolume || historyItem?.volume || 0,
              issuedValue: (detail.totalIssuedValue || 0) / 1000000000,
              listedValue: (detail.currentListedValue || 0) / 1000000000,
              issueDate: detail.issueDate ? detail.issueDate.split('T')[0] : '',
              maturityDate: detail.maturityDate ? detail.maturityDate.split('T')[0] : '',
              interestType,
              status: detail.status || ''
            };
            setSelectedBond(fullBond);
            setBondEnterpriseName(enterpriseName);
        } catch (error) {
          console.error("Error fetching bond from URL:", error);
        }
      };
      fetchBond();
    } else if (!bondCode && selectedBond) {
      setSelectedBond(null);
    }
  }, [bondCode]); // Removed selectedBond from dependency to prevent re-fetch flicker on close

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(console.error);
      return;
    }

    const profile = (user.profile || {}) as Record<string, unknown>;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userData: {
          id: profile.sub ?? profile.sid ?? '',
          email: profile.email ?? '',
          name: profile.name ?? profile.preferred_username ?? profile.email ?? '',
        },
      }),
    }).catch(console.error);

    warmDashboardCoreDataInBackground();
    void import('./components/MarketOverview');
    void import('./components/IndustryView');
    void import('./components/EnterpriseView');
  }, [user, authLoading]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    const previousView = document.body.getAttribute('data-app-view');
    document.body.style.overflow = user ? 'hidden' : 'auto';
    document.body.setAttribute('data-app-view', user ? 'dashboard' : 'login');

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousView) {
        document.body.setAttribute('data-app-view', previousView);
      } else {
        document.body.removeAttribute('data-app-view');
      }
    };
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('OIDC sign-out failed', error);
    }
  };

  const handleRegister = () => {
    window.open('https://www.fireant.vn/Account/Register', '_blank', 'noopener,noreferrer');
  };

  const handleSearchSelect = async (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'enterprise') {
      const cachedEnterprises = (getCache('enterprise_list') || []) as Enterprise[];
      const cached = cachedEnterprises.find((enterprise) => enterprise.ticker === suggestion.ticker);
      const selection: Enterprise = {
        id: suggestion.ticker || suggestion.id,
        ticker: suggestion.ticker || suggestion.id,
        name: suggestion.title,
        industry: cached?.industry || 'N/A',
        bondCount: cached?.bondCount || 0,
        issuedValue: cached?.issuedValue || 0,
        initialDebt: cached?.initialDebt || 0,
        remainingDebt: cached?.remainingDebt || 0,
      };
      navigate(`/enterprise/${selection.ticker}`);
      setSelectedBond(null);
      setBondEnterpriseName('');
      return;
    }

    // For bond selection, fetch full details first
    try {
        const data = await fireantApi.getBond(suggestion.code || suggestion.id);
        const detail = data.detail || {};
        const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
        const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

        // Fetch enterprise name if needed
        let enterpriseName = suggestion.enterpriseName || suggestion.subtitle || '';
        if (!enterpriseName && detail.issuerSymbol) {
          try {
              const profile = await fireantApi.getIssuerProfile(detail.issuerSymbol);
              enterpriseName = profile.internationalName || profile.name || detail.issuerSymbol;
          } catch (error) {
            console.warn('Failed to fetch enterprise name for bond:', error);
            enterpriseName = detail.issuerSymbol || '';
          }
        }

        const interestRate = detail.bondRate || detail.interestRate || detail.couponRate || cashFlowRate || 0;
        const rawInterestType = detail.bondRateType || detail.interestRateType || detail.couponRateType || detail.interestType || '';
        const paymentMethod = detail.interestPaymentMethod || detail.paymentMethod || detail.bondType || detail.bondName || '';
        const interestType = normalizeInterestType(rawInterestType, paymentMethod, Array.isArray(data.cashFlows) ? data.cashFlows : []);
        const listedVolume = detail.currentListedVolume || historyItem?.volume || 0;
        const issueValue = detail.totalIssuedValue
          ? detail.totalIssuedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : 0;
        const listedValue = detail.currentListedValue
          ? detail.currentListedValue / 1000000000
          : historyItem?.value
            ? historyItem.value / 1000000000
            : issueValue;

        const fullBond: Bond = {
          id: suggestion.code || suggestion.id,
          code: suggestion.code || suggestion.id,
          enterpriseId: detail.issuerSymbol || suggestion.ticker || suggestion.enterpriseName || '',
          term: detail.tenorPeriod ? String(detail.tenorPeriod) : '',
          interestRate,
          listedVolume,
          issuedValue: issueValue,
          listedValue,
          issueDate: detail.issueDate ? detail.issueDate.split('T')[0] : '',
          maturityDate: detail.maturityDate ? detail.maturityDate.split('T')[0] : '',
          interestType,
          status: detail.status || ''
        };

        setSelectedBond(fullBond);
        setBondEnterpriseName(enterpriseName);
        navigate(`/${fullBond.code}`, { state: { backgroundLocation: location } });
    } catch (error) {
      console.error('Error fetching bond details for search selection:', error);
      // Fallback to minimal bond object
      const bond: Bond = {
        id: suggestion.code || suggestion.id,
        code: suggestion.code || suggestion.id,
        enterpriseId: suggestion.ticker || suggestion.enterpriseName || '',
        term: '',
        interestRate: 0,
        listedVolume: 0,
        issuedValue: 0,
        listedValue: 0,
        issueDate: '',
        maturityDate: '',
        interestType: '',
        status: ''
      };
      setSelectedBond(bond);
      setBondEnterpriseName(suggestion.enterpriseName || suggestion.subtitle || '');
      navigate(`/${bond.code}`, { state: { backgroundLocation: location } });
    }
  };

  const handleEnterpriseTabClick = () => {
    navigate('/enterprise');
  };

  const handleSelectNews = (news: NewsItem) => {
    const url = news.originalUrl || news.url;
    if (!url || url === '#') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSeeMoreNews = () => {
    navigate('/news');
  };

  if (location.pathname === '/signin-callback') {
    return <SignInCallback />;
  }

  if (location.pathname === '/signout-callback') {
    return <SignOutCallback />;
  }

  if (location.pathname === '/silent-renew-callback') {
    return <SilentRenewCallback />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base text-text-base">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600/20 border-t-blue-600"></div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">Đang xác thực...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView onRegister={handleRegister} onSignIn={signIn} isSigningIn={authLoading} />
    );
  }

  const isProfileMode = activeTab === 'profile' || activeTab === 'help';

  return (
    <div className="h-dvh overflow-hidden bg-bg-base font-sans text-text-base selection:bg-text-highlight/20 selection:text-text-highlight transition-colors duration-300 flex flex-col">
      <Header 
        onProfileClick={() => setActiveTab('profile')} 
        onHelpClick={() => setActiveTab('help')}
        onLogoClick={() => setActiveTab('overview')}
        onLogout={handleLogout}
        onSearchSelect={handleSearchSelect}
      />
      
      <div ref={appFrameRef} className="flex flex-1 min-h-0 flex-col lg:flex-row relative items-stretch overflow-hidden">
        {!isProfileMode && (
          <>
          {isSidebarOpen && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 top-16 z-40 bg-black/20 lg:hidden"
              aria-label={t('hideSidebar')}
            />
          )}
          <div className={cn(
            "transition-all duration-300 ease-in-out shrink-0 border-border-base bg-surface-bright/95 backdrop-blur",
            isSidebarOpen
              ? "fixed bottom-0 left-0 top-16 z-50 w-72 max-w-full border-r shadow-xl lg:static lg:z-auto lg:w-64 lg:shadow-none"
              : "hidden lg:block lg:w-14 lg:border-r"
          )}>
            <Sidebar 
              activeTab={activeTab} 
              setActiveTab={setActiveTab} 
              activeIndustry={activeIndustry} 
              setActiveIndustry={setActiveIndustry} 
              isOpen={isSidebarOpen} 
              onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
              onEnterpriseTabClick={handleEnterpriseTabClick} 
            />
          </div>
          </>
        )}
        
        <div className="flex-1 min-w-0 h-full overflow-hidden transition-all duration-300">
          <div className={cn(
            "flex h-full min-h-0 flex-col lg:flex-row items-stretch overflow-hidden transition-all duration-300",
            !isProfileMode ? "bg-bg-base" : "h-full"
          )}>
            {!isProfileMode && isMobileLayout && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-base bg-surface-bright/95 px-3 py-2 shadow-sm backdrop-blur lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-all hover:border-text-highlight hover:text-text-highlight active:scale-95"
                  aria-label={t('showSidebar')}
                  title={t('showSidebar')}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRightPanelTabClick('maturity')}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-all hover:border-text-highlight hover:text-text-highlight active:scale-95",
                      isRightPanelOpen && rightPanelTab === 'maturity' && "border-text-highlight bg-action-accent text-slate-950 shadow-md shadow-cyan-500/20 hover:text-slate-950"
                    )}
                    title={t('upcomingBonds')}
                  >
                    <Calendar className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRightPanelTabClick('news')}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-all hover:border-text-highlight hover:text-text-highlight active:scale-95",
                      isRightPanelOpen && rightPanelTab === 'news' && "border-text-highlight bg-action-accent text-slate-950 shadow-md shadow-cyan-500/20 hover:text-slate-950"
                    )}
                    title={t('relatedNews')}
                  >
                    <Newspaper className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
            <main className="flex-1 min-h-0 min-w-0 overflow-hidden transition-all duration-300">
              <div
                ref={scrollContainerRef}
                className={cn(
                  "h-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar overscroll-contain",
                  isProfileMode
                    ? "w-full"
                    : activeTab === 'overview'
                      ? "w-full pb-3 pl-2 pr-1 sm:pl-3 sm:pr-2 md:pb-4 md:px-4 lg:pl-4 lg:pr-2 xl:pl-4 xl:pr-3"
                      : activeTab === 'maturity-list' || activeTab === 'watchlist'
                        ? "w-full pt-2 pb-3 pl-2 pr-1 sm:pt-3 sm:pl-3 sm:pr-2 md:pt-4 md:pb-4 md:px-4 lg:pt-4 lg:pl-4 lg:pr-2 xl:pt-4 xl:pl-4 xl:pr-3"
                        : "w-full pt-0 pb-3 pl-2 pr-1 sm:pl-3 sm:pr-2 md:pb-4 md:px-4 lg:pl-4 lg:pr-2 xl:pl-4 xl:pr-3"
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex min-h-96 items-center justify-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    </div>
                  }
                >
                  <Routes location={location.state?.backgroundLocation || location}>
                    <Route path="/" element={<MarketOverview />} />
                    <Route path="/industry/:industryId?" element={<IndustryView industry={activeIndustry} />} />
                    <Route path="/enterprise/:ticker?" element={
                      <EnterpriseView 
                        selectedEnterprise={selectedEnterprise} 
                        setSelectedEnterprise={handleSetSelectedEnterprise}
                        setSelectedBond={handleSetSelectedBond}
                        setBondEnterpriseName={setBondEnterpriseName}
                      />
                    } />
                    <Route path="/maturity" element={
                      <MaturityListView 
                        setSelectedBond={handleSetSelectedBond}
                        setBondEnterpriseName={setBondEnterpriseName}
                      />
                    } />
                    <Route path="/news" element={<NewsListView onSelectNews={handleSelectNews} />} />
                    <Route path="/news/:id" element={<Navigate to="/news" replace />} />
                    <Route path="/watchlist" element={
                      <WatchlistView
                        setSelectedBond={handleSetSelectedBond}
                        setBondEnterpriseName={setBondEnterpriseName}
                      />
                    } />
                    <Route path="/profile" element={
                      <ProfileView onLogout={handleLogout} />
                    } />
                    <Route path="/settings" element={<Navigate to="/" replace />} />
                    <Route path="/help" element={<HelpView onBack={() => navigate('/')} />} />
                    <Route path="/:bondCode" element={<MarketOverview />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </div>
            </main>

            {!isProfileMode && (!isMobileLayout || isRightPanelOpen) && (
              <>
              {isRightPanelOpen && isMobileLayout && (
                <button
                  type="button"
                  onClick={() => setIsRightPanelOpen(false)}
                  className="fixed inset-0 top-16 z-30 bg-black/20 lg:hidden"
                  aria-label={t('hideSidebar')}
                />
              )}
              <div className={cn(
                "transition-all duration-300 ease-in-out shrink-0 border-border-base bg-surface-bright/95 backdrop-blur",
                isRightPanelOpen
                  ? "fixed bottom-0 right-0 top-16 z-40 w-80 max-w-full border-l shadow-xl lg:static lg:z-auto lg:w-64 lg:shadow-none"
                  : "w-0 border-0"
              )}>
                <RightPanel 
                  isOpen={isRightPanelOpen}
                  onToggle={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  activePanelTab={rightPanelTab}
                  setActivePanelTab={setRightPanelTab}
                  setSelectedBond={handleSetSelectedBond}
                  setBondEnterpriseName={setBondEnterpriseName}
                  onSeeMoreMaturity={() => setActiveTab('maturity-list')}
                  onSelectNews={handleSelectNews}
                  onSeeMoreNews={handleSeeMoreNews}
                  newsSymbol={activeTab === 'enterprise' ? ticker : null}
                />
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* AI chat removed from dashboard UI */}

      {selectedBond && (
        <Suspense fallback={null}>
          <BondDetailPopup 
            bond={selectedBond}
            enterpriseName={bondEnterpriseName}
            onClose={() => handleSetSelectedBond(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
