import { LayoutDashboard, Building2, Briefcase, Bookmark, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';
import { warmDashboardCoreDataInBackground, warmIndustryData } from '../services/dashboardPrefetch';
import { fireantApi } from '../api/fireant';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeIndustry: string;
  setActiveIndustry: (industry: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onEnterpriseTabClick: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeIndustry,
  setActiveIndustry,
  isOpen,
  onToggle,
  onEnterpriseTabClick
}: SidebarProps) {
  const [isIndustryOpen, setIsIndustryOpen] = useState(false);
  const [industryIssuedValues, setIndustryIssuedValues] = useState<Record<string, number> | null>(
    () => getCache('sidebar_industry_issued_values_v2')
  );
  const { t } = useLanguage();

  const menuItems = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'industry', label: t('industry'), icon: Building2, hasSubmenu: true },
    { id: 'enterprise', label: t('enterprise'), icon: Briefcase },
    { id: 'watchlist', label: t('watchList'), icon: Bookmark },
  ];

  useEffect(() => {
    let isMounted = true;

    const loadIndustryIssuedValues = async () => {
      const cached = getCache('sidebar_industry_issued_values_v2');
      if (cached && Object.keys(cached).length > 0) {
        setIndustryIssuedValues(cached);
        return;
      }

      try {
        const [level1Rows, level2Rows, level4Rows] = await Promise.all([
          fireantApi.getIndustries(1000, 1).catch(() => []),
          fireantApi.getIndustries(1000, 2).catch(() => []),
          fireantApi.getIndustries(1000, 4).catch(() => []),
        ]);
        const statsByCode = new Map<string, any>();

        [...level1Rows, ...level2Rows, ...level4Rows].forEach((row: any) => {
          const code = String(row?.icbCode || '').trim();
          if (code && !statsByCode.has(code)) statsByCode.set(code, row);
        });

        const nextIssuedValues = INDUSTRY_NAV_ITEMS.reduce<Record<string, number>>((acc, item) => {
          const stats = statsByCode.get(item.code);
          let issuedValue = Number(stats?.totalIssuedValue || 0);

          if (item.id === 'Financials') {
            issuedValue = Math.max(
              0,
              issuedValue
                - Number(statsByCode.get('3010')?.totalIssuedValue || 0)
                - Number(statsByCode.get('30202005')?.totalIssuedValue || 0)
            );
          }

          const bondCount = Number(stats?.bondCount || 0);

          if (bondCount > 0 && issuedValue > 0) {
            acc[item.id] = issuedValue;
          }
          return acc;
        }, {});

        if (Object.keys(nextIssuedValues).length > 0) {
          setCache('sidebar_industry_issued_values_v2', nextIssuedValues);
        }
        if (isMounted) setIndustryIssuedValues(nextIssuedValues);
      } catch (error) {
        console.error('Failed to load sidebar industry order', error);
      }
    };

    loadIndustryIssuedValues();

    return () => {
      isMounted = false;
    };
  }, []);

  const subIndustries = useMemo(() => {
    const items = INDUSTRY_NAV_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey as any),
      issuedValue: industryIssuedValues?.[item.id],
    }));

    if (!industryIssuedValues || Object.keys(industryIssuedValues).length === 0) return items;

    const visibleItems = items.filter((item) => typeof item.issuedValue === 'number');
    return visibleItems.length > 0
      ? visibleItems.sort((a, b) => (b.issuedValue || 0) - (a.issuedValue || 0))
      : items;
  }, [industryIssuedValues, t]);

  return (
    <aside className="w-full bg-surface-bright/95 lg:border-r border-border-base flex flex-col h-full overflow-hidden transition-colors duration-300">
      <div className={cn("min-h-0 overflow-y-auto p-3 lg:p-4 transition-all duration-300", isOpen ? "w-full lg:w-64" : "w-full lg:w-14 lg:px-2")}>
        <nav className={cn(isOpen ? "space-y-1" : "flex justify-center gap-2 lg:block lg:space-y-1")}>
          {menuItems.map((item) => (
            <div key={item.id}>
              <button
                onMouseEnter={() => {
                  if (item.id === 'overview' || item.id === 'enterprise') {
                    warmDashboardCoreDataInBackground();
                  }
                }}
                onClick={() => {
                  if (item.hasSubmenu) {
                    if (!isOpen) {
                      onToggle();
                      setIsIndustryOpen(true);
                      setActiveTab('industry');
                      return;
                    }
                    setIsIndustryOpen(!isIndustryOpen);
                  } else if (item.id === 'enterprise') {
                    if (activeTab === item.id && isOpen) {
                      onToggle();
                      return;
                    }
                    if (!isOpen) onToggle();
                    onEnterpriseTabClick();
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
                  isIndustryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                )}
                {isOpen && !item.hasSubmenu && activeTab === item.id && (
                  <ChevronRight className="h-4 w-4 animate-in slide-in-from-left-2 duration-300" />
                )}
              </button>

              {isOpen && item.hasSubmenu && isIndustryOpen && (
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
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
