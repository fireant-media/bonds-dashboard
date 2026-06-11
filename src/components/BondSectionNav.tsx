import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, ChevronRight, CheckCircle2, Eye, Zap } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useMaturingBondsQuery } from '../query/dashboardQueries';
import { formatDate, formatInterestRate, parseDateToTimestamp } from '../utils/format';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type BondSectionKey = 'market' | 'maturity' | 'watchlist';

interface BondSectionNavProps {
  activeSection: BondSectionKey;
}

const sectionItems: Array<{
  key: BondSectionKey;
  path: string;
  labelKey: 'marketBondList' | 'upcomingBonds' | 'watchList';
}> = [
  { key: 'market', path: '/filter/bonds', labelKey: 'marketBondList' },
  { key: 'maturity', path: '/maturity', labelKey: 'upcomingBonds' },
  { key: 'watchlist', path: '/watchlist', labelKey: 'watchList' },
];

const getMaturityStatusMeta = (daysLeft: number, t: (key: any, ticker?: string) => string) => {
  if (daysLeft < 30) {
    return {
      label: t('statusVeryNear'),
      icon: AlertCircle,
      iconClassName: 'text-red-600',
      badgeClassName: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-400/30',
    };
  }

  if (daysLeft <= 90) {
    return {
      label: t('statusNear'),
      icon: Zap,
      iconClassName: 'text-orange-600',
      badgeClassName: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-400/30',
    };
  }

  if (daysLeft <= 180) {
    return {
      label: t('statusMonitor'),
      icon: Eye,
      iconClassName: 'text-yellow-600',
      badgeClassName: 'bg-yellow-50 text-yellow-600 border-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-400/30',
    };
  }

  if (daysLeft <= 270) {
    return {
      label: t('statusMediumTerm'),
      icon: Activity,
      iconClassName: 'text-blue-600',
      badgeClassName: 'bg-blue-600/5 text-blue-600 border-blue-600/10',
    };
  }

  return {
    label: t('statusLongTerm'),
    icon: CheckCircle2,
    iconClassName: 'text-green-600',
    badgeClassName: 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-400/30',
  };
};

const getBondDaysLeft = (maturityDate: string) => {
  const timestamp = parseDateToTimestamp(maturityDate);
  if (!timestamp) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maturity = new Date(timestamp);
  maturity.setHours(0, 0, 0, 0);

  return Math.max(0, Math.ceil((maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
};

export default function BondSectionNav({ activeSection }: BondSectionNavProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const maturityQuery = useMaturingBondsQuery(3650);

  const upcomingCards = useMemo(() => {
    const rows = Array.isArray(maturityQuery.data) ? maturityQuery.data : [];

    return rows
      .map((row: any) => {
        const maturityDate = String(row?.maturityDate || '').split('T')[0];
        const daysLeft = getBondDaysLeft(maturityDate);
        if (daysLeft === null) return null;

        return {
          code: String(row?.bondCode || row?.code || '').trim(),
          interestRate: Number(row?.bondRate || row?.interestRate || row?.couponRate || 0),
          maturityDate,
          daysLeft,
        };
      })
      .filter((item): item is { code: string; interestRate: number; maturityDate: string; daysLeft: number } => Boolean(item?.code))
      .sort((left, right) => left.daysLeft - right.daysLeft || left.code.localeCompare(right.code))
      .slice(0, 5);
  }, [maturityQuery.data]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="mb-4">
      <div className="mt-4 grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {upcomingCards.map((card) => {
            const status = getMaturityStatusMeta(card.daysLeft, t);
            const StatusIcon = status.icon;

            return (
              <div
                key={card.code}
                className="min-w-0 w-60 sm:w-64 lg:w-72 rounded-lg border border-border-base bg-white p-4 shadow-sm transition-colors hover:border-blue-200"
              >
                <p className="truncate text-sm font-bold text-text-base">{card.code}</p>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 whitespace-nowrap text-text-muted">Lãi suất</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-text-base">{formatInterestRate(card.interestRate)}%</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 whitespace-nowrap text-text-muted">Ngày đáo hạn</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-text-base">{formatDate(card.maturityDate)}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 whitespace-nowrap">
                  <StatusIcon className={cn('h-4 w-4 shrink-0', status.iconClassName)} />
                  <span className={cn('inline-flex min-w-0 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase', status.badgeClassName)}>
                    <span className="truncate">{status.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => handleNavigate('/maturity')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-500"
          >
            <span>{t('seeMore')}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
      </div>

      <div className="mt-1">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-stretch gap-1 px-0">
            {sectionItems.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigate(item.path)}
                  className={cn(
                    'relative flex shrink-0 items-center px-4 py-3 text-sm font-semibold transition-colors',
                    isActive ? 'text-blue-600' : 'text-text-muted hover:text-blue-600'
                  )}
                >
                  <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                  <span
                    className={cn(
                      'absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors',
                      isActive ? 'bg-blue-600' : 'bg-transparent'
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
