import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookmarkCheck, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { Portal } from './ui/Portal';
import {
  BondDataRow,
  loadBondFilterRows,
  loadGovernmentBondRows,
  loadUnlistedEnterpriseBondRows,
} from '../services/bondData';
import { buildBondFilterQueryFromCriteria } from '../services/aiBondFilter';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';
import { getLocalizedBondType } from '../utils/bondPresentation';
import {
  createWatchlistItemFromBond,
  isBondTracked,
  onWatchlistUpdated,
  removeWatchlistItemWithStatus,
  upsertWatchlistItemWithStatus,
} from '../utils/watchlist';

interface WatchlistAddBondModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MARKET_BOND_FETCH_LIMIT = 10000;
const MAX_RESULTS = 50;

// Resolve the issuer stock symbol for a bond row. Prefer the symbol carried on
// the row/raw payload; otherwise fall back to the longest known ticker that the
// bond code starts with (Vietnamese corporate bond codes lead with the ticker).
const resolveRowSymbol = (row: BondDataRow, knownSymbolsByLength: string[]): string => {
  const raw = row.raw as Record<string, unknown> | undefined;
  const bondInfos = row.bondInfos as Record<string, unknown> | undefined;
  const direct = String(
    row.issuerSymbol
    || (raw?.issuerSymbol as string | undefined)
    || (raw?.IssuerSymbol as string | undefined)
    || (bondInfos?.Symbol as string | undefined)
    || (bondInfos?.IssuerSymbol as string | undefined)
    || '',
  ).trim().toUpperCase();
  if (direct) return direct;

  const code = String(row.bondCode || '').trim().toUpperCase();
  if (!code) return '';

  for (const symbol of knownSymbolsByLength) {
    if (symbol && code.startsWith(symbol)) return symbol;
  }
  return '';
};

// Relevance score for a search term against a candidate string.
// Lower is better; Infinity means no match. Prefers exact > prefix > word-start > substring.
const scoreMatch = (candidate: string, term: string): number => {
  if (!term) return 0;
  const haystack = candidate.toLowerCase();
  const idx = haystack.indexOf(term);
  if (idx === -1) return Number.POSITIVE_INFINITY;
  if (haystack === term) return 0;
  if (idx === 0) return 1;
  const prevChar = haystack[idx - 1];
  return prevChar && /[^a-z0-9]/.test(prevChar) ? 2 : 3;
};

