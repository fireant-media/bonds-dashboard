
import { safeSetLocalStorageItem } from './localStorageBudget';

// Persistent cache for API data to avoid spinners on tab navigation and after login
const MEMORY_CACHE: Record<string, { data: any, timestamp: number }> = {};
const DEFAULT_TTL = 30 * 60 * 1000; // Increase to 30 minutes for better persistence
const CACHE_PREFIX = 'sentinel_cache_';
const MAX_PERSISTED_CACHE_ITEM_LENGTH = 450_000;

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const readCacheEntry = <T = any>(key: string): CacheEntry<T> | null => {
  let item = MEMORY_CACHE[key] as CacheEntry<T> | undefined;

  if (!item) {
    try {
      const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (stored) {
        item = JSON.parse(stored) as CacheEntry<T>;
        MEMORY_CACHE[key] = item;
      }
    } catch (e) {
      console.warn('Failed to read cache from localStorage', e);
    }
  }

  return item || null;
};

export const setCache = (key: string, data: any): boolean => {
  const item = { data, timestamp: Date.now() };
  
  // Save to memory
  MEMORY_CACHE[key] = item;
  
  const serialized = JSON.stringify(item);
  return safeSetLocalStorageItem(`${CACHE_PREFIX}${key}`, serialized, {
    maxLength: MAX_PERSISTED_CACHE_ITEM_LENGTH,
    warnOnFailure: false,
    warnLabel: `cache ${key}`,
  });
};

export const getCache = (key: string, ttl = DEFAULT_TTL) => {
  const item = readCacheEntry(key);
  if (!item) return null;
  
  const isExpired = Date.now() - item.timestamp > ttl;
  if (isExpired) {
    // Optional: could remove from localStorage here
    return null;
  }
  
  return item.data;
};

export const getCacheEntry = <T = any>(key: string, ttl = DEFAULT_TTL): CacheEntry<T> | null => {
  const item = readCacheEntry<T>(key);
  if (!item) return null;

  if (Date.now() - item.timestamp > ttl) {
    return null;
  }

  return item;
};

export const getCacheEntryAllowExpired = <T = any>(key: string): CacheEntry<T> | null =>
  readCacheEntry<T>(key);

export const clearCache = (prefix?: string) => {
  // Clear memory
  if (!prefix) {
    Object.keys(MEMORY_CACHE).forEach(key => delete MEMORY_CACHE[key]);
  } else {
    Object.keys(MEMORY_CACHE).forEach(key => {
      if (key.startsWith(prefix)) delete MEMORY_CACHE[key];
    });
  }

  // Clear localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            if (!prefix || key.startsWith(`${CACHE_PREFIX}${prefix}`)) {
                localStorage.removeItem(key);
                i--; // Adjust index after removal
            }
        }
    }
  } catch (e) {
    console.warn('Failed to clear cache from localStorage', e);
  }
};
