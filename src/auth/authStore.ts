import { create } from 'zustand';
import type { User } from 'oidc-client';
import type { UserAccount } from '../models/users';

export interface AccessInfo {
  /** Whether this FireAnt account is allowed to use the app (on the allowlist / open mode). */
  allowed: boolean;
  /** Whether this account is an admin (email in ADMIN_FIREANT or promoted via /admin). */
  isAdmin: boolean;
  role: 'admin' | 'user' | string;
  /** Whether server-side access control is active (an admin exists). */
  enforced?: boolean;
}

export interface AuthState {
  user: User | null;
  account: UserAccount | null;
  roles: string[];
  /** Server-verified access decision for the current FireAnt account. `null` = not resolved yet. */
  access: AccessInfo | null;
  isLoading: boolean;
  isAccountLoading: boolean;
  setUser: (user: User | null) => void;
  setAccount: (account: UserAccount | null) => void;
  setAccess: (access: AccessInfo | null) => void;
  setLoading: (loading: boolean) => void;
  setAccountLoading: (loading: boolean) => void;
  reset: () => void;
}

const extractRoles = (user: User | null): string[] => {
  if (!user) return [];
  const profile = user.profile as Record<string, unknown>;
  const raw = profile.roles ?? profile.role;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return [raw];
  return [];
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  account: null,
  roles: [],
  access: null,
  isLoading: true,
  isAccountLoading: false,
  setUser: (user) =>
    set({
      user,
      roles: extractRoles(user),
    }),
  setAccount: (account) => set({ account }),
  setAccess: (access) => set({ access }),
  setLoading: (loading) => set({ isLoading: loading }),
  setAccountLoading: (loading) => set({ isAccountLoading: loading }),
  reset: () =>
    set({
      user: null,
      account: null,
      roles: [],
      access: null,
      isLoading: false,
      isAccountLoading: false,
    }),
}));

export const getAuthSnapshot = () => useAuthStore.getState();

export const getStoredAccessToken = (): string | null => {
  const { user } = useAuthStore.getState();
  if (!user) return null;
  if (user.expires_at && user.expires_at <= Date.now() / 1000) return null;
  return user.access_token ?? null;
};

export const useAuthUser = (): UserAccount | null =>
  useAuthStore((s) => s.account);

export const useOidcSession = (): User | null =>
  useAuthStore((s) => s.user);

export const useIsAuthenticated = (): boolean =>
  useAuthStore((s) => Boolean(s.user));

export const useAccess = (): AccessInfo | null => useAuthStore((s) => s.access);

export const useIsAdmin = (): boolean => useAuthStore((s) => Boolean(s.access?.isAdmin));

export const useIsGoogleUser = (): boolean =>
  useAuthStore((s) => {
    const profile = s.user?.profile as Record<string, unknown> | undefined;
    const idp = typeof profile?.idp === 'string' ? profile.idp.toLowerCase() : '';
    return idp.includes('google');
  });
