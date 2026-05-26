import { fireantApi } from '../api/fireant';
import { loadDedupedIndustrySymbols, loadIndustryBaseBondGroupData, loadIndustryBondGroupData, loadIssuerStatsSummary } from './industryBondData';
import { loadMaturingBonds } from './bondData';
import { INDUSTRY_NAV_ITEMS } from '../constants/industries';

let coreWarmupPromise: Promise<void> | null = null;
const industryWarmupPromises = new Map<string, Promise<void>>();

const runIdle = (task: () => void) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task());
    return;
  }

  window.setTimeout(task, 0);
};

export const warmDashboardCoreData = () => {
  if (coreWarmupPromise) return coreWarmupPromise;

  coreWarmupPromise = (async () => {
    await Promise.allSettled([
      loadIssuerStatsSummary(200),
      fireantApi.getHighYieldBonds(10),
      loadMaturingBonds(30),
      loadMaturingBonds(90),
      loadMaturingBonds(180),
      loadDedupedIndustrySymbols(),
      ...INDUSTRY_NAV_ITEMS.filter((item) => item.statsLevel === 1).map((item) => loadIndustryBaseBondGroupData(item.id)),
    ]);
  })().finally(() => {
    coreWarmupPromise = null;
  });

  return coreWarmupPromise;
};

export const warmDashboardCoreDataInBackground = () => {
  runIdle(() => {
    void warmDashboardCoreData();
  });
};

export const warmIndustryData = (industryId: string) => {
  const normalizedId = String(industryId || '').trim();
  if (!normalizedId) return Promise.resolve();

  const inflight = industryWarmupPromises.get(normalizedId);
  if (inflight) return inflight;

  const promise = (async () => {
    await Promise.allSettled([
      loadIndustryBaseBondGroupData(normalizedId),
      loadIndustryBondGroupData(normalizedId),
    ]);
  })().finally(() => {
    industryWarmupPromises.delete(normalizedId);
  });

  industryWarmupPromises.set(normalizedId, promise);
  return promise;
};

