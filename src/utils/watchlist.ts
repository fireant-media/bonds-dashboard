import { getCache } from './cache';
import type { Bond } from '../types';

export interface WatchlistItem extends Bond {
  issuerName: string;
  ticker?: string;
  addedAt: number;
}

const STORAGE_KEY = 'sentinel_watchlist_bonds';
const WATCHLIST_UPDATED_EVENT = 'sentinel-watchlist-updated';

function readStoredWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as WatchlistItem[];
    }
  } catch (error) {
    console.warn('Failed to read watchlist from localStorage', error);
  }

  const legacyCache = getCache('tracked_watchlist_bonds');
  return Array.isArray(legacyCache) ? (legacyCache as WatchlistItem[]) : [];
}

function writeStoredWatchlist(items: WatchlistItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Failed to save watchlist to localStorage', error);
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

export function upsertWatchlistItem(item: Omit<WatchlistItem, 'addedAt'>): WatchlistItem[] {
  const items = readStoredWatchlist();
  const nextItem: WatchlistItem = {
    ...item,
    addedAt: Date.now(),
  };

  const index = items.findIndex((entry) => entry.code === item.code);
  const next = index >= 0
    ? items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...nextItem } : entry))
    : [nextItem, ...items];

  writeStoredWatchlist(next);
  emitWatchlistUpdated();
  return next;
}

export function removeWatchlistItem(code: string): WatchlistItem[] {
  const next = readStoredWatchlist().filter((item) => item.code !== code);
  writeStoredWatchlist(next);
  emitWatchlistUpdated();
  return next;
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
