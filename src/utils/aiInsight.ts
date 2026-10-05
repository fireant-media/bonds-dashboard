import { safeSetLocalStorageItem } from './localStorageBudget';

export interface DailyAIInsightEntry {
  date: string;
  signature: string;
  text: string;
  model: string;
  updatedAt: string;
}

type InsightLanguage = 'vi' | 'en';

const DAILY_AI_INSIGHT_PREFIX = 'sentinel_ai_daily_insight_v1_';
const AI_INSIGHT_MAX_LENGTH = 16_000;
const AI_INSIGHT_TIMEZONE = 'Asia/Saigon';

const getStorageKey = (cacheKey: string) => `${DAILY_AI_INSIGHT_PREFIX}${cacheKey}`;

export const getAIInsightDayKey = () => (
  new Intl.DateTimeFormat('en-CA', { timeZone: AI_INSIGHT_TIMEZONE }).format(new Date())
);

export const sanitizeAIInsightText = (content: string, language: InsightLanguage = 'vi') => {
  if (!content.trim()) return content;

  const replacements = language === 'en'
    ? {
        basedOnData: 'Based on the data',
        pageData: 'current data',
        dataSource: 'current data source',
        aggregateDataSource: 'aggregated data source',
        dataContext: 'data context',
        data: 'data',
        metrics: 'metrics',
        internalProcessing: 'internal processing',
        internalData: 'internal data',
      }
    : {
        basedOnData: 'Theo du lieu',
        pageData: 'du lieu hien tai',
        dataSource: 'nguon du lieu hien tai',
        aggregateDataSource: 'nguon du lieu tong hop',
        dataContext: 'ngu canh du lieu',
        data: 'du lieu',
        metrics: 'chi tieu',
        internalProcessing: 'xu ly noi bo',
        internalData: 'du lieu noi bo',
      };

  const normalized = content
    .replace(/Based on the data([^:\n]*?)in\s+`?PAGE_DATA`?\s*:?/gi, `${replacements.basedOnData}$1`)
    .replace(/Theo d(?:u|ữ) li(?:e|ệ)u([^:\n]*?)trong\s+`?PAGE_DATA`?\s*:?/gi, `${replacements.basedOnData}$1`)
    .replace(/\s+trong\s+`?PAGE_DATA`?/gi, '')
    .replace(/\s+t(?:u|ừ)\s+`?PAGE_DATA`?/gi, '')
    .replace(/\s+from\s+`?PAGE_DATA`?/gi, '')
    .replace(/`?PAGE_DATA`?/gi, replacements.pageData)
    .replace(/\/api\/[^\s)`]*/gi, replacements.dataSource)
    .replace(/\bJSON\b/gi, replacements.data)
    .replace(/\bAPI\b/gi, replacements.dataSource)
    .replace(/\bendpoint(s)?\b/gi, replacements.dataSource)
    .replace(/`?apiCatalog`?/gi, replacements.aggregateDataSource)
    .replace(/`?pageContext`?/gi, replacements.dataContext)
    .replace(/`?datasets?`?/gi, replacements.data)
    .replace(/\bfield(s)?\b/gi, replacements.metrics)
    .replace(/\bfunction(s)?\b/gi, replacements.internalProcessing)
    .replace(/\bvariable(s)?\b/gi, replacements.internalData);

  // Collapse a proper-noun word the model sometimes repeats inside an issuer name
  // (e.g. "Ngân hàng TMCP Sài Gòn Tài Tài Lộc" -> "... Sài Gòn Tài Lộc"). Restricted to an
  // uppercase-initial word repeated verbatim (same casing) so ordinary prose and legitimate
  // reduplication stay untouched; the `+` collapses three or more repeats in one pass.
  let deduped = normalized;
  try {
    const repeatedProperNoun = new RegExp(
      '(^|[^\\p{L}\\p{N}])(\\p{Lu}[\\p{L}\\p{M}]*)(?:\\s+\\2)+(?![\\p{L}\\p{N}])',
      'gu',
    );
    deduped = deduped.replace(repeatedProperNoun, '$1$2');
  } catch {
    // Engine without Unicode property escapes — leave the text unchanged.
  }

  return deduped
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const readDailyAIInsight = (
  cacheKey: string,
  signature: string,
  options?: { ignoreDate?: boolean },
) => {
  if (typeof window === 'undefined' || !signature) return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(cacheKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DailyAIInsightEntry>;
    // With ignoreDate the cache persists until the input signature changes (no daily expiry),
    // so the insight is only regenerated on a real data change or a manual refresh.
    if (
      (!options?.ignoreDate && parsed.date !== getAIInsightDayKey())
      || parsed.signature !== signature
      || typeof parsed.text !== 'string'
      || typeof parsed.updatedAt !== 'string'
      || typeof parsed.model !== 'string'
    ) {
      return null;
    }

    return parsed as DailyAIInsightEntry;
  } catch (error) {
    console.warn('Failed to read AI daily insight from localStorage', error);
    return null;
  }
};

export const writeDailyAIInsight = (
  cacheKey: string,
  entry: Omit<DailyAIInsightEntry, 'date'>,
) => {
  if (typeof window === 'undefined') return false;

  return safeSetLocalStorageItem(
    getStorageKey(cacheKey),
    JSON.stringify({
      ...entry,
      date: getAIInsightDayKey(),
    } satisfies DailyAIInsightEntry),
    {
      maxLength: AI_INSIGHT_MAX_LENGTH,
      warnLabel: 'AI daily insight',
      warnOnTooLarge: true,
    },
  );
};
