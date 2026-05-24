import { useEffect, useMemo, useState } from 'react';
import { Building2, Trash2 } from 'lucide-react';
import { Bond } from '../types';
import { formatDate, formatInterestRate } from '../utils/format';
import { useLanguage } from '../LanguageContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getWatchlistItems, onWatchlistUpdated, removeWatchlistItem, type WatchlistItem } from '../utils/watchlist';
import { getCache, setCache } from '../utils/cache';
import { getFulfilledValues, mapWithConcurrency } from '../utils/async';
import { loadBondDetail, loadIssuerProfile } from '../services/bondData';
import { buildIndustrySymbolLookup, resolveIndustryKeyFromCandidates, resolveIndustryKeyFromSymbolGroups } from '../constants/industries';
import { loadDedupedIndustrySymbols } from '../services/industryBondData';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WatchlistBond extends WatchlistItem {
  daysLeft: number;
  industry?: string;
}

interface WatchlistViewProps {
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

function getStatusMeta(daysLeft: number, t: (key: any, ticker?: string) => string) {
  if (daysLeft < 30) {
    return {
      label: t('statusVeryNear'),
      color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-400/30',
    };
  }

  if (daysLeft <= 90) {
    return {
      label: t('statusNear'),
      color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-400/30',
    };
  }

  if (daysLeft <= 180) {
    return {
      label: t('statusMonitor'),
      color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-100 dark:border-yellow-400/30',
    };
  }

  if (daysLeft <= 270) {
    return {
      label: t('statusMediumTerm'),
      color: 'bg-blue-600/5 text-blue-600 border-blue-600/10',
    };
  }

  return {
    label: t('statusLongTerm'),
    color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-400/30',
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
    industry: String((item as WatchlistItem & { industry?: string }).industry || ''),
    addedAt: item.addedAt || Date.now(),
  };
}

function needsIssuerLookup(bond: WatchlistBond) {
  const issuerName = String(bond.issuerName || '').trim();
  const ticker = String(bond.ticker || bond.enterpriseId || '').trim();
  const industry = String(bond.industry || '').trim();

  return !industry || !issuerName || issuerName === bond.code || issuerName === ticker;
}

export default function WatchlistView({ setSelectedBond, setBondEnterpriseName }: WatchlistViewProps) {
  const { t, language } = useLanguage();
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

  useEffect(() => {
    let cancelled = false;
    const enterpriseList = (getCache('enterprise_list') || []) as Array<{ ticker?: string; industry?: string; name?: string }>;
    const symbolGroupsPromise = loadDedupedIndustrySymbols();

    const bondsWithCachedIndustry = bonds.map((bond) => {
      if (bond.industry) return bond;

      const ticker = bond.ticker || bond.enterpriseId;
      const enterprise = enterpriseList.find((item) => item.ticker === ticker);
      return enterprise?.industry ? { ...bond, industry: enterprise.industry } : bond;
    });
    const hasCachedIndustryUpdates = bondsWithCachedIndustry.some((bond, index) => bond.industry !== bonds[index]?.industry);
    const bondsToLookup = bondsWithCachedIndustry.filter(needsIssuerLookup);

    if (bondsToLookup.length === 0) {
      if (hasCachedIndustryUpdates) setBonds(bondsWithCachedIndustry);
      return;
    }

    const enrichIssuerNames = async () => {
      const symbolLookup = buildIndustrySymbolLookup(await symbolGroupsPromise);
      const results = await mapWithConcurrency(
        bondsToLookup,
        6,
        async (bond) => {
          try {
            const bondCacheKey = `bond_detail_${bond.code}`;
            const cachedBondData = getCache(bondCacheKey);
            const bondData = cachedBondData || await loadBondDetail(bond.code);
            if (!cachedBondData) setCache(bondCacheKey, bondData);

            const detail = bondData?.detail || bondData || {};
            const issuerSymbol = String(detail.issuerSymbol || bond.enterpriseId || bond.ticker || '').trim();
            const detailIndustry = resolveIndustryKeyFromCandidates(
              detail.infoObj?.icbNameLv2 ||
              detail.infoObj?.icbNameLv1 ||
              detail.icbNameLv2 ||
              detail.industry ||
              bond.industry ||
              ''
            );
            let industry = resolveIndustryKeyFromSymbolGroups(
              issuerSymbol,
              symbolLookup,
              detailIndustry
            );
            let issuerName = String(
              detail.issuerName ||
              detail.companyName ||
              detail.organizationName ||
              ''
            ).trim();

            if (issuerSymbol) {
              try {
                const profileCacheKey = `issuer_profile_${issuerSymbol}`;
                const cachedProfile = getCache(profileCacheKey);
                const profile = cachedProfile || await loadIssuerProfile(issuerSymbol);
                if (!cachedProfile) setCache(profileCacheKey, profile);

                issuerName = String(
                  language === 'en'
                    ? profile?.internationalName || profile?.name || profile?.companyName || issuerName || ''
                    : profile?.name || profile?.companyName || profile?.internationalName || issuerName || ''
                ).trim();
                industry = resolveIndustryKeyFromSymbolGroups(
                  issuerSymbol,
                  symbolLookup,
                  industry,
                  profile.icbNameLv2,
                  profile.icbNameLv1,
                  profile.industryName,
                  profile.industry
                );
              } catch (profileError) {
                console.warn(`Failed to fetch issuer profile for ${issuerSymbol}`, profileError);
              }
            }

            const nextIssuerName = issuerName && issuerName !== bond.code && issuerName !== issuerSymbol ? issuerName : bond.issuerName;
            const nextIndustry = industry || bond.industry || '';

            if ((!nextIssuerName || nextIssuerName === bond.code || nextIssuerName === issuerSymbol) && !nextIndustry) return null;
            if (nextIssuerName === bond.issuerName && nextIndustry === bond.industry && issuerSymbol === (bond.ticker || bond.enterpriseId)) return null;

            return {
              code: bond.code,
              issuerName: nextIssuerName,
              ticker: issuerSymbol || bond.ticker,
              enterpriseId: issuerSymbol || bond.enterpriseId,
              industry: nextIndustry,
            };
          } catch (error) {
            console.warn(`Failed to fetch issuer name for ${bond.code}`, error);
            return null;
          }
        }
      );

      if (cancelled) return;

      const validUpdates = getFulfilledValues(results).filter(Boolean) as Array<{
        code: string;
        issuerName: string;
        ticker: string;
        enterpriseId: string;
        industry: string;
      }>;

      if (validUpdates.length === 0 && !hasCachedIndustryUpdates) return;

      setBonds((current) => current.map((bond) => {
        const cached = bondsWithCachedIndustry.find((item) => item.code === bond.code);
        const update = validUpdates.find((item) => item.code === bond.code);
        return update ? { ...bond, ...cached, ...update } : { ...bond, ...cached };
      }));
    };

    void enrichIssuerNames();

    return () => {
      cancelled = true;
    };
  }, [bonds, language]);

  const summary = useMemo(() => {
    const total = bonds.length;
    const urgent = bonds.filter((bond) => bond.daysLeft < 30).length;
    const next90 = bonds.filter((bond) => bond.daysLeft >= 30 && bond.daysLeft <= 90).length;
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
    <div className="min-w-0 space-y-3 transition-colors duration-300">
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-600 dark:text-white transition-colors">{t('watchList')}</h1>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">{t('totalTrackedBonds')}</p>
            <p className="mt-2 text-xl font-bold text-text-base dark:text-white">{summary.total}</p>
          </div>
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">{t('maturityWarning')}</p>
            <p className="mt-2 text-xl font-bold text-red-600 dark:text-white">{summary.urgent}</p>
          </div>
          <div className="rounded-2xl border border-border-base bg-bg-surface px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted/80">{t('maturityNext90')}</p>
            <p className="mt-2 text-xl font-bold text-orange-600 dark:text-white">{summary.next90}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {bonds.length > 0 ? (
          bonds.map((bond) => {
            const status = getStatusMeta(bond.daysLeft, t);
            return (
              <button
                key={bond.code}
                type="button"
                onClick={() => handleOpenBond(bond)}
                className="w-full rounded-lg border border-border-base bg-bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-text-highlight">{bond.code}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{t(bond.issuerName as any, bond.ticker)}</p>
                    {bond.industry && <p className="mt-1 text-xs font-semibold text-text-muted">{t(bond.industry as any)}</p>}
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase", status.color)}>
                    {status.label}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-bg-base p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{t('interestRate')}</p>
                    <p className="mt-1 text-sm font-bold text-green-600 dark:text-green-500">{formatInterestRate(bond.interestRate)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted/80">{t('maturityDate')}</p>
                    <p className="mt-1 text-sm font-bold text-text-base">{formatDate(bond.maturityDate)}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-text-muted/80">
                      {t('remainingPrefix')} {bond.daysLeft} {t('daysUnit').toLowerCase()}
                    </p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveBond(bond);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-base text-text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      title={t('delete')}
                      aria-label={t('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-lg border border-border-base bg-bg-surface px-4 py-10 text-center">
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Building2 className="h-8 w-8" />
              <p className="text-sm font-bold uppercase transition-colors">{t('noBondsFound')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-sm transition-colors lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white transition-colors">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {t('bondCode')}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {t('issuerName')}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <span className="whitespace-nowrap leading-none">{t('interestRate')}</span>
                    <span className="whitespace-nowrap mt-1 leading-none">({t('unitPercentLabel')})</span>
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {t('maturityDate')}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {t('situation')}
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-center whitespace-nowrap">
                  {t('action')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border-base transition-colors">
              {bonds.length > 0 ? (
                bonds.map((bond, index) => {
                  const status = getStatusMeta(bond.daysLeft, t);
                  return (
                    <tr
                      key={bond.code}
                      onClick={() => handleOpenBond(bond)}
                      className={cn(
                        'cursor-pointer transition-colors group',
                        index % 2 === 1 ? 'bg-bg-base/30' : 'bg-bg-surface',
                        'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                      )}
                    >
                      <td className="px-6 py-5 whitespace-nowrap text-center border-none">
                        <span className="text-sm font-bold text-text-highlight group-hover:underline transition-colors">{bond.code}</span>
                      </td>

                      <td className="px-6 py-5 text-left border-none">
                        <div className="max-w-[300px]">
                          <p className="text-sm font-bold text-text-base group-hover:text-text-highlight transition-colors">
                            {t(bond.issuerName as any, bond.ticker)}
                          </p>
                          {bond.industry && (
                            <p className="text-[10px] text-text-muted font-semibold group-hover:text-text-highlight transition-colors">
                              {t(bond.industry as any)}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-500 text-center border-none transition-colors">
                        {formatInterestRate(bond.interestRate)}%
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-text-muted text-center border-none group-hover:text-text-highlight transition-colors">
                        {formatDate(bond.maturityDate)}
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap text-center border-none">
                        <div className="flex flex-col items-center gap-2">
                          <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold uppercase transition-colors', status.color)}>
                            {status.label}
                          </span>
                          <p className="text-[10px] font-bold text-text-muted tracking-wider transition-colors group-hover:text-text-highlight">
                            {t('remainingPrefix')} {bond.daysLeft} {t('daysUnit').toLowerCase()}
                          </p>
                        </div>
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap text-center border-none">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveBond(bond);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-base text-text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          title={t('delete')}
                          aria-label={t('delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-text-muted">
                      <Building2 className="h-8 w-8" />
                      <p className="text-sm font-bold uppercase transition-colors">{t('noBondsFound')}</p>
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
