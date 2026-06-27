import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  Building2,
  ChevronDown,
  ChevronRight,
  Headphones,
  HelpCircle,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Search,
  SlidersHorizontal,
  Sun,
  User,
  UserCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';
import { useAuthUser } from '../auth/authStore';
import { getCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';
import Logo from './Logo';
import GlobalSearch from './GlobalSearch';
import type { SearchSuggestion } from '../hooks/useGlobalSearch';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeIndustry?: string;
  setActiveIndustry: (industry: string) => void;
  activeFilterSubTab: 'issuer' | 'bonds';
  setActiveFilterSubTab: (subTab: 'issuer' | 'bonds') => void;
  activeProfileSection: 'info';
  setActiveProfileSection: (section: 'info') => void;
  activeHelpSection: 'manual' | 'faq' | 'report' | 'contact';
  setActiveHelpSection: (section: 'manual' | 'faq' | 'report' | 'contact') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSearchSelect: (suggestion: SearchSuggestion) => void;
  onProfileClick: () => void;
  onHelpClick: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeIndustry,
  setActiveIndustry,
  activeFilterSubTab,
  setActiveFilterSubTab,
  activeProfileSection,
  setActiveProfileSection,
  activeHelpSection,
  setActiveHelpSection,
  isCollapsed,
  onToggleCollapse,
  onSearchSelect,
  onProfileClick,
  onHelpClick,
  onLogout,
}: SidebarProps) {
  const { t, language, setLanguage } = useLanguage();
  const { setTheme, effectiveTheme } = useTheme();
  const authUser = useAuthUser();
  const industryIssuedValuesQuery = useSidebarIndustryIssuedValuesQuery();
  const userName = authUser?.profile?.name || 'Admin User';
  const userInitial = (userName.charAt(0) || 'A').toUpperCase();
  const toggleTheme = () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
  const toggleLanguage = () => setLanguage(language === 'vi' ? 'en' : 'vi');
  const activeSidebarItemClassName =
    'bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20';
  const [isIndustryOpen, setIsIndustryOpen] = useState(activeTab === 'industry');
  const [industryIssuedValues, setIndustryIssuedValues] = useState<Record<string, number> | null>(
    () => getCache('sidebar_industry_issued_values_v2')
  );

  useEffect(() => {
    if (industryIssuedValuesQuery.data && Object.keys(industryIssuedValuesQuery.data).length > 0) {
      setIndustryIssuedValues(industryIssuedValuesQuery.data);
    }
  }, [industryIssuedValuesQuery.data]);

  useEffect(() => {
    if (activeTab === 'industry') {
      setIsIndustryOpen(true);
    }
  }, [activeTab]);

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
    { id: 'industry', label: t('industry'), icon: Building2, hasSubmenu: true },
    { id: 'issuer', label: t('filterByIssuer'), icon: UserCircle },
  ];

  const bondItems = [
    {
      id: 'bond-list',
      label: t('filterByBond'),
      icon: SlidersHorizontal,
      isActive: activeTab === 'filter' && activeFilterSubTab === 'bonds',
      onClick: () => {
        warmDashboardCoreDataInBackground();
        setActiveFilterSubTab('bonds');
      },
    },
    {
      id: 'watchlist',
      label: t('watchList'),
      icon: Bookmark,
      isActive: activeTab === 'watchlist',
      onClick: () => setActiveTab('watchlist'),
    },
  ];

  const contextItems = [
    { id: 'profile', label: t('personalProfile'), icon: User },
    { id: 'manual', label: t('supportManual'), icon: BookOpen },
    { id: 'faq', label: t('faqTitle'), icon: HelpCircle },
    { id: 'report', label: t('systemReport'), icon: AlertTriangle },
    { id: 'contact', label: t('contactSupport'), icon: Headphones },
  ] as const;

  const isProfileSidebar = activeTab === 'profile';
  const isHelpSidebar = activeTab === 'help';
  const isContextSidebar = isProfileSidebar || isHelpSidebar;

  return (
    <aside
      className={cn(
        'hidden h-full min-h-0 shrink-0 border-r border-border-base bg-bg-surface text-text-base shadow-lg shadow-blue-950/5 transition-all duration-300 lg:flex',
        isCollapsed ? 'w-16' : 'w-72'
      )}
    >
      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden p-3 lg:p-4', isCollapsed && 'overflow-visible p-2')}>
        <div className={cn('mb-4 flex h-10 items-center justify-between gap-2', isCollapsed && 'justify-center')}>
          {!isCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="min-w-0 overflow-hidden rounded-lg transition-opacity hover:opacity-90"
                aria-label="FireAnt Bonds"
              >
                <Logo />
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                aria-label={language === 'vi' ? 'Thu gọn' : 'Collapse'}
                title={language === 'vi' ? 'Thu gọn' : 'Collapse'}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg transition-opacity hover:opacity-90"
              aria-label={language === 'vi' ? 'Mở rộng' : 'Expand'}
              title={language === 'vi' ? 'Mở rộng' : 'Expand'}
            >
              <Logo iconOnly />
            </button>
          )}
        </div>

        {!isCollapsed ? (
          <div className="mb-4">
            <GlobalSearch onSearchSelect={onSearchSelect} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="mb-4 flex h-9 w-9 items-center justify-center self-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
            aria-label={t('searchPlaceholder')}
            title={t('searchPlaceholder')}
          >
            <Search className="h-5 w-5" />
          </button>
        )}

        <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar', isCollapsed && 'flex flex-col items-center overflow-x-visible pr-0')}>

          {isCollapsed ? null : isContextSidebar ? (
            <nav className="space-y-1">
              {contextItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.id === 'profile'
                    ? isProfileSidebar && activeProfileSection === 'info'
                    : isHelpSidebar && activeHelpSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'profile') {
                        setActiveProfileSection('info');
                        return;
                      }
                      if (item.id === 'manual' || item.id === 'faq' || item.id === 'report' || item.id === 'contact') {
                        setActiveHelpSection(item.id);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
                      isActive
                        ? activeSidebarItemClassName
                        : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="truncate font-semibold">{item.label}</span>
                    </span>
                    {isActive ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </nav>
          ) : (
            <nav className="space-y-1">
              {dashboardItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.id === 'overview'
                    ? activeTab === 'overview'
                    : item.id === 'industry'
                      ? activeTab === 'industry'
                      : activeTab === 'filter' && activeFilterSubTab === 'issuer';

                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.id === 'overview') {
                          setActiveTab('overview');
                          return;
                        }
                        if (item.id === 'industry') {
                          setIsIndustryOpen((current) => !current);
                          return;
                        }
                        setActiveFilterSubTab('issuer');
                      }}
                      className={cn(
                        'group flex w-full items-center rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
                        isActive
                          ? activeSidebarItemClassName
                          : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <Icon className={cn('h-5 w-5 shrink-0 transition-colors', isActive ? 'text-white' : 'text-current')} />
                        <span className="truncate text-sm font-semibold">{item.label}</span>
                      </span>
                      {item.hasSubmenu ? (
                        isIndustryOpen ? (
                          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-white' : 'text-current')} />
                        ) : (
                          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-white' : 'text-current')} />
                        )
                      ) : null}
                    </button>

                    {item.id === 'industry' && isIndustryOpen && (
                      <div className="mt-1 space-y-1 pl-5">
                        {subIndustries.map((sub) => {
                          const isIndustryActive = activeTab === 'industry' && activeIndustry === sub.id;

                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onMouseEnter={() => {
                                void warmIndustryData(sub.id);
                              }}
                              onClick={() => {
                                void warmIndustryData(sub.id);
                                setActiveTab('industry');
                                setActiveIndustry(sub.id);
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                                isIndustryActive
                                  ? activeSidebarItemClassName
                                  : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                              )}
                            >
                              <span className="min-w-0 truncate font-medium">{sub.label}</span>
                              {isIndustryActive && <ChevronRight className="h-4 w-4 shrink-0 text-white" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          )}

          {!isCollapsed && !isContextSidebar ? (
            <div className="mt-2 space-y-1">
              {bondItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
                      item.isActive
                        ? activeSidebarItemClassName
                        : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="truncate font-semibold">{item.label}</span>
                    </span>
                    {item.isActive ? <ChevronRight className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2 px-1">
              {isContextSidebar
                ? contextItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.id === 'profile'
                        ? isProfileSidebar && activeProfileSection === 'info'
                        : isHelpSidebar && activeHelpSection === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.id === 'profile') {
                            setActiveProfileSection('info');
                            return;
                          }
                          if (item.id === 'manual' || item.id === 'faq' || item.id === 'report' || item.id === 'contact') {
                            setActiveHelpSection(item.id);
                          }
                        }}
                          className={cn(
                           'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                           isActive
                             ? activeSidebarItemClassName
                             : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                        )}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    );
                  })
                : (
                  <>
                    {dashboardItems.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        item.id === 'overview'
                          ? activeTab === 'overview'
                          : item.id === 'industry'
                            ? activeTab === 'industry'
                            : activeTab === 'filter' && activeFilterSubTab === 'issuer';

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (item.id === 'overview') {
                              setActiveTab('overview');
                              return;
                            }
                            if (item.id === 'industry') {
                              setIsIndustryOpen(true);
                              onToggleCollapse();
                              return;
                            }
                            setActiveFilterSubTab('issuer');
                          }}
                           className={cn(
                             'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                             isActive
                               ? activeSidebarItemClassName
                               : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                          )}
                          aria-label={item.label}
                          title={item.label}
                        >
                          <Icon className="h-5 w-5" />
                        </button>
                      );
                    })}
                    {bondItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onClick}
                           className={cn(
                             'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                             item.isActive
                               ? activeSidebarItemClassName
                               : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                          )}
                          aria-label={item.label}
                          title={item.label}
                        >
                          <Icon className="h-5 w-5" />
                        </button>
                      );
                    })}
                  </>
                )}
            </div>
          ) : null}
        </div>

        <div className={cn('mt-4 border-t border-border-base pt-4', isCollapsed ? 'flex flex-col items-center gap-2' : 'space-y-2')}>
          {!isCollapsed ? (
            <>
              <button
                type="button"
                onClick={onProfileClick}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  isProfileSidebar
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-300'
                    : 'text-text-muted hover:bg-blue-50 hover:text-blue-600'
                )}
                aria-label={t('profile')}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 font-bold text-white shadow-lg shadow-cyan-500/20">
                  {userInitial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-text-base">{userName}</span>
                  <span className="block truncate text-xs font-medium text-text-muted">{t('profile')}</span>
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
                  title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
                  aria-label={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
                >
                  {effectiveTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
                  title={t('uiLanguage')}
                  aria-label={t('uiLanguage')}
                >
                  <Languages className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">{language}</span>
                </button>
                <button
                  type="button"
                  onClick={onHelpClick}
                  className={cn(
                    'flex h-9 flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-surface transition-colors hover:border-blue-200 hover:text-blue-600',
                    isHelpSidebar ? 'text-blue-600' : 'text-text-muted'
                  )}
                  title={t('help')}
                  aria-label={t('help')}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex h-9 flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-red-200 hover:text-red-600"
                  title={t('logout')}
                  aria-label={t('logout')}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onProfileClick}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 font-bold text-white shadow-lg shadow-cyan-500/20"
                aria-label={t('profile')}
                title={userName}
              >
                {userInitial}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
                aria-label={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
              >
                {effectiveTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={toggleLanguage}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                title={t('uiLanguage')}
                aria-label={t('uiLanguage')}
              >
                <Languages className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                title={t('logout')}
                aria-label={t('logout')}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
