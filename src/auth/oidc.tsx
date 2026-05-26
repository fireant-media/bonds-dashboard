import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from 'oidc-client';
import { useAuthStore } from './authStore';
import { getUserAccount } from '../api/users';
import { APP_URL } from '../api/config';
import { removeFireantToken, setFireantToken } from '../utils/token';

const scopes = [
  'openid',
  'profile',
  'roles',
  'email',
  'accounts-read',
  'accounts-write',
  'orders-read',
  'orders-write',
  'companies-read',
  'individuals-read',
  'finance-read',
  'posts-write',
  'posts-read',
  'symbols-read',
  'user-data-read',
  'user-data-write',
  'users-read',
  'search',
  'academy-read',
  'academy-write',
  'blog-read',
  'investopedia-read',
].join(' ');

const oidcAuthority =
  import.meta.env.VITE_OIDC_AUTHORITY?.trim() || 'https://accounts.fireant.vn';
const oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID?.trim();
const appBaseUrl = APP_URL;
const isPopupWindow = () => Boolean(window.opener && window.opener !== window);

const OIDC_STORAGE_PREFIX = 'oidc.';
const AUTH_STORAGE_PRESSURE_PREFIXES = [
  OIDC_STORAGE_PREFIX,
  'sentinel_cache_',
  'fireant_access_token',
  'ai_chat_history',
];

const isQuotaExceededError = (error: unknown): boolean => {
  if (!(error instanceof DOMException)) {
    const message = error instanceof Error ? error.message : String(error);
    return /quota|storage/i.test(message);
  }

  return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
};

const pruneAuthStoragePressure = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (AUTH_STORAGE_PRESSURE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.warn(`Pruned ${keysToRemove.length} auth/cache items to free localStorage space`);
    }
  } catch (error) {
    console.warn('Failed to prune localStorage pressure', error);
  }
};

const resilientLocalStorage: Storage = {
  get length() {
    return window.localStorage.length;
  },
  clear: () => window.localStorage.clear(),
  getItem: (key: string) => window.localStorage.getItem(key),
  key: (index: number) => window.localStorage.key(index),
  removeItem: (key: string) => window.localStorage.removeItem(key),
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        throw error;
      }

      pruneAuthStoragePressure();
      window.localStorage.setItem(key, value);
    }
  },
};

const getOidcSettings = (): UserManagerSettings => ({
  authority: oidcAuthority,
  client_id: oidcClientId,
  redirect_uri: `${appBaseUrl}/signin-callback`,
  post_logout_redirect_uri: `${appBaseUrl}/signout-callback`,
  silent_redirect_uri: `${appBaseUrl}/silent-renew-callback`,
  popup_redirect_uri: `${appBaseUrl}/signin-callback`,
  popup_post_logout_redirect_uri: `${appBaseUrl}/signout-callback`,
  response_type: 'id_token token',
  scope: scopes,
  automaticSilentRenew: true,
  monitorSession: false,
  filterProtocolClaims: true,
  clockSkew: 86400,
  popupWindowFeatures:
    'location=no,toolbar=no,width=800,height=600,left=100,top=100',
  userStore: new WebStorageStateStore({ store: resilientLocalStorage }),
});

export const authManager = new UserManager(getOidcSettings());

let bootstrapPromise: Promise<void> | null = null;

export const refreshUserAccount = async (): Promise<void> => {
  const store = useAuthStore.getState();
  if (!store.user) {
    store.setAccount(null);
    return;
  }

  store.setAccountLoading(true);
  try {
    const response = await getUserAccount();
    if (response.isError) {
      console.error('Failed to load user account:', response.errorMessage);
      useAuthStore.getState().setAccount(null);
      return;
    }
    useAuthStore.getState().setAccount(response.data ?? null);
  } catch (error) {
    console.error('Failed to load user account', error);
    useAuthStore.getState().setAccount(null);
  } finally {
    useAuthStore.getState().setAccountLoading(false);
  }
};

