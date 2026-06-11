/**
 * Utility to manage the Fireant Access Token.
 * Prioritizes token from the current OIDC session, then localStorage,
 * then falls back to environment variable.
 */

import { getStoredAccessToken } from '../auth/authStore';

const TOKEN_KEY = 'fireant_access_token';

type TokenSource = 'session' | 'localStorage' | 'env' | 'none';

function resolveFireantToken(): { token: string | null; source: TokenSource } {
  const sessionToken = getStoredAccessToken();
  if (sessionToken && sessionToken.trim().length > 10) {
    return { token: sessionToken.trim(), source: 'session' };
  }

  try {
    const localToken = localStorage.getItem(TOKEN_KEY);
    if (localToken && localToken.trim().length > 10) {
      return { token: localToken.trim(), source: 'localStorage' };
    }
  } catch (error) {
    console.warn('Failed to read FireAnt token from localStorage', error);
  }

  const envToken = import.meta.env.VITE_FIREANT_ACCESS_TOKEN;
  if (envToken && envToken.trim().length > 10) {
    return { token: envToken.trim(), source: 'env' };
  }

  return { token: null, source: 'none' };
}

export const getFireantToken = (): string | null => {
  return resolveFireantToken().token;
};

export const setFireantToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch (error) {
    console.warn('Failed to persist FireAnt token to localStorage', error);
  }
};

export const removeFireantToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.warn('Failed to remove FireAnt token from localStorage', error);
  }
};

export const cleanTokenString = (token: string): string => {
  const trimmed = token.trim();
  return trimmed.replace(/^bearer\s+/i, '');
};

export const getFireantTokenDebugInfo = () => {
  const { token, source } = resolveFireantToken();
  const cleanedToken = token ? cleanTokenString(token) : '';
  return {
    hasToken: Boolean(cleanedToken),
    source,
    length: cleanedToken.length,
    preview: cleanedToken ? `${cleanedToken.slice(0, 12)}...${cleanedToken.slice(-6)}` : '',
  };
};
