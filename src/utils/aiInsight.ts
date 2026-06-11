import { safeSetLocalStorageItem } from './localStorageBudget';

export interface DailyAIInsightEntry {
  date: string;
  signature: string;
  text: string;
  model: string;
  updatedAt: string;
}

const DAILY_AI_INSIGHT_PREFIX = 'sentinel_ai_daily_insight_v1_';
const AI_INSIGHT_MAX_LENGTH = 16_000;
const AI_INSIGHT_TIMEZONE = 'Asia/Saigon';

const getStorageKey = (cacheKey: string) => `${DAILY_AI_INSIGHT_PREFIX}${cacheKey}`;

export const getAIInsightDayKey = () => (
  new Intl.DateTimeFormat('en-CA', { timeZone: AI_INSIGHT_TIMEZONE }).format(new Date())
);

export const sanitizeAIInsightText = (content: string) => {
  if (!content.trim()) return content;

  return content
    .replace(/Theo dữ liệu([^:\n]*?)trong\s+`?PAGE_DATA`?\s*:?/gi, 'Theo dữ liệu$1')
    .replace(/Theo du lieu([^:\n]*?)trong\s+`?PAGE_DATA`?\s*:?/gi, 'Theo dữ liệu$1')
    .replace(/\s+trong\s+`?PAGE_DATA`?/gi, '')
    .replace(/\s+từ\s+`?PAGE_DATA`?/gi, '')
    .replace(/`?PAGE_DATA`?/gi, 'dữ liệu hiện tại')
    .replace(/\/api\/[^\s)`]*/gi, 'nguồn dữ liệu hiện tại')
    .replace(/\bJSON\b/gi, 'dữ liệu')
    .replace(/\bAPI\b/gi, 'nguồn dữ liệu')
    .replace(/\bendpoint(s)?\b/gi, 'nguồn dữ liệu')
    .replace(/`?apiCatalog`?/gi, 'nguồn dữ liệu tổng hợp')
    .replace(/`?pageContext`?/gi, 'ngữ cảnh dữ liệu')
    .replace(/`?datasets?`?/gi, 'dữ liệu')
    .replace(/\bfield(s)?\b/gi, 'chỉ tiêu')
    .replace(/\bfunction(s)?\b/gi, 'xử lý nội bộ')
    .replace(/\bvariable(s)?\b/gi, 'dữ liệu nội bộ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const readDailyAIInsight = (cacheKey: string, signature: string) => {
  if (typeof window === 'undefined' || !signature) return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(cacheKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DailyAIInsightEntry>;
    if (
      parsed.date !== getAIInsightDayKey()
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
