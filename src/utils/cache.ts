
// Persistent cache for API data to avoid spinners on tab navigation and after login
const MEMORY_CACHE: Record<string, { data: any, timestamp: number }> = {};
const DEFAULT_TTL = 30 * 60 * 1000; // Increase to 30 minutes for better persistence
const CACHE_PREFIX = 'sentinel_cache_';

export const setCache = (key: string, data: any): boolean => {
  const item = { data, timestamp: Date.now() };
  
  // Save to memory
  MEMORY_CACHE[key] = item;
  
  // Save to localStorage for persistence
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(item));
    return true;
  } catch (e) {
    console.warn('Failed to save cache to localStorage', e);
    return false;
  }
};

export const getCache = (key: string, ttl = DEFAULT_TTL) => {
  // Try memory first (fastest)
  let item = MEMORY_CACHE[key];
  
  // Try localStorage if not in memory
  if (!item) {
    try {
      const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (stored) {
        item = JSON.parse(stored);
        // Hydrate memory cache
        MEMORY_CACHE[key] = item;
      }
    } catch (e) {
      console.warn('Failed to read cache from localStorage', e);
    }
  }

  if (!item) return null;
  
  const isExpired = Date.now() - item.timestamp > ttl;
  if (isExpired) {
    // Optional: could remove from localStorage here
    return null;
  }
  
  return item.data;
};

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
