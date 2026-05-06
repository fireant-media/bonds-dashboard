import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
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
import { IndustryType, Enterprise, Bond, NewsItem } from './types';
import { useLanguage } from './LanguageContext';

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
  
  const appFrameRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab or industry changes
    if (appFrameRef.current) {
      appFrameRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
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
        user={user}
        setActiveTab={setActiveTab}
        setSelectedEnterprise={setSelectedEnterprise}
        setSelectedBond={setSelectedBond}
        setBondEnterpriseName={setBondEnterpriseName}
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
                "transition-all duration-300 ease-in-out shrink-0 border-t md:border-t-0 md:border-l border-border-base bg-bg-surface",
                isRightPanelOpen ? "w-full md:w-80" : "w-full md:w-16"
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
