import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

const CARD_GAP_PX = 8;
const CARD_EDGE_PADDING_PX = 0;

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
  const location = useLocation();
  const { t } = useLanguage();
  const maturityQuery = useMaturingBondsQuery(3650);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionButtonRefs = useRef<Partial<Record<BondSectionKey, HTMLButtonElement | null>>>({});
  const [visibleCardCount, setVisibleCardCount] = useState(1);

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
      .sort((left, right) => left.daysLeft - right.daysLeft || left.code.localeCompare(right.code));
  }, [maturityQuery.data]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;

    const button = sectionButtonRefs.current[activeSection];
    button?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeSection]);

  useEffect(() => {
    const container = cardsContainerRef.current;
    if (!container || typeof window === 'undefined') return;

    const resolveCardWidth = () => {
      if (window.innerWidth >= 1024) return 224;
      if (window.innerWidth >= 640) return 208;
      return 192;
    };

    const updateVisibleCount = () => {
      const cardWidth = resolveCardWidth();
      const availableWidth = Math.max(container.clientWidth - CARD_EDGE_PADDING_PX * 2, cardWidth);
      const nextCount = Math.max(1, Math.floor((availableWidth + CARD_GAP_PX) / (cardWidth + CARD_GAP_PX)));
      setVisibleCardCount(nextCount);
    };

    updateVisibleCount();

    const resizeObserver = new ResizeObserver(() => {
      updateVisibleCount();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', updateVisibleCount);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateVisibleCount);
    };
  }, []);

  const visibleCards = useMemo(
    () => upcomingCards.slice(0, visibleCardCount),
    [upcomingCards, visibleCardCount],
  );

  const handleOpenBondDetail = (code: string) => {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) return;

    navigate(`/${normalizedCode}`, { state: { backgroundLocation: location } });
  };

  return (
    <div className="mb-4">
      <div ref={cardsContainerRef} className="mt-4">
        <div className="flex w-full items-stretch gap-2 overflow-visible sm:gap-3 lg:gap-4">
          {visibleCards.map((card) => {
            const status = getMaturityStatusMeta(card.daysLeft, t);
            const StatusIcon = status.icon;

            return (
              <div
                key={card.code}
                className="group relative flex min-w-0 flex-1 basis-48 flex-col overflow-hidden rounded-lg border border-border-base bg-bg-surface/95 p-3 shadow-sm shadow-slate-900/5 transition-all duration-200 hover:-translate-y-1 hover:border-blue-500/25 hover:shadow-lg hover:shadow-blue-500/10 dark:shadow-black/20 sm:basis-52 lg:basis-56"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100/80 via-blue-50/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:from-blue-500/15 dark:via-blue-500/5" />
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-200/30 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-blue-500/10" />
                <button
                  type="button"
                  onClick={() => handleOpenBondDetail(card.code)}
                  className="relative truncate text-left text-sm font-bold text-text-base transition-colors hover:text-blue-600"
                  title={card.code}
                >
                  {card.code}
                </button>

                <div className="relative mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 whitespace-nowrap text-text-muted">Lãi suất</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-text-base">{formatInterestRate(card.interestRate)}%</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 whitespace-nowrap text-text-muted">Ngày đáo hạn</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-text-base">{formatDate(card.maturityDate)}</span>
                  </div>
                </div>

                <div className="relative mt-3 flex items-center justify-center gap-2 whitespace-nowrap text-center">
                  <StatusIcon className={cn('h-4 w-4 shrink-0', status.iconClassName)} />
                  <span className={cn('inline-flex min-w-0 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase', status.badgeClassName)}>
                    <span className="truncate">{status.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
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
        <div className="overflow-x-auto scroll-smooth">
          <div className="flex min-w-max items-stretch gap-1 px-0">
            {sectionItems.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  ref={(node) => {
                    sectionButtonRefs.current[item.key] = node;
                  }}
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
