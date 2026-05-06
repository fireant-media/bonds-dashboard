import { 
  BookOpen, 
  HelpCircle, 
  AlertTriangle, 
  Headphones, 
  ChevronRight, 
  Play, 
  FileText, 
  Search, 
  Filter, 
  BarChart2, 
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import SentinelFooter from './SentinelFooter';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type HelpTab = 'manual' | 'faq' | 'report' | 'contact';

interface HelpViewProps {
  onBack?: () => void;
}

export default function HelpView({ onBack }: HelpViewProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [activeTab, setActiveTab] = useState<HelpTab>('manual');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  const tabs = [
    { id: 'manual', label: t('supportManual'), icon: BookOpen },
    { id: 'faq', label: t('faqTitle'), icon: HelpCircle },
    { id: 'report', label: t('systemReport'), icon: AlertTriangle },
    { id: 'contact', label: t('contactSupport'), icon: Headphones },
  ];

  return (
    <div className="flex bg-bg-base h-full overflow-hidden transition-colors">
      {/* Sidebar */}
      <div className="w-80 bg-bg-surface border-r border-border-base flex flex-col pt-10 pb-10 px-4 shrink-0 transition-colors">
        <div className="mb-12 px-6">
          <h2 className="text-xl font-bold text-[#3634B3] tracking-tight transition-colors">{t('helpCenter')}</h2>
          <p className="text-sm text-text-muted mt-1 font-medium transition-colors">{t('helpSubtitle')}</p>
        </div>

        <nav className="flex-1 space-y-2 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as HelpTab)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all text-left group",
                  isActive 
                    ? "bg-[#3634B3]/5 text-[#3634B3]" 
                    : "text-text-muted hover:bg-bg-base"
                )}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Icon className={cn("h-5 w-5 transition-colors shrink-0", isActive ? "text-[#3634B3]" : "text-text-muted group-hover:text-text-base")} />
                  <span className={cn("text-sm tracking-tight transition-colors whitespace-nowrap", isActive ? "text-[#3634B3] font-bold" : "text-text-muted font-medium group-hover:text-text-base")}>
                    {tab.label}
                  </span>
                </div>
                {isActive && <ChevronRight className="h-4 w-4 ml-auto text-[#3634B3]" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 custom-scrollbar transition-colors">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'manual' && <UserManualView />}
          {activeTab === 'faq' && <FAQView />}
          {activeTab === 'report' && <ErrorReportView />}
          {activeTab === 'contact' && <ContactSupportView />}

          <SentinelFooter />
        </div>
      </div>
    </div>
  );
}

