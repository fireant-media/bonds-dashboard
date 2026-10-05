import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useAccess } from '../auth/authStore';
import {
  deleteAdminUser,
  listAdminUsers,
  saveAdminUser,
  type AdminUser,
} from '../api/admin';
import { Card } from './ui/Card';

const extractError = (err: unknown, fallback: string): string => {
  const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
  return anyErr?.response?.data?.error || anyErr?.message || fallback;
};

const formatLastLogin = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

export default function AdminView() {
  const { t } = useLanguage();
  const access = useAccess();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUsers(await listAdminUsers());
    } catch (err) {
      setError(extractError(err, t('adminLoadError')));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const list = await saveAdminUser({ email, role: newRole, enabled: true });
      setUsers(list);
      setNewEmail('');
      setNewRole('user');
    } catch (err) {
      setError(extractError(err, t('adminLoadError')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const runMutation = async (email: string, fn: () => Promise<AdminUser[]>) => {
    setBusyEmail(email);
    setError(null);
    try {
      setUsers(await fn());
    } catch (err) {
      setError(extractError(err, t('adminLoadError')));
    } finally {
      setBusyEmail(null);
    }
  };

  const toggleRole = (user: AdminUser) =>
    runMutation(user.email, () =>
      saveAdminUser({ email: user.email, role: user.role === 'admin' ? 'user' : 'admin' }),
    );

  const toggleEnabled = (user: AdminUser) =>
    runMutation(user.email, () => saveAdminUser({ email: user.email, enabled: !user.enabled }));

  const remove = (user: AdminUser) => runMutation(user.email, () => deleteAdminUser(user.email));

  const openMode = access?.enforced === false;

  return (
    <div className="mx-auto w-full max-w-5xl px-1 py-4 sm:px-3">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-500/20">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-base">{t('adminAccountsTitle')}</h1>
          <p className="mt-1 text-sm font-medium text-text-muted">{t('adminAccountsDesc')}</p>
        </div>
      </div>

      {openMode ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium leading-6">{t('adminOpenModeWarning')}</p>
        </div>
      ) : null}

      <Card className="p-4">
        <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder={t('adminAddPlaceholder')}
            className="min-w-0 flex-1 rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm text-text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value === 'admin' ? 'admin' : 'user')}
            className="rounded-lg border border-border-base bg-bg-base px-3 py-2.5 text-sm font-semibold text-text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="user">{t('adminRoleMember')}</option>
            <option value="admin">{t('adminRoleAdmin')}</option>
          </select>
          <button
            type="submit"
            disabled={isSubmitting || !newEmail.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t('adminAddButton')}
          </button>
        </form>
      </Card>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border-base bg-bg-base/60 text-xs font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3">{t('adminColEmail')}</th>
                <th className="px-4 py-3">{t('adminColRole')}</th>
                <th className="px-4 py-3">{t('adminColStatus')}</th>
                <th className="px-4 py-3">{t('adminColLastLogin')}</th>
                <th className="px-4 py-3 text-right">{t('adminColActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-medium text-text-muted">
                    {t('adminEmpty')}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const busy = busyEmail === user.email;
                  return (
                    <tr key={user.email} className="text-text-base">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{user.email}</span>
                          {user.locked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <Lock className="h-3 w-3" />
                              {t('adminEnvBadge')}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            user.role === 'admin'
                              ? 'inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                              : 'inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }
                        >
                          {user.role === 'admin' ? t('adminRoleAdmin') : t('adminRoleMember')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            user.enabled
                              ? 'inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400'
                              : 'inline-flex items-center gap-1 text-xs font-semibold text-slate-400'
                          }
                        >
                          {user.enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {user.enabled ? t('adminEnabled') : t('adminDisabled')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {formatLastLogin(user.lastLoginAt) || t('adminNeverLoggedIn')}
                      </td>
                      <td className="px-4 py-3">
                        {user.locked ? (
                          <div className="flex justify-end">
                            <span className="text-xs text-text-muted">—</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : null}
                            <button
                              type="button"
                              onClick={() => toggleRole(user)}
                              disabled={busy}
                              className="rounded-md border border-border-base px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
                            >
                              {user.role === 'admin' ? t('adminMakeMember') : t('adminMakeAdmin')}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleEnabled(user)}
                              disabled={busy}
                              className="rounded-md border border-border-base px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-amber-300 hover:text-amber-600 disabled:opacity-50"
                            >
                              {user.enabled ? t('adminDisable') : t('adminEnable')}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(user)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md border border-border-base px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                              aria-label={t('adminRemove')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
