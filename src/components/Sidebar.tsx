import { LayoutDashboard, Building2, Briefcase, ChevronDown, ChevronRight, PanelLeft, Calendar } from 'lucide-react';
import { useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';

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
  const { t, language } = useLanguage();

  const menuItems = [
    { id: 'overview', label: t('overview'), icon: LayoutDashboard },
    { id: 'industry', label: t('industry'), icon: Building2, hasSubmenu: true },
    { id: 'enterprise', label: t('enterprise'), icon: Briefcase },
  ];

  const subIndustries = [
    { id: 'Banking', label: t('Banking') },
    { id: 'Securities', label: t('Securities') },
    { id: 'RealEstate', label: t('RealEstate') },
  ];

  return (
    <aside className="w-full bg-bg-surface md:border-r border-border-base flex flex-col h-auto md:h-full overflow-hidden transition-colors duration-300">
      <div className={cn("p-3 md:p-6 transition-all duration-300 shrink-0", isOpen ? "w-full md:w-80" : "w-full md:w-[64px] md:px-3")}>
        <div className={cn("flex items-center mb-3 md:mb-8", isOpen ? "justify-end" : "justify-center")}>
          <button 
            onClick={onToggle}
            className="p-2 text-gray-400 hover:text-text-highlight hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
            title={isOpen ? t('hideSidebar') : t('showSidebar')}
          >
            <PanelLeft className={cn("h-5 w-5 transition-transform duration-300", !isOpen && "rotate-180")} />
          </button>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (!isOpen) {
                    onToggle();
                    return;
                  }
                  if (item.hasSubmenu) {
                    setIsIndustryOpen(!isIndustryOpen);
                  } else if (item.id === 'enterprise') {
                    onEnterpriseTabClick();
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={cn(
                  "w-full flex items-center rounded-xl transition-all duration-200 group",
                  isOpen ? "px-3 py-2.5 md:px-4 md:py-3 justify-between" : "p-3 justify-center",
                  activeTab === item.id && !item.hasSubmenu
                    ? "bg-[#3634B3]/5 text-text-highlight"
                    : "text-text-muted hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-text-highlight"
                )}
                title={!isOpen ? item.label : undefined}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <item.icon className={cn("h-5 w-5 transition-colors shrink-0", activeTab === item.id && !item.hasSubmenu ? "text-text-highlight" : "text-gray-400 group-hover:text-text-highlight")} />
                  {isOpen && <span className={cn("text-sm transition-all animate-in fade-in duration-300 truncate", activeTab === item.id && !item.hasSubmenu ? "font-bold" : "font-medium")}>{item.label}</span>}
                </div>
                {isOpen && item.hasSubmenu && (
                  isIndustryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                )}
                {isOpen && !item.hasSubmenu && activeTab === item.id && (
                  <ChevronRight className="h-4 w-4 animate-in slide-in-from-left-2 duration-300" />
                )}
              </button>

              {isOpen && item.hasSubmenu && isIndustryOpen && (
                <div className="mt-1 ml-6 md:ml-9 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {subIndustries.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        setActiveIndustry(sub.id);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-between group whitespace-nowrap",
                        activeTab === 'industry' && activeIndustry === sub.id
                          ? "text-text-highlight font-bold bg-[#3634B3]/5"
                          : "text-text-muted hover:text-text-highlight hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                    >
                      {sub.label}
                      {activeTab === 'industry' && activeIndustry === sub.id && (
                        <ChevronRight className="h-3 w-3" />
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