import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  Building2,
  ChevronDown,
  ChevronRight,
  Headphones,
  HelpCircle,
  History,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  SlidersHorizontal,
  User,
  UserCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { getCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';
import Logo from './Logo';

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
  activeProfileSection: 'info' | 'history';
  setActiveProfileSection: (section: 'info' | 'history') => void;
  activeHelpSection: 'manual' | 'faq' | 'report' | 'contact';
  setActiveHelpSection: (section: 'manual' | 'faq' | 'report' | 'contact') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
}: SidebarProps) {
  const { t, language } = useLanguage();
  const industryIssuedValuesQuery = useSidebarIndustryIssuedValuesQuery();
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

  const profileItems = [
    { id: 'info', label: t('personalInfo'), icon: User },
    { id: 'history', label: t('activityLog'), icon: History },
  ] as const;

  const helpItems = [
    { id: 'manual', label: t('supportManual'), icon: BookOpen },
    { id: 'faq', label: t('faqTitle'), icon: HelpCircle },
    { id: 'report', label: t('systemReport'), icon: AlertTriangle },
    { id: 'contact', label: t('contactSupport'), icon: Headphones },
  ] as const;

  const isProfileSidebar = activeTab === 'profile';
  const isHelpSidebar = activeTab === 'help';
  const isContextSidebar = isProfileSidebar || isHelpSidebar;
  const contextTitle = isProfileSidebar ? t('profileUser') : t('helpCenter');
  const contextSubtitle = isProfileSidebar ? t('manageAccount') : t('helpSubtitle');
  const contextItems = isProfileSidebar ? profileItems : helpItems;

  return (
    <aside
      className={cn(
        'hidden h-full min-h-0 shrink-0 border-r border-border-base bg-bg-surface text-text-base shadow-lg shadow-blue-950/5 transition-all duration-300 lg:flex',
        isCollapsed ? 'w-16' : 'w-72'
      )}
    >
      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden p-3 lg:p-4', isCollapsed && 'p-2')}>
        <div className={cn('mb-5 flex h-10 items-center justify-between gap-2', isCollapsed && 'justify-center')}>
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className="min-w-0 overflow-hidden rounded-lg transition-opacity hover:opacity-90"
              aria-label="FireAnt Bonds"
            >
              <Logo />
            </button>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-blue-50 text-blue-600">
              <LayoutDashboard className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="sr-only"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
          >
            {isCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>

          {!isCollapsed && isContextSidebar ? (
            <div className="mb-4 rounded-2xl border border-border-base bg-bg-base px-4 py-4">
              <h2 className="text-base font-bold tracking-tight text-blue-600 transition-colors">{contextTitle}</h2>
              <p className="mt-1 text-sm font-medium text-text-muted transition-colors">{contextSubtitle}</p>
            </div>
          ) : null}

          {isCollapsed ? null : isContextSidebar ? (
            <nav className="space-y-1">
              {contextItems.map((item) => {
                const Icon = item.icon;
                const isActive = isProfileSidebar
                  ? activeProfileSection === item.id
                  : activeHelpSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (isProfileSidebar && (item.id === 'info' || item.id === 'history')) {
                        setActiveProfileSection(item.id);
                        return;
                      }
                      if (!isProfileSidebar && (item.id === 'manual' || item.id === 'faq' || item.id === 'report' || item.id === 'contact')) {
                        setActiveHelpSection(item.id);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
                                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
            <div className="mt-3 flex flex-col items-center gap-2">
              {isContextSidebar
                ? contextItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isProfileSidebar
                      ? activeProfileSection === item.id
                      : activeHelpSection === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (isProfileSidebar && (item.id === 'info' || item.id === 'history')) {
                            setActiveProfileSection(item.id);
                            return;
                          }
                          if (!isProfileSidebar && (item.id === 'manual' || item.id === 'faq' || item.id === 'report' || item.id === 'contact')) {
                            setActiveHelpSection(item.id);
                          }
                        }}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                          isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
                            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                            isActive
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
                            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                            item.isActive
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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

        <div className="mt-4 border-t border-border-base pt-4">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-2.5 text-text-muted transition-colors hover:bg-blue-50 hover:text-blue-600',
              isCollapsed ? 'h-10 justify-center px-0' : 'justify-start gap-3'
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
          >
            {isCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            {!isCollapsed ? <span className="truncate text-sm font-semibold">{language === 'vi' ? 'Thu gọn' : 'Collapse'}</span> : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
