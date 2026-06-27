import {
  Search,
  LogOut,
  HelpCircle,
  UserCircle,
  Sun,
  Languages,
  X,
  Menu,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Building2,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../LanguageContext';
import { getCache } from '../utils/cache';
import { useAuthUser } from '../auth/authStore';
import Logo from './Logo';
import { useTheme } from '../ThemeContext';
import { INDUSTRY_LABEL_KEYS, INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';
import GlobalSearch from './GlobalSearch';
import type { SearchSuggestion } from '../hooks/useGlobalSearch';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type { SearchSuggestion };

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
  showDesktopBrand?: boolean;
  showPageTitle?: boolean;
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
  showDesktopBrand = true,
  showPageTitle = true,
}: HeaderProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<HeaderMenu>(null);
  const [activeDashboardSubmenu, setActiveDashboardSubmenu] = useState<'industry' | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileIndustryOpen, setMobileIndustryOpen] = useState(false);
  const [mobileBondListOpen, setMobileBondListOpen] = useState(false);
  const [industryIssuedValues, setIndustryIssuedValues] = useState<Record<string, number> | null>(
    () => getCache('sidebar_industry_issued_values_v2')
  );
  const { t, language, setLanguage } = useLanguage();
  const { setTheme, effectiveTheme } = useTheme();
  const headerRef = useRef<HTMLElement | null>(null);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const dashboardMenuCloseTimerRef = useRef<number | null>(null);
  const [mobileNavOffset, setMobileNavOffset] = useState(0);
  const authUser = useAuthUser();
  const industryIssuedValuesQuery = useSidebarIndustryIssuedValuesQuery();

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
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
    setMobileBondListOpen(true);
    setMobileIndustryOpen(activeTab === 'industry');
  }, [activeTab, activeFilterSubTab, mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen || typeof document === 'undefined') return;

    const updateMobileNavOffset = () => {
      const nextOffset = headerRef.current?.getBoundingClientRect().bottom ?? 0;
      setMobileNavOffset(nextOffset);
    };

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    updateMobileNavOffset();
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('resize', updateMobileNavOffset);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('resize', updateMobileNavOffset);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileNavOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setMobileNavOpen(false);
    }

    mediaQuery.addEventListener('change', handleBreakpointChange);
    return () => mediaQuery.removeEventListener('change', handleBreakpointChange);
  }, []);

  useEffect(() => {
    if (activeMenu !== 'dashboard') {
      setActiveDashboardSubmenu(null);
      return;
    }
  }, [activeMenu, activeTab]);

  useEffect(() => () => {
    if (dashboardMenuCloseTimerRef.current != null) {
      window.clearTimeout(dashboardMenuCloseTimerRef.current);
      dashboardMenuCloseTimerRef.current = null;
    }
  }, []);


  const getIndustryHeaderLabel = (value?: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';

    const labelKey = INDUSTRY_LABEL_KEYS[normalized];
    if (labelKey) return t(labelKey as any);

    return t(normalized as any) || normalized;
  };

  const currentPageTitle = (() => {
    if (activeTab === 'overview') {
      return t('marketOverview');
    }

    if (activeTab === 'industry') {
      return `${t('marketTitle')} ${getIndustryHeaderLabel(activeIndustry)}`.trim();
    }

    if (activeTab === 'filter') {
      return activeFilterSubTab === 'bonds' ? t('filterByBond') : t('filterByIssuer');
    }

    if (activeTab === 'watchlist') {
      return t('watchList');
    }

    if (activeTab === 'news-list') {
      return t('relatedNews');
    }

    if (activeTab === 'profile') {
      return t('profile');
    }

    if (activeTab === 'help') {
      return t('help');
    }

    return '';
  })();

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

  const closeMobileNav = () => {
    setMobileIndustryOpen(false);
    setMobileBondListOpen(false);
    setMobileNavOpen(false);
  };

  const openTopLevel = (tab: string) => {
    if (tab === 'overview' || tab === 'watchlist' || tab === 'filter') {
      warmDashboardCoreDataInBackground();
    }
    setActiveTab(tab);
    setActiveMenu(null);
    closeMobileNav();
  };

  const openIndustry = (industry: string) => {
    void warmIndustryData(industry);
    setActiveIndustry(industry);
    setActiveMenu(null);
    closeMobileNav();
  };

  const openFilter = (subTab: 'issuer' | 'bonds') => {
    warmDashboardCoreDataInBackground();
    setActiveFilterSubTab(subTab);
    setActiveMenu(null);
    closeMobileNav();
  };

  const toggleDashboardSubmenu = (submenu: 'industry') => {
    setActiveDashboardSubmenu((current) => (current === submenu ? null : submenu));
  };

  const clearDashboardMenuCloseTimer = () => {
    if (dashboardMenuCloseTimerRef.current != null) {
      window.clearTimeout(dashboardMenuCloseTimerRef.current);
      dashboardMenuCloseTimerRef.current = null;
    }
  };

  const scheduleDashboardMenuClose = () => {
    clearDashboardMenuCloseTimer();
    dashboardMenuCloseTimerRef.current = window.setTimeout(() => {
      setActiveMenu(null);
      setActiveDashboardSubmenu(null);
      dashboardMenuCloseTimerRef.current = null;
    }, 140);
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
            setActiveDashboardSubmenu(null);
          }
        }}
        onClick={() => {
          if (item.id === 'dashboard') {
            openTopLevel('overview');
            setActiveMenu(null);
            setActiveDashboardSubmenu(null);
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
          compact ? 'w-full justify-between px-3 py-3 text-sm' : 'px-3 py-2.5 text-sm',
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

  const mobileSectionButtonClassName = (active: boolean) => cn(
    'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors cursor-pointer',
    active
      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-600/10 dark:text-blue-300 dark:ring-blue-400/20'
      : 'text-text-base hover:bg-surface-container-low'
  );

  const mobileSectionItemClassName = (active: boolean) => cn(
    'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
    active
      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-600/10 dark:text-blue-300 dark:ring-blue-400/20'
      : 'text-text-muted hover:bg-surface-container-low hover:text-blue-600'
  );

  const mobileNav = mobileNavOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-50 overflow-hidden lg:hidden"
          style={{ top: mobileNavOffset }}
        >
          <div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={closeMobileNav}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-full max-w-sm flex-col overflow-hidden border-r border-border-base bg-surface-bright shadow-2xl shadow-blue-950/20">
            <div className="border-b border-border-base px-4 py-4">
              <div className="rounded-2xl border border-border-base bg-bg-surface p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-action-accent font-bold text-slate-950 shadow-md shadow-cyan-500/20">
                    {getInitials(authUser?.profile?.name || '')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text-base">{authUser?.profile?.name || 'Admin User'}</p>
                    <p className="truncate text-xs font-medium text-text-muted">{authUser?.identityData?.email || ''}</p>
                  </div>
                </div>
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="space-y-5">
                <section className="space-y-2">
                  <div className="px-1 text-xs font-semibold uppercase tracking-wider text-text-muted/80">{t('dashboardMenu')}</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => openTopLevel('overview')}
                      className={mobileSectionItemClassName(activeTab === 'overview')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <LayoutDashboard className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('overview')}</span>
                      </span>
                      {activeTab === 'overview' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => setMobileIndustryOpen((current) => !current)}
                      className={mobileSectionItemClassName(activeTab === 'industry' || mobileIndustryOpen)}
                      aria-expanded={mobileIndustryOpen}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Building2 className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('industry')}</span>
                      </span>
                      {mobileIndustryOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    </button>

                    {mobileIndustryOpen ? (
                      <div className="space-y-1 pl-4">
                        {subIndustries.map((industry) => {
                          const isIndustryActive = activeTab === 'industry' && activeIndustry === industry.id;

                          return (
                            <button
                              key={industry.id}
                              type="button"
                              onClick={() => openIndustry(industry.id)}
                              className={mobileSectionItemClassName(isIndustryActive)}
                            >
                              <span className="min-w-0 truncate font-medium">{industry.label}</span>
                              {isIndustryActive ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => openFilter('issuer')}
                      className={mobileSectionItemClassName(activeTab === 'filter' && activeFilterSubTab === 'issuer')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <UserCircle className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('filterByIssuer')}</span>
                      </span>
                      {activeTab === 'filter' && activeFilterSubTab === 'issuer' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => openFilter('bonds')}
                      className={mobileSectionItemClassName(activeTab === 'filter' && activeFilterSubTab === 'bonds')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <SlidersHorizontal className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('filterByBond')}</span>
                      </span>
                      {activeTab === 'filter' && activeFilterSubTab === 'bonds' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => openTopLevel('watchlist')}
                      className={mobileSectionItemClassName(activeTab === 'watchlist')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Bookmark className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('watchList')}</span>
                      </span>
                      {activeTab === 'watchlist' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="px-1 text-xs font-semibold uppercase tracking-wider text-text-muted/80">{t('account')}</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        onProfileClick();
                        closeMobileNav();
                      }}
                      className={mobileSectionItemClassName(activeTab === 'profile')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <UserCircle className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('personalProfile')}</span>
                      </span>
                      {activeTab === 'profile' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>

                    <div className="rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-text-muted">
                          <Languages className="h-4 w-4 shrink-0" />
                          <span>{t('language')}</span>
                        </span>
                        <div className="flex items-center gap-1 rounded-full border border-border-base bg-bg-surface p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setLanguage('en');
                              closeMobileNav();
                            }}
                            className={cn(
                              'min-w-16 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                              language === 'en'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-300'
                                : 'text-text-muted hover:text-blue-600'
                            )}
                          >
                            {t('english')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLanguage('vi');
                              closeMobileNav();
                            }}
                            className={cn(
                              'min-w-16 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                              language === 'vi'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-300'
                                : 'text-text-muted hover:text-blue-600'
                            )}
                          >
                            {t('vietnamese')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-text-muted">
                          <Sun className="h-4 w-4 shrink-0" />
                          <span>{t('themeMode')}</span>
                        </span>
                        <div className="flex items-center gap-1 rounded-full border border-border-base bg-bg-surface p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTheme('light');
                              closeMobileNav();
                            }}
                            className={cn(
                              'min-w-16 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                              effectiveTheme === 'light'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-300'
                                : 'text-text-muted hover:text-blue-600'
                            )}
                          >
                            {t('light')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTheme('dark');
                              closeMobileNav();
                            }}
                            className={cn(
                              'min-w-16 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                              effectiveTheme === 'dark'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-300'
                                : 'text-text-muted hover:text-blue-600'
                            )}
                          >
                            {t('dark')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onHelpClick();
                        closeMobileNav();
                      }}
                      className={mobileSectionItemClassName(activeTab === 'help')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <HelpCircle className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{t('help')}</span>
                      </span>
                      {activeTab === 'help' ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        closeMobileNav();
                        onLogout();
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span>{t('logout')}</span>
                    </button>
                  </div>
                </section>
              </div>
            </nav>
          </aside>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <header ref={headerRef} className="relative z-40 flex min-h-16 shrink-0 items-center gap-3 border-b border-border-base bg-bg-base/90 px-3 py-2 backdrop-blur transition-colors duration-300 sm:px-4 lg:h-16 lg:px-6 lg:py-0">
      <div className={cn('flex min-w-0 shrink-0 items-center gap-2', showDesktopBrand ? 'lg:min-w-72 lg:pr-3' : 'lg:min-w-0 lg:pr-0')}>
        <button
          type="button"
          onClick={() => {
            setMobileSearchOpen(false);
            setMobileNavOpen((current) => !current);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600 active:scale-95 lg:hidden"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          title={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className={cn('min-w-0 shrink-0 items-center gap-3 select-none', showDesktopBrand ? 'flex' : 'flex lg:hidden')}
          onClick={onLogoClick}
          aria-label="FireAnt"
        >
          <Logo />
        </button>
      </div>

      <div className="hidden min-w-0 flex-1 items-center lg:flex">
        {showPageTitle && currentPageTitle ? (
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-text-base transition-colors lg:text-xl">{currentPageTitle}</p>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center justify-end gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSearchOpen((current) => !current)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600 active:scale-95"
          aria-label={t('searchPlaceholder')}
          title={t('searchPlaceholder')}
        >
          <Search className="h-5 w-5" />
        </button>

        {mobileSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border-base bg-surface-bright p-3 shadow-xl shadow-blue-950/10 lg:hidden">
            <GlobalSearch
              onSearchSelect={onSearchSelect}
              autoFocus
              showCloseButton
              onClose={() => setMobileSearchOpen(false)}
              onAfterSelect={() => setMobileSearchOpen(false)}
            />
          </div>
        )}
      </div>

      </header>
      {mobileNav}
    </>
  );
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