export const bootstrapAuth = (): Promise<void> => {
  if (bootstrapPromise) return bootstrapPromise;

  const { setUser, setLoading } = useAuthStore.getState();

  bootstrapPromise = (async () => {
    try {
      const user = await authManager.getUser();
      setUser(user ?? null);
      if (user) {
        if (user.access_token) {
          setFireantToken(user.access_token);
        }
        await refreshUserAccount();
      } else {
        removeFireantToken();
      }
    } catch (error) {
      console.error('Failed to bootstrap OIDC user', error);
      setUser(null);
      removeFireantToken();
    } finally {
      setLoading(false);
    }
  })();

  authManager.events.addUserLoaded((user) => {
    useAuthStore.getState().setUser(user);
    if (user?.access_token) {
      setFireantToken(user.access_token);
    }
    void refreshUserAccount();
  });
  authManager.events.addUserUnloaded(() => {
    const store = useAuthStore.getState();
    store.setUser(null);
    store.setAccount(null);
    removeFireantToken();
  });
  authManager.events.addAccessTokenExpired(() => {
    authManager.removeUser().catch((error) => {
      console.error('Failed to remove expired user', error);
    });
    const store = useAuthStore.getState();
    store.setUser(null);
    store.setAccount(null);
    removeFireantToken();
  });
  authManager.events.addSilentRenewError((error) => {
    console.warn('Silent renew error', error);
  });

  return bootstrapPromise;
};

export const useOidcAuth = () => {
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  const signIn = useCallback(async () => {
    if (!oidcClientId) {
      throw new Error('Missing VITE_OIDC_CLIENT_ID');
    }
    try {
      pruneAuthStoragePressure();
      await authManager.signinPopup();
    } catch (error) {
      console.error('Sign-in popup failed', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authManager.signoutPopup();
    } catch (error) {
      console.warn('Sign-out popup failed', error);
    }
    try {
      await authManager.removeUser();
    } catch (err) {
      console.error('Failed to remove user after sign-out', err);
    }
    removeFireantToken();
    useAuthStore.getState().reset();
  }, []);

  return { user, roles, isLoading, signIn, signOut };
};

export function SignInCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const completeSignIn = async () => {
      try {
        if (isPopupWindow()) {
          await authManager.signinPopupCallback();
          const popupUser = await authManager.getUser();
          useAuthStore.getState().setUser(popupUser ?? null);
          if (popupUser?.access_token) {
            setFireantToken(popupUser.access_token);
            await refreshUserAccount();
          } else {
            removeFireantToken();
          }
          window.close();
          return;
        }

        const user = await authManager.signinCallback();
        console.log('Sign-in callback completed:', user ? 'User loaded' : 'No user');
        const resolvedUser = user ?? (await authManager.getUser());
        useAuthStore.getState().setUser(resolvedUser ?? null);

        if (resolvedUser?.access_token) {
          setFireantToken(resolvedUser.access_token);
          await refreshUserAccount();
        } else {
          removeFireantToken();
        }

        if (!resolvedUser) {
          console.warn('Sign-in callback returned no user');
        }
      } catch (error) {
        console.error('Sign-in callback failed:', error);
      } finally {
        navigate('/', { replace: true });
      }
    };

    completeSignIn();
  }, [navigate]);

  return null;
}

export function SilentRenewCallback() {
  useEffect(() => {
    authManager.signinSilentCallback().catch((error) => {
      console.error('Silent renew callback failed', error);
    });
  }, []);

  return null;
}

export function SignOutCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const completeSignOut = async () => {
      try {
        if (isPopupWindow()) {
          await authManager.signoutPopupCallback();
          window.close();
          return;
        }
        await authManager.signoutRedirectCallback();
      } catch (error) {
        console.error('Sign-out callback failed', error);
      } finally {
        removeFireantToken();
        useAuthStore.getState().reset();
        navigate('/', { replace: true });
      }
    };

    completeSignOut();
  }, [navigate]);

  return null;
}
