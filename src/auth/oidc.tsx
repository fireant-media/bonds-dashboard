import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from 'oidc-client';
import { useAuthStore } from './authStore';
import { getUserAccount } from '../api/users';

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
const oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID?.trim() || 'fireant.bonds';
const appBaseUrl =
  import.meta.env.VITE_APP_BASE_URL?.trim() || window.location.origin;
const isPopupWindow = () => Boolean(window.opener && window.opener !== window);

const POPUP_CLOSED_PATTERNS = ['popup window closed', 'popup closed', 'closed by user'];
const isPopupClosedByUser = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return POPUP_CLOSED_PATTERNS.some((pattern) => message.includes(pattern));
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
  userStore: new WebStorageStateStore({ store: window.localStorage }),
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
        await refreshUserAccount();
      }
    } catch (error) {
      console.error('Failed to bootstrap OIDC user', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  })();

  authManager.events.addUserLoaded((user) => {
    useAuthStore.getState().setUser(user);
    void refreshUserAccount();
  });
  authManager.events.addUserUnloaded(() => {
    const store = useAuthStore.getState();
    store.setUser(null);
    store.setAccount(null);
  });
  authManager.events.addAccessTokenExpired(() => {
    authManager.removeUser().catch((error) => {
      console.error('Failed to remove expired user', error);
    });
    const store = useAuthStore.getState();
    store.setUser(null);
    store.setAccount(null);
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
      await authManager.signinPopup();
    } catch (error) {
      if (isPopupClosedByUser(error)) {
        console.info('Sign-in popup was dismissed by user');
        return;
      }
      console.warn('Popup sign-in failed, fallback to redirect', error);
      await authManager.signinRedirect();
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authManager.signoutPopup();
    } catch (error) {
      if (!isPopupClosedByUser(error)) {
        console.warn('Popup sign-out failed', error);
      }
    } finally {
      try {
        await authManager.removeUser();
      } catch (err) {
        console.error('Failed to remove user after sign-out', err);
      }
      useAuthStore.getState().reset();
    }
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
          window.close();
          return;
        }

        await authManager.signinCallback();
      } catch (error) {
        console.error('Sign-in callback failed', error);
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
        useAuthStore.getState().reset();
        navigate('/', { replace: true });
      }
    };

    completeSignOut();
  }, [navigate]);

  return null;
}
