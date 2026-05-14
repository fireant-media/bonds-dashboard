/**
 * Utility to manage the Fireant Access Token.
 * Prioritizes token from the current OIDC session, then localStorage,
 * then falls back to environment variable.
 */

import { getStoredAccessToken } from '../auth/authStore';

const TOKEN_KEY = 'fireant_access_token';

export const getFireantToken = (): string | null => {
  const sessionToken = getStoredAccessToken();
  if (sessionToken && sessionToken.trim().length > 10) return sessionToken.trim();

  // Check localStorage first
  const localToken = localStorage.getItem(TOKEN_KEY);
  if (localToken && localToken.trim().length > 10) return localToken.trim();

  // Fallback to env var
  const envToken = import.meta.env.VITE_FIREANT_ACCESS_TOKEN;
  if (envToken && envToken.trim().length > 10) {
    return envToken.trim();
  }

  return null;
};

export const setFireantToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token.trim());
};

export const removeFireantToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

export const cleanTokenString = (token: string): string => {
  const trimmed = token.trim();
  // Remove "Bearer " prefix case-insensitively and handle any amount of whitespace
  return trimmed.replace(/^bearer\s+/i, '');
};
