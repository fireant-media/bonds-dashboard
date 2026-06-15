import {
  Search,
  LogOut,
  HelpCircle,
  UserCircle,
  Moon,
  Sun,
  Languages,
  X,
  Menu,
  ChevronRight,
  LayoutDashboard,
  Building2,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { useAuthUser } from '../auth/authStore';
import Logo from './Logo';
import { useTheme } from '../ThemeContext';
import { Language } from '../translations';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';
import { loadIssuerStatsSummary } from '../services/industryBondData';
import { loadBondDetail, loadMaturingBonds } from '../services/bondData';
import { fireantApi } from '../api/fireant';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type SearchSuggestion = {
  id: string;
  type: 'enterprise' | 'bond';
  title: string;
  subtitle: string;
  code?: string;
  ticker?: string;
  enterpriseName?: string;
};

interface HeaderProps {
  onProfileClick: () => void;
  onHelpClick: () => void;
  onLogoClick: () => void;
  onLogout: () => void;
  onSearchSelect: (suggestion: SearchSuggestion) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeIndustry?: string;
  setActiveIndustry: (industry: string) => void;
  activeFilterSubTab: 'issuer' | 'bonds';
  setActiveFilterSubTab: (subTab: 'issuer' | 'bonds') => void;
}

type HeaderMenu = 'dashboard' | null;

export default function Header({
  onProfileClick,
  onHelpClick,
  onLogoClick,
  onLogout,
  onSearchSelect,
  activeTab,
  setActiveTab,
  activeIndustry,
  setActiveIndustry,
  activeFilterSubTab,
  setActiveFilterSubTab,
}: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<HeaderMenu>(null);
  const [activeDashboardSubmenu, setActiveDashboardSubmenu] = useState<'industry' | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [industryIssuedValues, setIndustryIssuedValues] = useState<Record<string, number> | null>(
    () => getCache('sidebar_industry_issued_values_v2')
  );
  const { t, language, setLanguage } = useLanguage();
  const { setTheme, effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const authUser = useAuthUser();
  const industryIssuedValuesQuery = useSidebarIndustryIssuedValuesQuery();

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
      if (navMenuRef.current && !navMenuRef.current.contains(target)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (industryIssuedValuesQuery.data && Object.keys(industryIssuedValuesQuery.data).length > 0) {
      setIndustryIssuedValues(industryIssuedValuesQuery.data);
    }
  }, [industryIssuedValuesQuery.data]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    if (activeTab === 'overview' || activeTab === 'industry' || (activeTab === 'filter' && activeFilterSubTab === 'issuer')) {
      setActiveMenu('dashboard');
      if (activeTab === 'industry') {
        setActiveDashboardSubmenu('industry');
      }
      return;
    }
    if (activeTab === 'maturity-list' || (activeTab === 'filter' && activeFilterSubTab === 'bonds')) {
      setActiveMenu('bond');
      return;
    }
    setActiveMenu(null);
    setActiveDashboardSubmenu(null);
  }, [activeTab, activeFilterSubTab, mobileNavOpen]);

  useEffect(() => {
    if (activeMenu !== 'dashboard') {
      setActiveDashboardSubmenu(null);
      return;
    }

    if (activeTab === 'industry') {
      setActiveDashboardSubmenu('industry');
    }
  }, [activeMenu, activeTab]);

  useEffect(() => {
      const loadSearchCaches = async () => {
      const enterpriseCache = getCache('enterprise_list');
      const bondCache = getCache('comparison_pool_bonds');

      if (!enterpriseCache) {
        try {
            const issuers = await loadIssuerStatsSummary(200);
            if (Array.isArray(issuers)) {
              const mappedEnterprises = issuers.map((issuer: any) => ({
                id: issuer.issuerSymbol,
                ticker: issuer.issuerSymbol,
                name: issuer.issuerName,
                industry: 'N/A',
                bondCount: issuer.bondCount || 0,
                  issuedValue: (issuer.totalIssuedValue || 0) / 1000000000,
                initialDebt: (issuer.totalDebtFull || issuer.totalIssuedValue || 0) / 1000000000,
                remainingDebt: (issuer.totalRemainingDebt || 0) / 1000000000
              }));
                setCache('enterprise_list', mappedEnterprises);
            }
        } catch (error) {
          console.warn('Header failed to preload enterprise list', error);
        }
      }

      if (!bondCache) {
        try {
            const bonds = await loadMaturingBonds(3650);
            if (Array.isArray(bonds)) {
              const mappedBonds = bonds.map((bond: any) => ({
                id: String(bond.bondCode || bond.code || ''),
                code: String(bond.bondCode || bond.code || ''),
                enterpriseId: String(bond.issuerSymbol || bond.companyCode || ''),
                enterpriseName: String(bond.issuerName || bond.companyName || ''),
              })).filter((bond: any) => bond.code);
              if (mappedBonds.length > 0) {
                setCache('comparison_pool_bonds', mappedBonds);
              }
            }
        } catch (error) {
          console.warn('Header failed to preload bond pool', error);
        }
      }
    };
    loadSearchCaches();
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const loadSuggestions = async () => {
      setIsSearching(true);
      const normalized = trimmed.toLowerCase();

      const suggestionMap = new Map<string, SearchSuggestion>();
      const addSuggestion = (suggestion: SearchSuggestion) => {
        const key = `${suggestion.type}:${suggestion.id}`;
        if (!suggestionMap.has(key)) {
          suggestionMap.set(key, suggestion);
        }
      };

      const cachedEnterprises = (getCache('enterprise_list') || []) as any[];
      cachedEnterprises.forEach((enterprise) => {
        const name = String(enterprise.name || '');
        const ticker = String(enterprise.ticker || enterprise.id || '');
        if (name.toLowerCase().includes(normalized) || ticker.toLowerCase().includes(normalized)) {
          addSuggestion({
            id: ticker,
            type: 'enterprise',
            title: name,
            subtitle: ticker,
            ticker,
            enterpriseName: name
          });
        }
      });

      const cachedBonds = (getCache('comparison_pool_bonds') || []) as any[];
      cachedBonds.forEach((bond) => {
        const code = String(bond.code || bond.id || '');
        if (!code) return;
        if (code.toLowerCase().includes(normalized) || String(bond.enterpriseId || '').toLowerCase().includes(normalized)) {
          addSuggestion({
            id: code,
            type: 'bond',
            title: code,
            subtitle: String(bond.enterpriseName || bond.enterpriseId || t('bond')),
            code,
            enterpriseName: String(bond.enterpriseName || bond.enterpriseId || '')
          });
        }
      });

      try {
          const data = await fireantApi.searchSymbols(trimmed);
          const items = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.items)
                ? data.items
                : [];

          items.forEach((item: any) => {
            const symbol = String(item.symbol || item.ticker || '');
            if (!symbol) return;

            const name = String(item.name || item.fullName || item.companyName || item.issuerName || '');
            const symbolType = String(item.symbolType || item?.type || '').toLowerCase();
            
            // Stricter classification to avoid warrants (cw) or other types
            const isBondType = symbolType.includes('bond') || symbolType === '3'; // Type 3 is often bonds in some Fireant APIs
            const isStockType = symbolType.includes('stock') || symbolType.includes('enterprise') || symbolType === '1';
            
            // Only add if it's clearly a bond or enterprise, and avoid warrants
            if (isBondType || isStockType) {
              const type = isBondType ? 'bond' : 'enterprise';
              const title = isBondType ? symbol : (name || symbol);
              const subtitle = isBondType ? (name || item.symbolType || '') : symbol;
              
              const suggestion: SearchSuggestion = {
                id: symbol,
                type: type,
                title,
                subtitle,
                code: isBondType ? symbol : undefined,
                ticker: !isBondType ? symbol : undefined,
                enterpriseName: !isBondType ? name || symbol : undefined
              };
              addSuggestion(suggestion);
            }
          });
      } catch (error) {
        console.warn('Header search symbol lookup failed', error);
      }

      const normalizedCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const maybeBond = normalizedCode.length >= 3 && /[0-9]/.test(normalizedCode);
      if (maybeBond && !Array.from(suggestionMap.values()).some(s => s.type === 'bond' && s.code?.toUpperCase() === normalizedCode)) {
        try {
            const bondData = await loadBondDetail(normalizedCode);
            const issuerName = String(bondData?.issuerName || bondData?.issuerSymbol || '');
            addSuggestion({
              id: normalizedCode,
              type: 'bond',
              title: normalizedCode,
              subtitle: issuerName || t('bond'),
              code: normalizedCode,
              enterpriseName: issuerName
            });
        } catch (error) {
          console.warn('Header exact bond lookup failed', error);
        }
      }

      if (!active) return;
      const results = Array.from(suggestionMap.values());
      setSuggestions(results);
      setIsSearching(false);
    };

    const timer = window.setTimeout(loadSuggestions, 240);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, t]);

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    setMobileSearchOpen(false);
    onSearchSelect(suggestion);
  };

  const toggleTheme = () => {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    setLanguage((language === 'vi' ? 'en' : 'vi') as Language);
  };

  const subIndustries = useMemo(() => {
    const items = INDUSTRY_NAV_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey as any),
      issuedValue: industryIssuedValues?.[item.id],
      order: item.priority,
    }));

    return items.sort((a, b) => {
      const leftValue = typeof a.issuedValue === 'number' ? a.issuedValue : -1;
      const rightValue = typeof b.issuedValue === 'number' ? b.issuedValue : -1;

      return rightValue - leftValue || a.order - b.order;
    });
  }, [industryIssuedValues, t]);

  const dashboardItems = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'industry', label: t('industry'), icon: Building2, submenu: 'industry' as const },
    { id: 'issuer', label: t('filterByIssuer'), icon: UserCircle },
  ];

  const isDashboardActive =
    activeTab === 'overview' ||
    activeTab === 'industry' ||
    (activeTab === 'filter' && activeFilterSubTab === 'issuer');

  const navItems = [
    { id: 'dashboard', label: t('dashboardMenu'), icon: LayoutDashboard, menu: 'dashboard' as const, isActive: isDashboardActive },
    { id: 'bond', label: t('bondNavigationMenu'), icon: SlidersHorizontal, isActive: activeTab === 'filter' && activeFilterSubTab === 'bonds' },
    { id: 'watchlist', label: t('watchList'), icon: Bookmark, isActive: activeTab === 'watchlist' },
  ];

  const openTopLevel = (tab: string) => {
    if (tab === 'overview' || tab === 'watchlist' || tab === 'filter' || tab === 'maturity-list') {
      warmDashboardCoreDataInBackground();
    }
    setActiveTab(tab);
    setActiveMenu(null);
    setMobileNavOpen(false);
  };

  const openIndustry = (industry: string) => {
    void warmIndustryData(industry);
    setActiveIndustry(industry);
    setActiveMenu(null);
    setMobileNavOpen(false);
  };

  const openFilter = (subTab: 'issuer' | 'bonds') => {
    warmDashboardCoreDataInBackground();
    setActiveFilterSubTab(subTab);
    setActiveMenu(null);
    setMobileNavOpen(false);
  };

  const toggleDashboardSubmenu = (submenu: 'industry') => {
    setActiveDashboardSubmenu((current) => (current === submenu ? null : submenu));
  };

  const handleMenuRegionLeave = (event: ReactMouseEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setActiveMenu(null);
    setActiveDashboardSubmenu(null);
  };

  const renderNavButton = (item: typeof navItems[number], compact = false) => {
    const isActive = item.isActive;

    return (
      <button
        key={item.id}
        type="button"
        onMouseEnter={() => {
          if (item.id === 'dashboard' || item.id === 'bond') {
            warmDashboardCoreDataInBackground();
          }
          if (!compact && item.menu) {
            setActiveMenu(item.menu);
            if (activeTab === 'industry') {
              setActiveDashboardSubmenu('industry');
            }
          }
        }}
        onClick={() => {
          if (item.id === 'dashboard') {
            openTopLevel('overview');
            setActiveMenu(null);
            setActiveDashboardSubmenu(null);
            setMobileNavOpen(false);
            return;
          }
          if (item.id === 'watchlist') {
            openTopLevel('watchlist');
            return;
          }
          if (item.id === 'bond') {
            openFilter('bonds');
            return;
          }
        }}
        className={cn(
          'flex items-center gap-2 rounded-lg font-semibold transition-colors duration-200 cursor-pointer',
          compact ? 'w-full justify-between px-3 py-3 text-sm' : 'px-3 py-2 text-xs',
          isActive
            ? 'text-blue-600'
            : 'text-text-muted hover:text-blue-600'
        )}
        aria-haspopup={item.menu ? 'menu' : undefined}
        aria-expanded={item.menu ? Boolean(activeMenu === item.menu) : undefined}
      >
        <span className="flex min-w-0 items-center gap-2">
          {item.id === 'watchlist' && <Bookmark className="h-4 w-4 shrink-0" />}
          <span className="truncate">{item.label}</span>
        </span>
      </button>
    );
  };

  return (
    <header className="relative sticky top-0 z-50 flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-border-base bg-surface-bright/95 px-3 py-2 shadow-md shadow-blue-950/5 backdrop-blur transition-colors duration-300 dark:shadow-black/20 sm:flex-nowrap sm:gap-3 md:h-16 md:px-6 md:py-0">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:text-blue-600 active:scale-95 xl:hidden"
          aria-label="Open navigation"
          title="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="flex shrink-0 items-center gap-3 select-none"
          onClick={onLogoClick}
          aria-label="FireAnt"
        >
          <Logo />
        </button>
      </div>

      <nav
        ref={navMenuRef}
        className="relative hidden min-w-0 flex-1 items-center gap-1 xl:flex"
      >
        {navItems.map((item) => renderNavButton(item))}

        {activeMenu === 'dashboard' && (
          <div
            className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-border-base bg-surface-bright p-2"
            onMouseLeave={handleMenuRegionLeave}
          >
            {dashboardItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.id === 'overview'
                  ? activeTab === 'overview'
                  : item.id === 'industry'
                    ? activeTab === 'industry'
                    : activeTab === 'filter' && activeFilterSubTab === 'issuer';
              const isSubmenuOpen = item.submenu === 'industry' && activeDashboardSubmenu === 'industry';

              return (
                <div key={item.id} className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => {
                      if (item.submenu === 'industry') {
                        setActiveDashboardSubmenu('industry');
                      } else {
                        setActiveDashboardSubmenu(null);
                      }
                    }}
                    onClick={() => {
                      if (item.id === 'overview') {
                        openTopLevel('overview');
                        return;
                      }
                      if (item.id === 'industry') {
                        toggleDashboardSubmenu('industry');
                        return;
                      }
                      openFilter('issuer');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                      isActive || isSubmenuOpen
                        ? 'font-semibold text-blue-600'
                        : 'font-medium text-text-muted hover:text-blue-600'
                    )}
                    aria-haspopup={item.submenu ? 'menu' : undefined}
                    aria-expanded={item.submenu ? isSubmenuOpen : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.submenu === 'industry' && isSubmenuOpen ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                  </button>

                  {item.submenu === 'industry' && isSubmenuOpen && (
                    <div className="absolute left-full top-0 ml-2 w-80 rounded-lg border border-border-base bg-surface-bright p-2">
                      {subIndustries.map((sub) => {
                        const isIndustryActive = activeTab === 'industry' && activeIndustry === sub.id;

                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onMouseEnter={() => {
                              void warmIndustryData(sub.id);
                            }}
                            onClick={() => openIndustry(sub.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                              isIndustryActive
                                ? 'font-semibold text-blue-600'
                                : 'font-medium text-text-muted hover:text-blue-600'
                            )}
                          >
                            <span className="min-w-0 truncate">{sub.label}</span>
                            {isIndustryActive && <ChevronRight className="h-4 w-4 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </nav>

      <div className="ml-auto flex basis-full items-center justify-end gap-1 pt-2 sm:min-w-0 sm:basis-auto sm:flex-none sm:pt-0 sm:gap-2">
        <button
          type="button"
          onClick={() => {
            setMobileSearchOpen(true);
            setShowDropdown(true);
            window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-600 hover:text-blue-600 active:scale-95 md:hidden"
          aria-label={t('searchPlaceholder')}
          title={t('searchPlaceholder')}
        >
          <Search className="h-5 w-5" />
        </button>

        <div ref={containerRef} className="relative hidden w-72 min-w-0 max-w-xs md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            type="text"
            aria-label={t('searchPlaceholder')}
            className="block w-full rounded-lg border border-border-base bg-bg-surface py-2 pl-10 pr-3 text-sm font-medium text-text-base placeholder-text-muted transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
            placeholder={t('searchPlaceholder')}
          />

          {showDropdown && (suggestions.length > 0 || isSearching) && (
            <div className="absolute left-0 right-0 mt-2 z-50 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-xl shadow-blue-950/10 md:max-h-96 dark:shadow-black/30">
              {isSearching && (
                <div className="px-4 py-3 text-sm text-text-muted">{t('loading')}...</div>
              )}
              {!isSearching && suggestions.length === 0 && searchQuery.trim().length > 0 && (
                <div className="px-4 py-3 text-sm text-text-muted">{t('noResults')}</div>
              )}
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.type}:${suggestion.id}`}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-container-low cursor-pointer"
                >
                  <div className="text-sm font-semibold text-text-base">{suggestion.title}</div>
                  <div className="text-xs font-medium text-text-muted">{suggestion.subtitle || (suggestion.type === 'bond' ? t('bond') : t('enterprise'))}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {mobileSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border-base bg-surface-bright p-3 shadow-xl shadow-blue-950/10 md:hidden">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-text-muted" />
              </div>
              <input
                ref={mobileSearchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                type="text"
                aria-label={t('searchPlaceholder')}
                className="block w-full rounded-lg border border-border-base bg-bg-surface py-3 pl-10 pr-10 text-sm font-medium text-text-base placeholder-text-muted transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
                placeholder={t('searchPlaceholder')}
              />
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setShowDropdown(false);
                }}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted transition-colors hover:text-blue-600"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {showDropdown && (suggestions.length > 0 || isSearching) && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-xl shadow-blue-950/10">
                {isSearching && (
                  <div className="px-4 py-3 text-sm text-text-muted">{t('loading')}...</div>
                )}
                {!isSearching && suggestions.length === 0 && searchQuery.trim().length > 0 && (
                  <div className="px-4 py-3 text-sm text-text-muted">{t('noResults')}</div>
                )}
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.type}:${suggestion.id}`}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-text-base">{suggestion.title}</div>
                    <div className="text-xs font-medium text-text-muted">{suggestion.subtitle || (suggestion.type === 'bond' ? t('bond') : t('enterprise'))}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="shrink-0 rounded-lg p-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95"
          title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
          aria-label={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
        >
          {effectiveTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={toggleLanguage}
          className="flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95 sm:px-2.5"
          title={t('uiLanguage')}
          aria-label={t('uiLanguage')}
        >
          <Languages className="h-5 w-5" />
          <span className="hidden text-xs font-bold uppercase sm:inline">{language}</span>
        </button>

        <div ref={userMenuRef} className="relative">
          <button 
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex shrink-0 items-center gap-3 rounded-lg p-1.5 transition-all hover:bg-surface-container-low active:scale-95"
            aria-label={t('profile')}
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-text-base leading-none">{authUser?.profile?.name || 'Admin User'}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-action-accent font-bold text-slate-950 shadow-md shadow-cyan-500/20">
              {getInitials(authUser?.profile?.name || '')}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-border-base bg-surface-bright py-2 shadow-xl shadow-blue-950/10 dark:shadow-black/30">
              <button 
                onClick={() => {
                  onProfileClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <UserCircle className="h-4 w-4" /> {t('profile')}
              </button>
              <button 
                onClick={() => {
                  onHelpClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <HelpCircle className="h-4 w-4" /> {t('help')}
              </button>
              <hr className="my-1 border-border-base" />
              <button 
                onClick={() => {
                  onLogout();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
              >
                <LogOut className="h-4 w-4" /> {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative flex h-full w-80 max-w-full flex-col border-r border-border-base bg-surface-bright">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border-base px-4">
              <button
                type="button"
                className="flex shrink-0 items-center"
                onClick={() => {
                  onLogoClick();
                  setMobileNavOpen(false);
                }}
                aria-label="FireAnt"
              >
                <Logo />
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-blue-600"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <div key={item.id}>
                    {renderNavButton(item, true)}
                    {item.id === 'dashboard' && activeMenu === 'dashboard' && (
                      <div className="mt-1 space-y-1 pl-5">
                        {dashboardItems.map((sub) => {
                          const Icon = sub.icon;
                          const isActive =
                            sub.id === 'overview'
                              ? activeTab === 'overview'
                              : sub.id === 'industry'
                                ? activeTab === 'industry'
                                : activeTab === 'filter' && activeFilterSubTab === 'issuer';
                          const isSubmenuOpen = sub.submenu === 'industry' && activeDashboardSubmenu === 'industry';

                          return (
                            <div key={sub.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sub.id === 'overview') {
                                    openTopLevel('overview');
                                    return;
                                  }
                                  if (sub.id === 'industry') {
                                    toggleDashboardSubmenu('industry');
                                    return;
                                  }
                                  openFilter('issuer');
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                  isActive || isSubmenuOpen
                                    ? 'font-semibold text-blue-600'
                                    : 'font-medium text-text-muted hover:text-blue-600'
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  <Icon className="h-4 w-4 shrink-0" />
                                  <span className="truncate">{sub.label}</span>
                                </span>
                                {sub.submenu === 'industry' && isSubmenuOpen ? <ChevronRight className="h-4 w-4 shrink-0" /> : isActive ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                              </button>

                              {sub.submenu === 'industry' && isSubmenuOpen && (
                                <div className="mt-1 space-y-1 pl-5">
                                  {subIndustries.map((industry) => {
                                    const isIndustryActive = activeTab === 'industry' && activeIndustry === industry.id;

                                    return (
                                      <button
                                        key={industry.id}
                                        type="button"
                                        onClick={() => openIndustry(industry.id)}
                                        className={cn(
                                          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                          isIndustryActive
                                            ? 'font-semibold text-blue-600'
                                            : 'font-medium text-text-muted hover:text-blue-600'
                                        )}
                                      >
                                        <span className="min-w-0 truncate">{industry.label}</span>
                                        {isIndustryActive && <ChevronRight className="h-4 w-4 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
