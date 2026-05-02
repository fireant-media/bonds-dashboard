import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Apple, AlertCircle, LayoutGrid, BarChart4, BellRing, ClipboardList } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

interface LoginViewProps {
  onLoginSuccess: (userData: any) => void;
}

type AuthMode = 'login' | 'register';

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const DEMO_EMAIL = 'admin@test.com';
  const DEMO_PASSWORD = '123456';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      onLoginSuccess({ 
        email: DEMO_EMAIL, 
        name: 'Admin',
        isGoogleUser: false
      });
    } else {
      setError(t('invalidCredentials'));
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (password !== confirmPassword) {
      setError(t('confirmPasswordMismatch'));
      return;
    }

    onLoginSuccess({ 
      email, 
      name: fullName || 'New User', 
      isGoogleUser: false
    });
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError(null);
    // Simulate API delay
    setTimeout(() => {
      const userData = {
        name: 'User (Google)',
        isGoogleUser: true,
        updatedAt: new Date().toISOString()
      };
      onLoginSuccess(userData);
      setIsGoogleLoading(false);
    }, 1000);
  };

  const isLogin = authMode === 'login';

  return (
    <div className="h-screen flex bg-bg-base font-sans text-text-base overflow-hidden relative transition-colors">
      {/* Left side - Brand Panel (Product Introduction) */}

      <div className="hidden lg:flex w-1/2 flex-col justify-center items-center p-4 lg:p-6 relative overflow-hidden border-r border-border-base transition-colors">
        <div className="w-full max-w-[500px] p-6 lg:p-8 relative z-10 flex flex-col justify-between h-fit">
          <div className="relative">
            {/* 1. Header with Logo */}
            <div className="flex items-center gap-2 mb-8 text-[#3634B3]">
              <div className="h-8 w-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center border border-indigo-100 dark:border-indigo-900 shadow-sm transition-colors">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="font-black text-lg tracking-tight uppercase">FIREANT</span>
            </div>

            <motion.div
              key={authMode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* 2. Hero Section */}
              <h1 className="text-2xl lg:text-3xl font-extrabold text-[#3634B3] mb-4 leading-tight tracking-tight transition-colors">
                {t('heroTitle1')} <br />
                <span className="text-text-base font-bold transition-colors">{t('heroTitle2')}</span>
              </h1>

              {/* 3. Description */}
              <p className="text-xs lg:text-[13px] text-text-muted max-w-[420px] leading-relaxed font-medium mb-8 transition-colors">
                {t('heroDesc')}
              </p>

              {/* 4. Grid tính năng (2 cột x 2 hàng) */}
              <div className="grid grid-cols-2 gap-3 mb-10">
                {[
                  { icon: BarChart4, label: t('featureWatchlist') },
                  { icon: LayoutGrid, label: t('featureDashboard') },
                  { icon: ClipboardList, label: t('featureReports') },
                  { icon: BellRing, label: t('featureAlerts') }
                ].map((item, i) => (
                  <div 
                    key={i} 
                    className="bg-bg-surface/40 backdrop-blur-sm border border-border-base rounded-2xl p-3.5 flex items-center gap-3 shadow-sm hover:shadow-md hover:bg-bg-surface transition-all cursor-pointer group"
                  >
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-bg-surface border border-border-base flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <item.icon className="h-4 w-4 text-[#3634B3]" />
                    </div>
                    <span className="text-[10px] font-bold text-text-base leading-tight tracking-tight uppercase transition-colors">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="space-y-5">
            {/* 5. Khu vực dữ liệu realtime mini (3 card cùng 1 hàng) */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'VNINDEX', val: '1,285.4', change: '+1.26%' },
                { label: 'FPT', val: '132.5', change: '+2.8%' },
                { label: 'USD/VND', val: '25,420', change: '' }
              ].map((stat, i) => (
                <div key={i} className="bg-bg-surface border border-border-base rounded-xl p-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] transition-colors">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest transition-colors">{stat.label}</p>
                    <p className="text-[14px] font-extrabold text-text-base tracking-tight leading-none transition-colors">{stat.val}</p>
                    {stat.change && (
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        {stat.change}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 6. Footer trái dưới cùng */}
            <div className="pt-6 border-t border-border-base flex items-center gap-3 transition-colors">
              <div className="h-1 w-8 bg-[#3634B3] rounded-full transition-colors"></div>
              <span className="text-[9px] font-black text-[#3634B3] tracking-[0.4em] uppercase transition-colors">FIREANT FINANCE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 lg:p-8 relative overflow-hidden transition-colors">
        <div className="w-full max-w-[540px] bg-bg-surface rounded-[32px] lg:rounded-[40px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] p-8 lg:p-12 relative z-10 border border-border-base max-h-[85vh] h-fit overflow-y-auto no-scrollbar flex flex-col justify-center transition-colors">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login-form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-8 text-center">
                  <p className="text-[10px] font-bold text-[#3634B3] uppercase tracking-tight mb-2 transition-colors">{t('loginWelcome')}</p>
                  <h2 className="text-xl font-bold text-text-base tracking-tight transition-colors">{t('loginAccount')}</h2>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  {error && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 shadow-sm rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-tight transition-colors">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('emailAddress')}</label>
                    <div className="relative group">
                      <input 
                        type="email" 
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-5 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                      />
                      <Mail className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted group-hover:text-text-base transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('securePassword')}</label>
                    <div className="relative group">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-12 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 p-1 hover:bg-bg-surface/50 rounded-lg transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4 text-text-muted" /> : <Eye className="h-4 w-4 text-text-muted" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-0.5">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-3.5 h-3.5 rounded border-border-base text-[#3634B3] focus:ring-0 cursor-pointer bg-bg-base" />
                      <span className="text-[10px] text-text-muted font-medium group-hover:text-text-base transition-colors tracking-tight">{t('rememberMe')}</span>
                    </label>
                    <button type="button" onClick={() => setAuthMode('register')} className="text-[9px] font-bold text-[#3634B3] hover:underline uppercase tracking-tight transition-colors">{t('forgotPassword')}</button>
                  </div>

                  <button type="submit" className="w-full py-3 bg-[#3634B3] hover:opacity-90 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-[#3634B3]/20 transition-all uppercase tracking-tight active:scale-[0.98]">
                    {t('signIn')}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="register-form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-7 text-center">
                  <h2 className="text-2xl font-bold text-text-base tracking-tight transition-colors">{t('registerAccount')}</h2>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('fullName')}</label>
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="Nguyen Van A"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full px-5 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('email')}</label>
                      <div className="relative group">
                        <input 
                          type="email" 
                          placeholder="example@sentinel.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-5 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('password')}</label>
                    <div className="relative group">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-12 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 p-1 hover:bg-bg-surface/50 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4 text-text-muted" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-tight block ml-1 transition-colors">{t('confirmPassword')}</label>
                    <div className="relative group">
                      <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-12 py-3 bg-bg-base border border-border-base rounded-xl text-sm transition-all focus:outline-none focus:ring-4 focus:ring-indigo-600/5 dark:focus:ring-indigo-400/5 focus:border-indigo-600/20 dark:focus:border-indigo-400/20 group-hover:border-indigo-600/10 dark:group-hover:border-indigo-400/10 font-medium tracking-tight text-text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 pt-0.5">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 rounded border-border-base text-[#3634B3] focus:ring-0 cursor-pointer bg-bg-base" />
                      <span className="text-[9px] text-text-muted font-medium leading-normal tracking-tight transition-colors">
                        {t('agreeTerms')} <span className="font-bold text-text-base underline">{t('termsOfService')}</span>.
                      </span>
                    </label>
                  </div>

                  <button type="submit" className="w-full py-3 bg-[#3634B3] hover:opacity-90 text-white text-xs font-bold rounded-xl shadow-lg shadow-[#3634B3]/20 transition-all uppercase tracking-tight active:scale-[0.98]">
                    {t('createAccount')}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4 mt-5">
            <div className="relative py-1.5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border-base transition-colors"></span>
              </div>
              <div className="relative flex justify-center text-[9px] uppercase">
                <span className="bg-bg-surface px-3 text-text-muted font-bold tracking-tight transition-colors">{t('orContinueWith')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                className="flex items-center justify-center gap-2 py-2 border border-border-base rounded-xl hover:bg-bg-base transition-all active:scale-[0.98] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <div className="h-3.5 w-3.5 border-2 border-[#3634B3]/20 border-t-[#3634B3] rounded-full animate-spin"></div>
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-3.5 w-3.5" />
                )}
                <span className="text-[10px] font-bold text-text-base tracking-tight transition-colors">
                  {isGoogleLoading ? t('signingIn') || 'Signing in...' : t('googleAuth')}
                </span>
              </button>
              <button className="flex items-center justify-center gap-2 py-2 border border-border-base rounded-xl hover:bg-bg-base transition-all active:scale-[0.98] transition-colors">
                <Apple className="h-3.5 w-3.5 text-text-base" />
                <span className="text-[10px] font-bold text-text-base tracking-tight transition-colors">{t('appleAuth')}</span>
              </button>
            </div>

            <div className="text-center text-[11px] text-text-muted mt-4 tracking-tight font-medium transition-colors">
              {isLogin ? (
                <>{t('dontHaveAccount')} <button onClick={() => setAuthMode('register')} className="text-[#3634B3] font-bold hover:underline">{t('signUp')}</button></>
              ) : (
                <>{t('alreadyHaveAccount')} <button onClick={() => setAuthMode('login')} className="text-[#3634B3] font-bold hover:underline">{t('signIn')}</button></>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
