import { QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';

const DASHBOARD_STALE_TIME = 15 * 60 * 1000;
const DASHBOARD_GC_TIME = 60 * 60 * 1000;

const QUERY_PERSIST_KEY = 'dashboard_query_cache_v2';
const QUERY_PERSIST_TS_KEY = 'dashboard_query_cache_ts_v2';
const QUERY_PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const PERSISTABLE_ROOT_KEYS = new Set(['dashboard', 'bond', 'news', 'watchlist']);

const canPersistQueryKey = (queryKey: readonly unknown[]) => {
  const root = String(queryKey[0] ?? '');
  return PERSISTABLE_ROOT_KEYS.has(root);
};

const isMeaningfulIndustryDashboardData = (value: unknown) => {
  const data = value as { bonds?: unknown[]; issuerSummaries?: unknown[]; symbols?: unknown[]; industryStats?: { bondCount?: number } } | null | undefined;
  if (!data || typeof data !== 'object') return false;

  return Boolean(
    (Array.isArray(data.bonds) && data.bonds.length > 0)
    || (Array.isArray(data.issuerSummaries) && data.issuerSummaries.length > 0)
    || (Array.isArray(data.symbols) && data.symbols.length > 0)
    || data.industryStats?.bondCount
  );
};

const canHydratePersistedQuery = (query: { queryKey: readonly unknown[]; state: { data: unknown } }) => {
  if (!canPersistQueryKey(query.queryKey)) return false;

  const root = String(query.queryKey[0] ?? '');
  const section = String(query.queryKey[1] ?? '');

  if (root === 'dashboard' && section === 'industry') {
    return isMeaningfulIndustryDashboardData(query.state.data);
  }

  if (root === 'news') {
    return Array.isArray(query.state.data) && query.state.data.length > 0;
  }

  return true;
};

export const dashboardQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DASHBOARD_STALE_TIME,
      gcTime: DASHBOARD_GC_TIME,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

export const restoreDashboardQueryCache = (queryClient: QueryClient) => {
  if (typeof window === 'undefined') return;

  try {
    const persistedAt = Number(window.localStorage.getItem(QUERY_PERSIST_TS_KEY) || 0);
    if (!persistedAt || Date.now() - persistedAt > QUERY_PERSIST_MAX_AGE) return;

    const raw = window.localStorage.getItem(QUERY_PERSIST_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as DehydratedState;
    parsed.queries = (parsed.queries || []).filter((query) => canHydratePersistedQuery(query as any));
    hydrate(queryClient, parsed);
  } catch (error) {
    console.warn('Failed to restore React Query cache', error);
  }
};

export const setupDashboardQueryPersistence = (queryClient: QueryClient) => {
  if (typeof window === 'undefined') return () => {};

  let timeout: number | null = null;

  const persist = () => {
    try {
      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => {
          if (!canPersistQueryKey(query.queryKey)) return false;

          const root = String(query.queryKey[0] ?? '');
          const section = String(query.queryKey[1] ?? '');

          if (root === 'dashboard' && section === 'industry') {
            return isMeaningfulIndustryDashboardData(query.state.data);
          }

          if (root === 'news') {
            return Array.isArray(query.state.data) && query.state.data.length > 0;
          }

          return true;
        },
      });

      window.localStorage.setItem(QUERY_PERSIST_KEY, JSON.stringify(state));
      window.localStorage.setItem(QUERY_PERSIST_TS_KEY, String(Date.now()));
    } catch (error) {
      console.warn('Failed to persist React Query cache', error);
    }
  };

  const schedulePersist = () => {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }

    timeout = window.setTimeout(() => {
      timeout = null;
      persist();
    }, 250);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    schedulePersist();
  });

  persist();

  return () => {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    unsubscribe();
  };
};

export const dashboardQueryStaleTime = DASHBOARD_STALE_TIME;
