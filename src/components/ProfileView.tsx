import { User, ShieldCheck, History, HelpCircle, LogOut, Camera, CheckCircle2, Monitor, Smartphone, Globe, ChevronLeft, ChevronRight, ExternalLink, Clock, Sun, Moon, Bell, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import SentinelFooter from './SentinelFooter';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ProfileTab = 'info' | 'security' | 'history';

interface ProfileViewProps {
  onLogout: () => void;
  user: any;
  onUpdateUser: (data: any) => void;
}

export default function ProfileView({ onLogout, user, onUpdateUser }: ProfileViewProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [activeTab, setActiveTab] = useState<ProfileTab>('info');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  const menuItems = [
    { id: 'info', label: t('personalInfo'), icon: User },
    { id: 'security', label: t('securitySettings'), icon: ShieldCheck },
    { id: 'history', label: t('activityLog'), icon: History },
  ];

  return (
    <div className="flex flex-col md:flex-row bg-bg-base h-full overflow-hidden transition-colors">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-bg-surface border-b md:border-b-0 md:border-r border-border-base flex flex-col pt-4 md:pt-10 pb-4 md:pb-10 px-3 md:px-4 shrink-0 shadow-sm transition-colors">
        <div className="mb-4 md:mb-12 px-3 md:px-6">
          <h2 className="text-xl font-bold text-[#3634B3] tracking-tight transition-colors">{t('profileUser')}</h2>
          <p className="text-sm text-text-muted mt-1 font-medium transition-colors">{t('manageAccount')}</p>
        </div>

        <nav className="flex-1 grid grid-cols-3 md:block md:space-y-4 gap-2 md:px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as ProfileTab)}
                className={cn(
                  "w-full flex items-center justify-center md:justify-between gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 rounded-xl transition-all text-left group",
                  isActive 
                    ? "bg-[#3634B3]/5 text-[#3634B3]" 
                    : "text-text-muted hover:bg-bg-base"
                )}
              >
                <div className="flex items-center justify-center md:justify-start gap-2 md:gap-4 flex-1 min-w-0">
                  <Icon className={cn("h-5 w-5 transition-colors shrink-0", isActive ? "text-[#3634B3]" : "text-text-muted group-hover:text-text-base")} />
                  <span className={cn("hidden sm:inline text-xs md:text-sm tracking-tight transition-colors truncate", isActive ? "text-[#3634B3] font-bold" : "text-text-muted font-medium group-hover:text-text-base")}>
                    {item.label}
                  </span>
                </div>
                {isActive && <ChevronRight className="hidden md:block h-4 w-4 text-[#3634B3] animate-in slide-in-from-left-2 duration-300" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar transition-colors">
        <div className="max-w-5xl min-w-0">
          {activeTab === 'info' && <PersonalInfoView user={user} onUpdateUser={onUpdateUser} />}
          {activeTab === 'security' && <SecuritySettingsView user={user} onUpdateUser={onUpdateUser} />}
          {activeTab === 'history' && <ActivityLogView />}
        </div>
      </div>
    </div>
  );
}function PersonalInfoView({ user, onUpdateUser }: { user: any; onUpdateUser: (data: any) => void }) {
  const { t } = useLanguage();
  const isGoogleUser = user?.isGoogleUser === true;
  const [formData, setFormData] = useState({
    name: user?.name || 'Admin',
    email: user?.email || "admin@test.com"
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    if (isGoogleUser) return;
    setIsSaving(true);
    // Simulate API delay
    setTimeout(() => {
      onUpdateUser({
        name: formData.name,
        email: formData.email
      });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('personalInfo')}</h1>

      {isGoogleUser && (
        <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900 rounded-xl flex items-center gap-3 text-[#3634B3] text-xs font-bold transition-colors">
          <ShieldCheck className="h-5 w-5" />
          <span>Tài khoản Google đang được sử dụng. Thông tin cá nhân được đồng bộ từ Google và không thể thay đổi tại đây.</span>
        </div>
      )}

      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-48 w-48 rounded-xl bg-bg-base/50 flex items-center justify-center border-2 border-dashed border-border-base relative group overflow-hidden transition-colors">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="h-20 w-20 text-text-muted/40" />
                )}
                {!isGoogleUser && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
              {!isGoogleUser && (
                <button className="flex items-center gap-2 px-6 py-2 bg-bg-base hover:bg-bg-base/80 text-text-base text-xs font-bold rounded-lg transition-colors uppercase tracking-wider">
                  {t('uploadNewPhoto')}
                </button>
              )}
              <p className="text-[10px] text-text-muted transition-colors">{t('uploadSizeLimit')}</p>
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('fullName')}</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    disabled={isGoogleUser}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={cn(
                      "w-full px-4 py-3 bg-bg-base border border-border-base rounded-lg text-sm font-medium text-text-base focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 transition-all outline-none",
                      isGoogleUser && "opacity-60 cursor-not-allowed bg-bg-base/50"
                    )}
                  />
                </div>
                {!isGoogleUser && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('email')}</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-bg-base border border-border-base rounded-lg text-sm font-medium text-text-base focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 transition-all outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('roleLabel')}</label>
                  <input 
                    type="text" 
                    defaultValue={t('adminRole')} 
                    disabled
                    className="w-full px-4 py-3 bg-bg-base/50 border border-border-base rounded-lg text-sm font-medium text-text-base opacity-60 cursor-not-allowed transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('organization')}</label>
                  <input 
                    type="text" 
                    defaultValue={t('sentinelOrg')} 
                    disabled
                    className="w-full px-4 py-3 bg-bg-base/50 border border-border-base rounded-lg text-sm font-medium text-text-base opacity-60 cursor-not-allowed transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row sm:justify-end sm:items-center gap-4">
                {saveSuccess && (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 animate-in fade-in slide-in-from-right-4 transition-colors">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{t('updated')}</span>
                  </div>
                )}
                {!isGoogleUser && (
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn(
                      "w-full sm:w-auto justify-center px-8 md:px-10 py-4 bg-[#3634B3] hover:opacity-90 text-white text-sm font-bold rounded-lg shadow-lg shadow-[#3634B3]/20 transition-all uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2",
                      isSaving && "cursor-wait"
                    )}
                  >
                    {isSaving ? (
                      <>
                        <div className="h-3 w-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        {t('savingLabel')}
                      </>
                    ) : t('saveChanges')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SentinelFooter />
    </div>
  );
}

function SecuritySettingsView({ user, onUpdateUser }: { user: any, onUpdateUser: (data: any) => void }) {
  const { t } = useLanguage();
  const isGoogleUser = user?.isGoogleUser === true;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{current?: boolean, new?: boolean, confirm?: boolean}>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const validatePassword = (pass: string) => {
    if (pass.length < 6) return false;
    const hasLetter = /[a-zA-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return hasLetter && hasNumber && hasSpecial;
  };

  const handleUpdatePassword = () => {
    if (isGoogleUser) return;
    const newErrors: {current?: boolean, new?: boolean, confirm?: boolean} = {};
    
    // Check current password (default to 123456 if none set)
    const activePass = user?.password || '123456';
    if (currentPassword !== activePass) {
        newErrors.current = true;
    }

    // Check new password format
    if (!validatePassword(newPassword)) {
        newErrors.new = true;
    }

    // Check confirm password
    if (confirmPassword !== newPassword || !confirmPassword) {
        newErrors.confirm = true;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
        setIsSaving(true);
        setTimeout(() => {
            onUpdateUser({ password: newPassword });
            setIsSaving(false);
            setSaveSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setSaveSuccess(false), 3000);
        }, 1000);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('securitySettings')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Change Password */}
          <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
            <div className="flex items-center gap-3 mb-8">
                <Clock className="h-5 w-5 text-[#3634B3] transition-colors" />
                <h3 className="text-xl font-bold text-[#3634B3] transition-colors">{t('changePassword')}</h3>
            </div>

            {isGoogleUser && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900 rounded-xl flex items-center gap-3 text-amber-700 dark:text-amber-500 text-xs font-bold transition-colors">
                <AlertCircle className="h-5 w-5" />
                <span>Tính năng đổi mật khẩu bị vô hiệu hóa khi đăng nhập bằng Google. Vui lòng quản lý mật khẩu trong cài đặt tài khoản Google của bạn.</span>
              </div>
            )}

            <div className={cn("space-y-6", isGoogleUser && "opacity-50 pointer-events-none")}>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('currentPassword')}</label>
                    <input 
                        type="password" 
                        disabled={isGoogleUser}
                        placeholder="••••••••••••"
                        value={currentPassword}
                        onChange={(e) => {
                            setCurrentPassword(e.target.value);
                            setErrors({...errors, current: false});
                        }}
                        className={cn(
                            "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 outline-none text-text-base",
                            errors.current ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                        )}
                    />
                    {errors.current && <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight ml-1">{t('currentPasswordIncorrect')}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('newPassword')}</label>
                        <input 
                            type="password" 
                            disabled={isGoogleUser}
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => {
                                setNewPassword(e.target.value);
                                setErrors({...errors, new: false});
                            }}
                            className={cn(
                                "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 outline-none text-text-base",
                                errors.new ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                            )}
                        />
                        {errors.new && <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight ml-1">{t('invalidPasswordFormat')}</p>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider transition-colors">{t('confirmNewPassword')}</label>
                        <input 
                            type="password" 
                            disabled={isGoogleUser}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                setErrors({...errors, confirm: false});
                            }}
                            className={cn(
                                "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600/20 dark:focus:ring-indigo-400/20 focus:border-indigo-600 dark:focus:border-indigo-400 outline-none text-text-base",
                                errors.confirm ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                            )}
                        />
                        {errors.confirm && <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight ml-1">{t('passwordsDoNotMatch')}</p>}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button 
                        onClick={handleUpdatePassword}
                        disabled={isSaving || isGoogleUser}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-3 bg-[#3634B3] hover:opacity-90 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? t('updatingLabel') : t('updatePasswordLabel')} <ChevronLeft className="h-4 w-4 rotate-180" />
                    </button>
                    {saveSuccess && (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 animate-in fade-in slide-in-from-left-4">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">{t('passwordUpdatedSuccess')}</span>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>


        <div className="lg:col-span-1">
          {/* Password Requirements */}
          <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 flex flex-col gap-4 h-full transition-colors">
              <div className="h-10 w-10 bg-orange-600 rounded-xl flex items-center justify-center text-white font-bold italic text-lg shadow-lg shadow-orange-600/20">i</div>
              <div>
                  <h4 className="font-bold text-text-base mb-3 transition-colors">{t('securityRequirements')}</h4>
                  <p className="text-sm text-text-muted leading-relaxed transition-colors">
                      {t('securityDesc')}
                  </p>
              </div>
          </div>
        </div>

        <div className="lg:col-span-3">
             <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 mt-6 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
                    <h3 className="text-xl font-bold text-[#3634B3] transition-colors">{t('currentSessions')}</h3>
                    <button className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-widest transition-colors">{t('logoutAllDevices')}</button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                         <thead>
                             <tr className="text-[10px] font-bold text-text-muted uppercase tracking-widest border-b border-border-base pb-4 transition-colors">
                                 <th className="text-left py-4 px-2">{t('browserDevice')}</th>
                                 <th className="text-left py-4 px-2">{t('location')}</th>
                                 <th className="text-left py-4 px-2">{t('time')}</th>
                                 <th className="text-right py-4 px-2">{t('status')}</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-border-base">
                             <tr className="transition-colors hover:bg-bg-base/50">
                                 <td className="py-6 px-2">
                                     <div className="flex items-center gap-4">
                                         <div className="h-10 w-10 bg-bg-base rounded-lg flex items-center justify-center transition-colors">
                                             <Monitor className="h-5 w-5 text-text-muted" />
                                         </div>
                                         <div>
                                             <p className="text-sm font-bold text-text-base transition-colors">{t('browserChrome')}</p>
                                             <p className="text-xs text-text-muted transition-colors">IP: 14.232.xxx.xxx</p>
                                         </div>
                                     </div>
                                 </td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{t('hanoiVN')}</td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{t('current')}</td>
                                 <td className="text-right px-2">
                                     <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500 text-[10px] font-bold rounded uppercase transition-colors">{t('activeStatus')}</span>
                                 </td>
                             </tr>
                             <tr className="transition-colors hover:bg-bg-base/50">
                                 <td className="py-6 px-2">
                                     <div className="flex items-center gap-4">
                                         <div className="h-10 w-10 bg-bg-base rounded-lg flex items-center justify-center transition-colors">
                                             <Smartphone className="h-5 w-5 text-text-muted" />
                                         </div>
                                         <div>
                                             <p className="text-sm font-bold text-text-base transition-colors">iPhone 15 Pro</p>
                                             <p className="text-xs text-text-muted transition-colors">Sentinel App v2.4</p>
                                         </div>
                                     </div>
                                 </td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{t('hanoiVN')}</td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{t('twoHoursAgo')}</td>
                                 <td className="text-right px-2">
                                     <span className="px-2 py-1 bg-bg-base text-text-muted text-[10px] font-bold rounded uppercase transition-colors">{t('validStatus')}</span>
                                 </td>
                             </tr>
                         </tbody>
                    </table>
                </div>
             </div>
        </div>
      </div>

      <SentinelFooter />
    </div>
  );
}

function ActivityLogView() {
  const { t } = useLanguage();
  const activities = [
    { time: '14:23:45 12/10/2023', action: t('loginSuccess'), ip: '113.190.23.45', device: 'Chrome / macOS', status: 'success' },
    { time: '09:12:02 12/10/2023', action: t('pinChange'), ip: '113.190.23.45', device: 'Chrome / macOS', status: 'warning' },
    { time: '22:45:12 11/10/2023', action: t('otpSuccess'), ip: '172.16.0.44', device: 'iPhone 15 Pro', status: 'success' },
    { time: '22:44:55 11/10/2023', action: t('withdrawRequest'), ip: '172.16.0.44', device: 'iPhone 15 Pro', status: 'success' },
    { time: '08:30:00 11/10/2023', action: t('loginFailed'), ip: '42.112.56.78', device: 'Firefox / Windows', status: 'error' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('activityLog')}</h1>

      {/* Active stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm flex items-center gap-4 transition-colors">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center transition-colors">
                <Smartphone className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
            </div>
            <div>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('devices')}</p>
                <p className="text-base font-bold text-text-base transition-colors">2 {t('activities')}</p>
            </div>
        </div>
        <div className="bg-bg-surface p-6 rounded-2xl border border-border-base shadow-sm flex items-center gap-4 transition-colors">
            <div className="h-12 w-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center transition-colors">
                <Globe className="h-6 w-6 text-[#3634B3]" />
            </div>
            <div>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('locations')}</p>
                <p className="text-base font-bold text-text-base transition-colors">{t('hanoiVN')}</p>
            </div>
        </div>
      </div>

      <div className="bg-bg-surface rounded-2xl border border-border-base shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-bg-base/50 border-b border-border-base transition-colors">
                <th className="text-left py-6 px-8 text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('time')}</th>
                <th className="text-left py-6 px-8 text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('activities')}</th>
                <th className="text-left py-6 px-8 text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('ipAddress')}</th>
                <th className="text-right py-6 px-8 text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">{t('devices')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {activities.map((item, i) => (
                <tr key={i} className="hover:bg-bg-base/50 transition-colors">
                  <td className="py-6 px-8 text-sm text-text-muted transition-colors">{item.time}</td>
                  <td className="py-6 px-8">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        item.status === 'success' && "bg-emerald-500",
                        item.status === 'warning' && "bg-amber-500",
                        item.status === 'error' && "bg-red-500",
                      )}></div>
                      <span className="text-sm font-medium text-text-base transition-colors">{item.action}</span>
                    </div>
                  </td>
                  <td className="py-6 px-8 text-sm text-text-muted transition-colors">{item.ip}</td>
                  <td className="py-6 px-8 text-right">
                    <div className="inline-flex items-center gap-3 bg-bg-base px-4 py-2 rounded-lg group transition-colors">
                        {item.device.includes('iPhone') ? <Smartphone className="h-4 w-4 text-text-muted" /> : <Monitor className="h-4 w-4 text-text-muted" />}
                        <span className="text-[10px] font-bold text-text-muted uppercase transition-all">{item.device}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="py-4 px-4 md:py-6 md:px-8 bg-bg-base/50 border-t border-border-base flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest transition-colors">
              {t('showingLogs').replace('{count}', '5').replace('{total}', '128')}
            </p>
            <div className="flex items-center gap-1">
                <button className="px-3 py-1 text-[10px] font-bold text-text-muted uppercase hover:text-[#3634B3] transition-colors">{t('prev')}</button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-[#3634B3] text-white text-[10px] font-bold transition-colors">1</button>
                <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-bg-surface border border-transparent hover:border-border-base text-[10px] font-bold text-text-muted transition-colors">2</button>
                <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-bg-surface border border-transparent hover:border-border-base text-[10px] font-bold text-text-muted transition-colors">3</button>
                <button className="px-3 py-1 text-[10px] font-bold text-text-muted uppercase hover:text-[#3634B3] transition-colors">{t('next')}</button>
            </div>
        </div>
      </div>

      <SentinelFooter />
    </div>
  );
}
