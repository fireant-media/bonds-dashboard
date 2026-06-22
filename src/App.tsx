import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import Header, { SearchSuggestion } from './components/Header';
import Sidebar from './components/Sidebar';
import LoginView from './components/LoginView';
import { IndustryType, Enterprise, NewsItem, Bond } from './types';
import { getCache } from './utils/cache';
import { normalizeInterestType } from './utils/format';
import { POST_LOGIN_REDIRECT_KEY, SignInCallback, SignOutCallback, SilentRenewCallback, useOidcAuth } from './auth/oidc';
import { fireantApi } from './api/fireant';
import { buildAppApiUrl } from './api/config';
import { warmDashboardCoreDataInBackground } from './services/dashboardPrefetch';
import { dashboardQueryClient } from './query/client';
import { prefetchDashboardCoreData, prefetchDashboardRouteData } from './query/dashboardQueries';

const MarketOverview = lazy(() => import('./components/MarketOverview'));
const IndustryView = lazy(() => import('./components/IndustryView'));
const FilterView = lazy(() => import('./components/FilterView'));
const NewsListView = lazy(() => import('./components/NewsListView'));
const WatchlistView = lazy(() => import('./components/WatchlistView'));
const BondDetailPopup = lazy(() => import('./components/BondDetailPopup'));
const BondComparisonPopup = lazy(() => import('./components/BondComparisonPopup'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const HelpView = lazy(() => import('./components/HelpView'));
const AIChatBot = lazy(() => import('./components/AIChatBot'));

const RESERVED_ROUTES = ['industry', 'enterprise', 'filter', 'maturity', 'news', 'news-list', 'profile', 'help', 'watchlist', 'login'];

const isBondCode = (s: string) => {
  if (!s) return false;
  const lower = s.toLowerCase();
  if (RESERVED_ROUTES.includes(lower)) return false;
  return s.length >= 6;
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, signIn, signOut } = useOidcAuth();
  
  // Derive activeTab from location.pathname
  const { activeTab, activeIndustry, ticker, bondCode, filterSubTab } = (() => {
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
    
    if (currentPath.startsWith('/filter')) {
      const subTab = parts[1] === 'bonds' ? 'bonds' : 'issuer';
      return {
        activeTab: 'filter',
        filterSubTab: subTab as 'issuer' | 'bonds',
        ticker: subTab === 'issuer' ? parts[2] || null : null,
        bondCode: urlBondCode,
      };
    }

    if (currentPath.startsWith('/enterprise')) {
      return { 
        activeTab: 'filter',
        filterSubTab: 'issuer' as const,
        ticker: parts[1] || null,
        bondCode: urlBondCode
      };
    }
    
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
  const [selectedBond, setSelectedBond] = useState<Bond | null>(null);
  const [bondEnterpriseName, setBondEnterpriseName] = useState<string>('');
  const [showBondComparison, setShowBondComparison] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const setActiveTab = (tab: string) => {
    switch (tab) {
      case 'overview': navigate('/'); break;
      case 'industry': {
        navigate(`/industry/${activeIndustry || 'Banking'}`);
        break;
      }
      case 'filter': navigate('/filter/issuer'); break;
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

  const setActiveFilterSubTab = (subTab: 'issuer' | 'bonds') => {
    navigate(subTab === 'bonds' ? '/filter/bonds' : '/filter/issuer');
  };

  const handleSetSelectedBond = (bond: Bond | null) => {
    if (bond) {
      setSelectedBond(bond);
      setShowBondComparison(false);
      // Pass the current location as state so we can keep it as background
      navigate(`/${bond.code}`, { state: { backgroundLocation: location } });
    } else {
      setSelectedBond(null);
      setShowBondComparison(false);
      // If we are currently on a bond page, go back to the background location
      if (location.state?.backgroundLocation) {
        navigate(-1);
      } else if (bondCode) {
        navigate('/');
      }
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position only when the main logical view changes
    // Opening a modal (bond popup) should not reset the scroll of the background content
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab, activeIndustry, ticker, filterSubTab]);

  const handleSetSelectedEnterprise = (enterprise: Enterprise | null) => {
    if (enterprise) {
      navigate(`/filter/issuer/${enterprise.ticker}`);
    } else {
      navigate('/filter/issuer');
    }
  };

  // Sync selectedEnterprise with URL ticker
  useEffect(() => {
    if (activeTab === 'filter' && filterSubTab === 'issuer' && ticker) {
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
    } else if (activeTab === 'filter' && filterSubTab === 'issuer' && !ticker && selectedEnterprise) {
      setSelectedEnterprise(null);
    }
  }, [activeTab, filterSubTab, ticker, selectedEnterprise]);

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
      fetch(buildAppApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      }).catch(console.error);
      return;
    }

    const profile = (user.profile || {}) as Record<string, unknown>;
    fetch(buildAppApiUrl('/api/auth/login'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userData: {
          id: profile.sub ?? profile.sid ?? '',
          email: profile.email ?? '',
          name: profile.name ?? profile.preferred_username ?? profile.email ?? '',
        },
      }),
    }).catch(console.error);

    const currentViewPrefetch = prefetchDashboardRouteData(dashboardQueryClient, {
      activeTab,
      activeIndustry,
      ticker,
      bondCode,
      filterSubTab,
    });

    void currentViewPrefetch.finally(() => {
      warmDashboardCoreDataInBackground();
      void prefetchDashboardCoreData(dashboardQueryClient);
      void import('./components/MarketOverview');
      void import('./components/IndustryView');
      void import('./components/EnterpriseView');
      void import('./components/FilterView');
    });

    if (activeTab === 'industry') {
      void import('./components/IndustryView');
    } else if (activeTab === 'filter') {
      void import('./components/FilterView');
      void import('./components/EnterpriseView');
      if (filterSubTab === 'bonds') {
        void import('./components/MarketBondFilterView');
      }
    } else if (activeTab === 'news-list') {
      void import('./components/NewsListView');
    } else if (activeTab === 'watchlist') {
      void import('./components/WatchlistView');
    } else {
      void import('./components/MarketOverview');
    }

  }, [user, authLoading, activeTab, activeIndustry, ticker, bondCode, filterSubTab]);

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

  useEffect(() => {
    if (authLoading || !user || typeof window === 'undefined') return;

    const redirectTarget = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (redirectTarget !== 'dashboard') return;

    if (location.pathname === '/') {
      window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    }
  }, [authLoading, location.pathname, user]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('OIDC sign-out failed', error);
    }
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
      navigate(`/filter/issuer/${selection.ticker}`);
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

  const handleSelectNews = (news: NewsItem) => {
    const url = news.originalUrl || news.url;
    if (!url || url === '#') return;
    window.open(url, '_blank', 'noopener,noreferrer');
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

  const shouldForceDashboardAfterLogin =
    !authLoading &&
    Boolean(user) &&
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) === 'dashboard' &&
    location.pathname !== '/';

  if (shouldForceDashboardAfterLogin) {
    return <Navigate to="/" replace />;
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
      <LoginView onSignIn={signIn} isSigningIn={authLoading} />
    );
  }

  const isProfileMode = activeTab === 'profile' || activeTab === 'help';
  const isDashboardSidebarMode =
    activeTab === 'overview' ||
    activeTab === 'industry' ||
    (activeTab === 'filter' && (filterSubTab === 'issuer' || filterSubTab === 'bonds')) ||
    activeTab === 'watchlist';

  return (
    <div className="h-dvh overflow-hidden bg-bg-base font-sans text-text-base selection:bg-text-highlight/20 selection:text-text-highlight transition-colors duration-300 flex flex-col">
      <Header 
        onProfileClick={() => setActiveTab('profile')} 
        onHelpClick={() => setActiveTab('help')}
        onLogoClick={() => setActiveTab('overview')}
        onLogout={handleLogout}
        onSearchSelect={handleSearchSelect}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeIndustry={activeIndustry}
        setActiveIndustry={setActiveIndustry}
        activeFilterSubTab={filterSubTab || 'issuer'}
        setActiveFilterSubTab={setActiveFilterSubTab}
      />
      
      <div className="flex flex-1 min-h-0 flex-col relative items-stretch overflow-hidden">
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden transition-all duration-300">
          <div className={cn(
            "flex h-full min-h-0 w-full items-stretch overflow-hidden transition-all duration-300",
            !isProfileMode ? "bg-bg-base" : "h-full"
          )}>
            {!isProfileMode && isDashboardSidebarMode && (
              <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                activeIndustry={activeIndustry}
                setActiveIndustry={setActiveIndustry}
                activeFilterSubTab={filterSubTab || 'issuer'}
                setActiveFilterSubTab={setActiveFilterSubTab}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
              />
            )}
            <main className="flex-1 min-h-0 min-w-0 overflow-hidden transition-all duration-300">
              <div
                ref={scrollContainerRef}
                className={cn(
                  "h-full min-h-0 overflow-y-scroll overflow-x-hidden custom-scrollbar overscroll-contain",
                  isProfileMode
                    ? "w-full"
                  : activeTab === 'overview'
                  ? "w-full pb-3 pl-2 pr-1 sm:pl-3 sm:pr-2 md:pb-4 md:px-4 lg:pl-4 lg:pr-2 xl:pl-4 xl:pr-3"
                    : activeTab === 'watchlist'
                      ? "w-full pb-3 pl-2 pr-1 sm:pl-3 sm:pr-2 md:pb-4 md:px-4 lg:pl-4 lg:pr-2 xl:pl-4 xl:pr-3"
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
                    <Route path="/filter" element={<Navigate to="/filter/issuer" replace />} />
                    <Route path="/filter/issuer/:ticker?" element={
                      <FilterView
                        activeSubTab="issuer"
                        selectedEnterprise={selectedEnterprise}
                        setSelectedEnterprise={handleSetSelectedEnterprise}
                        setSelectedBond={handleSetSelectedBond}
                        setBondEnterpriseName={setBondEnterpriseName}
                      />
                    } />
                    <Route path="/filter/bonds" element={
                      <FilterView
                        activeSubTab="bonds"
                        selectedEnterprise={selectedEnterprise}
                        setSelectedEnterprise={handleSetSelectedEnterprise}
                        setSelectedBond={handleSetSelectedBond}
                        setBondEnterpriseName={setBondEnterpriseName}
                      />
                    } />
                    <Route path="/enterprise" element={<LegacyEnterpriseRedirect />} />
                    <Route path="/enterprise/:ticker" element={<LegacyEnterpriseRedirect />} />
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
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <AIChatBot />
      </Suspense>

      {selectedBond && (
        <Suspense fallback={null}>
          <BondDetailPopup 
            bond={selectedBond}
            enterpriseName={bondEnterpriseName}
            onClose={() => handleSetSelectedBond(null)}
            onCompare={() => setShowBondComparison(true)}
          />
        </Suspense>
      )}

      {selectedBond && showBondComparison && (
        <Suspense fallback={null}>
          <BondComparisonPopup
            primaryBond={selectedBond}
            primaryEnterpriseName={bondEnterpriseName}
            onBack={() => setShowBondComparison(false)}
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

function LegacyEnterpriseRedirect() {
  const { ticker } = useParams();
  return <Navigate to={ticker ? `/filter/issuer/${ticker}` : '/filter/issuer'} replace />;
}
