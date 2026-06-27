const DEFAULT_MAX_ITEM_LENGTH = 750_000;

const LOW_PRIORITY_PREFIXES = [
  'sentinel_cache_',
  'dashboard_query_cache_',
  'dashboard_query_cache_ts_',
];

export const isQuotaExceededError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; code?: number };
  return value.name === 'QuotaExceededError' || value.code === 22 || value.code === 1014;
};

export const pruneLowPriorityLocalStorage = (preserveKeys: string[] = []) => {
  if (typeof window === 'undefined') return 0;

  const preserve = new Set(preserveKeys);
  const keys: string[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || preserve.has(key)) continue;
      if (LOW_PRIORITY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }

    keys.forEach((key) => window.localStorage.removeItem(key));
    return keys.length;
  } catch (error) {
    console.warn('Failed to prune low-priority localStorage entries', error);
    return 0;
  }
};

export const safeSetLocalStorageItem = (
  key: string,
  value: string,
  options: {
    maxLength?: number;
    preserveKeys?: string[];
    retryAfterPrune?: boolean;
    warnOnFailure?: boolean;
    warnOnTooLarge?: boolean;
    warnLabel?: string;
  } = {},
) => {
  if (typeof window === 'undefined') return false;

  const maxLength = options.maxLength ?? DEFAULT_MAX_ITEM_LENGTH;
  const warnLabel = options.warnLabel || key;
  const warnOnFailure = options.warnOnFailure !== false;

  if (value.length > maxLength) {
    if (options.warnOnTooLarge) {
      console.warn(`Skipping localStorage persist for ${warnLabel}: payload is too large (${value.length} chars)`);
    }
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error) || options.retryAfterPrune === false) {
      if (warnOnFailure) {
        console.warn(`Failed to persist ${warnLabel} to localStorage`, error);
      }
      return false;
    }

    pruneLowPriorityLocalStorage([key, ...(options.preserveKeys || [])]);

    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      if (warnOnFailure) {
        console.warn(`Failed to persist ${warnLabel} to localStorage after pruning`, retryError);
      }
      return false;
    }
  }
};