export default function WatchlistAddBondModal({ isOpen, onClose }: WatchlistAddBondModalProps) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<BondDataRow[]>([]);
  const [knownSymbols, setKnownSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [trackedVersion, setTrackedVersion] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    return onWatchlistUpdated(() => setTrackedVersion((current) => current + 1));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setSearchTerm('');

    let cancelled = false;

    const loadRows = async () => {
      setLoading(rows.length === 0);
      setError(null);

      try {
        const query = buildBondFilterQueryFromCriteria({}, {
          statusID: 1,
          isListing: 1,
          top: MARKET_BOND_FETCH_LIMIT,
        });

        const [marketRows, governmentRows, unlistedEnterpriseRows, symbolGroups] = await Promise.all([
          loadBondFilterRows(query, { enrichWithDetails: false }),
          loadGovernmentBondRows(),
          loadUnlistedEnterpriseBondRows(),
          loadDedupedIndustrySymbols().catch(() => ({} as Record<string, string[]>)),
        ]);

        if (cancelled) return;

        const mergedRows = Array.from(
          new Map(
            [...marketRows, ...governmentRows, ...unlistedEnterpriseRows]
              .filter((row) => Boolean(row?.bondCode))
              .map((row) => [row.bondCode, row] as const),
          ).values(),
        );

        const symbolList = Array.from(
          new Set(
            Object.values(symbolGroups || {})
              .flat()
              .map((symbol) => String(symbol || '').trim().toUpperCase())
              .filter(Boolean),
          ),
        ).sort((left, right) => right.length - left.length);

        setRows(mergedRows);
        setKnownSymbols(symbolList);
      } catch (requestError) {
        if (!cancelled) {
          console.error('Failed to load bonds for watchlist search', requestError);
          setError(requestError instanceof Error ? requestError.message : t('error'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRows();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const entries = useMemo(() => (
    rows.map((row) => ({
      row,
      symbol: resolveRowSymbol(row, knownSymbols),
      issuerName: String(t((row.issuerName || row.issuerSymbol || '') as any, row.issuerSymbol) || row.issuerName || row.issuerSymbol || ''),
    }))
  ), [rows, knownSymbols, t]);

  const matchedEntries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const scored = entries
      .map((entry) => {
        const bondCode = entry.row.bondCode || '';
        const lower = bondCode.toLowerCase();

        if (!term) {
          return { entry, score: 0, idx: 0, lower };
        }

        // Match against bond code, issuer symbol, and issuer name; keep the best.
        const score = Math.min(
          scoreMatch(bondCode, term),
          scoreMatch(entry.symbol, term),
          scoreMatch(entry.issuerName, term),
        );
        if (!Number.isFinite(score)) return null;

        const bondIdx = lower.indexOf(term);
        return { entry, score, idx: bondIdx >= 0 ? bondIdx : Number.MAX_SAFE_INTEGER, lower };
      })
      .filter((item): item is { entry: typeof entries[number]; score: number; idx: number; lower: string } => Boolean(item));

    scored.sort((left, right) => (
      left.score - right.score
      || left.idx - right.idx
      || left.lower.length - right.lower.length
      || left.lower.localeCompare(right.lower)
    ));

    return scored.map((item) => item.entry);
  }, [entries, searchTerm]);

  const filteredEntries = useMemo(() => matchedEntries.slice(0, MAX_RESULTS), [matchedEntries]);
  const totalMatches = matchedEntries.length;

  const handleOpenBondDetail = (bondCode: string) => {
    const normalizedCode = String(bondCode || '').trim();
    if (!normalizedCode) return;
    onClose();
    navigate(`/${encodeURIComponent(normalizedCode)}`, { state: { backgroundLocation: location } });
  };

  const handleAddBond = (row: BondDataRow, symbol: string) => {
    const resolvedSymbol = row.issuerSymbol || symbol;
    upsertWatchlistItemWithStatus(
      createWatchlistItemFromBond({
        code: row.bondCode,
        enterpriseId: resolvedSymbol,
        ticker: resolvedSymbol,
        issuerName: row.issuerName || resolvedSymbol || row.bondCode,
        term: row.tenorPeriod,
        interestRate: row.bondRate,
        listedVolume: row.currentListedVolume,
        issuedValue: row.totalIssuedValue,
        listedValue: row.currentListedValue,
        issueDate: row.issueDate,
        maturityDate: row.maturityDate,
        interestType: row.bondRateType,
        bondType: row.bondType,
        status: row.status,
      }),
      { preserveAddedAt: true },
    );
  };

  if (!isOpen) return null;

  // trackedVersion is referenced so the result list re-renders after a watchlist change.
  void trackedVersion;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-[8vh]"
        onClick={onClose}
      >
        <div
          className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-base bg-surface-bright shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border-base px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-snug text-black md:text-lg">
                {t('addBond')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-muted">
                {language === 'vi'
                  ? 'Tìm theo mã trái phiếu hoặc mã chứng khoán của tổ chức phát hành'
                  : 'Search by bond code or issuer stock symbol'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
              title={t('close')}
              aria-label={t('close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-border-base px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                autoFocus
                placeholder={language === 'vi'
                  ? 'Nhập mã trái phiếu hoặc mã chứng khoán của tổ chức phát hành...'
                  : 'Enter bond code or issuer stock symbol...'}
                className="w-full rounded-lg border border-border-base bg-bg-surface py-2.5 pl-9 pr-3 text-sm font-medium text-text-base outline-none transition-colors placeholder:text-text-muted/70 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-12 text-sm font-semibold text-text-muted">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span>{t('loadingBondsMessage')}</span>
              </div>
            ) : error ? (
              <div className="px-3 py-10 text-center text-sm font-medium text-red-600">{error}</div>
            ) : filteredEntries.length === 0 ? (
              <div className="px-3 py-12 text-center text-sm font-medium text-text-muted">{t('noData')}</div>
            ) : (
              <ul className="space-y-1">
                {filteredEntries.map(({ row, symbol, issuerName }) => {
                  const tracked = isBondTracked(row.bondCode);
                  const bondType = getLocalizedBondType(row.bondType, language);
                  const untrackLabel = language === 'vi' ? 'Bỏ theo dõi' : 'Untrack';

                  return (
                    <li key={row.bondCode}>
                      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-container-low">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenBondDetail(row.bondCode)}
                              className="min-w-0 truncate font-bold text-text-highlight transition-colors hover:text-blue-600 hover:underline"
                              title={`${language === 'vi' ? 'Xem chi tiết' : 'View detail'} ${row.bondCode}`}
                            >
                              {row.bondCode}
                            </button>
                            {symbol ? (
                              <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                {symbol}
                              </span>
                            ) : null}
                            {bondType ? (
                              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-500/10 dark:text-slate-300">
                                {bondType}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs font-medium text-text-muted">
                            {issuerName || t('none')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => (tracked ? removeWatchlistItemWithStatus(row.bondCode) : handleAddBond(row, symbol))}
                          className={`group/track inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            tracked
                              ? 'bg-amber-50 text-amber-600 hover:bg-red-50 hover:text-red-600 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-red-500/10 dark:hover:text-red-300'
                              : 'border border-border-base bg-bg-surface text-text-base hover:border-blue-200 hover:text-blue-600'
                          }`}
                          aria-label={`${tracked ? untrackLabel : t('addBond')} ${row.bondCode}`}
                          title={`${tracked ? untrackLabel : t('addBond')} ${row.bondCode}`}
                        >
                          {tracked ? (
                            <>
                              <BookmarkCheck className="h-3.5 w-3.5 group-hover/track:hidden" />
                              <X className="hidden h-3.5 w-3.5 group-hover/track:inline" />
                              <span className="group-hover/track:hidden">{t('trackedBond')}</span>
                              <span className="hidden group-hover/track:inline">{untrackLabel}</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              <span>{t('addBond')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!loading && !error && totalMatches > MAX_RESULTS ? (
            <div className="border-t border-border-base px-5 py-2.5 text-center text-xs font-medium text-text-muted">
              {language === 'vi'
                ? `Hiển thị ${MAX_RESULTS}/${totalMatches} kết quả. Nhập thêm để thu hẹp tìm kiếm.`
                : `Showing ${MAX_RESULTS} of ${totalMatches} results. Refine your search to narrow it down.`}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
