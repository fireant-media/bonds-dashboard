import { Building2, ChevronDown, ChevronRight, LayoutDashboard, PanelLeft, PanelRight, UserCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { getCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';

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
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { t } = useLanguage();
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

  return (
    <aside
      className={cn(
        'hidden h-full min-h-0 shrink-0 border-r border-border-base bg-surface-bright/95 transition-all duration-300 lg:flex',
        isCollapsed ? 'w-16' : 'w-72'
      )}
    >
      <div className={cn('min-h-0 flex-1 overflow-hidden p-3 lg:p-4', isCollapsed && 'p-2')}>
        <div className={cn('mb-3 flex items-center justify-between gap-2', isCollapsed && 'justify-center')}>
          {!isCollapsed ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted/80">Dashboard</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Hide sidebar'}
          >
            {isCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
        </div>

        {isCollapsed ? null : (
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
                      'group flex w-full items-center rounded-lg px-3 py-2.5 transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100 dark:bg-blue-600/10 dark:text-blue-300 dark:ring-blue-400/20'
                        : 'text-text-muted hover:bg-surface-container-low hover:text-blue-600'
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <Icon className={cn('h-5 w-5 shrink-0 transition-colors', isActive ? 'text-blue-600' : 'text-current')} />
                      <span className="truncate text-sm font-semibold">{item.label}</span>
                    </span>
                    {item.hasSubmenu ? (
                      isIndustryOpen ? (
                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-blue-600' : 'text-current')} />
                      ) : (
                        <ChevronRight className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-blue-600' : 'text-current')} />
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
                                ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100 dark:bg-blue-600/10 dark:text-blue-300 dark:ring-blue-400/20'
                                : 'text-text-muted hover:bg-surface-container-low hover:text-blue-600'
                            )}
                          >
                            <span className="min-w-0 truncate font-medium">{sub.label}</span>
                            {isIndustryActive && <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />}
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

        {isCollapsed ? (
          <div className="mt-3 flex flex-col items-center gap-2">
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
                      ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100 dark:bg-blue-600/10 dark:text-blue-300 dark:ring-blue-400/20'
                      : 'text-text-muted hover:bg-surface-container-low hover:text-blue-600'
                  )}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
