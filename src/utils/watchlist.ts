import { clearCache, getCache, setCache } from './cache';
import type { Bond } from '../types';

export interface WatchlistItem extends Bond {
  issuerName: string;
  ticker?: string;
  addedAt: number;
  bondType?: string;
}

const STORAGE_KEY = 'sentinel_watchlist_bonds';
const WATCHLIST_UPDATED_EVENT = 'sentinel-watchlist-updated';

export interface WatchlistSaveResult {
  items: WatchlistItem[];
  persistedToLocalStorage: boolean;
  usedFallback: boolean;
  error?: string;
}

export interface WatchlistUpsertOptions {
  preserveAddedAt?: boolean;
}

function buildWatchlistItem(item: Omit<WatchlistItem, 'addedAt'>, addedAt: number): WatchlistItem {
  return {
    id: String(item.id || item.code),
    code: String(item.code || '').trim(),
    enterpriseId: String(item.enterpriseId || '').trim(),
    term: String(item.term || ''),
    interestRate: Number(item.interestRate || 0),
    listedVolume: Number(item.listedVolume || 0),
    issuedValue: Number(item.issuedValue || 0),
    listedValue: Number(item.listedValue || 0),
    issueDate: String(item.issueDate || ''),
    maturityDate: String(item.maturityDate || ''),
    interestType: String(item.interestType || ''),
    bondType: String(item.bondType || ''),
    status: String(item.status || ''),
    issuerName: String(item.issuerName || item.enterpriseId || item.code || ''),
    ticker: String(item.ticker || item.enterpriseId || ''),
    addedAt,
  };
}

function readStoredWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => buildWatchlistItem(item, Number(item?.addedAt) || Date.now()));
      }
    }
  } catch (error) {
    console.warn('Failed to read watchlist from localStorage', error);
  }

  const legacyCache = getCache('tracked_watchlist_bonds');
  if (Array.isArray(legacyCache)) {
    return legacyCache.map((item) => buildWatchlistItem(item, Number(item?.addedAt) || Date.now()));
  }

  return [];
}

function writeStoredWatchlist(items: WatchlistItem[]): WatchlistSaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return {
      items,
      persistedToLocalStorage: true,
      usedFallback: false,
    };
  } catch (error) {
    console.warn('Failed to save watchlist to localStorage', error);

    // Watchlist is user-facing state. If storage is full, clear cached API data
    // and retry once before falling back to ephemeral storage.
    try {
      clearCache();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return {
        items,
        persistedToLocalStorage: true,
        usedFallback: false,
      };
    } catch (retryError) {
      console.warn('Failed to persist watchlist after pruning cache', retryError);
    }

    // Keep a session-safe fallback so the watchlist still works when
    // persistent storage is blocked or unavailable.
    const fallbackSaved = setCache('tracked_watchlist_bonds', items);
    return {
      items,
      persistedToLocalStorage: false,
      usedFallback: fallbackSaved,
      error: error instanceof Error ? error.message : 'Failed to save watchlist to localStorage',
    };
  }
}

function emitWatchlistUpdated() {
  window.dispatchEvent(new Event(WATCHLIST_UPDATED_EVENT));
}

export function getWatchlistItems(): WatchlistItem[] {
  return readStoredWatchlist();
}

export function isBondTracked(code: string): boolean {
  return readStoredWatchlist().some((item) => item.code === code);
}

export function upsertWatchlistItem(item: Omit<WatchlistItem, 'addedAt'>, options: WatchlistUpsertOptions = {}): WatchlistItem[] {
  return upsertWatchlistItemWithStatus(item, options).items;
}

export function upsertWatchlistItemWithStatus(item: Omit<WatchlistItem, 'addedAt'>, options: WatchlistUpsertOptions = {}): WatchlistSaveResult {
  const items = readStoredWatchlist();
  const existing = items.find((entry) => entry.code === item.code);
  const nextItem = buildWatchlistItem(item, options.preserveAddedAt && existing ? existing.addedAt : Date.now());

  const index = items.findIndex((entry) => entry.code === item.code);
  const next = index >= 0
    ? items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...nextItem } : entry))
    : [nextItem, ...items];

  const result = writeStoredWatchlist(next);
  emitWatchlistUpdated();
  return result;
}

export function removeWatchlistItem(code: string): WatchlistItem[] {
  return removeWatchlistItemWithStatus(code).items;
}

export function removeWatchlistItemWithStatus(code: string): WatchlistSaveResult {
  const next = readStoredWatchlist().filter((item) => item.code !== code);
  const result = writeStoredWatchlist(next);
  emitWatchlistUpdated();
  return result;
}

export function onWatchlistUpdated(handler: () => void) {
  const listener = () => handler();
  window.addEventListener(WATCHLIST_UPDATED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(WATCHLIST_UPDATED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
