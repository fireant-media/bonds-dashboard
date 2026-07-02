import { User, ShieldCheck, Camera, CheckCircle2, Monitor, Smartphone, ChevronLeft, Clock, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../LanguageContext';
import { useAuthUser, useIsGoogleUser } from '../auth/authStore';
import type { UserAccount } from '../models/users';
import SentinelFooter from './SentinelFooter';
import { exportRowsToExcel } from '../utils/excel';
import { getActivityLogEntries, type ActivityLogEntry } from '../utils/activityLog';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProfileViewProps {
  section: 'info';
}

export default function ProfileView({ section }: ProfileViewProps) {
  const user = useAuthUser();

  return (
    <div className="bg-bg-base p-4 transition-colors sm:p-6 md:p-10">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        {section === 'info' && <PersonalInfoView user={user} />}
      </div>
    </div>
  );
}

function PersonalInfoView({ user }: { user: UserAccount | null }) {
  const { t } = useLanguage();
  const isGoogleUser = useIsGoogleUser();
  const profileName = user?.profile?.name ?? '';
  const profileEmail = user?.identityData?.email ?? '';
  const [formData, setFormData] = useState({
    name: profileName,
    email: profileEmail,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setFormData({
      name: profileName,
      email: profileEmail,
    });
  }, [profileName, profileEmail]);

  const handleSave = () => {
    if (isGoogleUser) return;
    setIsSaving(true);
    setTimeout(() => {
      console.warn('Profile update is read-only for OIDC accounts.');
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <h1 className="text-2xl font-bold text-text-base tracking-tight mb-8 transition-colors">{t('personalProfile')}</h1>

      {isGoogleUser && (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-600 transition-colors dark:border-blue-900 dark:bg-blue-900/20">
          <ShieldCheck className="h-5 w-5" />
          <span>{t('googleProfileReadOnly')}</span>
        </div>
      )}

      <div className="bg-bg-surface rounded-2xl shadow-sm border border-border-base p-4 md:p-8 transition-colors">
        <div className="mb-6">
          <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
            <div className="flex flex-col items-center gap-4">
              <div className="group relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border-base bg-bg-base/50 transition-colors sm:h-44 sm:w-44 lg:h-48 lg:w-48">
                <User className="h-16 w-16 text-text-muted/40 sm:h-20 sm:w-20" />
                {!isGoogleUser && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
              {!isGoogleUser && (
                <button className="flex items-center gap-2 px-6 py-2 bg-bg-base hover:bg-bg-base/80 text-text-base text-xs font-bold rounded-lg transition-colors uppercase tracking-wider">
                  {t('uploadNewPhoto')}
                </button>
              )}
              <p className="text-xs text-text-muted transition-colors">{t('uploadSizeLimit')}</p>
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('fullName')}</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    disabled={isGoogleUser}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={cn(
                      "w-full px-4 py-3 bg-bg-base border border-border-base rounded-lg text-sm font-medium text-text-base focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:focus:ring-blue-400/20 focus:border-blue-600 dark:focus:border-blue-400 transition-all outline-none",
                      isGoogleUser && "opacity-60 cursor-not-allowed bg-bg-base/50"
                    )}
                  />
                </div>
                {!isGoogleUser && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('email')}</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-bg-base border border-border-base rounded-lg text-sm font-medium text-text-base focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:focus:ring-blue-400/20 focus:border-blue-600 dark:focus:border-blue-400 transition-all outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('roleLabel')}</label>
                  <input 
                    type="text" 
                    defaultValue={t('adminRole')} 
                    disabled
                    className="w-full px-4 py-3 bg-bg-base/50 border border-border-base rounded-lg text-sm font-medium text-text-base opacity-60 cursor-not-allowed transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('organization')}</label>
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
                      "w-full sm:w-auto justify-center px-8 md:px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all uppercase tracking-widest active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2",
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
      <div className="mt-6">
        <ActivityLogTable />
      </div>
    </div>
  );
}

function SecuritySettingsView() {
  const { t } = useLanguage();
  const isGoogleUser = useIsGoogleUser();
  const [sessionsExportLoading, setSessionsExportLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{current?: boolean, new?: boolean, confirm?: boolean}>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const sessionRows = [
    { browserDevice: t('browserChrome'), location: t('hanoiVN'), time: t('current'), status: t('activeStatus'), ip: 'IP: 14.232.xxx.xxx' },
    { browserDevice: 'iPhone 15 Pro', location: t('hanoiVN'), time: t('twoHoursAgo'), status: t('validStatus'), ip: 'Sentinel App v2.4' },
  ];

  const handleExportSessions = async () => {
    setSessionsExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      exportRowsToExcel({
        fileNameBase: 'Current_Sessions',
        sheetName: t('currentSessions'),
        rows: sessionRows,
        columns: [
          { header: t('browserDevice'), value: (row) => row.browserDevice },
          { header: t('location'), value: (row) => row.location },
          { header: t('time'), value: (row) => row.time },
          { header: t('status'), value: (row) => row.status },
        ],
      });
    } finally {
      setSessionsExportLoading(false);
    }
  };

  const validatePassword = (pass: string) => {
    if (pass.length < 6) return false;
    const hasLetter = /[a-zA-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return hasLetter && hasNumber && hasSpecial;
  };

  const handleUpdatePassword = () => {
    if (isGoogleUser) return;
    const newErrors: { current?: boolean; new?: boolean; confirm?: boolean } = {};

    if (!currentPassword) {
      newErrors.current = true;
    }
    if (!validatePassword(newPassword)) {
      newErrors.new = true;
    }
    if (confirmPassword !== newPassword || !confirmPassword) {
      newErrors.confirm = true;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsSaving(true);
      setTimeout(() => {
        console.warn('Password change must be done at the identity provider.');
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
                <Clock className="h-5 w-5 text-blue-600 transition-colors" />
                <h3 className="text-xl font-bold text-blue-600 transition-colors">{t('changePassword')}</h3>
            </div>

            {isGoogleUser && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900 rounded-xl flex items-center gap-3 text-amber-700 dark:text-amber-500 text-xs font-bold transition-colors">
                <AlertCircle className="h-5 w-5" />
                <span>{t('googlePasswordDisabled')}</span>
              </div>
            )}

            <div className={cn("space-y-6", isGoogleUser && "opacity-50 pointer-events-none")}>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('currentPassword')}</label>
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
                            "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:focus:ring-blue-400/20 focus:border-blue-600 dark:focus:border-blue-400 outline-none text-text-base",
                            errors.current ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                        )}
                    />
                    {errors.current && <p className="text-xs text-red-500 font-bold uppercase tracking-tight ml-1">{t('currentPasswordIncorrect')}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('newPassword')}</label>
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
                                "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:focus:ring-blue-400/20 focus:border-blue-600 dark:focus:border-blue-400 outline-none text-text-base",
                                errors.new ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                            )}
                        />
                        {errors.new && <p className="text-xs text-red-500 font-bold uppercase tracking-tight ml-1">{t('invalidPasswordFormat')}</p>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider transition-colors">{t('confirmNewPassword')}</label>
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
                                "w-full px-4 py-3 bg-bg-base border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:focus:ring-blue-400/20 focus:border-blue-600 dark:focus:border-blue-400 outline-none text-text-base",
                                errors.confirm ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border-base"
                            )}
                        />
                        {errors.confirm && <p className="text-xs text-red-500 font-bold uppercase tracking-tight ml-1">{t('passwordsDoNotMatch')}</p>}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button 
                        onClick={handleUpdatePassword}
                        disabled={isSaving || isGoogleUser}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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
                    <h3 className="text-xl font-bold text-blue-600 transition-colors">{t('currentSessions')}</h3>
                    <div className="flex items-center gap-3">
                      <button className="text-xs font-bold text-red-600 hover:underline uppercase tracking-widest transition-colors">{t('logoutAllDevices')}</button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                         <thead>
                             <tr className="border-b border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 pb-4 text-xs font-bold uppercase tracking-widest text-white transition-colors">
                                 <th className="px-2 py-4 text-left">{t('browserDevice')}</th>
                                 <th className="px-2 py-4 text-left">{t('location')}</th>
                                 <th className="px-2 py-4 text-left">{t('time')}</th>
                                 <th className="px-2 py-4 text-right">{t('status')}</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-border-base">
                             {sessionRows.map((session) => (
                             <tr key={session.browserDevice} className="transition-colors hover:bg-bg-base/50">
                                 <td className="py-6 px-2">
                                     <div className="flex items-center gap-4">
                                         <div className="h-10 w-10 bg-bg-base rounded-lg flex items-center justify-center transition-colors">
                                             {session.browserDevice.includes('iPhone') ? <Smartphone className="h-5 w-5 text-text-muted" /> : <Monitor className="h-5 w-5 text-text-muted" />}
                                         </div>
                                         <div>
                                             <p className="text-sm font-bold text-text-base transition-colors">{session.browserDevice}</p>
                                             <p className="text-xs text-text-muted transition-colors">{session.ip}</p>
                                         </div>
                                     </div>
                                 </td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{session.location}</td>
                                 <td className="text-sm text-text-muted px-2 transition-colors">{session.time}</td>
                                 <td className="text-right px-2">
                                     <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500 text-xs font-bold rounded uppercase transition-colors">{session.status}</span>
                                 </td>
                             </tr>
                             ))}
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

function ActivityLogTable() {
  const user = useAuthUser();
  const { t, language } = useLanguage();
  const [activityExportLoading, setActivityExportLoading] = useState(false);
  const activityUserId =
    user?.identityData?.email ||
    user?.profile?.name ||
    '';
  const activities = getActivityLogEntries(activityUserId);

  const formatActivityTime = (timestamp: string) => {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return timestamp;

    return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  };

  const getActivityLabel = (action: ActivityLogEntry['action']) => {
    if (action === 'logout') return t('logout');
    return t('loginSuccess');
  };

  const handleExportActivities = async () => {
    setActivityExportLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));

      exportRowsToExcel({
        fileNameBase: 'Activity_Log',
        sheetName: t('activityLog'),
        rows: activities,
        columns: [
          { header: t('time'), value: (row) => formatActivityTime(row.timestamp) },
          { header: t('activities'), value: (row) => getActivityLabel(row.action) },
          { header: t('location'), value: (row) => row.location },
          { header: t('devices'), value: (row) => row.device },
        ],
      });
    } finally {
      setActivityExportLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors">
      <div className="overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-sm transition-colors">
        <div className="flex flex-col gap-3 px-4 py-4 md:px-8 md:py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-base transition-colors">{t('activityLog')}</h2>
            <p className="mt-1 text-sm font-medium text-text-muted transition-colors">
              {t('showingLogs').replace('{count}', String(activities.length)).replace('{total}', String(activities.length))}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportActivities}
            disabled={activityExportLoading || activities.length === 0}
            className="rounded-lg border border-border-base px-4 py-2 text-xs font-bold uppercase tracking-widest text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activityExportLoading ? t('savingLabel') : t('export')}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-full">
            <thead>
              <tr className="border-b border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 transition-colors">
                <th className="whitespace-nowrap px-8 py-6 text-left text-xs font-bold uppercase tracking-widest text-white transition-colors">{t('time')}</th>
                <th className="whitespace-nowrap px-8 py-6 text-left text-xs font-bold uppercase tracking-widest text-white transition-colors">{t('activities')}</th>
                <th className="whitespace-nowrap px-8 py-6 text-right text-xs font-bold uppercase tracking-widest text-white transition-colors">{t('devices')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {activities.length > 0 ? (
                activities.map((item) => (
                  <tr key={item.id} className="hover:bg-bg-base/50 transition-colors">
                    <td className="whitespace-nowrap px-8 py-6 text-sm text-text-muted transition-colors">{formatActivityTime(item.timestamp)}</td>
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          item.action === 'logout' ? 'bg-amber-500' : 'bg-emerald-500'
                        )}></div>
                        <span className="text-sm font-medium text-text-base transition-colors">{getActivityLabel(item.action)}</span>
                      </div>
                    </td>
                    <td className="py-6 px-8 text-right">
                      <div className="inline-flex items-center gap-3 rounded-lg bg-bg-base px-4 py-2 transition-colors">
                        {item.device.includes('iPhone') || item.device.includes('Android') || item.device.includes('iPad')
                          ? <Smartphone className="h-4 w-4 text-text-muted" />
                          : <Monitor className="h-4 w-4 text-text-muted" />}
                        <span className="text-xs font-bold uppercase text-text-muted transition-colors">{item.device}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-8 py-10 text-center text-sm font-medium text-text-muted transition-colors">
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border-base bg-bg-base/50 px-4 py-4 transition-colors md:px-8 md:py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted transition-colors">
            {t('showingLogs').replace('{count}', String(activities.length)).replace('{total}', String(activities.length))}
          </p>
        </div>
      </div>
    </div>
  );
}
