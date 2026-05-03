import { useState, useEffect, useRef } from 'react';
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
import { IndustryType, Enterprise, NewsItem, Bond } from './types';
import { useLanguage } from './LanguageContext';
import { getCache } from './utils/cache';
import { normalizeInterestType } from './utils/format';
import { getFireantToken, cleanTokenString } from './utils/token';

export default function App() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeIndustry, setActiveIndustry] = useState<IndustryType>('Banking');
  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [selectedBond, setSelectedBond] = useState<Bond | null>(null);
  const [bondEnterpriseName, setBondEnterpriseName] = useState<string>('');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab or industry changes
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab, activeIndustry]);

  useEffect(() => {
    const checkAuth = async () => {
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
    setActiveTab('overview');
  };

  const handleLogout = async () => {
    setUser(null);
    localStorage.removeItem('sentinel_user');
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
      setSelectedEnterprise(selection);
      setActiveTab('enterprise');
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
    }
  };

  const handleEnterpriseTabClick = () => {
    setActiveTab('enterprise');
    setSelectedEnterprise(null);
  };

  const handleSelectNews = (news: NewsItem) => {
    setSelectedNews(news);
    setActiveTab('news-detail');
  };

  const handleSeeMoreNews = () => {
    setActiveTab('news-list');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#3634B3]">
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
      
      <div className="flex relative items-stretch h-[calc(100vh-64px)] overflow-hidden">
        {!isProfileMode && (
          <div className={cn(
            "transition-all duration-300 ease-in-out shrink-0 border-r border-border-base bg-bg-surface",
            isSidebarOpen ? "w-80" : "w-16"
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
            "flex-1 h-full transition-all duration-300",
            isProfileMode ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"
          )}
        >
          <div className={cn(
            "flex items-stretch transition-all duration-300",
            !isProfileMode ? "min-h-full bg-bg-base/30" : "h-full"
          )}>
            <main className="flex-1 min-h-fit transition-all duration-300 min-w-0">
              <div className={cn(isProfileMode ? "w-full h-full" : "max-w-[1600px] mx-auto py-6 px-6 w-full")}>
                {activeTab === 'overview' && <MarketOverview />}
                {activeTab === 'industry' && <IndustryView industry={activeIndustry} />}
                {activeTab === 'enterprise' && (
                  <EnterpriseView 
                    selectedEnterprise={selectedEnterprise} 
                    setSelectedEnterprise={setSelectedEnterprise}
                    setSelectedBond={setSelectedBond}
                    setBondEnterpriseName={setBondEnterpriseName}
                  />
                )}
                {activeTab === 'maturity-list' && (
                  <MaturityListView 
                    setSelectedBond={setSelectedBond}
                    setBondEnterpriseName={setBondEnterpriseName}
                  />
                )}
                {activeTab === 'news-list' && (
                  <NewsListView onSelectNews={handleSelectNews} />
                )}
                {activeTab === 'news-detail' && selectedNews && (
                  <NewsDetailView 
                    news={selectedNews} 
                    onBack={() => setActiveTab('news-list')} 
                  />
                )}
                {activeTab === 'profile' && (
                  <ProfileView 
                    onLogout={handleLogout} 
                    user={user} 
                    onUpdateUser={handleUpdateUser} 
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsView />
                )}
                {activeTab === 'help' && (
                  <HelpView onBack={() => setActiveTab('overview')} />
                )}
              </div>
            </main>

            {!isProfileMode && (
              <div className={cn(
                "transition-all duration-300 ease-in-out shrink-0 border-l border-border-base bg-bg-surface",
                isRightPanelOpen ? "w-80" : "w-16"
              )}>
                <RightPanel 
                  isOpen={isRightPanelOpen}
                  onToggle={() => setIsRightPanelOpen(!isRightPanelOpen)}
                  setSelectedBond={setSelectedBond}
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
          onClose={() => setSelectedBond(null)}
        />
      )}
    </div>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