function UserManualView() {
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);
  const { t, language } = useLanguage();

  const guides = [
    {
      id: "market",
      title: t('marketFluctuationTitle'),
      description: t('marketFluctuationDesc'),
      icon: BarChart2,
      color: "bg-[#3634B3]/5 text-[#3634B3]",
      content: {
        intro: t('manualIntroMarket'),
        steps: [
          { 
            title: t('manualStepHeatmapTitle'), 
            detail: t('manualStepHeatmapDetail') 
          },
          { 
            title: t('manualStepYieldTitle'), 
            detail: t('manualStepYieldDetail')
          },
          { 
            title: t('manualStepTopDebtTitle'), 
            detail: t('manualStepTopDebtDetail')
          }
        ]
      }
    },
    {
      id: "bond-data",
      title: t('bondDataTitle'),
      description: t('bondDataDesc'),
      icon: Search,
      color: "bg-[#3634B3]/5 text-[#3634B3]",
      content: {
        intro: t('manualIntroBondData'),
        steps: [
          { 
            title: t('manualStepSearchTitle'), 
            detail: t('manualStepSearchDetail')
          },
          { 
            title: t('manualStepBasicInfoTitle'), 
            detail: t('manualStepBasicInfoDetail')
          },
          { 
            title: t('manualStepBondPackageTitle'), 
            detail: t('manualStepBondPackageDetail')
          }
        ]
      }
    },
    {
      id: "filtering",
      title: t('enterpriseFilterTitle'),
      description: t('enterpriseFilterDesc'),
      icon: Filter,
      color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
      content: {
        intro: t('manualIntroFiltering'),
        steps: [
          { 
            title: t('manualStepFilterIndustryTitle'), 
            detail: t('manualStepFilterIndustryDetail')
          },
          { 
            title: t('manualStepFilterDebtTitle'), 
            detail: t('manualStepFilterDebtDetail')
          },
          { 
            title: t('manualStepMaturityTitle'), 
            detail: t('manualStepMaturityDetail')
          }
        ]
      }
    },
    {
      id: "alerts",
      title: t('newsAlertsTitle'),
      description: t('newsAlertsDesc'),
      icon: FileText,
      color: "bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400",
      content: {
        intro: t('manualIntroAlerts'),
        steps: [
          { 
            title: t('manualStepNewsBoardTitle'), 
            detail: t('manualStepNewsBoardDetail')
          },
          { 
            title: t('manualStepMaturityAlertTitle'), 
            detail: t('manualStepMaturityAlertDetail')
          },
          { 
            title: t('manualStepNewsDetailTitle'), 
            detail: t('manualStepNewsDetailDetail')
          }
        ]
      }
    }
  ];

  if (selectedGuide) {
    const guide = guides.find(g => g.id === selectedGuide);
    if (guide) {
      return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500 transition-colors">
          <button 
            onClick={() => setSelectedGuide(null)}
            className="flex items-center gap-2 text-sm font-bold text-text-muted hover:text-[#3634B3] mb-8 transition-colors group"
          >
            <ArrowRight className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1" /> {t('backToGuides')}
          </button>
          
          <div className="mb-12">
            <h1 className="text-2xl font-bold text-text-base tracking-tight mb-4 transition-colors">{guide.title}</h1>
            <p className="text-base text-text-muted font-medium leading-relaxed max-w-3xl transition-colors">
              {guide.content.intro}
            </p>
          </div>

          <div className="space-y-8 mb-12">
            {guide.content.steps.map((step, idx) => (
              <div key={idx} className="bg-bg-surface p-8 rounded-3xl border border-border-base shadow-sm flex gap-6 items-start transition-colors">
                <div className="h-9 w-9 rounded-full bg-[#3634B3] text-white flex items-center justify-center font-bold text-base shrink-0 transition-colors">
                  {idx + 1}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-text-base mb-2 transition-colors">{step.title}</h4>
                  <p className="text-sm text-text-muted leading-relaxed font-medium transition-colors">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-8 bg-[#3634B3]/5 rounded-3xl border border-[#3634B3]/10 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <Play className="h-5 w-5 text-[#3634B3] fill-[#3634B3]" />
              <h4 className="font-bold text-[#3634B3] transition-colors">{t('watchIllustrationVideoLabel')}</h4>
            </div>
            <p className="text-sm text-text-muted mb-6 transition-colors">
              {t('videoInstructionDetail').replace('{title}', guide.title)}
            </p>
            <button className="px-6 py-3 bg-[#3634B3] text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all">
              {t('startWatchingVideo')}
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <div className="mb-12">
        <h1 className="text-2xl font-bold text-text-base tracking-tight mb-4 transition-colors">{t('supportManual')}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {guides.map((guide, i) => (
          <div 
            key={i} 
            onClick={() => setSelectedGuide(guide.id)}
            className="bg-bg-surface p-8 rounded-2xl border border-border-base shadow-sm hover:shadow-md transition-all group cursor-pointer"
          >
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 transition-colors", guide.color)}>
              <guide.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-text-base mb-3 group-hover:text-[#3634B3] transition-colors">{guide.title}</h3>
            <p className="text-sm text-text-muted leading-relaxed mb-6 transition-colors">
              {guide.description}
            </p>
            <button className="flex items-center gap-2 text-sm font-bold text-[#3634B3] hover:gap-3 transition-all">
              {t('seeMore')} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Video Section */}
      <div className="rounded-3xl overflow-hidden bg-[#3634B3] relative group shadow-2xl shadow-[#3634B3]/20 flex flex-col md:flex-row h-[400px] transition-colors">
        <div className="p-10 md:w-1/2 flex flex-col justify-center relative z-10">
          <span className="text-[10px] font-black tracking-[0.2em] text-white/50 uppercase mb-4 transition-colors">{t('videoInstruction')}</span>
          <h2 className="text-3xl font-bold text-white mb-6 leading-tight transition-colors">{t('gettingStartedVideoTitle')}</h2>
          <p className="text-white/70 text-sm mb-8 leading-relaxed font-medium transition-colors">
            {t('gettingStartedVideoDesc')}
          </p>
          <button className="flex items-center justify-center gap-3 bg-white text-[#3634B3] px-8 py-4 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all w-fit shadow-lg active:scale-95">
            <Play className="h-4 w-4 fill-current" /> {t('watchNow')}
          </button>
        </div>
        <div className="md:w-1/2 relative">
          <img 
            src="https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=2070&auto=format&fit=crop" 
            alt="Dashboard Preview" 
            className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#3634B3] to-transparent transition-colors"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                <Play className="h-8 w-8 text-white fill-current ml-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQView() {
  const { language, t } = useLanguage();
  const faqs = [
    {
      q: t('faqQ1'),
      a: t('faqA1')
    },
    {
      q: t('faqQ2'),
      a: t('faqA2')
    },
    {
      q: t('faqQ3'),
      a: t('faqA3')
    },
    {
      q: t('faqQ4'),
      a: t('faqA4')
    }
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <div className="mb-12">
        <h1 className="text-2xl font-bold text-text-base tracking-tight mb-4 transition-colors">{t('faqTitle')}</h1>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, i) => (
          <div key={i} className="bg-bg-surface rounded-2xl border border-border-base p-6 hover:border-[#3634B3]/30 transition-colors cursor-pointer group">
            <h4 className="font-bold text-text-base flex items-center gap-3 mb-3 group-hover:text-[#3634B3] transition-colors">
              <span className="h-6 w-6 rounded-lg bg-[#3634B3]/10 text-[#3634B3] flex items-center justify-center text-[10px] shrink-0 transition-colors">Q</span>
              {faq.q}
            </h4>
            <p className="text-sm text-text-muted leading-relaxed pl-9 transition-colors">
              {faq.a}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 p-8 bg-[#3634B3]/5 rounded-3xl border border-[#3634B3]/10 flex items-center justify-between transition-colors">
        <div>
          <h4 className="font-bold text-[#3634B3] mb-1 transition-colors">{t('noAnswerFound')}</h4>
          <p className="text-sm text-[#3634B3]/80 transition-colors">{t('technicalSupport247')}</p>
        </div>
        <button className="px-6 py-3 bg-[#3634B3] text-white text-xs font-bold rounded-xl uppercase tracking-widest hover:opacity-90 transition-all">
          {t('sendNewRequest')}
        </button>
      </div>
    </div>
  );
}

function ErrorReportView() {
  const { t, language } = useLanguage();
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <div className="mb-12">
        <h1 className="text-2xl font-bold text-text-base tracking-tight mb-4 transition-colors">{t('systemReport')}</h1>
      </div>

      <div className="bg-bg-surface rounded-2xl border border-border-base p-8 shadow-sm max-w-2xl transition-colors">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('errorType')}</label>
            <select className="w-full px-4 py-3 bg-bg-base border border-border-base rounded-xl text-sm text-text-base focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 transition-colors outline-none cursor-pointer">
              <option>{t('errorTypeData')}</option>
              <option>{t('errorTypePerf')}</option>
              <option>{t('errorTypeSecurity')}</option>
              <option>{t('errorTypeFeature')}</option>
              <option>{t('errorTypeOther')}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('errorTitle')}</label>
            <input type="text" placeholder={t('errorTitlePlaceholder')} className="w-full px-4 py-3 bg-bg-base border border-border-base rounded-xl text-sm text-text-base focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 transition-colors outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('errorDescription')}</label>
            <textarea rows={5} placeholder={t('errorDescPlaceholder')} className="w-full px-4 py-3 bg-bg-base border border-border-base rounded-xl text-sm text-text-base focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 transition-colors outline-none resize-none"></textarea>
          </div>
          <div className="p-10 border-2 border-dashed border-border-base rounded-2xl flex flex-col items-center justify-center gap-3 bg-bg-base/50 hover:bg-bg-base transition-colors cursor-pointer group">
              <div className="h-10 w-10 rounded-full bg-[#3634B3]/10 flex items-center justify-center text-[#3634B3] group-hover:scale-110 transition-transform transition-colors">
                  <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-text-muted transition-colors">{t('uploadScreenshot')}</p>
              <p className="text-[10px] text-text-muted/60 transition-colors">{t('uploadFormatHint')}</p>
          </div>
          <button className="w-full py-4 bg-[#3634B3] text-white font-bold rounded-xl shadow-lg shadow-[#3634B3]/20 hover:opacity-90 transition-all uppercase tracking-[0.2em] text-xs">
            {t('sendReport')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactSupportView() {
  const { t } = useLanguage();
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <div className="mb-12">
        <h1 className="text-2xl font-bold text-text-base tracking-tight mb-4 transition-colors">{t('contactSupport')}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-bg-surface p-8 rounded-2xl border border-border-base shadow-sm flex flex-col items-center text-center group transition-colors">
          <div className="h-14 w-14 rounded-full bg-[#3634B3]/5 text-[#3634B3] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform transition-colors">
            <Headphones className="h-6 w-6" />
          </div>
          <h4 className="font-bold text-text-base mb-2 transition-colors">{t('supportHotline')}</h4>
          <p className="text-sm text-text-muted mb-4 transition-colors">{t('supportHours')}</p>
          <p className="text-lg font-black text-[#3634B3] tracking-tight transition-colors">1900 6000</p>
        </div>

        <div className="bg-bg-surface p-8 rounded-2xl border border-border-base shadow-sm flex flex-col items-center text-center group transition-colors">
          <div className="h-14 w-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform transition-colors">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h4 className="font-bold text-text-base mb-2 transition-colors">{t('onlineSupport')}</h4>
          <p className="text-sm text-text-muted mb-4 transition-colors">{t('chatWithSpecialist')}</p>
          <button className="px-6 py-2 bg-emerald-600 dark:bg-emerald-700 text-white text-xs font-bold rounded-lg uppercase tracking-wider hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-all">
            {t('connectNow')}
          </button>
        </div>

        <div className="bg-bg-surface p-8 rounded-2xl border border-border-base shadow-sm flex flex-col items-center text-center group transition-colors">
          <div className="h-14 w-14 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform transition-colors">
            <HelpCircle className="h-6 w-6" />
          </div>
          <h4 className="font-bold text-text-base mb-2 transition-colors">{t('supportEmail')}</h4>
          <p className="text-sm text-text-muted mb-4 transition-colors">{t('responseWithin24h')}</p>
          <p className="text-sm font-bold text-[#3634B3] hover:underline cursor-pointer transition-colors">support@sentinel.vn</p>
        </div>
      </div>

    </div>
  );
}