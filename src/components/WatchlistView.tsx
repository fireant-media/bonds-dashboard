import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Bookmark, Calendar, TrendingUp, Building2, Trash2 } from 'lucide-react';
import { Bond } from '../types';
import { formatDate, formatInterestRate } from '../utils/format';
import { useLanguage } from '../LanguageContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getWatchlistItems, onWatchlistUpdated, removeWatchlistItem, type WatchlistItem } from '../utils/watchlist';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WatchlistBond extends WatchlistItem {
  daysLeft: number;
  statusLabel: string;
}

interface WatchlistViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

function getStatusMeta(daysLeft: number) {
  if (daysLeft <= 30) {
    return {
      label: 'Sắp đáo hạn',
      classes: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-400/30',
    };
  }

  if (daysLeft <= 90) {
    return {
      label: 'Theo dõi',
      classes: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-400/30',
    };
  }

  if (daysLeft <= 180) {
    return {
      label: 'Ổn định',
      classes: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-400/30',
    };
  }

  return {
    label: 'Dài hạn',
    classes: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-400/30',
  };
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
  const status = getStatusMeta(daysLeft);

  return {
    id: code,
    code,
    enterpriseId: String(item.enterpriseId || item.ticker || ''),
    ticker: String(item.ticker || item.enterpriseId || ''),
    issuerName: String(item.issuerName || item.ticker || item.enterpriseId || ''),
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
    statusLabel: status.label,
    addedAt: item.addedAt || Date.now(),
  };
}

export default function WatchlistView({ setSelectedBond, setBondEnterpriseName }: WatchlistViewProps) {
  const { t } = useLanguage();
  const [bonds, setBonds] = useState<WatchlistBond[]>([]);

  useEffect(() => {
    const refresh = () => {
      const items = getWatchlistItems()
        .map(toWatchlistBond)
        .filter(Boolean) as WatchlistBond[];
      setBonds(items.sort((a, b) => b.addedAt - a.addedAt));
    };

    refresh();
    return onWatchlistUpdated(refresh);
  }, []);

  const summary = useMemo(() => {
    const total = bonds.length;
    const urgent = bonds.filter((bond) => bond.daysLeft <= 30).length;
    const next90 = bonds.filter((bond) => bond.daysLeft > 30 && bond.daysLeft <= 90).length;
    return { total, urgent, next90 };
  }, [bonds]);

  const handleOpenBond = (bond: WatchlistBond) => {
    setBondEnterpriseName(bond.issuerName);
    setSelectedBond(bond);
  };

  const handleRemoveBond = (bond: WatchlistBond) => {
    removeWatchlistItem(bond.code);
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-600">
            <Bookmark className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">{t('watchList')}</p>
          </div>
          <h1 className="text-2xl font-bold text-text-base tracking-tight">{t('watchList')}</h1>
          <p className="max-w-2xl text-sm font-medium text-text-muted">
            Danh sách các mã trái phiếu đang được theo dõi để mở nhanh chi tiết khi cần xem thông tin sâu hơn.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">Tổng mã</p>
            <p className="mt-2 text-xl font-bold text-text-base">{summary.total}</p>
          </div>
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">Cần chú ý</p>
            <p className="mt-2 text-xl font-bold text-red-600">{summary.urgent}</p>
          </div>
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">90 ngày tới</p>
            <p className="mt-2 text-xl font-bold text-orange-600">{summary.next90}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-base/60">
              <tr className="border-b border-border-base">
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                  Mã trái phiếu
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                  Tổ chức phát hành
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                  <div className="flex flex-col items-end">
                    <span>Lãi suất</span>
                    <span className="mt-1 text-xs font-semibold normal-case tracking-normal text-text-muted/80">(%/năm)</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                  Ngày đáo hạn
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted">
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {bonds.length > 0 ? (
                bonds.map((bond, index) => {
                  const status = getStatusMeta(bond.daysLeft);
                  return (
                    <tr
                      key={bond.code}
                      onClick={() => handleOpenBond(bond)}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-900/10',
                        index % 2 === 1 && 'bg-bg-base/20'
                      )}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                            <BadgeCheck className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-text-base hover:text-blue-600">{bond.code}</p>
                            <p className="truncate text-xs font-medium text-text-muted">Theo dõi</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="max-w-sm min-w-0">
                          <p className="truncate text-sm font-semibold text-text-base">{bond.issuerName}</p>
                          <p className="truncate text-xs font-medium text-text-muted">{bond.enterpriseId || bond.ticker || '-'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600">
                          <TrendingUp className="h-4 w-4" />
                          <span>{formatInterestRate(bond.interestRate)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted">
                          <Calendar className="h-4 w-4 shrink-0" />
                          <span>{formatDate(bond.maturityDate)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-start gap-2">
                          <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider', status.classes)}>
                            {bond.statusLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-text-muted">Còn {bond.daysLeft} ngày</p>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveBond(bond);
                              }}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-base text-text-muted transition-colors hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                              title="Bỏ theo dõi"
                              aria-label="Bỏ theo dõi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-text-muted">
                      <Building2 className="h-8 w-8" />
                      <p className="text-sm font-bold uppercase tracking-widest">{t('noBondsFound')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
