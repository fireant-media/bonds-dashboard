import { Building2, ChevronDown, ChevronRight, LayoutDashboard, UserCircle } from 'lucide-react';
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
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeIndustry,
  setActiveIndustry,
  activeFilterSubTab,
  setActiveFilterSubTab,
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
    <aside className="hidden h-full min-h-0 w-72 shrink-0 border-r border-border-base bg-surface-bright/95 md:flex">
      <div className="min-h-0 flex-1 overflow-hidden p-3 lg:p-4">
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
                      setActiveTab('industry');
                      setIsIndustryOpen((current) => !current);
                      return;
                    }
                    setActiveFilterSubTab('issuer');
                  }}
                  className={cn(
                    'w-full flex items-center rounded-lg px-3 py-2.5 transition-colors',
                    isActive ? 'text-blue-600' : 'text-text-muted hover:text-blue-600'
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate text-sm font-semibold">{item.label}</span>
                  </span>
                  {item.hasSubmenu ? (
                    isIndustryOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
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
                              ? 'text-blue-600'
                              : 'text-text-muted hover:text-blue-600'
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
        </nav>
      </div>
    </aside>
  );
}
