import { Bell, Palette, Key, ShieldCheck, Info, Save, Trash2, AlertCircle, CheckCircle2, RefreshCw, Loader2, ChevronDown, Fingerprint, Timer, Zap, Scale, Shield, ChevronRight, Mail, HelpCircle, Sun, Moon, Monitor, Sparkles, Server } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getFireantToken, setFireantToken, removeFireantToken, cleanTokenString } from '../utils/token';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { Language } from '../translations';
import SentinelFooter from './SentinelFooter';
import { useAIStore } from '../store/aiStore';
import { sendChat } from '../api/ai';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SettingsTab = 'notifications' | 'interface' | 'token' | 'aiKey' | 'security' | 'about';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('notifications');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  const { t } = useLanguage();
  const menuItems = [
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'interface', label: t('interface'), icon: Palette },
    { id: 'token', label: t('token'), icon: Key },
    { id: 'aiKey', label: t('aiKey'), icon: Zap },
    { id: 'security', label: t('security'), icon: ShieldCheck },
    { id: 'about', label: t('about'), icon: Info },
  ];

  return (
    <div className="flex flex-col md:flex-row bg-bg-base h-full overflow-hidden transition-colors">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-bg-surface border-b md:border-b-0 md:border-r border-border-base flex flex-col pt-4 md:pt-10 pb-4 md:pb-10 px-3 md:px-4 shrink-0 shadow-sm transition-colors">
        <div className="mb-4 md:mb-12 px-3 md:px-6">
          <h2 className="text-xl font-bold text-text-highlight tracking-tight transition-colors">{t('settings')}</h2>
          <p className="text-sm text-text-muted mt-1 font-medium transition-colors">{t('manageAccount')}</p>
        </div>

        <nav className="flex-1 grid grid-cols-3 sm:grid-cols-6 md:block md:space-y-4 gap-2 md:px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  "w-full flex items-center justify-center md:justify-between gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 rounded-xl transition-all text-left group",
                  isActive 
                    ? "bg-text-highlight/5 text-text-highlight" 
                    : "text-text-muted hover:bg-bg-base"
                )}
              >
                <div className="flex items-center justify-center md:justify-start gap-2 md:gap-4 flex-1 min-w-0">
                  <Icon className={cn("h-5 w-5 transition-colors shrink-0", isActive ? "text-text-highlight" : "text-gray-400 group-hover:text-text-muted")} />
                  <span className={cn("hidden md:inline text-sm tracking-tight transition-colors truncate", isActive ? "text-text-highlight font-bold" : "text-text-muted font-medium group-hover:text-text-base")}>
                    {item.label}
                  </span>
                </div>
                {isActive && <ChevronRight className="hidden md:block h-4 w-4 text-text-highlight animate-in slide-in-from-left-2 duration-300" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar transition-colors">
        <div className="max-w-5xl min-w-0">
          {activeTab === 'notifications' && <NotificationSettings />}
          {activeTab === 'interface' && <InterfaceSettings />}
          {activeTab === 'token' && <TokenSettings />}
          {activeTab === 'aiKey' && <AIModelSettings />}
          {activeTab === 'security' && <AppSecuritySettings />}
          {activeTab === 'about' && <AboutSettings />}
          
          <SentinelFooter />
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const { t, language } = useLanguage();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [dndDuration, setDndDuration] = useState(60); // minutes
  const [dndTimeRange, setDndTimeRange] = useState('22:00 - 07:00');

  const durationOptions = [
    { label: t('duration30m'), value: 30 },
    { label: t('duration1h'), value: 60 },
    { label: t('duration2h'), value: 120 },
    { label: t('duration4h'), value: 240 },
    { label: t('duration8h'), value: 480 },
  ];

  const generateRanges = (minutes: number) => {
    const ranges = [];
    let current = 0;
    while (current < 24 * 60) {
      const startH = Math.floor(current / 60);
      const startM = current % 60;
      const endTotal = current + minutes;
      const endH = Math.floor(endTotal / 60) % 24;
      const endM = endTotal % 60;
      
      ranges.push(
        `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')} - ${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
      );
      current += minutes;
    }
    return ranges;
  };

  const timeRanges = generateRanges(dndDuration);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('notifications')}</h1>

      <div className="space-y-6">
        {/* Push Notifications Card */}
        <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('pushNotificationsTitle')}</h3>
              <p className="text-sm text-text-muted transition-colors leading-relaxed">{t('pushNotificationsDesc')}</p>
            </div>
            <button 
              onClick={() => setPushEnabled(!pushEnabled)}
              className={cn(
                "w-14 h-7 rounded-full relative p-1 transition-all duration-300",
                pushEnabled ? "bg-text-highlight" : "bg-bg-base"
              )}
            >
              <div className={cn(
                "h-5 w-5 bg-white rounded-full shadow-sm transition-transform duration-300",
                pushEnabled ? "translate-x-7" : "translate-x-0"
              )}></div>
            </button>
          </div>
        </div>

        {/* Email Notifications Card */}
        <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('emailNotificationsTitle')}</h3>
              <p className="text-sm text-text-muted transition-colors leading-relaxed">{t('emailNotificationsDesc')}</p>
            </div>
            <button 
              onClick={() => setEmailEnabled(!emailEnabled)}
              className={cn(
                "w-14 h-7 rounded-full relative p-1 transition-all duration-300",
                emailEnabled ? "bg-text-highlight" : "bg-bg-base"
              )}
            >
              <div className={cn(
                "h-5 w-5 bg-white rounded-full shadow-sm transition-transform duration-300",
                emailEnabled ? "translate-x-7" : "translate-x-0"
              )}></div>
            </button>
          </div>
        </div>

        {/* Do Not Disturb Card */}
        <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
          <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('dndTitleTotal')}</h3>
          <p className="text-sm text-text-muted mb-8 transition-colors leading-relaxed">{t('dndSubtitle')}</p>
          
          <div className="flex flex-col md:flex-row gap-4 max-w-2xl">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('duration')}</label>
              <div className="relative text-text-base">
                <select 
                  value={dndDuration}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setDndDuration(val);
                    setDndTimeRange(generateRanges(val)[0]);
                  }}
                  className="w-full h-12 bg-bg-base border border-border-base rounded-xl px-4 text-sm font-bold text-text-base appearance-none focus:ring-2 focus:ring-text-highlight/20 focus:border-text-highlight cursor-pointer transition-colors"
                >
                  {durationOptions.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-bg-surface">{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('timeRange')}</label>
              <div className="relative text-text-base">
                <select 
                  value={dndTimeRange}
                  onChange={(e) => setDndTimeRange(e.target.value)}
                  className="w-full h-12 bg-bg-base border border-border-base rounded-xl px-4 text-sm font-bold text-text-base appearance-none focus:ring-2 focus:ring-text-highlight/20 focus:border-text-highlight cursor-pointer transition-colors"
                >
                  {timeRanges.map(range => (
                    <option key={range} value={range} className="bg-bg-surface">{range}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InterfaceSettings() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [fontSize, setFontSize] = useState(50); // 0: Small, 50: Medium, 100: Large
  const [density, setDensity] = useState<'spacious' | 'standard' | 'compact'>('standard');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('interface')}</h1>

      <div className="space-y-6">
        {/* Theme Selection */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xs transition-colors">
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('themeMode')}</h3>
              <p className="text-sm text-text-muted leading-relaxed transition-colors">{t('themeDescription')}</p>
            </div>
            
            <div className="flex flex-wrap items-start gap-4 md:gap-6">
              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={() => setTheme('light')}
                  className={cn(
                    "w-28 md:w-32 h-20 rounded-lg border-2 transition-all overflow-hidden bg-white relative",
                    theme === 'light' ? "border-text-highlight shadow-md" : "border-border-base hover:border-text-highlight/30"
                  )}
                >
                  <div className="absolute top-2 left-2 right-2 h-2 bg-gray-100 rounded-sm"></div>
                  <div className="absolute top-6 left-2 right-6 h-10 bg-gray-50 rounded-sm"></div>
                </button>
                <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest", theme === 'light' ? "text-text-highlight" : "text-text-muted")}>
                  <Sun className="h-3.5 w-3.5" />
                  <span>{t('light')}</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={() => setTheme('dark')}
                  className={cn(
                    "w-28 md:w-32 h-20 rounded-lg border-2 transition-all overflow-hidden bg-[#101827] relative",
                    theme === 'dark' ? "border-text-highlight shadow-md" : "border-border-base hover:border-text-highlight/30"
                  )}
                >
                  <div className="absolute top-2 left-2 right-2 h-2 bg-gray-800 rounded-sm"></div>
                  <div className="absolute top-6 left-2 right-6 h-10 bg-gray-900 rounded-sm"></div>
                </button>
                <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest", theme === 'dark' ? "text-text-highlight" : "text-text-muted")}>
                  <Moon className="h-3.5 w-3.5" />
                  <span>{t('dark')}</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={() => setTheme('auto')}
                  className={cn(
                    "w-28 md:w-32 h-20 rounded-lg border-2 transition-all overflow-hidden relative",
                    theme === 'auto' ? "border-text-highlight shadow-md" : "border-border-base hover:border-text-highlight/30"
                  )}
                >
                  <div className="absolute inset-y-0 left-0 w-1/2 bg-white">
                    <div className="absolute top-2 left-2 right-2 h-2 bg-gray-100 rounded-sm"></div>
                    <div className="absolute top-6 left-2 right-2 h-10 bg-gray-50 rounded-sm"></div>
                  </div>
                  <div className="absolute inset-y-0 right-0 w-1/2 bg-[#101827]">
                    <div className="absolute top-2 left-2 right-2 h-2 bg-gray-800 rounded-sm"></div>
                    <div className="absolute top-6 left-2 right-2 h-10 bg-gray-900 rounded-sm"></div>
                  </div>
                </button>
                <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest", theme === 'auto' ? "text-text-highlight" : "text-text-muted")}>
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{t('auto')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Language Selection */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xs transition-colors">
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('uiLanguage')}</h3>
              <p className="text-sm text-text-muted leading-relaxed transition-colors">{t('langDescription')}</p>
            </div>
            
            <div className="relative w-full md:w-72">
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full h-12 bg-bg-base border-none rounded-xl px-6 text-sm font-bold text-text-base appearance-none focus:ring-0 cursor-pointer transition-colors"
                style={{ colorScheme: theme === 'auto' ? 'normal' : theme }}
              >
                <option value="vi" className="bg-bg-surface">{language === 'vi' ? 'Tiếng Việt' : 'Vietnamese'}</option>
                <option value="en" className="bg-bg-surface">{language === 'vi' ? 'Tiếng Anh' : 'English'}</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown className="h-4 w-4 text-text-muted" />
              </div>
            </div>
          </div>
        </div>

        {/* Font Size Selection */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xs transition-colors">
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('fontSize')}</h3>
              <p className="text-sm text-text-muted leading-relaxed transition-colors">{t('fontDescription')}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-12 flex-1 max-w-lg">
              <div className="flex-1 space-y-4">
                <div className="flex justify-between items-end mb-1">
                   <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{t('small')}</span>
                </div>
                <div className="relative h-6 flex items-center">
                  <div className="absolute w-full h-1 bg-border-base rounded-full"></div>
                  <div className="absolute h-1 bg-text-highlight rounded-full" style={{ width: `${fontSize}%` }}></div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="50"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer accent-text-highlight"
                  />
                  <div 
                    className="absolute h-4 w-4 bg-text-highlight rounded-full shadow-lg border-2 border-white pointer-events-none" 
                    style={{ left: `calc(${fontSize}% - 8px)` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  <span>{t('small')}</span>
                  <span className={cn(fontSize === 50 && "text-text-highlight")}>{t('medium')}</span>
                  <span>{t('large')}</span>
                </div>
              </div>

              <div className="text-right min-w-[100px]">
                <p className="text-lg font-bold text-text-highlight leading-tight uppercase tracking-tight">
                  {fontSize === 0 ? t('small') : fontSize === 50 ? t('medium') : t('large')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* UI Density Selection */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xs transition-colors">
              <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('uiDensity')}</h3>
              <p className="text-sm text-text-muted leading-relaxed transition-colors">{t('densityDescription')}</p>
            </div>
            
            <div className="bg-bg-base p-1.5 rounded-xl flex transition-colors border border-border-base">
              {[
                { id: 'spacious', label: t('spacious') },
                { id: 'standard', label: t('standard') },
                { id: 'compact', label: t('compact') }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setDensity(option.id as any)}
                  className={cn(
                    "px-8 py-2.5 rounded-lg text-xs font-bold transition-all uppercase tracking-widest",
                    density === option.id 
                      ? "bg-bg-surface text-text-highlight shadow-sm" 
                      : "text-text-muted hover:text-text-base"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenSettings() {
  const { t, language } = useLanguage();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'testing'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const currentToken = getFireantToken() || '';
    setToken(currentToken);
  }, []);

  const handleTest = async () => {
    if (!token.trim()) {
      setStatus('error');
      setMessage(t('enterTokenToTest'));
      return;
    }

    setStatus('testing');
    setMessage(t('testingConnection'));

    try {
      const cleanToken = cleanTokenString(token);
      const response = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=1', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${cleanToken}`
        }
      });

      if (response.ok) {
        setStatus('success');
        setMessage(t('connectionSuccess'));
      } else {
        setStatus('error');
        setMessage(t('connectionError').replace('{status}', response.status.toString()));
      }
    } catch (error) {
      setStatus('error');
      setMessage(t('unableConnectServer'));
    }
  };

  const handleSave = () => {
    if (!token.trim()) {
      setStatus('error');
      setMessage(t('enterTokenToSave'));
      return;
    }
    setFireantToken(token);
    setStatus('success');
    setMessage(t('savingTokenSuccess'));
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleDelete = () => {
    removeFireantToken();
    setToken('');
    setStatus('success');
    setMessage(t('tokenRemoved'));
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('tokenTitleSettings')}</h1>

      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 space-y-6 md:space-y-8 transition-colors">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">FIREANT ACCESS TOKEN</label>
            <button 
              onClick={handleTest}
              disabled={status === 'testing'}
              className="text-xs font-bold text-text-highlight hover:underline flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('testToken')}
            </button>
          </div>
          <textarea
            className="w-full h-40 p-4 bg-bg-base border border-border-base rounded-2xl text-sm font-mono text-text-base focus:ring-2 focus:ring-text-highlight/20 focus:border-text-highlight transition-all resize-none"
            placeholder={t('tokenPlaceholder')}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-[10px] text-text-muted transition-colors">
            {t('tokenHelp')}
          </p>
        </div>

        {status !== 'idle' && (
          <div className={cn(
            "p-6 rounded-2xl flex items-start gap-4",
            status === 'success' ? 'bg-green-50 text-green-700' : 
            status === 'testing' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
          )}>
            {status === 'success' ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : 
             status === 'testing' ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" /> : <AlertCircle className="h-6 w-6 shrink-0" />}
            <p className="text-sm font-bold">{message}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4">
          <button
            onClick={handleDelete}
            className="w-full sm:w-auto px-8 py-4 bg-bg-base text-text-muted rounded-xl text-sm font-bold hover:bg-rose-500/10 hover:text-rose-500 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4" /> {t('deleteTokenLabel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-8 py-4 bg-text-highlight text-white rounded-xl text-sm font-bold hover:opacity-90 shadow-lg shadow-text-highlight/20 transition-all flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" /> {t('saveTokenLabel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AIModelSettings() {
  const { t } = useLanguage();
  const {
    configured,
    baseUrl,
    defaultModel,
    defaultSystemPrompt,
    models,
    selectedModel,
    systemPrompt,
    isLoadingStatus,
    isLoadingModels,
    statusError,
    modelsError,
    refreshStatus,
    refreshModels,
    setSelectedModel,
    setSystemPrompt,
    resetSystemPrompt,
  } = useAIStore();

  const [draftPrompt, setDraftPrompt] = useState(systemPrompt);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'testing'>('idle');
  const [message, setMessage] = useState('');
  const [testReply, setTestReply] = useState<string>('');

  useEffect(() => {
    void refreshStatus();
    void refreshModels(false);
  }, [refreshStatus, refreshModels]);

  useEffect(() => {
    setDraftPrompt(systemPrompt);
  }, [systemPrompt]);

  const handleTest = async () => {
    if (!configured) {
      setStatus('error');
      setMessage(t('aiNotConfigured'));
      return;
    }
    setStatus('testing');
    setMessage(t('aiTesting'));
    setTestReply('');
    try {
      const res = await sendChat({
        userMessage: t('aiTestPrompt'),
        messages: [],
        model: selectedModel || defaultModel,
        systemPrompt: draftPrompt || defaultSystemPrompt,
      });
      setStatus('success');
      setMessage(t('aiTestSuccess').replace('{model}', res.model));
      setTestReply(res.text);
    } catch (err: any) {
      setStatus('error');
      const detail = err?.response?.data?.details || err?.response?.data?.error || err?.message || 'Unknown error';
      setMessage(`${t('aiTestFailed')}: ${detail}`);
    }
  };

  const handleSave = () => {
    setSystemPrompt(draftPrompt);
    setStatus('success');
    setMessage(t('aiPreferencesSaved'));
    setTimeout(() => setStatus('idle'), 3000);
  };

  const handleResetPrompt = () => {
    resetSystemPrompt();
    setDraftPrompt(defaultSystemPrompt);
  };

  const activeModelId = selectedModel || defaultModel;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-2 transition-colors">{t('aiModelTitle')}</h1>
      <p className="text-sm text-text-muted mb-8 leading-relaxed">{t('aiModelSubtitle')}</p>

      {/* Provider status */}
      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 mb-6 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
              configured ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500",
            )}>
              <Server className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-text-highlight mb-1 transition-colors">{t('aiProviderStatus')}</h3>
              <p className="text-sm text-text-muted leading-relaxed transition-colors">
                {isLoadingStatus
                  ? t('aiCheckingStatus')
                  : configured
                  ? t('aiConfiguredOk')
                  : t('aiNotConfigured')}
              </p>
              {statusError && (
                <p className="text-xs font-semibold text-rose-500 mt-1">{statusError}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => void refreshStatus()}
            className="px-4 py-2.5 rounded-xl bg-bg-base hover:bg-bg-base/70 text-xs font-bold text-text-base flex items-center gap-2 transition-colors"
          >
            {isLoadingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('refresh')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoTile label={t('aiProviderEndpoint')} value={baseUrl || '—'} />
          <InfoTile label={t('aiServerDefaultModel')} value={defaultModel || '—'} />
          <InfoTile
            label={t('aiKeyState')}
            value={configured ? t('aiKeyConfigured') : t('aiKeyMissing')}
            valueClassName={configured ? 'text-emerald-500' : 'text-rose-500'}
          />
        </div>

        <p className="text-xs text-text-muted/80 mt-6 leading-relaxed">
          {t('aiKeyServerOnly')}
        </p>
      </div>

      {/* Model picker */}
      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 mb-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-text-highlight mb-1 transition-colors">{t('aiModel')}</h3>
            <p className="text-sm text-text-muted leading-relaxed">{t('aiModelDescription')}</p>
          </div>
          <button
            onClick={() => void refreshModels(true)}
            className="text-xs font-bold text-text-highlight hover:underline flex items-center gap-2 transition-colors"
          >
            {isLoadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('aiRefreshModels')}
          </button>
        </div>

        {modelsError && !models.length && (
          <p className="text-xs font-semibold text-rose-500 mb-3">{modelsError}</p>
        )}

        <div className="relative text-text-base">
          <select
            value={activeModelId}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!models.length}
            className="w-full h-12 bg-bg-base border border-border-base rounded-xl px-4 text-sm font-bold text-text-base appearance-none focus:ring-2 focus:ring-text-highlight/20 focus:border-text-highlight cursor-pointer transition-colors disabled:opacity-60"
          >
            {models.length === 0 ? (
              <option value="" className="bg-bg-surface">{t('aiNoModels')}</option>
            ) : !activeModelId ? (
              <option value="" className="bg-bg-surface">{t('aiPickModel')}</option>
            ) : null}
            {models.map((m) => (
              <option key={m.id} value={m.id} className="bg-bg-surface">
                {(m.label || m.id) + (m.id === defaultModel ? ` · ${t('aiDefault')}` : '')}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* System prompt */}
      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 mb-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-text-highlight mb-1 flex items-center gap-2 transition-colors">
              <Sparkles className="h-4 w-4" /> {t('aiSystemPrompt')}
            </h3>
            <p className="text-sm text-text-muted leading-relaxed">{t('aiSystemPromptDesc')}</p>
          </div>
          <button
            onClick={handleResetPrompt}
            className="text-xs font-bold text-text-muted hover:text-text-highlight flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> {t('aiResetPrompt')}
          </button>
        </div>
        <textarea
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
          rows={8}
          className="w-full p-4 bg-bg-base border border-border-base rounded-2xl text-sm text-text-base focus:ring-2 focus:ring-text-highlight/20 focus:border-text-highlight transition-all resize-y leading-relaxed"
          placeholder={t('aiSystemPromptPlaceholder')}
        />
      </div>

      {/* Status banner */}
      {status !== 'idle' && (
        <div className={cn(
          "mb-6 p-6 rounded-2xl flex items-start gap-4 transition-colors",
          status === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
          status === 'testing' ? 'bg-blue-500/10 text-blue-500' : 'bg-rose-500/10 text-rose-500',
        )}>
          {status === 'success' ? <CheckCircle2 className="h-6 w-6 shrink-0" /> :
            status === 'testing' ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" /> : <AlertCircle className="h-6 w-6 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-bold wrap-break-word">{message}</p>
            {testReply && status === 'success' && (
              <p className="text-xs mt-2 opacity-80 leading-relaxed whitespace-pre-wrap wrap-break-word">{testReply}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
        <button
          onClick={handleTest}
          disabled={status === 'testing' || !configured}
          className="w-full sm:w-auto px-8 py-4 bg-bg-base text-text-base rounded-xl text-sm font-bold hover:bg-bg-base/70 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {t('aiTestModel')}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 px-8 py-4 bg-text-highlight text-white rounded-xl text-sm font-bold hover:opacity-90 shadow-lg shadow-text-highlight/20 transition-all flex items-center justify-center gap-2"
        >
          <Save className="h-4 w-4" /> {t('aiSavePreferences')}
        </button>
      </div>

      {/* Tips */}
      <div className="mt-8 bg-text-highlight/5 rounded-2xl p-4 md:p-8 border border-text-highlight/10 transition-colors">
        <h4 className="text-sm font-bold text-text-highlight mb-4 flex items-center gap-2 transition-colors">
          <Info className="h-4 w-4" /> {t('aiTipsTitle')}
        </h4>
        <ul className="text-xs text-text-muted space-y-4 leading-relaxed transition-colors">
          <li className="flex gap-3">
            <div className="h-5 w-5 rounded-full bg-text-highlight text-white flex items-center justify-center text-xs shrink-0 transition-colors">1</div>
            <p>{t('aiTip1')}</p>
          </li>
          <li className="flex gap-3">
            <div className="h-5 w-5 rounded-full bg-text-highlight text-white flex items-center justify-center text-xs shrink-0 transition-colors">2</div>
            <p>{t('aiTip2')}</p>
          </li>
          <li className="flex gap-3">
            <div className="h-5 w-5 rounded-full bg-text-highlight text-white flex items-center justify-center text-xs shrink-0 transition-colors">3</div>
            <p>{t('aiTip3')}</p>
          </li>
        </ul>
      </div>
    </div>
  );
}

function InfoTile({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="bg-bg-base/50 border border-border-base rounded-xl p-4 min-w-0">
      <p className="text-xs font-bold text-text-muted/80 uppercase tracking-widest mb-2 truncate">{label}</p>
      <p className={cn("text-sm font-bold text-text-base font-mono break-all", valueClassName)}>{value}</p>
    </div>
  );
}

function AppSecuritySettings() {
  const { language, t } = useLanguage();
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(true);
  const [isQuickLoginEnabled, setIsQuickLoginEnabled] = useState(false);
  const [autoLockTime, setAutoLockTime] = useState(language === 'vi' ? `5 ${t('minuteUnit')}` : `5 ${t('minuteUnit')}`);

  const autoLockOptions = [
    { label: `1 ${t('minuteUnit')}`, value: `1 ${t('minuteUnit')}` },
    { label: `5 ${t('minuteUnit')}`, value: `5 ${t('minuteUnit')}` },
    { label: `15 ${t('minuteUnit')}`, value: `15 ${t('minuteUnit')}` },
    { label: `30 ${t('minuteUnit')}`, value: `30 ${t('minuteUnit')}` },
    { label: `1 ${language === 'vi' ? 'Giờ' : 'Hour'}`, value: `1 ${language === 'vi' ? 'Giờ' : 'Hour'}` },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('appSecurityTitle')}</h1>

      <div className="grid grid-cols-12 gap-6">
        {/* Biometric Lock */}
        <div className="col-span-12 lg:col-span-7 bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm flex flex-col justify-between transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="mt-1 transition-colors">
                <Fingerprint className="h-5 w-5 text-text-muted/50 transition-colors" />
              </div>
              <div className="max-w-md transition-colors">
                <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('biometricLock')}</h3>
                <p className="text-sm text-text-muted leading-relaxed transition-colors">
                  {t('biometricLockDesc')}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsBiometricEnabled(!isBiometricEnabled)}
              className={cn(
                "w-14 h-7 rounded-full relative p-1 transition-all duration-300 shrink-0",
                isBiometricEnabled ? "bg-text-highlight" : "bg-bg-base border border-border-base"
              )}
            >
              <div className={cn(
                "h-5 w-5 bg-white rounded-full shadow-sm transition-transform duration-300",
                isBiometricEnabled ? "translate-x-7" : "translate-x-0"
              )}></div>
            </button>
          </div>
        </div>

        {/* Auto Lock */}
        <div className="col-span-12 lg:col-span-5 bg-bg-base/50 rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-2 transition-colors">
            <Timer className="h-4 w-4 text-text-muted/50 transition-colors" />
            <h3 className="text-xl font-bold text-text-highlight transition-colors">{t('autoLock')}</h3>
          </div>
          <p className="text-sm text-text-muted mb-8 leading-relaxed transition-colors">
            {t('autoLockDesc')}
          </p>
          <div className="relative text-text-base">
            <select 
              value={autoLockTime}
              onChange={(e) => setAutoLockTime(e.target.value)}
              className="w-full h-12 bg-bg-surface border border-border-base rounded-xl px-6 text-sm font-bold text-text-base appearance-none focus:ring-0 cursor-pointer shadow-sm transition-colors"
            >
              {autoLockOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-bg-surface">{opt.label}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown className="h-4 w-4 text-text-muted" />
            </div>
          </div>
        </div>

        {/* Quick Login */}
        <div className="col-span-12 lg:col-span-8 bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm flex flex-col justify-between transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="mt-1 transition-colors">
                <Zap className="h-5 w-5 text-text-muted/50 transition-colors" />
              </div>
              <div className="max-w-xl transition-colors">
                <h3 className="text-xl font-bold text-text-highlight mb-2 transition-colors">{t('quickLogin')}</h3>
                <p className="text-sm text-text-muted leading-relaxed transition-colors">
                  {t('quickLoginDesc')}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsQuickLoginEnabled(!isQuickLoginEnabled)}
              className={cn(
                "w-14 h-7 rounded-full relative p-1 transition-all duration-300 shrink-0",
                isQuickLoginEnabled ? "bg-text-highlight" : "bg-bg-base border border-border-base"
              )}
            >
              <div className={cn(
                "h-5 w-5 bg-white rounded-full shadow-sm transition-transform duration-300",
                isQuickLoginEnabled ? "translate-x-7" : "translate-x-0"
              )}></div>
            </button>
          </div>
        </div>

        {/* Organizational Standard Card */}
        <div className="col-span-12 lg:col-span-4 bg-[#000045] rounded-2xl p-4 md:p-8 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          {/* Background Decorative Text */}
          <div className="absolute top-0 right-0 text-[100px] font-bold text-white/5 select-none leading-none -translate-y-1/4 translate-x-1/4">
            {t('appDesign')}
          </div>
          <div className="absolute bottom-0 left-0 text-[100px] font-bold text-white/5 select-none leading-none translate-y-1/4 -translate-x-1/4">
            {t('appDesignSuffix')}
          </div>
          
          <div className="relative z-10 transition-colors">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest transition-colors">{t('organizationalStandard')}</h3>
            <p className="text-sm text-white/70 leading-relaxed transition-colors">
              {t('securityStandardDesc')}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-2 mt-8">
            <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">{t('hardwareEncryption')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSettings() {
  const { t } = useLanguage();
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('aboutTitleSettings')}</h1>

      <div className="space-y-6">
        {/* Version Info Card */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <h3 className="text-xl font-bold text-text-highlight mb-2 uppercase tracking-tight transition-colors">FIREANT DASHBOARD</h3>
          <p className="text-sm text-text-muted font-medium tracking-wide transition-colors">{t('version')}: 2.5.0 (Build 20231027)</p>
        </div>

        {/* Legal Documents */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-6 transition-colors">{t('legalDocs')}</h3>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between gap-3 p-4 md:p-6 bg-bg-base/50 rounded-xl hover:bg-bg-base transition-colors group">
              <div className="flex items-center gap-4">
                <Scale className="h-5 w-5 text-text-muted/50 transition-colors" />
                <span className="text-sm font-bold text-text-base transition-colors">{t('termsOfService')}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted/30 group-hover:text-text-muted/60 transition-colors" />
            </button>
            <button className="w-full flex items-center justify-between gap-3 p-4 md:p-6 bg-bg-base/50 rounded-xl hover:bg-bg-base transition-colors group">
              <div className="flex items-center gap-4">
                <Shield className="h-5 w-5 text-text-muted/50 transition-colors" />
                <span className="text-sm font-bold text-text-base transition-colors">{t('privacyPolicy')}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted/30 group-hover:text-text-muted/60 transition-colors" />
            </button>
          </div>
        </div>

        {/* Support */}
        <div className="bg-bg-surface rounded-2xl p-4 md:p-8 border border-border-base shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex-1">
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4 transition-colors">{t('contactSupportLabel')}</h3>
              <p className="text-sm text-text-muted leading-relaxed max-w-md transition-colors">
                {t('supportDescLabel')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button className="flex items-center gap-3 px-6 py-3.5 bg-text-highlight text-white text-xs font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-text-highlight/10 active:scale-95">
                <Mail className="h-4 w-4" /> {t('techContact')}
              </button>
              <button className="flex items-center gap-3 px-6 py-3.5 bg-bg-surface border border-border-base text-text-base text-xs font-bold rounded-xl hover:bg-bg-base transition-all active:scale-95">
                <HelpCircle className="h-4 w-4 text-text-highlight" /> FAQ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}