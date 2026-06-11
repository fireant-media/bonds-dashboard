import { LayoutDashboard, Building2, Bookmark, CalendarClock, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { getCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { useSidebarIndustryIssuedValuesQuery } from '../query/dashboardQueries';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeIndustry: string;
  setActiveIndustry: (industry: string) => void;
  activeFilterSubTab: 'issuer' | 'bonds';
  setActiveFilterSubTab: (subTab: 'issuer' | 'bonds') => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeIndustry,
  setActiveIndustry,
  activeFilterSubTab,
  setActiveFilterSubTab,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [isIndustryOpen, setIsIndustryOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [industryIssuedValues, setIndustryIssuedValues] = useState<Record<string, number> | null>(
    () => getCache('sidebar_industry_issued_values_v2')
  );
  const { t } = useLanguage();
  const industryIssuedValuesQuery = useSidebarIndustryIssuedValuesQuery();

  const menuItems = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'industry', label: t('industry'), icon: Building2, hasSubmenu: true },
    { id: 'filter', label: t('filterTab'), icon: SlidersHorizontal, hasSubmenu: true },
    { id: 'maturity-list', label: t('upcomingBonds'), icon: CalendarClock },
    { id: 'watchlist', label: t('watchList'), icon: Bookmark },
  ];

  useEffect(() => {
    if (industryIssuedValuesQuery.data && Object.keys(industryIssuedValuesQuery.data).length > 0) {
      setIndustryIssuedValues(industryIssuedValuesQuery.data);
    }
  }, [industryIssuedValuesQuery.data]);

  useEffect(() => {
    if (activeTab === 'industry') {
      setIsIndustryOpen(true);
    }
    if (activeTab === 'filter') {
      setIsFilterOpen(true);
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

  return (
    <aside className="w-full bg-surface-bright/95 lg:border-r border-border-base flex flex-col h-full overflow-hidden transition-colors duration-300">
      <div className={cn("min-h-0 overflow-y-auto p-3 lg:p-4 transition-all duration-300", isOpen ? "w-full lg:w-64" : "w-full lg:w-14 lg:px-2")}>
        <nav className={cn(isOpen ? "space-y-1" : "flex justify-center gap-2 lg:block lg:space-y-1")}>
          {menuItems.map((item) => (
            <div key={item.id}>
              <button
                onMouseEnter={() => {
                  if (item.id === 'overview' || item.id === 'filter') {
                    warmDashboardCoreDataInBackground();
                  }
                }}
                onClick={() => {
                  if (item.hasSubmenu) {
                    if (!isOpen) {
                      onToggle();
                      if (item.id === 'industry') {
                        setIsIndustryOpen(true);
                        setActiveTab('industry');
                      } else {
                        setIsFilterOpen(true);
                        setActiveTab('filter');
                      }
                      return;
                    }
                    if (item.id === 'industry') {
                      setIsIndustryOpen(!isIndustryOpen);
                      return;
                    }
                    setIsFilterOpen(!isFilterOpen);
                  } else {
                    if (activeTab === item.id && isOpen) {
                      onToggle();
                      return;
                    }
                    if (!isOpen) onToggle();
                    setActiveTab(item.id);
                  }
                }}
                className={cn(
                  "w-full flex items-center rounded-lg transition-all duration-200 group active:scale-95",
                  isOpen ? "px-3 py-2.5 justify-between" : "p-2.5 justify-center",
                  activeTab === item.id
                    ? "bg-action-accent text-slate-950 font-semibold shadow-md shadow-cyan-500/20"
                    : "text-text-muted hover:bg-surface-container-low hover:text-text-highlight"
                )}
                title={!isOpen ? item.label : undefined}
                >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <item.icon className={cn("h-5 w-5 transition-colors shrink-0", activeTab === item.id ? "text-slate-950" : "text-text-muted group-hover:text-text-highlight")} />
                  {isOpen && <span className={cn("text-sm transition-all animate-in fade-in duration-300 truncate", activeTab === item.id ? "font-semibold" : "font-medium")}>{item.label}</span>}
                </div>
                {isOpen && item.hasSubmenu && (
                  ((item.id === 'industry' && isIndustryOpen) || (item.id === 'filter' && isFilterOpen))
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />
                )}
                {isOpen && !item.hasSubmenu && activeTab === item.id && (
                  <ChevronRight className="h-4 w-4 animate-in slide-in-from-left-2 duration-300" />
                )}
              </button>

              {isOpen && item.id === 'industry' && isIndustryOpen && (
                <div className="mt-1 ml-6 lg:ml-9 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {subIndustries.map((sub) => (
                    <button
                      key={sub.id}
                      onMouseEnter={() => {
                        void warmIndustryData(sub.id);
                      }}
                      onClick={() => {
                        void warmIndustryData(sub.id);
                        setActiveIndustry(sub.id);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm leading-snug rounded-lg transition-colors flex items-start justify-between gap-2 group break-words",
                        activeTab === 'industry' && activeIndustry === sub.id
                          ? "bg-action-accent text-slate-950 font-semibold shadow-md shadow-cyan-500/20"
                          : "text-text-muted hover:text-text-highlight hover:bg-surface-container-low"
                      )}
                    >
                      <span className="min-w-0">{sub.label}</span>
                      {activeTab === 'industry' && activeIndustry === sub.id && (
                        <ChevronRight className="mt-1 h-3 w-3 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {isOpen && item.id === 'filter' && isFilterOpen && (
                <div className="mt-1 ml-6 lg:ml-9 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {[
                    { id: 'issuer' as const, label: t('filterByIssuer') },
                    { id: 'bonds' as const, label: t('filterByBond') },
                  ].map((sub) => {
                    const isActive = activeTab === 'filter' && activeFilterSubTab === sub.id;

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          warmDashboardCoreDataInBackground();
                          setActiveFilterSubTab(sub.id);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2 text-sm leading-snug rounded-lg transition-colors flex items-start justify-between gap-2 group break-words",
                          isActive
                            ? "bg-action-accent text-slate-950 font-semibold shadow-md shadow-cyan-500/20"
                            : "text-text-muted hover:text-text-highlight hover:bg-surface-container-low"
                        )}
                      >
                        <span className="min-w-0">{sub.label}</span>
                        {isActive && (
                          <ChevronRight className="mt-1 h-3 w-3 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
