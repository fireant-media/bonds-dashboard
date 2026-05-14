import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertCircle, LayoutGrid, BarChart4, BellRing, ClipboardList } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import Logo from './Logo';

interface LoginViewProps {
  onSignIn: () => Promise<void> | void;
  isSigningIn?: boolean;
}

export default function LoginView({ onSignIn, isSigningIn = false }: LoginViewProps) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    try {
      await onSignIn();
    } catch (err) {
      console.error('OIDC sign-in failed', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Sign in failed: ${message}`);
    }
  };

  return (
    <div className="h-screen flex bg-bg-base font-sans text-text-base overflow-hidden relative transition-colors">
      {/* Left side - Brand Panel (Product Introduction) */}

      <div className="hidden lg:flex w-1/2 flex-col justify-center items-center p-4 lg:p-6 relative overflow-hidden border-r border-border-base transition-colors">
        <div className="w-full max-w-[500px] p-6 lg:p-8 relative z-10 flex flex-col justify-between h-fit">
          <div className="relative">
            {/* 1. Header with Logo */}
            <div className='absolute -top-10 -left-1'>
            <Logo />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* 2. Hero Section */}
              <h1 className="text-2xl lg:text-3xl font-bold text-blue-600 mb-4 leading-tight tracking-tight transition-colors">
                {t('heroTitle1')} <br />
                <span className="text-text-base font-bold transition-colors">{t('heroTitle2')}</span>
              </h1>

              {/* 3. Description */}
              <p className="text-xs lg:text-[13px] text-text-muted max-w-[420px] leading-relaxed font-medium mb-8 transition-colors">
                {t('heroDesc')}
              </p>

              {/* 4. Grid tính nang (2 c?t x 2 hàng) */}
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
                      <item.icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="text-[10px] font-semibold text-text-base leading-tight tracking-tight uppercase transition-colors">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="space-y-5">
            {/* 5. Khu v?c d? li?u realtime mini (3 card cùng 1 hàng) */}
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

            {/* 6. Footer trái du?i cùng */}
            <div className="pt-6 border-t border-border-base flex items-center gap-3 transition-colors">
              <div className="h-1 w-8 bg-blue-600 rounded-full transition-colors"></div>
              <span className="text-xs font-bold text-blue-600 tracking-[0.4em] uppercase transition-colors">FIREANT FINANCE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 lg:p-8 relative overflow-hidden transition-colors">
        <div className="w-full max-w-[540px] bg-bg-surface rounded-[32px] lg:rounded-[40px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] p-8 lg:p-12 relative z-10 border border-border-base max-h-[85vh] h-fit overflow-y-auto no-scrollbar flex flex-col justify-center transition-colors">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-tight transition-colors">{t('loginWelcome')}</p>
              <h2 className="text-xl font-bold text-text-base tracking-tight transition-colors">{t('loginAccount')}</h2>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 shadow-sm rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-tight transition-colors">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={isSigningIn}
              className="w-full py-3 bg-blue-600 hover:opacity-90 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all uppercase tracking-tight active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningIn ? (t('signingIn') || 'Signing in...') : t('signIn')}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
