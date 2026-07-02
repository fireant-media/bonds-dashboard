import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, Filter, FilterX, ListOrdered, Plus, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import { getLocalizedBondType, getLocalizedInterestType } from '../utils/bondPresentation';
import { useLanguage } from '../LanguageContext';
import { getWatchlistItems, onWatchlistUpdated, removeWatchlistItemWithStatus, upsertWatchlistItem, type WatchlistItem } from '../utils/watchlist';
import { loadBondDetail, type BondDataRow } from '../services/bondData';
import { DataTable, type DataTableColumn } from './ui/DataTable';
import { BondFilterPanel, useBondFilterController } from './BondFilterPanel';
import { filterBondRowsByCriteria, sortBondRowsByCriteria } from '../services/aiBondFilter';
import WatchlistAddBondModal from './WatchlistAddBondModal';

interface WatchlistBond extends WatchlistItem {
  daysLeft: number;
  industry?: string;
  bondType?: string;
}

interface WatchlistViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

const toBillionValue = (value: number | string | null | undefined) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return numericValue > 1_000_000_000 ? numericValue / 1_000_000_000 : numericValue;
};

const toWatchlistFilterRow = (bond: WatchlistBond): BondDataRow => ({
  bondCode: bond.code,
  issuerSymbol: String(bond.ticker || bond.enterpriseId || '').trim(),
  issuerName: String(bond.issuerName || bond.ticker || bond.enterpriseId || bond.code || '').trim(),
  bondType: String(bond.bondType || '').trim(),
  industry: String(bond.industry || '').trim(),
  issueDate: String(bond.issueDate || '').trim(),
  maturityDate: String(bond.maturityDate || '').trim(),
  tenorPeriod: Number(String(bond.term || '').replace(/[^0-9.-]/g, '')) || 0,
  bondRate: Number(bond.interestRate || 0),
  bondRateType: String(bond.interestType || '').trim(),
  currentListedVolume: Number(bond.listedVolume || 0),
  currentListedValue: toBillionValue(bond.listedValue) * 1_000_000_000,
  totalIssuedValue: toBillionValue(bond.issuedValue) * 1_000_000_000,
  totalRemainingDebt: 0,
  totalDebtFull: 0,
  status: String(bond.status || '').trim(),
  bondInfos: {},
  raw: bond,
  daysLeft: Number(bond.daysLeft || 0),
});

