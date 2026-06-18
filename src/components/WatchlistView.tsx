import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkCheck, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bond } from '../types';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType, parseDateToTimestamp } from '../utils/format';
import { useLanguage } from '../LanguageContext';
import BondSectionNav from './BondSectionNav';
import { getWatchlistItems, onWatchlistUpdated, removeWatchlistItemWithStatus, upsertWatchlistItem, type WatchlistItem } from '../utils/watchlist';
import { loadBondDetail } from '../services/bondData';
import { DataTable, type DataTableColumn } from './ui/DataTable';

interface WatchlistBond extends WatchlistItem {
  daysLeft: number;
  industry?: string;
  bondType?: string;
}

interface WatchlistViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

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
    issuedValue: Number(item.issuedValue || 0),
    listedValue: Number(item.listedValue || 0),
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [bonds, setBonds] = useState<WatchlistBond[]>([]);
  const enrichingRef = useRef(false);

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
    setSelectedBond(bond);
  };

  const columns = useMemo<DataTableColumn<WatchlistBond>[]>(() => ([
    {
      id: 'order',
      header: <ListOrdered className="h-4 w-4" aria-hidden="true" />,
      align: 'center',
      widthClassName: 'w-14',
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
          <BookmarkCheck className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="min-w-0 truncate font-bold text-text-highlight transition-colors hover:text-blue-600">
            {row.code}
          </span>
        </div>
      ),
    },
    {
      id: 'issuerName',
      header: t('issuer'),
      accessor: (row) => row.issuerName || row.ticker,
      sortable: true,
      widthClassName: 'w-60',
      cell: (row) => {
        const issuerName = row.issuerName || row.ticker || t('none');
        const industry = row.industry ? t(row.industry as any) : '';

        return (
          <div className="max-w-xs min-w-0">
            <div className="truncate">{issuerName}</div>
            {industry ? <div className="mt-1 text-xs font-semibold text-text-muted">{industry}</div> : null}
          </div>
        );
      },
    },
    {
      id: 'bondType',
      header: t('bondTypeLabel'),
      accessor: (row) => row.bondType || '',
      sortable: true,
      widthClassName: 'w-36',
      cell: (row) => row.bondType || t('none'),
    },
    {
      id: 'term',
      header: t('term'),
      unit: `(${t('monthUnit')})`,
      accessor: (row) => Number(String(row.term || '').replace(/[^0-9.-]/g, '')) || 0,
      sortable: true,
      align: 'right',
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
      widthClassName: 'w-28',
      cell: (row) => formatDate(row.issueDate),
    },
    {
      id: 'maturityDate',
      header: t('maturityDate'),
      accessor: (row) => parseDateToTimestamp(row.maturityDate) ?? Number.POSITIVE_INFINITY,
      sortable: true,
      align: 'center',
      widthClassName: 'w-28',
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
      accessor: (row) => row.interestType,
      sortable: true,
      widthClassName: 'w-32',
      cell: (row) => row.interestType || t('none'),
    },
    {
      id: 'currentListedVolume',
      header: t('listedVolume'),
      accessor: (row) => row.listedVolume || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-32',
      cell: (row) => formatNumber(row.listedVolume || 0, 0),
    },
    {
      id: 'totalIssuedValue',
      header: t('issuedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.issuedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-36',
      cell: (row) => formatNumber(row.issuedValue || 0, 2),
    },
    {
      id: 'currentListedValue',
      header: t('listedValue'),
      unit: `(${t('unitBillionShort')})`,
      accessor: (row) => row.listedValue || 0,
      sortable: true,
      align: 'right',
      widthClassName: 'w-36',
      cell: (row) => formatNumber(row.listedValue || 0, 2),
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
  ]), [t]);

  const emptyState = (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm font-bold text-text-base">Chưa có mã trái phiếu đang theo dõi</p>
      <button
        type="button"
        onClick={() => navigate('/filter/bonds')}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        <Plus className="h-4 w-4" />
        <span>{t('addBond')}</span>
      </button>
    </div>
  );

  return (
    <div className="min-w-0 transition-colors duration-300">
      <BondSectionNav activeSection="watchlist" />

      <div className="mb-4 space-y-2">
        <h2 className="text-xl font-bold text-text-base">{t('watchList')}</h2>
        <p className="max-w-3xl text-sm font-medium text-text-muted">{t('watchListSubtitle')}</p>
      </div>

      <DataTable
        rows={bonds}
        columns={columns}
        getRowKey={(row) => row.code}
        pageSize={15}
        emptyState={emptyState}
        onRowClick={handleOpenBond}
      />

      {bonds.length > 0 ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/filter/bonds')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            <span>{t('addBond')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}


