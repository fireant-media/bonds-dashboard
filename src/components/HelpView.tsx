import { 
  ChevronRight,
  HelpCircle, 
  AlertTriangle, 
  Headphones, 
  FileText, 
  Search, 
  Filter, 
  BarChart2, 
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type HelpTab = 'manual' | 'faq' | 'report' | 'contact';

interface HelpViewProps {
  section: HelpTab;
}

export default function HelpView({ section }: HelpViewProps) {
  return (
    <div className="bg-bg-base px-4 py-6 transition-colors sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-5xl">
        {section === 'manual' && <UserManualView />}
        {section === 'faq' && <FAQView />}
        {section === 'report' && <ErrorReportView />}
        {section === 'contact' && <ContactSupportView />}
      </div>
    </div>
  );
}

function UserManualView() {
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);
  const { t } = useLanguage();

  const guides = [
    {
      id: "market",
      title: t('marketFluctuationTitle'),
      description: t('marketFluctuationDesc'),
      icon: BarChart2,
      color: "bg-blue-600/10 text-blue-600",
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
      color: "bg-blue-600/10 text-blue-600",
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
            className="flex items-center gap-2 text-sm font-bold text-text-muted hover:text-blue-600 mb-8 transition-colors group"
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
                <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shrink-0 transition-colors">
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
            <h3 className="text-lg font-bold text-text-base mb-3 group-hover:text-blue-600 transition-colors">{guide.title}</h3>
            <p className="text-sm text-text-muted leading-relaxed mb-6 transition-colors">
              {guide.description}
            </p>
            <button className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:gap-3 transition-all">
              {t('seeMore')} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQView() {
  const { t } = useLanguage();
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
          <div key={i} className="group cursor-pointer rounded-2xl border border-border-base bg-bg-surface p-5 transition-colors hover:border-blue-600/30 sm:p-6">
            <h4 className="mb-3 flex items-center gap-3 font-bold text-text-base transition-colors group-hover:text-blue-600">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-[10px] text-blue-600 transition-colors">Q</span>
              {faq.q}
            </h4>
            <p className="text-sm text-text-muted leading-relaxed pl-9 transition-colors">
              {faq.a}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-4 rounded-3xl border border-blue-600/10 bg-blue-600/10 p-6 transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h4 className="mb-1 font-bold text-blue-600 transition-colors">{t('noAnswerFound')}</h4>
          <p className="text-sm text-blue-600/80 transition-colors">{t('technicalSupport247')}</p>
        </div>
        <button className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-blue-700">
          {t('sendNewRequest')}
        </button>
      </div>
    </div>
  );
}

function ErrorReportView() {
  const { t } = useLanguage();
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 transition-transform transition-colors group-hover:scale-110">
                  <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-text-muted transition-colors">{t('uploadScreenshot')}</p>
              <p className="text-[10px] text-text-muted/60 transition-colors">{t('uploadFormatHint')}</p>
          </div>
          <button className="w-full rounded-xl bg-blue-600 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700">
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
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 transition-transform transition-colors group-hover:scale-110">
            <Headphones className="h-6 w-6" />
          </div>
          <h4 className="font-bold text-text-base mb-2 transition-colors">{t('supportHotline')}</h4>
          <p className="text-sm text-text-muted mb-4 transition-colors">{t('supportHours')}</p>
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
        </div>
      </div>

    </div>
  );
}
