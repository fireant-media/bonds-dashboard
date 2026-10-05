import { LogOut, ShieldAlert } from 'lucide-react';
import Logo from './Logo';
import { useLanguage } from '../LanguageContext';

interface NotAuthorizedViewProps {
  email?: string;
  onLogout: () => void;
}

export default function NotAuthorizedView({ email, onLogout }: NotAuthorizedViewProps) {
  const { t } = useLanguage();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-100 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-rose-100/60 via-orange-50/30 to-transparent dark:from-rose-500/10 dark:via-orange-500/10 dark:to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-sm shadow-slate-900/5 dark:border-slate-800/80 dark:bg-slate-900/95">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-lg shadow-rose-500/25">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-slate-50">{t('accessDeniedTitle')}</h1>
          <p className="mt-3 text-sm font-medium leading-7 text-slate-500 dark:text-slate-300">
            {t('accessDeniedMessage')}
          </p>
          {email ? (
            <p className="mt-4 inline-flex max-w-full items-center gap-2 truncate rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {email}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/25"
          >
            <LogOut className="h-4 w-4" />
            {t('logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