function toWatchlistBond(item: WatchlistItem): WatchlistBond | null {
  const code = String(item.code || '').trim();
  if (!code) return null;

  const maturityDate = String(item.maturityDate || '').split('T')[0];
  const maturity = maturityDate ? new Date(maturityDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = maturity
    ? Math.max(0, Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    id: code,
    code,
    enterpriseId: String(item.enterpriseId || item.ticker || ''),
    ticker: String(item.ticker || item.enterpriseId || ''),
    issuerName: String(item.issuerName || item.ticker || item.enterpriseId || code),
    term: item.term || '',
    interestRate: Number(item.interestRate || 0),
    listedVolume: Number(item.listedVolume || 0),
    issuedValue: toBillionValue(item.issuedValue),
    listedValue: toBillionValue(item.listedValue),
    issueDate: String(item.issueDate || ''),
    maturityDate,
    interestType: String(item.interestType || ''),
    status: String(item.status || ''),
    daysLeft,
    industry: String((item as WatchlistItem & { industry?: string }).industry || ''),
    bondType: String((item as WatchlistItem & { bondType?: string }).bondType || ''),
    addedAt: item.addedAt || Date.now(),
  };
}

export default function WatchlistView({ setSelectedBond, setBondEnterpriseName }: WatchlistViewProps) {
  const { t, language } = useLanguage();
  const [bonds, setBonds] = useState<WatchlistBond[]>([]);
  const enrichingRef = useRef(false);
  const [isWatchlistFilterControlsVisible, setIsWatchlistFilterControlsVisible] = useState(false);
  const [watchlistHiddenColumnIds, setWatchlistHiddenColumnIds] = useState<string[]>([]);
  const [watchlistColumnVisibilityDraft, setWatchlistColumnVisibilityDraft] = useState<string[]>([]);
  const [watchlistColumnVisibilityOpen, setWatchlistColumnVisibilityOpen] = useState(false);
  const [isAddBondModalOpen, setIsAddBondModalOpen] = useState(false);
  const watchlistColumnVisibilityRef = useRef<HTMLDivElement | null>(null);

  const watchlistFilterRows = useMemo(
    () => bonds.map((bond) => toWatchlistFilterRow(bond)),
    [bonds],
  );

  const watchlistRateTypeOptions = useMemo(
    () => Array.from(new Set(watchlistFilterRows.map((row) => row.bondRateType).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [watchlistFilterRows],
  );

  const watchlistIssuerOptions = useMemo(
    () => Array.from(new Set(watchlistFilterRows.map((row) => row.issuerName || row.issuerSymbol).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [watchlistFilterRows],
  );

  const watchlistBondTypeOptions = useMemo(
    () => Array.from(new Set(watchlistFilterRows.map((row) => row.bondType).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [watchlistFilterRows],
  );

  const watchlistIndustryOptions = useMemo(
    () => Array.from(new Set(watchlistFilterRows.map((row) => row.industry).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [watchlistFilterRows],
  );

  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    appliedCriteria,
    aiPrompt,
    setAiPrompt,
    aiSummary,
    setAiSummary,
    aiError,
    setAiError,
    isApplyingAIFilter,
    isLoadingStatus,
    aiPromptSuggestions,
    showPromptSuggestions,
    applyDraftFilters,
    resetFilters,
    applyAIFilter,
  } = useBondFilterController({
    rateTypeOptions: watchlistRateTypeOptions,
    issuerOptions: watchlistIssuerOptions,
    bondTypeOptions: watchlistBondTypeOptions,
    industryOptions: watchlistIndustryOptions,
  });

  const filteredWatchlistRows = useMemo(() => {
    const manuallyFilteredRows = filterBondRowsByCriteria(watchlistFilterRows, appliedCriteria).filter((row) => {
      const searchTerm = appliedFilters.searchTerm.trim().toLowerCase();
      if (searchTerm) {
        const issuerName = String(t((row.issuerName || row.issuerSymbol || '') as any, row.issuerSymbol) || row.issuerName || row.issuerSymbol || '').trim();
        const haystack = [
          row.bondCode,
          issuerName,
          row.issuerSymbol,
          getLocalizedBondType(row.bondType, language),
          getLocalizedInterestType(row.bondRateType, t),
          row.industry ? (t(row.industry as any) || row.industry) : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    return sortBondRowsByCriteria(manuallyFilteredRows, appliedCriteria);
  }, [appliedCriteria, appliedFilters.searchTerm, language, t, watchlistFilterRows]);

  const filteredBonds = useMemo(() => {
    const bondByCode = new Map(bonds.map((bond) => [bond.code, bond] as const));
    return filteredWatchlistRows
      .map((row) => bondByCode.get(row.bondCode))
      .filter((bond): bond is WatchlistBond => Boolean(bond));
  }, [bonds, filteredWatchlistRows]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (enrichingRef.current) return;
      enrichingRef.current = true;

      try {
      const storedItems = getWatchlistItems();
      const enrichedItems = await Promise.all(storedItems.map(async (item) => {
        const nextItem: WatchlistItem = { ...item };
        const hasFullCoreData =
          Boolean(String(nextItem.bondType || '').trim())
          && Boolean(String(nextItem.issuerName || '').trim())
          && Boolean(String(nextItem.term || '').trim())
          && Boolean(String(nextItem.issueDate || '').trim())
          && Boolean(String(nextItem.maturityDate || '').trim());

        if (hasFullCoreData) {
          return nextItem;
        }

        try {
          const detailPayload = await loadBondDetail(nextItem.code);
          const detail = detailPayload?.detail || detailPayload || {};
          const historyItem = Array.isArray(detailPayload?.history) ? detailPayload.history[0] : undefined;
          const cashFlowRate = Array.isArray(detailPayload?.cashFlows) ? detailPayload.cashFlows[0]?.bondRate : undefined;
          const interestRate = detail.bondRate || detail.interestRate || detail.couponRate || cashFlowRate || nextItem.interestRate;
          const rawInterestType = detail.bondRateType || detail.interestRateType || detail.couponRateType || detail.interestType || nextItem.interestType || '';
          const paymentMethod = detail.interestPaymentMethod || detail.paymentMethod || detail.bondType || detail.bondName || '';
          const interestType = normalizeInterestType(rawInterestType, paymentMethod, Array.isArray(detailPayload?.cashFlows) ? detailPayload.cashFlows : []);
          const issueValue = detail.totalIssuedValue
            ? detail.totalIssuedValue / 1000000000
            : historyItem?.value
              ? historyItem.value / 1000000000
              : nextItem.issuedValue;
          const listedValue = detail.currentListedValue
            ? detail.currentListedValue / 1000000000
            : historyItem?.value
              ? historyItem.value / 1000000000
              : nextItem.listedValue;
          const listedVolume = detail.currentListedVolume || historyItem?.volume || nextItem.listedVolume;

          const merged: WatchlistItem = {
            ...nextItem,
            issuerName: String(detail.issuerName || detail.companyName || detail.organizationName || nextItem.issuerName || nextItem.ticker || nextItem.enterpriseId || nextItem.code || ''),
            ticker: String(detail.issuerSymbol || nextItem.ticker || nextItem.enterpriseId || ''),
            enterpriseId: String(detail.issuerSymbol || nextItem.enterpriseId || nextItem.ticker || ''),
            term: detail.tenorPeriod ? String(detail.tenorPeriod) : nextItem.term,
            interestRate: Number(interestRate || 0),
            listedVolume: Number(listedVolume || 0),
            issuedValue: Number(issueValue || 0),
            listedValue: Number(listedValue || 0),
            issueDate: String(detail.issueDate ? detail.issueDate.split('T')[0] : nextItem.issueDate || ''),
            maturityDate: String(detail.maturityDate ? detail.maturityDate.split('T')[0] : nextItem.maturityDate || ''),
            interestType,
            bondType: String(detail.bondType || detail.BondType || nextItem.bondType || ''),
            status: String(detail.status || nextItem.status || ''),
          };

          if (!cancelled) {
            upsertWatchlistItem(merged, { preserveAddedAt: true });
          }

          return merged;
        } catch (error) {
          console.warn(`Failed to enrich watchlist bond ${nextItem.code}`, error);
          return nextItem;
        }
      }));

      if (cancelled) return;

      const items = enrichedItems
        .map(toWatchlistBond)
        .filter(Boolean) as WatchlistBond[];
      setBonds(items.sort((a, b) => b.addedAt - a.addedAt));
      } finally {
        enrichingRef.current = false;
      }
    };

    void refresh();
    return onWatchlistUpdated(() => {
      void refresh();
    });
  }, []);

  const handleOpenBond = (bond: WatchlistBond) => {
    setBondEnterpriseName(bond.issuerName);
    setSelectedBond({
      ...bond,
      issuedValue: toBillionValue(bond.issuedValue),
      listedValue: toBillionValue(bond.listedValue),
    });
  };

  const columns = useMemo<DataTableColumn<WatchlistBond>[]>(() => ([
    {
      id: 'order',
      header: <ListOrdered className="h-4 w-4" aria-hidden="true" />,
      align: 'center',
      widthClassName: 'w-12',
      cell: (_row, index) => index + 1,
    },
    {
      id: 'bondCode',
      header: t('bondCode'),
      accessor: (row) => row.code,
      sortable: true,
      widthClassName: 'w-32',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-bold text-text-highlight transition-colors hover:text-blue-600 group-hover:text-blue-600">
            {row.code}
          </span>
        </div>
      ),
    },
    {
      id: 'issuerName',
      header: t('issuer'),
      accessor: (row) => String(t((row.issuerName || row.ticker || '') as any, row.ticker) || row.issuerName || row.ticker || ''),
      sortable: true,
      widthClassName: 'w-96',
      cell: (row) => {
        const issuerName = String(t((row.issuerName || row.ticker || t('none')) as any, row.ticker) || row.issuerName || row.ticker || t('none'));
        const industry = row.industry ? t(row.industry as any) : '';

        return (
          <div className="min-w-0 whitespace-normal break-words leading-5 transition-colors group-hover:text-blue-600">
            <div>{issuerName}</div>
            {industry ? <div className="mt-1 text-xs font-semibold text-text-muted transition-colors group-hover:text-blue-600">{industry}</div> : null}
          </div>
        );
      },
    },
    {
      id: 'bondType',
      header: t('bondTypeLabel'),
      accessor: (row) => getLocalizedBondType(row.bondType, language),
      sortable: true,
      widthClassName: 'w-60',
      cell: (row) => (
        <div className="min-w-0 whitespace-normal break-words leading-5 transition-colors group-hover:text-blue-600">
          {getLocalizedBondType(row.bondType, language) || t('none')}
        </div>
      ),
    },
    {
      id: 'term',
      header: t('term'),
      unit: `(${t('monthUnit')})`,
      accessor: (row) => Number(String(row.term || '').replace(/[^0-9.-]/g, '')) || 0,
      sortable: true,
      align: 'center',
      widthClassName: 'w-24',
      cell: (row) => {
        const termValue = String(row.term || '').replace(/(tháng|thang|months?)$/i, '').trim();
        return termValue || t('none');
      },
    },
    {
      id: 'issueDate',
      header: t('issueDate'),
      accessor: (row) => parseDateToTimestamp(row.issueDate) ?? Number.POSITIVE_INFINITY,
      sortable: true,
      align: 'center',
      widthClassName: 'w-36',
      cell: (row) => formatDate(row.issueDate),
    },
    {
      id: 'maturityDate',
      header: t('maturityDate'),
      accessor: (row) => parseDateToTimestamp(row.maturityDate) ?? Number.POSITIVE_INFINITY,
      sortable: true,
      align: 'center',
      widthClassName: 'w-36',
      cell: (row) => formatDate(row.maturityDate),
    },
    {
      id: 'bondRate',
      header: t('interestRate'),
      unit: `(${t('unitPercentLabel')})`,
      accessor: (row) => row.interestRate,
      sortable: true,
      align: 'right',
      widthClassName: 'w-24',
      cell: (row) => formatInterestRate(row.interestRate),
    },
    {
      id: 'bondRateType',
      header: t('interestType'),
      accessor: (row) => getLocalizedInterestType(row.interestType, t),
      sortable: true,
      widthClassName: 'w-32',
      cell: (row) => getLocalizedInterestType(row.interestType, t) || t('none'),
    },
    {
      id: 'currentListedVolume',
      header: t('listedVolume'),
      accessor: (row) => row.listedVolume || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber(row.listedVolume || 0, 0),
    },
    {
      id: 'totalIssuedValue',
      header: t('issuedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => toBillionValue(row.issuedValue || 0),
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber(toBillionValue(row.issuedValue || 0), 2),
    },
    {
      id: 'currentListedValue',
      header: t('listedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => toBillionValue(row.listedValue || 0),
      sortable: true,
      align: 'right',
      widthClassName: 'w-40',
      cell: (row) => formatNumber(toBillionValue(row.listedValue || 0), 2),
    },
    {
      id: 'action',
      header: t('action'),
      align: 'center',
      widthClassName: 'w-24',
      cell: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            removeWatchlistItemWithStatus(row.code);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-base bg-bg-base text-text-muted transition-colors hover:border-red-200 hover:text-red-600"
          aria-label={`${t('delete')} ${row.code}`}
          title={`${t('delete')} ${row.code}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ]), [language, t]);

  const watchlistColumnOptions = useMemo(
    () => columns.filter((column) => column.id !== 'order').map((column) => ({
      id: column.id,
      label: typeof column.header === 'string' ? column.header : t(column.id as any),
    })),
    [columns, t],
  );

  useEffect(() => {
    if (!watchlistColumnVisibilityOpen) return undefined;

    setWatchlistColumnVisibilityDraft(watchlistHiddenColumnIds);

    const handlePointerDown = (event: MouseEvent) => {
      if (!watchlistColumnVisibilityRef.current) return;
      if (watchlistColumnVisibilityRef.current.contains(event.target as Node)) return;
      setWatchlistColumnVisibilityOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWatchlistColumnVisibilityOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [watchlistColumnVisibilityOpen, watchlistHiddenColumnIds]);

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-base font-bold text-text-base">Bạn chưa có mã nào trong danh sách theo dõi</p>
      <p className="text-sm font-medium text-text-muted">Thêm mã trái phiếu để theo dõi nhanh</p>
      <button
        type="button"
        onClick={() => setIsAddBondModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-95"
      >
        <Plus className="h-4 w-4" />
        <span>{t('addBond')}</span>
      </button>
    </div>
  );

  const hasWatchlistBonds = bonds.length > 0;

  if (!hasWatchlistBonds) {
    return (
      <div className="min-w-0 pt-2 transition-colors duration-300 md:pt-3">
        {emptyState}
        <WatchlistAddBondModal isOpen={isAddBondModalOpen} onClose={() => setIsAddBondModalOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-w-0 transition-colors duration-300">
      <div className="space-y-2 pt-2 md:pt-3">
        <BondFilterPanel
          title={t('watchList')}
          resultCount={filteredBonds.length}
          totalCount={bonds.length}
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          rateTypeOptions={watchlistRateTypeOptions}
          aiPrompt={aiPrompt}
          setAiPrompt={setAiPrompt}
          aiSummary={aiSummary}
          setAiSummary={setAiSummary}
          aiError={aiError}
          setAiError={setAiError}
          isApplyingAIFilter={isApplyingAIFilter}
          isLoadingStatus={isLoadingStatus}
          aiPromptSuggestions={aiPromptSuggestions}
          showPromptSuggestions={showPromptSuggestions}
          onApply={applyDraftFilters}
          onReset={resetFilters}
          onApplyAI={applyAIFilter}
          variant="market"
          issuerOptions={watchlistIssuerOptions}
          bondTypeOptions={watchlistBondTypeOptions}
          industryOptions={watchlistIndustryOptions}
          searchOptions={bonds.map((bond) => bond.code)}
          showFilterControls={isWatchlistFilterControlsVisible}
          marketActionSlot={(
            <div ref={watchlistColumnVisibilityRef} className={watchlistColumnVisibilityOpen ? 'relative z-40 ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:gap-2' : 'relative ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:gap-2'}>
              <button
                type="button"
                onClick={applyDraftFilters}
                className="inline-flex h-8 w-8 flex-none items-center justify-center gap-0 whitespace-nowrap rounded-md border border-border-base bg-bg-surface px-0 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:w-9 sm:rounded-lg md:h-10 md:w-10 lg:h-11 lg:w-11 xl:w-28 xl:gap-2 xl:px-3"
                aria-label={t('applyFilters')}
                title={t('applyFilters')}
              >
                <Search className="h-4 w-4 shrink-0 text-blue-600" />
                <span className="hidden xl:inline">{t('applyFilters')}</span>
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-8 w-8 flex-none items-center justify-center gap-0 whitespace-nowrap rounded-md border border-border-base bg-bg-surface px-0 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:w-9 sm:rounded-lg md:h-10 md:w-10 lg:h-11 lg:w-11 xl:w-28 xl:gap-2 xl:px-3"
                aria-label={t('reset')}
                title={t('reset')}
              >
                <RefreshCcw className="h-4 w-4 shrink-0 text-blue-600" />
                <span className="hidden xl:inline">{t('reset')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsWatchlistFilterControlsVisible((current) => !current)}
                className="inline-flex h-8 w-8 flex-none items-center justify-center gap-0 whitespace-nowrap rounded-md border border-border-base bg-bg-surface px-0 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:w-9 sm:rounded-lg md:h-10 md:w-10 lg:h-11 lg:w-11 xl:w-28 xl:gap-2 xl:px-3"
                aria-label={isWatchlistFilterControlsVisible ? t('hideFilters') : t('showFilters')}
                title={isWatchlistFilterControlsVisible ? t('hideFilters') : t('showFilters')}
              >
                {isWatchlistFilterControlsVisible ? <FilterX className="h-4 w-4 text-blue-600" /> : <Filter className="h-4 w-4 text-blue-600" />}
                <span className="hidden xl:inline">{t('filterTab')}</span>
              </button>

              <button
                type="button"
                onClick={() => setWatchlistColumnVisibilityOpen((current) => !current)}
                className="inline-flex h-8 w-8 flex-none items-center justify-center gap-0 whitespace-nowrap rounded-md border border-border-base bg-bg-surface px-0 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:text-text-highlight sm:h-9 sm:w-9 sm:rounded-lg md:h-10 md:w-10 lg:h-11 lg:w-11 xl:w-28 xl:gap-2 xl:px-3"
                aria-haspopup="dialog"
                aria-expanded={watchlistColumnVisibilityOpen}
                aria-label={t('hideColumns')}
                title={t('hideColumns')}
              >
                <EyeOff className="h-4 w-4 text-blue-600" />
                <span className="hidden xl:inline">{t('hideColumns')}</span>
              </button>

              {watchlistColumnVisibilityOpen ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-96 max-w-none rounded-lg border border-border-base bg-bg-surface p-4 shadow-xl shadow-blue-950/10">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted/80">
                    <EyeOff className="h-4 w-4 text-blue-600" />
                    <span>{t('hideColumns')}</span>
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {watchlistColumnOptions.map((column) => {
                      const checked = watchlistColumnVisibilityDraft.includes(column.id);

                      return (
                        <label
                          key={column.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-base transition-colors hover:bg-surface-container-low"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setWatchlistColumnVisibilityDraft((current) => (
                                current.includes(column.id)
                                  ? current.filter((item) => item !== column.id)
                                  : [...current, column.id]
                              ));
                            }}
                            className="h-4 w-4 rounded border-border-base text-blue-600 focus:ring-blue-400"
                          />
                          <span className="truncate">{column.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setWatchlistHiddenColumnIds(watchlistColumnVisibilityDraft);
                        setWatchlistColumnVisibilityOpen(false);
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                    >
                      {t('hideColumns')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWatchlistHiddenColumnIds([]);
                        setWatchlistColumnVisibilityDraft([]);
                        setWatchlistColumnVisibilityOpen(false);
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-border-base bg-bg-base px-3 py-2 text-sm font-semibold text-text-base transition-colors hover:border-blue-200 hover:text-text-highlight"
                    >
                      {t('reset')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        />

        <DataTable
          rows={filteredBonds}
          columns={columns}
          getRowKey={(row) => row.code}
          pageSize={10}
          onRowClick={handleOpenBond}
          hiddenColumnIds={watchlistHiddenColumnIds}
          hideEmptyStateRow
        />
      </div>

      <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={() => setIsAddBondModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-colors hover:opacity-95"
      >
          <Plus className="h-4 w-4" />
          <span>{t('addBond')}</span>
        </button>
      </div>

      <WatchlistAddBondModal isOpen={isAddBondModalOpen} onClose={() => setIsAddBondModalOpen(false)} />
    </div>
  );
}


