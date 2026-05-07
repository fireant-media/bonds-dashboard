import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import Header, { SearchSuggestion } from './components/Header';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import MarketOverview from './components/MarketOverview';
import IndustryView from './components/IndustryView';
import EnterpriseView from './components/EnterpriseView';
import MaturityListView from './components/MaturityListView';
import NewsListView from './components/NewsListView';
import NewsDetailView from './components/NewsDetailView';
import BondDetailPopup from './components/BondDetailPopup';
import ProfileView from './components/ProfileView';
import SettingsView from './components/SettingsView';
import LoginView from './components/LoginView';
import HelpView from './components/HelpView';
import AIChatBot from './components/AIChatBot';
import { IndustryType, Enterprise, NewsItem, Bond } from './types';
import { useLanguage } from './LanguageContext';
import { getCache } from './utils/cache';
import { normalizeInterestType } from './utils/format';
import { getFireantToken, cleanTokenString } from './utils/token';

const RESERVED_ROUTES = ['industry', 'enterprise', 'maturity', 'news', 'news-list', 'profile', 'settings', 'help', 'login'];

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
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Derive activeTab from location.pathname
  const { activeTab, activeIndustry, ticker, newsId, bondCode } = (() => {
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
    
    if (currentPath.startsWith('/news/')) {
      return { activeTab: 'news-detail', newsId: parts[1], bondCode: urlBondCode };
    }
    
    if (currentPath === '/profile') return { activeTab: 'profile', bondCode: urlBondCode };
    if (currentPath === '/settings') return { activeTab: 'settings', bondCode: urlBondCode };
    if (currentPath === '/help') return { activeTab: 'help', bondCode: urlBondCode };
    
    // If it's a direct bond link and no background
    if (directParts.length === 1 && isBondCode(directParts[0])) {
      return { activeTab: 'bond-detail', bondCode: directParts[0] };
    }
    
    return { activeTab: 'overview', bondCode: urlBondCode };
  })();

  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
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
      case 'profile': navigate('/profile'); break;
      case 'settings': navigate('/settings'); break;
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

  useEffect(() => {
    // Reset scroll position only when the main logical view changes
    // Opening a modal (bond popup) should not reset the scroll of the background content
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (appFrameRef.current) {
      appFrameRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab, activeIndustry, ticker, newsId]);

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

  // Sync selectedNews with URL newsId
  useEffect(() => {
    if (activeTab === 'news-detail' && newsId && (!selectedNews || selectedNews.id !== newsId)) {
      setSelectedNews({
        id: newsId,
        title: '',
        summary: '',
        source: '',
        date: '',
        image: '',
        content: '',
        author: '',
        url: ''
      });
    }
  }, [activeTab, newsId, selectedNews]);

  // Sync selectedBond from URL bondCode
  useEffect(() => {
    if (bondCode && (!selectedBond || selectedBond.code !== bondCode)) {
      const fetchBond = async () => {
        try {
          const token = getFireantToken();
          const cleanToken = token ? cleanTokenString(token) : undefined;
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

          const response = await fetch(`/api/fireant/bonds/${encodeURIComponent(bondCode)}`, { headers });
          if (response.ok) {
            const data = await response.json();
            const detail = data.detail || {};
            const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
            const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

            let enterpriseName = detail.issuerSymbol || '';
            try {
              const profileRes = await fetch(`/api/fireant/symbols/${encodeURIComponent(detail.issuerSymbol)}/profile`, { headers });
              if (profileRes.ok) {
                const profile = await profileRes.json();
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
          }
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
    const checkAuth = async () => {
      try {
        // Try to get session from server first (more reliable for real environments)
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setUser(data.user);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to check server session", err);
      }

      const storedUser = localStorage.getItem('sentinel_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (err) {
          console.error("Failed to parse stored user", err);
          localStorage.removeItem('sentinel_user');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const handleLoginSuccess = (userData: any) => {
    setUser(userData);
    localStorage.setItem('sentinel_user', JSON.stringify(userData));
    // Tell server about login
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userData })
    }).catch(console.error);
    
    setActiveTab('overview');
  };

  const handleLogout = async () => {
    setUser(null);
    localStorage.removeItem('sentinel_user');
    // Tell server about logout
    fetch('/api/auth/logout', { method: 'POST' }).catch(console.error);
    setActiveTab('overview');
  };

  const handleUpdateUser = async (updatedData: any) => {
    const newUser = { ...user, ...updatedData, updatedAt: new Date().toISOString() };
    setUser(newUser);
    localStorage.setItem('sentinel_user', JSON.stringify(newUser));
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
      const token = getFireantToken();
      const cleanToken = token ? cleanTokenString(token) : undefined;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

      const response = await fetch(`/api/fireant/bonds/${encodeURIComponent(suggestion.code || suggestion.id)}`, {
        headers
      });

      if (response.ok) {
        const data = await response.json();
        const detail = data.detail || {};
        const historyItem = Array.isArray(data.history) ? data.history[0] : undefined;
        const cashFlowRate = Array.isArray(data.cashFlows) ? data.cashFlows[0]?.bondRate : undefined;

        // Fetch enterprise name if needed
        let enterpriseName = suggestion.enterpriseName || suggestion.subtitle || '';
        if (!enterpriseName && detail.issuerSymbol) {
          try {
            const profileRes = await fetch(`/api/fireant/symbols/${encodeURIComponent(detail.issuerSymbol)}/profile`, {
              headers
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              enterpriseName = profile.internationalName || profile.name || detail.issuerSymbol;
            }
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
      } else {
        // Fallback to minimal bond object if API fails
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
    navigate(`/news/${news.id}`);
  };

  const handleSeeMoreNews = () => {
    navigate('/news');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-600">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          <p className="text-white/60 font-bold uppercase tracking-widest text-xs">{t('authenticating')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const isProfileMode = activeTab === 'profile' || activeTab === 'settings' || activeTab === 'help';

  return (
    <div className="min-h-screen bg-bg-base font-sans text-text-base selection:bg-text-highlight/20 selection:text-text-highlight transition-colors duration-300">
      <Header 
        onProfileClick={() => setActiveTab('profile')} 
        onSettingsClick={() => setActiveTab('settings')}
        onHelpClick={() => setActiveTab('help')}
        onLogoClick={() => setActiveTab('overview')}
        onLogout={handleLogout}
        onSearchSelect={handleSearchSelect}
        user={user}
      />
      
      <div ref={appFrameRef} className="flex flex-col md:flex-row relative items-stretch h-[calc(100vh-64px)] overflow-y-auto overflow-x-hidden md:overflow-hidden">
        {!isProfileMode && (
          <div className={cn(
            "transition-all duration-300 ease-in-out shrink-0 border-b md:border-b-0 md:border-r border-border-base bg-bg-surface",
            isSidebarOpen ? "w-full md:w-80" : "w-full md:w-16"
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
        )}
        
        {/* Unified Scroll Container for Center + Right Panel */}
        <div 
          ref={scrollContainerRef}
          className={cn(
            "flex-1 min-w-0 transition-all duration-300",
            isProfileMode ? "h-full overflow-hidden" : "h-auto md:h-full overflow-visible md:overflow-y-auto md:overflow-x-hidden"
          )}
        >
          <div className={cn(
            "flex flex-col md:flex-row items-stretch transition-all duration-300",
            !isProfileMode ? "min-h-full bg-bg-base/30" : "h-full"
          )}>
            <main className="flex-1 min-h-fit transition-all duration-300 min-w-0">
              <div className={cn(isProfileMode ? "w-full h-full" : "max-w-[1600px] mx-auto py-4 px-3 md:py-6 md:px-6 w-full")}>
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
                  <Route path="/news/:id" element={
                    selectedNews ? (
                      <NewsDetailView 
                        news={selectedNews} 
                        onBack={handleSeeMoreNews} 
                      />
                    ) : (
                      <Navigate to="/news" replace />
                    )
                  } />
                  <Route path="/profile" element={
                    <ProfileView 
                      onLogout={handleLogout} 
                      user={user} 
                      onUpdateUser={handleUpdateUser} 
                    />
                  } />
                  <Route path="/settings" element={<SettingsView />} />
                  <Route path="/help" element={<HelpView onBack={() => navigate('/')} />} />
                  <Route path="/:bondCode" element={<MarketOverview />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </main>

            {!isProfileMode && (
              <div className={cn(
                "transition-all duration-300 ease-in-out shrink-0 border-t md:border-t-0 md:border-l border-border-base bg-bg-surface",
                isRightPanelOpen ? "w-full md:w-80" : "w-full md:w-16"
              )}>
                <RightPanel 
                  isOpen={isRightPanelOpen}
                  onToggle={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  setSelectedBond={handleSetSelectedBond}
                  setBondEnterpriseName={setBondEnterpriseName}
                  onSeeMoreMaturity={() => setActiveTab('maturity-list')}
                  onSelectNews={handleSelectNews}
                  onSeeMoreNews={handleSeeMoreNews}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedBond && (
        <BondDetailPopup 
          bond={selectedBond}
          enterpriseName={bondEnterpriseName}
          onClose={() => handleSetSelectedBond(null)}
        />
      )}
      <AIChatBot />
    </div>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}