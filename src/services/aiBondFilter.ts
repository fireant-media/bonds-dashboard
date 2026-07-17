import { sendChat } from '../api/ai';
import type { BondDataRow, BondFilterQuery } from './bondData';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';

const FALLBACK_MODEL = 'gpt-5.4-mini';
const MAX_FILTER_SUMMARY_COUNT = 3;

// The current date used to resolve relative expressions ("hôm nay", "trong vòng 1 tuần",
// "tháng tới"...). Computed live so it never drifts stale — a hard-coded date silently
// pushed every relative maturity window into the past and matched zero bonds.
function getTodayIso() {
  return new Date().toISOString().split('T')[0];
}

// Shift an ISO date (YYYY-MM-DD) by a number of days/months/years, using UTC so the
// calendar date never wobbles across timezones. Months/years shift by real calendar
// units (not fixed 30/365-day approximations).
function shiftIsoDate(baseIso: string, { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }) {
  const [year, month, day] = baseIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (years) date.setUTCFullYear(date.getUTCFullYear() + years);
  if (months) date.setUTCMonth(date.getUTCMonth() + months);
  if (days) date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export type AIBondRateType = 'fixed' | 'floating';
export type AIBondSortBy = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface AIBondFilterCriteria {
  industry?: string;
  issuer?: string;
  bondType?: string;
  remainingDaysMin?: number;
  remainingDaysMax?: number;
  minTenorMonths?: number;
  maxTenorMonths?: number;
  issueDateFrom?: string;
  issueDateTo?: string;
  maturityDateFrom?: string;
  maturityDateTo?: string;
  minBondRate?: number;
  maxBondRate?: number;
  bondRateType?: AIBondRateType;
  minListedVolume?: number;
  maxListedVolume?: number;
  minIssuedValueBillion?: number;
  maxIssuedValueBillion?: number;
  minListedValueBillion?: number;
  maxListedValueBillion?: number;
  sortBy?: AIBondSortBy;
  secondarySorts?: AIBondSortBy[];
}

export interface ExtractBondFilterCriteriaOptions {
  message: string;
  model?: string;
}

export interface AIBondFilterExtraction {
  isFilterRequest: boolean;
  criteria: AIBondFilterCriteria;
  summary: string[];
}

interface AIBondSortPreference {
  primary?: AIBondSortBy;
  secondary: AIBondSortBy[];
}

const pruneEmptyValues = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== ''),
  ) as Partial<T>;

const normalizeTextForMatching = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSearchText = (value: string) => normalizeTextForMatching(value);

const includesAny = (text: string, patterns: string[]) => patterns.some((pattern) => text.includes(pattern));
const normalizeLabelKey = (value: string) => normalizeTextForMatching(value);

const stripMarkdownCodeFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalizedText = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  if (!normalizedText) return undefined;

  const parsed = Number(normalizedText);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeDate = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return undefined;

  const normalizedText = text.replace(/\//g, '-');

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedText)) {
    return normalizedText;
  }

  const ddMmYyyyMatch = normalizedText.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    return `${year}-${month}-${day}`;
  }

  const timestamp = Date.parse(normalizedText);
  if (Number.isNaN(timestamp)) return undefined;

  return new Date(timestamp).toISOString().split('T')[0];
};

export function normalizeAIBondRateType(value: unknown): AIBondRateType | undefined {
  const text = normalizeSearchText(String(value ?? ''));
  if (!text) return undefined;

  if (/(^|[^a-z])(co dinh|fixed|fix|dinh ky)([^a-z]|$)/.test(text)) return 'fixed';
  if (/(^|[^a-z])(tha noi|floating|variable|linh hoat|flo)([^a-z]|$)/.test(text)) return 'floating';
  return undefined;
}

export function normalizeAIBondSortBy(value: unknown): AIBondSortBy | undefined {
  if (value === null || value === undefined || value === '') return undefined;

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8) {
    return value as AIBondSortBy;
  }

  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 8) {
    return numericValue as AIBondSortBy;
  }

  const text = normalizeSearchText(String(value));
  if (!text) return undefined;

  if (text.includes('ma trai phieu') || text.includes('bond code') || text.includes('ma tp')) return 1;
  if (
    text.includes('tong khoi luong phat hanh') ||
    text.includes('khoi luong phat hanh giam dan') ||
    text.includes('issued volume')
  ) return 2;
  if (
    text.includes('tong gia tri phat hanh') ||
    text.includes('gia tri phat hanh giam dan') ||
    text.includes('issued value')
  ) return 3;
  if (
    text.includes('dao han gan nhat') ||
    text.includes('thoi gian dao han gan nhat') ||
    text.includes('maturity gan nhat') ||
    text.includes('maturity nearest')
  ) return 4;
  if (
    text.includes('phat hanh moi nhat') ||
    text.includes('thoi gian phat hanh moi nhat') ||
    text.includes('issue moi nhat') ||
    text.includes('issue date moi nhat') ||
    text.includes('newest issue')
  ) return 5;
  if (
    text.includes('lai suat danh nghia giam dan') ||
    text.includes('lai suat cao nhat') ||
    text.includes('coupon cao nhat') ||
    text.includes('yield cao nhat') ||
    text.includes('nominal rate')
  ) return 6;
  if (
    text.includes('khoi luong niem yet giam dan') ||
    text.includes('khoi luong niem yet cao nhat') ||
    text.includes('listed volume')
  ) return 7;
  if (
    text.includes('gia tri niem yet giam dan') ||
    text.includes('gia tri niem yet cao nhat') ||
    text.includes('listed value')
  ) return 8;

  return undefined;
}

function normalizeSecondarySorts(value: unknown): AIBondSortBy[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized = Array.from(
    new Set(
      value
        .map((item) => normalizeAIBondSortBy(item))
        .filter((item): item is AIBondSortBy => item !== undefined),
    ),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function dedupeSorts(values: Array<AIBondSortBy | undefined>) {
  return Array.from(new Set(values.filter((item): item is AIBondSortBy => item !== undefined)));
}

function findFirstKeywordIndex(text: string, keywords: string[]) {
  return keywords.reduce((best, keyword) => {
    const nextIndex = text.indexOf(keyword);
    if (nextIndex === -1) return best;
    if (best === -1) return nextIndex;
    return Math.min(best, nextIndex);
  }, -1);
}

function inferAIBondSortPreferences(message: string): AIBondSortPreference {
  const text = normalizeSearchText(message);
  if (!text) {
    return { primary: undefined, secondary: [] };
  }

  const priorityAnchor = findFirstKeywordIndex(text, ['uu tien', 'priority', 'prioritize']);
  const candidates: Array<{ sortBy: AIBondSortBy; index: number }> = [];

  const maybePushCandidate = (sortBy: AIBondSortBy, keywords: string[]) => {
    const index = findFirstKeywordIndex(text, keywords);
    if (index !== -1) {
      candidates.push({ sortBy, index });
    }
  };

  maybePushCandidate(6, ['lai suat', 'coupon', 'yield', 'bond rate']);
  maybePushCandidate(4, ['dao han', 'maturity']);
  maybePushCandidate(5, ['phat hanh', 'issue date', 'issue']);
  maybePushCandidate(8, ['gia tri niem yet', 'listed value']);
  maybePushCandidate(7, ['khoi luong niem yet', 'listed volume']);
  maybePushCandidate(3, ['gia tri phat hanh', 'issued value']);
  maybePushCandidate(2, ['khoi luong phat hanh', 'issued volume', 'tong khoi luong']);
  maybePushCandidate(1, ['ma trai phieu', 'bond code', 'ma tp']);
  maybePushCandidate(0, ['ten to chuc phat hanh', 'issuer name', 'ten doanh nghiep']);

  const orderedCandidates = Array.from(
    new Map(
      candidates
        .sort((left, right) => left.index - right.index)
        .map((item) => [item.sortBy, item]),
    ).values(),
  );

  if (orderedCandidates.length === 0) {
    return { primary: undefined, secondary: [] };
  }

  let primary = orderedCandidates[0].sortBy;

  if (priorityAnchor !== -1) {
    const prioritizedCandidate = orderedCandidates
      .filter((candidate) => candidate.index >= priorityAnchor)
      .sort((left, right) => left.index - right.index)[0];

    if (prioritizedCandidate) {
      primary = prioritizedCandidate.sortBy;
    }
  }

  const secondary = orderedCandidates
    .map((candidate) => candidate.sortBy)
    .filter((sortBy) => sortBy !== primary);

  return {
    primary,
    secondary,
  };
}

function inferAIBondSortByFromText(message: string): AIBondSortBy | undefined {
  const text = normalizeSearchText(message);
  if (!text) return undefined;

  const asksHighest = includesAny(text, ['cao nhat', 'lon nhat', 'giam dan', 'tu cao xuong thap', 'nhieu nhat']);
  const asksLowest = includesAny(text, ['thap nhat', 'tang dan', 'tu thap len cao']);
  const asksNearest = includesAny(text, ['gan nhat', 'som nhat']);
  const asksNewest = includesAny(text, ['moi nhat']);

  if (includesAny(text, ['lai suat', 'coupon', 'yield', 'bond rate'])) {
    if (asksHighest || includesAny(text, ['lai suat cao', 'yield cao'])) return 6;
  }

  if (includesAny(text, ['gia tri niem yet', 'listed value'])) {
    if (asksHighest || includesAny(text, ['gia tri niem yet lon'])) return 8;
  }

  if (includesAny(text, ['khoi luong niem yet', 'listed volume'])) {
    if (asksHighest || includesAny(text, ['khoi luong niem yet lon'])) return 7;
  }

  if (includesAny(text, ['gia tri phat hanh', 'issued value'])) {
    if (asksHighest || includesAny(text, ['gia tri phat hanh lon'])) return 3;
  }

  if (includesAny(text, ['khoi luong phat hanh', 'issued volume', 'tong khoi luong'])) {
    if (asksHighest || includesAny(text, ['khoi luong phat hanh lon'])) return 2;
  }

  if (includesAny(text, ['dao han', 'maturity'])) {
    if (asksNearest || includesAny(text, ['dao han sap toi', 'dao han truoc'])) return 4;
  }

  if (includesAny(text, ['phat hanh', 'issue date', 'issue'])) {
    if (asksNewest || includesAny(text, ['phat hanh gan day', 'phat hanh sau cung'])) return 5;
  }

  if (includesAny(text, ['ma trai phieu', 'bond code', 'ma tp'])) {
    if (includesAny(text, ['alphabet', 'abc', 'thu tu chu cai'])) return 1;
  }

  if (includesAny(text, ['ten to chuc phat hanh', 'issuer name', 'ten doanh nghiep'])) {
    if (includesAny(text, ['alphabet', 'abc', 'thu tu chu cai'])) return 0;
  }

  if (asksLowest) {
    if (includesAny(text, ['dao han', 'maturity'])) return 4;
    if (includesAny(text, ['phat hanh', 'issue'])) return 5;
  }

  return undefined;
}

// Resolve a maturity time-window phrase ("đáo hạn trong vòng 1 tuần", "đáo hạn trong 30 ngày",
// "đáo hạn 3 tháng tới") into a concrete [today, today+window] maturity-date range. We express it
// as a maturity DATE range rather than remainingDays because the market-bond filter has a maturity
// date field (and filters on row.maturityDate) but has no remaining-days field and its rows carry
// no daysLeft — so a remainingDays criterion would silently disappear there. `text` is already
// diacritic-stripped (đ→d, "tuần"→"tuan"). Requires a maturity cue ("dao han") so an unrelated
// window like a tenor ("kỳ hạn 3 tháng") or an issue window is not misread as a maturity range.
function inferMaturityWindow(text: string): { from: string; to: string } | undefined {
  if (!/dao han/.test(text)) return undefined;

  // Either a leading window preposition ("trong (vong) X tuan") or a trailing one ("X tuan toi").
  const match =
    text.match(/(?:trong vong|trong khoang|trong|sap toi|toi)\s*(\d{1,3})\s*(ngay|tuan|thang|nam)/) ||
    text.match(/(\d{1,3})\s*(ngay|tuan|thang|nam)\s*(?:toi|nua|ke tiep|sap toi)/);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const today = getTodayIso();
  const shift =
    unit === 'ngay'
      ? { days: amount }
      : unit === 'tuan'
        ? { days: amount * 7 }
        : unit === 'thang'
          ? { months: amount }
          : { years: amount };

  return { from: today, to: shiftIsoDate(today, shift) };
}

// Vietnamese comparison cues shared by every numeric-range field. Kept as source fragments so each
// field can compose them with its own unit. "tu"/"trong khoang" lead a between-range; the min/max
// groups cover the common "trên/dưới/ít nhất/tối đa/lớn hơn/nhỏ hơn/≥/≤" phrasings plus English.
const RANGE_MIN_SIGNAL = '(?:tren|lon hon|cao hon|hon|it nhat|toi thieu|tu|from|over|more than|>=?)';
const RANGE_MAX_SIGNAL = '(?:duoi|nho hon|thap hon|khong qua|khong vuot qua|khong vuot|toi da|at most|under|less than|<=?)';
const RANGE_BETWEEN_LEAD = '(?:tu|trong khoang|khoang|from|between)';
const RANGE_BETWEEN_MID = '(?:den|toi|to|va)';
const RANGE_NUMBER = '(\\d[\\d.,]*)';
const RANGE_SCALE = '\\s*(nghin|trieu)?\\s*';

// Convert a matched number + optional magnitude word ("nghìn"→×1000) + optional unit ("năm"→×12
// months for tenor) into a scalar. normalizeNumber already reads "." as a thousands separator and
// "," as a decimal, so "1.000" → 1000 and "9,5" → 9.5.
function scaleRangeNumber(
  numText: string,
  magnitude: string | undefined,
  unit: string | undefined,
  options: { thousandForBillion?: boolean; yearToMonth?: boolean } = {},
): number | undefined {
  let value = normalizeNumber(numText);
  if (value === undefined) return undefined;
  if (options.thousandForBillion && magnitude === 'nghin') value *= 1000;
  if (options.yearToMonth && unit === 'nam') value *= 12;
  return value;
}

// Where a field's clause ends: at the next field/marker keyword after its own anchor, so numbers
// belonging to a later criterion ("...lãi suất trên 8% kỳ hạn dưới 24 tháng") are not swallowed.
const NUMERIC_CLAUSE_BOUNDARIES = [
  'lai suat', 'coupon', 'yield', 'ky han', 'gia tri phat hanh', 'gia tri niem yet',
  'khoi luong niem yet', 'khoi luong phat hanh', 'dao han', 'phat hanh', 'con lai', 'nganh', 'loai',
];

function sliceFieldClause(text: string, anchorIndex: number, anchorKeyword: string): string {
  const start = anchorIndex + anchorKeyword.length;
  let end = text.length;
  for (const boundary of NUMERIC_CLAUSE_BOUNDARIES) {
    const idx = text.indexOf(boundary, start);
    if (idx !== -1 && idx < end) end = idx;
  }
  return text.slice(anchorIndex, end);
}

// A field's expected unit token(s). A number is only accepted for a field when the unit right after
// it is blank or one the field allows — this stops a stray number from a neighbouring clause (e.g. a
// "%" value) from being read as tenor months or a billion-VND value when clause slicing is imperfect.
function unitIsCompatible(unit: string | undefined, allowed: string[]) {
  if (!unit) return true;
  return allowed.includes(unit);
}

// Extract {min,max} for one numeric field from `text`, scoped to the clause following its keyword.
function extractFieldRange(
  text: string,
  keywords: string[],
  allowedUnits: string[],
  scaleOptions: { thousandForBillion?: boolean; yearToMonth?: boolean } = {},
): { min?: number; max?: number } {
  const anchorKeyword = keywords.find((keyword) => text.includes(keyword));
  if (!anchorKeyword) return {};
  // "kỳ hạn còn lại" is a remaining-term phrase, handled elsewhere — never a tenor range.
  const clause = sliceFieldClause(text, text.indexOf(anchorKeyword), anchorKeyword);
  if (/con lai/.test(clause)) return {};

  const unitAlt = ['%', 'thang', 'nam', 'ty', 'ngay'].join('|');
  // The unit is a CAPTURING group so between[3]/[6] and min/max[3] hold the unit for the
  // compatibility check and the năm→months scaling — keep it capturing, not (?:…).
  const tail = `${RANGE_SCALE}(${unitAlt})?`;
  const scale = (num: string, mag: string | undefined, unit: string | undefined) =>
    scaleRangeNumber(num, mag, unit, scaleOptions);

  const between = clause.match(
    new RegExp(`${RANGE_BETWEEN_LEAD}\\s*${RANGE_NUMBER}${tail}\\s*${RANGE_BETWEEN_MID}\\s*${RANGE_NUMBER}${tail}`),
  );
  if (between && unitIsCompatible(between[3], allowedUnits) && unitIsCompatible(between[6], allowedUnits)) {
    const min = scale(between[1], between[2], between[3]);
    const max = scale(between[4], between[5], between[6]);
    if (min !== undefined || max !== undefined) return { min, max };
  }

  const result: { min?: number; max?: number } = {};
  const minMatch = clause.match(new RegExp(`${RANGE_MIN_SIGNAL}\\s*${RANGE_NUMBER}${tail}`));
  if (minMatch && unitIsCompatible(minMatch[3], allowedUnits)) {
    result.min = scale(minMatch[1], minMatch[2], minMatch[3]);
  }
  const maxMatch = clause.match(new RegExp(`${RANGE_MAX_SIGNAL}\\s*${RANGE_NUMBER}${tail}`));
  if (maxMatch && unitIsCompatible(maxMatch[3], allowedUnits)) {
    result.max = scale(maxMatch[1], maxMatch[2], maxMatch[3]);
  }

  // Trailing cues: "8% trở lên" (min), "24 tháng trở xuống" (max) — no leading comparator.
  if (result.min === undefined) {
    const trailingMin = clause.match(new RegExp(`${RANGE_NUMBER}${tail}\\s*tro len`));
    if (trailingMin && unitIsCompatible(trailingMin[3], allowedUnits)) {
      result.min = scale(trailingMin[1], trailingMin[2], trailingMin[3]);
    }
  }
  if (result.max === undefined) {
    const trailingMax = clause.match(new RegExp(`${RANGE_NUMBER}${tail}\\s*tro xuong`));
    if (trailingMax && unitIsCompatible(trailingMax[3], allowedUnits)) {
      result.max = scale(trailingMax[1], trailingMax[2], trailingMax[3]);
    }
  }
  return result;
}

// Deterministically parse every numeric-range criterion so a multi-criteria request narrows on all
// of them even when the LLM is unavailable or misses one. Rate is also read from a bare "N%" cue
// anywhere in the text, since a percentage here always denotes the coupon rate.
function inferNumericRangeCriteria(text: string): AIBondFilterCriteria {
  const rate = extractFieldRange(text, ['lai suat', 'coupon', 'yield', 'bond rate'], ['%']);
  if (rate.min === undefined && rate.max === undefined) {
    const bareMin = text.match(new RegExp(`${RANGE_MIN_SIGNAL}\\s*${RANGE_NUMBER}\\s*%`));
    const bareMax = text.match(new RegExp(`${RANGE_MAX_SIGNAL}\\s*${RANGE_NUMBER}\\s*%`));
    if (bareMin) rate.min = normalizeNumber(bareMin[1]);
    if (bareMax) rate.max = normalizeNumber(bareMax[1]);
  }

  const tenor = extractFieldRange(text, ['ky han'], ['thang', 'nam'], { yearToMonth: true });
  const issuedValue = extractFieldRange(text, ['gia tri phat hanh', 'issued value'], ['ty'], { thousandForBillion: true });
  const listedValue = extractFieldRange(text, ['gia tri niem yet', 'listed value'], ['ty'], { thousandForBillion: true });
  const listedVolume = extractFieldRange(text, ['khoi luong niem yet', 'listed volume'], []);

  return pruneEmptyValues({
    minBondRate: rate.min,
    maxBondRate: rate.max,
    minTenorMonths: tenor.min,
    maxTenorMonths: tenor.max,
    minIssuedValueBillion: issuedValue.min,
    maxIssuedValueBillion: issuedValue.max,
    minListedValueBillion: listedValue.min,
    maxListedValueBillion: listedValue.max,
    minListedVolume: listedVolume.min,
    maxListedVolume: listedVolume.max,
  } as Record<string, unknown>) as AIBondFilterCriteria;
}

export function inferHeuristicBondFilterCriteria(message: string): AIBondFilterCriteria {
  const text = normalizeSearchText(message);
  if (!text) return {};

  const sortPreferences = inferAIBondSortPreferences(message);
  const fallbackPrimarySort = inferAIBondSortByFromText(text);
  const numericCriteria = inferNumericRangeCriteria(text);
  const remainingDaysBetweenMatch = text.match(/(?:tu|trong khoang|khoang)\D*(\d{1,4})\D*(?:den|toi)\D*(\d{1,4})\s*ngay/);
  const remainingDaysBelowMatch = text.match(/(?:duoi|toi da|khong qua|less than|under)\D*(\d{1,4})\s*ngay/);
  const remainingDaysAboveMatch = text.match(/(?:tren|tu|toi thieu|more than|over)\D*(\d{1,4})\s*ngay/);
  const remainingDaysAtMatch = text.match(/(?:con lai|remaining term|days left|ngay con lai)\D*(\d{1,4})\s*ngay/);

  const maturityWindow = inferMaturityWindow(text);

  return pruneEmptyValues({
    ...numericCriteria,
    bondRateType: normalizeAIBondRateType(text),
    remainingDaysMin: remainingDaysBetweenMatch
      ? normalizeNumber(remainingDaysBetweenMatch[1])
      : remainingDaysAboveMatch
        ? normalizeNumber(remainingDaysAboveMatch[1])
        : undefined,
    remainingDaysMax: remainingDaysBetweenMatch
      ? normalizeNumber(remainingDaysBetweenMatch[2])
      : remainingDaysBelowMatch
        ? normalizeNumber(remainingDaysBelowMatch[1])
        : remainingDaysAtMatch
          ? normalizeNumber(remainingDaysAtMatch[1])
          : undefined,
    maturityDateFrom: maturityWindow?.from,
    maturityDateTo: maturityWindow?.to,
    sortBy: sortPreferences.primary ?? fallbackPrimarySort,
    secondarySorts: dedupeSorts(sortPreferences.secondary),
  } as Record<string, unknown>) as AIBondFilterCriteria;
}

function mergeBondFilterCriteria(
  aiCriteria: AIBondFilterCriteria,
  heuristicCriteria: AIBondFilterCriteria,
): AIBondFilterCriteria {
  const mergedPrimarySort = heuristicCriteria.sortBy ?? aiCriteria.sortBy;
  const mergedSecondarySorts = dedupeSorts([
    ...(heuristicCriteria.secondarySorts || []),
    ...(aiCriteria.secondarySorts || []),
  ]).filter((sortBy) => sortBy !== mergedPrimarySort);

  return pruneEmptyValues({
    ...aiCriteria,
    ...heuristicCriteria,
    sortBy: mergedPrimarySort,
    secondarySorts: mergedSecondarySorts.length > 0 ? mergedSecondarySorts : undefined,
  } as Record<string, unknown>) as AIBondFilterCriteria;
}

function normalizeCriteria(value: unknown): AIBondFilterCriteria {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const industry = String(source.industry ?? '').trim() || undefined;
  const issuer = String(source.issuer ?? '').trim() || undefined;
  const bondType = String(source.bondType ?? '').trim() || undefined;

  let minTenorMonths = normalizeNumber(source.minTenorMonths);
  let maxTenorMonths = normalizeNumber(source.maxTenorMonths);
  if (minTenorMonths !== undefined && maxTenorMonths !== undefined && minTenorMonths > maxTenorMonths) {
    [minTenorMonths, maxTenorMonths] = [maxTenorMonths, minTenorMonths];
  }

  let minBondRate = normalizeNumber(source.minBondRate);
  let maxBondRate = normalizeNumber(source.maxBondRate);
  if (minBondRate !== undefined && maxBondRate !== undefined && minBondRate > maxBondRate) {
    [minBondRate, maxBondRate] = [maxBondRate, minBondRate];
  }

  let minListedVolume = normalizeNumber(source.minListedVolume);
  let maxListedVolume = normalizeNumber(source.maxListedVolume);
  if (minListedVolume !== undefined && maxListedVolume !== undefined && minListedVolume > maxListedVolume) {
    [minListedVolume, maxListedVolume] = [maxListedVolume, minListedVolume];
  }

  let minIssuedValueBillion = normalizeNumber(source.minIssuedValueBillion);
  let maxIssuedValueBillion = normalizeNumber(source.maxIssuedValueBillion);
  if (minIssuedValueBillion !== undefined && maxIssuedValueBillion !== undefined && minIssuedValueBillion > maxIssuedValueBillion) {
    [minIssuedValueBillion, maxIssuedValueBillion] = [maxIssuedValueBillion, minIssuedValueBillion];
  }

  let minListedValueBillion = normalizeNumber(source.minListedValueBillion);
  let maxListedValueBillion = normalizeNumber(source.maxListedValueBillion);
  if (minListedValueBillion !== undefined && maxListedValueBillion !== undefined && minListedValueBillion > maxListedValueBillion) {
    [minListedValueBillion, maxListedValueBillion] = [maxListedValueBillion, minListedValueBillion];
  }

  let issueDateFrom = normalizeDate(source.issueDateFrom);
  let issueDateTo = normalizeDate(source.issueDateTo);
  if (issueDateFrom && issueDateTo && issueDateFrom > issueDateTo) {
    [issueDateFrom, issueDateTo] = [issueDateTo, issueDateFrom];
  }

  let maturityDateFrom = normalizeDate(source.maturityDateFrom);
  let maturityDateTo = normalizeDate(source.maturityDateTo);
  if (maturityDateFrom && maturityDateTo && maturityDateFrom > maturityDateTo) {
    [maturityDateFrom, maturityDateTo] = [maturityDateTo, maturityDateFrom];
  }

  return pruneEmptyValues({
    industry,
    issuer,
    bondType,
    remainingDaysMin: normalizeNumber(source.remainingDaysMin),
    remainingDaysMax: normalizeNumber(source.remainingDaysMax),
    minTenorMonths,
    maxTenorMonths,
    issueDateFrom,
    issueDateTo,
    maturityDateFrom,
    maturityDateTo,
    minBondRate,
    maxBondRate,
    bondRateType: normalizeAIBondRateType(source.bondRateType),
    minListedVolume,
    maxListedVolume,
    minIssuedValueBillion,
    maxIssuedValueBillion,
    minListedValueBillion,
    maxListedValueBillion,
    sortBy: normalizeAIBondSortBy(source.sortBy),
    secondarySorts: normalizeSecondarySorts(source.secondarySorts),
  });
}

function extractJsonObject(value: string) {
  const cleaned = stripMarkdownCodeFence(value);
  const firstObjectStart = cleaned.indexOf('{');
  const lastObjectEnd = cleaned.lastIndexOf('}');

  if (firstObjectStart === -1 || lastObjectEnd === -1 || lastObjectEnd <= firstObjectStart) {
    throw new Error('AI did not return valid JSON.');
  }

  return cleaned.slice(firstObjectStart, lastObjectEnd + 1);
}

function buildFallbackSummary(criteria: AIBondFilterCriteria) {
  const summary: string[] = [];

  if (criteria.industry) {
    summary.push(`Ngành nghề: ${criteria.industry}`);
  }

  if (criteria.issuer) {
    summary.push(`Tổ chức phát hành: ${criteria.issuer}`);
  }

  if (criteria.bondType) {
    summary.push(`Loại trái phiếu: ${criteria.bondType}`);
  }

  if (criteria.remainingDaysMin !== undefined || criteria.remainingDaysMax !== undefined) {
    if (criteria.remainingDaysMin !== undefined && criteria.remainingDaysMax !== undefined) {
      summary.push(`Kỳ hạn còn lại từ ${formatNumber(criteria.remainingDaysMin, 0)} đến ${formatNumber(criteria.remainingDaysMax, 0)} ngày`);
    } else if (criteria.remainingDaysMin !== undefined) {
      summary.push(`Kỳ hạn còn lại từ ${formatNumber(criteria.remainingDaysMin, 0)} ngày trở lên`);
    } else if (criteria.remainingDaysMax !== undefined) {
      summary.push(`Kỳ hạn còn lại đến ${formatNumber(criteria.remainingDaysMax, 0)} ngày`);
    }
  }

  if (criteria.minTenorMonths !== undefined || criteria.maxTenorMonths !== undefined) {
    if (criteria.minTenorMonths !== undefined && criteria.maxTenorMonths !== undefined) {
      summary.push(`Kỳ hạn từ ${formatNumber(criteria.minTenorMonths, 0)} đến ${formatNumber(criteria.maxTenorMonths, 0)} tháng`);
    } else if (criteria.minTenorMonths !== undefined) {
      summary.push(`Kỳ hạn từ ${formatNumber(criteria.minTenorMonths, 0)} tháng trở lên`);
    } else if (criteria.maxTenorMonths !== undefined) {
      summary.push(`Kỳ hạn đến ${formatNumber(criteria.maxTenorMonths, 0)} tháng`);
    }
  }

  if (criteria.minBondRate !== undefined || criteria.maxBondRate !== undefined) {
    if (criteria.minBondRate !== undefined && criteria.maxBondRate !== undefined) {
      summary.push(`Lãi suất từ ${formatInterestRate(criteria.minBondRate)}% đến ${formatInterestRate(criteria.maxBondRate)}%`);
    } else if (criteria.minBondRate !== undefined) {
      summary.push(`Lãi suất từ ${formatInterestRate(criteria.minBondRate)}% trở lên`);
    } else if (criteria.maxBondRate !== undefined) {
      summary.push(`Lãi suất đến ${formatInterestRate(criteria.maxBondRate)}%`);
    }
  }

  if (criteria.issueDateFrom || criteria.issueDateTo) {
    if (criteria.issueDateFrom && criteria.issueDateTo) {
      summary.push(`Ngày phát hành từ ${formatDate(criteria.issueDateFrom)} đến ${formatDate(criteria.issueDateTo)}`);
    } else if (criteria.issueDateFrom) {
      summary.push(`Ngày phát hành từ ${formatDate(criteria.issueDateFrom)} trở đi`);
    } else if (criteria.issueDateTo) {
      summary.push(`Ngày phát hành đến ${formatDate(criteria.issueDateTo)}`);
    }
  }

  if (criteria.maturityDateFrom || criteria.maturityDateTo) {
    if (criteria.maturityDateFrom && criteria.maturityDateTo) {
      summary.push(`Ngày đáo hạn từ ${formatDate(criteria.maturityDateFrom)} đến ${formatDate(criteria.maturityDateTo)}`);
    } else if (criteria.maturityDateFrom) {
      summary.push(`Ngày đáo hạn từ ${formatDate(criteria.maturityDateFrom)} trở đi`);
    } else if (criteria.maturityDateTo) {
      summary.push(`Ngày đáo hạn đến ${formatDate(criteria.maturityDateTo)}`);
    }
  }

  if (criteria.bondRateType === 'fixed') {
    summary.push('Loại lãi suất cố định');
  } else if (criteria.bondRateType === 'floating') {
    summary.push('Loại lãi suất thả nổi');
  }

  if (criteria.minListedVolume !== undefined || criteria.maxListedVolume !== undefined) {
    if (criteria.minListedVolume !== undefined && criteria.maxListedVolume !== undefined) {
      summary.push(`Khối lượng niêm yết từ ${formatNumber(criteria.minListedVolume, 0)} đến ${formatNumber(criteria.maxListedVolume, 0)}`);
    } else if (criteria.minListedVolume !== undefined) {
      summary.push(`Khối lượng niêm yết từ ${formatNumber(criteria.minListedVolume, 0)} trở lên`);
    } else if (criteria.maxListedVolume !== undefined) {
      summary.push(`Khối lượng niêm yết đến ${formatNumber(criteria.maxListedVolume, 0)}`);
    }
  }

  if (criteria.minIssuedValueBillion !== undefined || criteria.maxIssuedValueBillion !== undefined) {
    if (criteria.minIssuedValueBillion !== undefined && criteria.maxIssuedValueBillion !== undefined) {
      summary.push(`Giá trị phát hành từ ${formatNumber(criteria.minIssuedValueBillion, 2)} đến ${formatNumber(criteria.maxIssuedValueBillion, 2)} tỷ VND`);
    } else if (criteria.minIssuedValueBillion !== undefined) {
      summary.push(`Giá trị phát hành từ ${formatNumber(criteria.minIssuedValueBillion, 2)} tỷ VND trở lên`);
    } else if (criteria.maxIssuedValueBillion !== undefined) {
      summary.push(`Giá trị phát hành đến ${formatNumber(criteria.maxIssuedValueBillion, 2)} tỷ VND`);
    }
  }

  if (criteria.minListedValueBillion !== undefined || criteria.maxListedValueBillion !== undefined) {
    if (criteria.minListedValueBillion !== undefined && criteria.maxListedValueBillion !== undefined) {
      summary.push(`Giá trị niêm yết từ ${formatNumber(criteria.minListedValueBillion, 2)} đến ${formatNumber(criteria.maxListedValueBillion, 2)} tỷ VND`);
    } else if (criteria.minListedValueBillion !== undefined) {
      summary.push(`Giá trị niêm yết từ ${formatNumber(criteria.minListedValueBillion, 2)} tỷ VND trở lên`);
    } else if (criteria.maxListedValueBillion !== undefined) {
      summary.push(`Giá trị niêm yết đến ${formatNumber(criteria.maxListedValueBillion, 2)} tỷ VND`);
    }
  }

  if (criteria.sortBy !== undefined) {
    summary.push(getAIBondSortByLabel(criteria.sortBy, 'vi'));
  }

  if (criteria.secondarySorts && criteria.secondarySorts.length > 0) {
    summary.push(`Ưu tiên tiếp theo: ${criteria.secondarySorts.map((item) => getAIBondSortByLabel(item, 'vi')).join(', ')}`);
  }

  return summary;
}

export function isBondFilterIntent(message: string) {
  const text = normalizeSearchText(message);
  if (!text) return false;

  const hasFilterVerb = /(loc|filter|tim|liet ke|danh sach|chon|show|xem cac|goi y cac|sap xep|xep theo|order by|sort by)/.test(text);
  const hasFieldKeyword = /(nganh|industry|to chuc phat hanh|issuer|loai trai phieu|bond type|ky han|tenor|dao han|maturity|phat hanh|issue|lai suat|bond rate|ma trai phieu|bond code|khoi luong phat hanh|gia tri phat hanh|khoi luong niem yet|gia tri niem yet|listed volume|listed value|issued volume|issued value)/.test(text);
  const hasRemainingDaysKeyword = /(ky han con lai|remaining term|days left|ngay con lai|con lai.*ngay)/.test(text);
  const hasSortKeyword = /(sap xep|xep theo|giam dan|tang dan|cao nhat|thap nhat|gan nhat|moi nhat|top)/.test(text);
  const hasTypeKeyword = /(co dinh|fixed|tha noi|floating|variable)/.test(text);
  // `\b\d{4}\b` matches a standalone year (e.g. 2026) but NOT the digits inside a bond code like
  // "CVT12102" (letters+digits form one token, so there is no word boundary before the digits) —
  // otherwise a question naming a bond code was mistaken for a numeric range and sent to the filter.
  const hasRangeSignal = /(tu | den | duoi | tren | trong | khoang | sau | truoc | nho hon | lon hon | it nhat | toi da | toi thieu |\b\d{4}\b|\d+\s*%|\d+\s*thang)/.test(text);
  const isRankingQuestion = /(top|cao nhat|thap nhat|lon nhat|nho nhat|gan nhat|moi nhat)/.test(text);
  const hasExplicitCommand = /(loc|filter|liet ke|danh sach|sap xep|xep theo|order by|sort by|\btop\b)/.test(text);
  const isQuestion = /\?/.test(message)
    || /(bao nhieu|la gi|the nao|nhu the nao|tai sao|vi sao|co phai|khi nao|o dau|\bnao\b|giai thich|so sanh|danh gia|nhan xet|cho biet)/.test(text);

  // Analytical / aggregate questions are answered from the current page's data (grounded Q&A),
  // never turned into a market-wide bond filter. The filter can only return a list of individual
  // bonds, so it cannot say *who* the top issuers are, *summarize* a set, count the whole market,
  // or reason about the *current* filtered results — routing such questions to it produced an
  // off-topic, always-identical bond list. Genuine list/sort/criteria commands still filter.
  const asksWho = /(\bla ai\b|\bla nhung ai\b|\bnhung ai\b|gom (nhung )?ai)/.test(text);
  const asksToSummarize = /(tom tat|nhan xet|danh gia|phan tich|noi bat|noi troi|dang chu y)/.test(text);
  const refersToCurrentResults = /(ket qua (dang |hien )?loc|ket qua loc|dang duoc loc|bo loc hien tai|theo bo loc|trong danh sach nay|tren danh sach nay|danh sach hien tai)/.test(text);
  const asksHowMany = /(bao nhieu|how many|co may)/.test(text);
  const hasNumericCriterion = /(\d+\s*%|\d+\s*thang|\d+\s*ngay|\d{4}|\d[\d.,]*\s*ty)/.test(text);
  // "top/most … issuers/industry" ranks aggregates the filter can't compute (it lists bonds).
  const ranksIssuersOrIndustry =
    /(\btop\b|nhieu nhat|lon nhat|cao nhat|dan dau)/.test(text)
    && /(to chuc phat hanh|doanh nghiep phat hanh|nganh nao|nhom nganh|nhom to chuc)/.test(text)
    && !/(loc|liet ke|sap xep|xep theo|order by|sort by)/.test(text)
    && !/\btrai phieu\b/.test(text);

  if (asksWho || asksToSummarize || refersToCurrentResults || ranksIssuersOrIndustry) return false;
  if (asksHowMany && !hasNumericCriterion && !hasTypeKeyword) return false;

  // A genuine question that is not an explicit list/filter/sort command and has no numeric
  // range is answered from the current page context (grounded Q&A) instead of being turned
  // into a market-wide filter. Explicit filter/list/sort or range requests still filter.
  if (isQuestion && !hasExplicitCommand && !hasRangeSignal) return false;

  if (isRankingQuestion && !hasFilterVerb && !hasFieldKeyword) return false;
  if (hasSortKeyword && hasFieldKeyword) return true;
  if (hasFilterVerb && (hasFieldKeyword || hasTypeKeyword || hasRemainingDaysKeyword)) return true;
  if (hasTypeKeyword) return true;
  return (hasFieldKeyword || hasRemainingDaysKeyword) && hasRangeSignal;
}

export async function extractBondFilterCriteria({
  message,
  model,
}: ExtractBondFilterCriteriaOptions): Promise<AIBondFilterExtraction> {
  const heuristicCriteria = inferHeuristicBondFilterCriteria(message);

  try {
    const response = await sendChat({
      model: model || FALLBACK_MODEL,
      systemPrompt: [
        'Ban la bo xu ly trich xuat tieu chi loc trai phieu doanh nghiep.',
        'Nhiem vu cua ban la chuyen mo ta tu nhien thanh JSON ngan gon, khong giai thich them.',
        `Ngay hien tai la ${getTodayIso()}. Neu nguoi dung noi hom nay, thang nay, quy nay, nam nay, 12 thang toi, 6 thang toi... thi phai quy doi ra ngay thang cu the dua tren ngay hien tai nay.`,
        'Voi cac cum "dao han trong vong X ngay/tuan/thang/nam", "dao han X tuan/thang toi", hay dat maturityDateFrom = ngay hien tai va maturityDateTo = ngay hien tai cong them khoang do. Khong dung remainingDays cho cac cum ve dao han.',
        'Chi ho tro cac truong: industry, issuer, bondType, remainingDaysMin, remainingDaysMax, minTenorMonths, maxTenorMonths, issueDateFrom, issueDateTo, maturityDateFrom, maturityDateTo, minBondRate, maxBondRate, bondRateType, minListedVolume, maxListedVolume, minIssuedValueBillion, maxIssuedValueBillion, minListedValueBillion, maxListedValueBillion, sortBy, secondarySorts.',
        'Neu nguoi dung noi ve ky han con lai / remaining term / days left, hay su dung remainingDaysMin va remainingDaysMax.',
        'industry la nganh nghe; issuer la ten to chuc phat hanh; bondType la loai trai phieu.',
        'Quy uoc doc so: dau "." la phan ngan cach hang nghin; dau "," la phan thap phan.',
        'Vi du: 1.000 ty = 1000 ty = 1 nghin ty. 1000 ty = 1 nghin ty. 1,000 = 1 ty.',
        'bondRateType chi nhan mot trong hai gia tri: "fixed" hoac "floating".',
        'Cac truong gia tri theo ty VND gom: minIssuedValueBillion, maxIssuedValueBillion, minListedValueBillion, maxListedValueBillion.',
        'Chi dien industry, issuer, bondType neu nguoi dung neu ro tieu chi nay. Khong dua ma trai phieu (vi du ACB12203) vao issuer.',
        'Neu nguoi dung chi neu ten viet tat hoac ma chung khoan cua to chuc phat hanh (vi du: ACB, TCB, VIC, MSN, VPB) thi coi do la issuer va dat dung gia tri do (giu nguyen, khong tu suy dien thanh ten day du).',
        'sortBy chi nhan mot trong cac gia tri: 0 ten to chuc phat hanh, 1 ma trai phieu, 2 tong khoi luong phat hanh giam dan, 3 tong gia tri phat hanh giam dan, 4 dao han gan nhat, 5 phat hanh moi nhat, 6 lai suat danh nghia giam dan, 7 khoi luong niem yet giam dan, 8 gia tri niem yet giam dan.',
        'secondarySorts la danh sach thu tu uu tien tiep theo neu cau hoi co nhieu dieu kien xep hang.',
        'Neu nguoi dung hoi "trai phieu co lai suat cao nhat" thi phai uu tien {"sortBy": 6} va khong duoc tu y dat minBondRate/maxBondRate.',
        'Neu nguoi dung hoi "dao han gan nhat" thi uu tien {"sortBy": 4}.',
        'Neu nguoi dung hoi "phat hanh moi nhat" thi uu tien {"sortBy": 5}.',
        'Neu nguoi dung hoi "gia tri niem yet lon nhat" thi uu tien {"sortBy": 8}.',
        'Neu cau hoi co nhieu uu tien nhu "lai suat cao, dao han som nhung uu tien gia tri niem yet lon" thi dat sortBy cho tieu chi duoc uu tien nhat va dat secondarySorts cho cac tieu chi con lai theo dung thu tu uu tien.',
        'Khong biet gia tri nao thi bo trong, khong duoc doan vo can cu.',
        'Tra ve duy nhat mot object JSON co dang:',
        '{"isFilterRequest": true, "criteria": {}, "summary": ["..."]}',
        'summary la danh sach mo ta ngan gon bang tieng Viet CO DAU day du (co dau thanh va dau mu chinh xac, tuyet doi khong viet tieng Viet khong dau). Neu yeu cau khong phai loc trai phieu thi tra ve {"isFilterRequest": false, "criteria": {}, "summary": []}.',
        'Khong duoc tra ve markdown, code fence, hay van ban bo sung.',
      ].join(' '),
      userMessage: message.trim(),
    });

    const rawText = String(response.text || '').trim();
    const parsed = JSON.parse(extractJsonObject(rawText)) as {
      isFilterRequest?: unknown;
      criteria?: unknown;
      summary?: unknown;
    };

    const aiCriteria = normalizeCriteria(parsed.criteria);
    const criteria = mergeBondFilterCriteria(aiCriteria, heuristicCriteria);
    const fallbackSummary = buildFallbackSummary(criteria);
    const summary = Array.isArray(parsed.summary)
      ? parsed.summary
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, MAX_FILTER_SUMMARY_COUNT)
      : [];

    return {
      isFilterRequest: Boolean(parsed.isFilterRequest) || Object.keys(criteria).length > 0,
      criteria,
      summary: Array.from(
        new Map(
          [...(summary.length > 0 ? summary : []), ...fallbackSummary]
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .map((item) => [normalizeLabelKey(item), item]),
        ).values(),
      ).slice(0, MAX_FILTER_SUMMARY_COUNT),
    };
  } catch (error) {
    if (Object.keys(heuristicCriteria).length > 0) {
      return {
        isFilterRequest: true,
        criteria: heuristicCriteria,
        summary: buildFallbackSummary(heuristicCriteria).slice(0, MAX_FILTER_SUMMARY_COUNT),
      };
    }

    throw error;
  }
}

export function buildBondFilterQueryFromCriteria(
  criteria: AIBondFilterCriteria,
  options: {
    statusID?: number;
    isListing?: number;
    top?: number;
  } = {},
): BondFilterQuery {
  return pruneEmptyValues({
    StatusID: options.statusID ?? 1,
    IsListing: options.isListing ?? 1,
    Top: options.top,
    MinTenorMonths: criteria.minTenorMonths,
    MaxTenorMonths: criteria.maxTenorMonths,
    IssueDateFrom: criteria.issueDateFrom,
    IssueDateTo: criteria.issueDateTo,
    MaturityDateFrom: criteria.maturityDateFrom,
    MaturityDateTo: criteria.maturityDateTo,
    MinBondRate: criteria.minBondRate,
    MaxBondRate: criteria.maxBondRate,
    SortBy: criteria.sortBy,
  });
}

export function getAIBondSortSequence(criteria: AIBondFilterCriteria) {
  return dedupeSorts([criteria.sortBy, ...(criteria.secondarySorts || [])]);
}

export function getAIBondRateTypeLabel(rateType?: AIBondRateType, language: 'vi' | 'en' = 'vi') {
  if (!rateType) return '';
  if (language === 'en') {
    return rateType === 'fixed' ? 'Fixed' : 'Floating';
  }
  return rateType === 'fixed' ? 'Cố định' : 'Thả nổi';
}

export function summarizeBondFilterCriteria(criteria: AIBondFilterCriteria, language: 'vi' | 'en' = 'vi') {
  const summary = buildFallbackSummary(criteria).slice(0, MAX_FILTER_SUMMARY_COUNT);
  if (language === 'vi') return summary;

  return summary.map((item) =>
    item
      .replace('Ngành nghề', 'Industry')
      .replace('Tổ chức phát hành', 'Issuer')
      .replace('Loại trái phiếu', 'Bond type')
      .replace('Kỳ hạn còn lại', 'Remaining term')
      .replace('Khối lượng niêm yết', 'Listed volume')
      .replace('Giá trị phát hành', 'Issued value')
      .replace('Giá trị niêm yết', 'Listed value')
      .replace('Kỳ hạn', 'Tenor')
      .replace('Lãi suất', 'Coupon rate')
      .replace('Ngày phát hành', 'Issue date')
      .replace('Ngày đáo hạn', 'Maturity date')
      .replace('Loại lãi suất cố định', 'Fixed coupon')
      .replace('Loại lãi suất thả nổi', 'Floating coupon')
      .replace('Sắp xếp theo tên tổ chức phát hành', 'Sort by issuer name')
      .replace('Sắp xếp theo mã trái phiếu', 'Sort by bond code')
      .replace('Sắp xếp theo tổng khối lượng phát hành giảm dần', 'Sort by total issued volume descending')
      .replace('Sắp xếp theo tổng giá trị phát hành giảm dần', 'Sort by total issued value descending')
      .replace('Sắp xếp theo thời gian đáo hạn gần nhất', 'Sort by nearest maturity date')
      .replace('Sắp xếp theo thời gian phát hành mới nhất', 'Sort by newest issue date')
      .replace('Sắp xếp theo lãi suất danh nghĩa giảm dần', 'Sort by coupon rate descending')
      .replace('Sắp xếp theo khối lượng niêm yết giảm dần', 'Sort by listed volume descending')
      .replace('Sắp xếp theo giá trị niêm yết giảm dần', 'Sort by listed value descending')
      .replace('Ưu tiên tiếp theo', 'Secondary priority')
      .replace('tỷ VND', 'Billion VND')
      .replace('tháng trở lên', 'months and above')
      .replace('ngày trở lên', 'days and above')
      .replace('tháng', 'months')
      .replace('ngày', 'days')
      .replace(' trở lên', ' and above')
      .replace(' đến ', ' to ')
      .replace(' từ ', ' from '),
  );
}

export function getAIBondSortByLabel(sortBy?: AIBondSortBy, language: 'vi' | 'en' = 'vi') {
  if (sortBy === undefined) return '';

  const viLabels: Record<AIBondSortBy, string> = {
    0: 'Sắp xếp theo tên tổ chức phát hành',
    1: 'Sắp xếp theo mã trái phiếu',
    2: 'Sắp xếp theo tổng khối lượng phát hành giảm dần',
    3: 'Sắp xếp theo tổng giá trị phát hành giảm dần',
    4: 'Sắp xếp theo thời gian đáo hạn gần nhất',
    5: 'Sắp xếp theo thời gian phát hành mới nhất',
    6: 'Sắp xếp theo lãi suất danh nghĩa giảm dần',
    7: 'Sắp xếp theo khối lượng niêm yết giảm dần',
    8: 'Sắp xếp theo giá trị niêm yết giảm dần',
  };

  const enLabels: Record<AIBondSortBy, string> = {
    0: 'Sort by issuer name',
    1: 'Sort by bond code',
    2: 'Sort by total issued volume descending',
    3: 'Sort by total issued value descending',
    4: 'Sort by nearest maturity date',
    5: 'Sort by newest issue date',
    6: 'Sort by coupon rate descending',
    7: 'Sort by listed volume descending',
    8: 'Sort by listed value descending',
  };

  return language === 'en' ? enLabels[sortBy] : viLabels[sortBy];
}

export function getNormalizedBondRateTypeFromRow(row: BondDataRow): AIBondRateType | undefined {
  return normalizeAIBondRateType(
    normalizeInterestType(
      row.bondRateType,
      row.raw?.interestPaymentMethod || row.raw?.paymentMethod || row.raw?.bondType || row.raw?.bondName || '',
      Array.isArray(row.raw?.cashFlows) ? row.raw.cashFlows : [],
    ) || row.bondRateType || '',
  );
}

function parseComparableDate(value?: string) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

// Remaining days until maturity. Prefers a precomputed `daysLeft` (the maturity list view attaches
// one) and otherwise derives it live from `maturityDate`. Deriving it here is what makes the
// remaining-term criterion work on the market-bond list and in chat: those rows carry no daysLeft,
// so the criterion used to be silently skipped and never narrowed anything.
function resolveRemainingDays(row: BondDataRow): number | undefined {
  const provided = Number((row as any).daysLeft);
  if (Number.isFinite(provided)) return provided;

  const maturity = parseComparableDate(row.maturityDate);
  if (maturity === undefined) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((maturity - today.getTime()) / (1000 * 60 * 60 * 24));
}

function matchesMinMaxNumber(value: number, min?: number, max?: number) {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function matchesDateRange(value: string, min?: string, max?: string) {
  if (!min && !max) return true;

  const candidate = parseComparableDate(value);
  if (candidate === undefined) return false;

  const minTime = parseComparableDate(min);
  const maxTime = parseComparableDate(max);

  if (minTime !== undefined && candidate < minTime) return false;
  if (maxTime !== undefined && candidate > maxTime) return false;
  return true;
}

function matchesTextCriteria(value: string, expected?: string) {
  const candidate = normalizeLabelKey(value);
  const normalizedExpected = normalizeLabelKey(expected || '');
  if (!normalizedExpected) return true;
  if (!candidate) return false;
  return candidate === normalizedExpected || candidate.includes(normalizedExpected);
}

// Issuer matching is deliberately lenient so a question like "Danh sách mã trái phiếu ACB" resolves
// even when the extracted issuer is a TICKER rather than the stored full name. It matches against the
// issuer name, the issuer symbol, AND the bond code — Vietnamese bond codes start with the issuer's
// ticker (e.g. ACB12203, TCB12102), so the ticker is found there even when `issuerSymbol` is blank.
// It also accepts a token-subset match so a name given in a slightly different word order still hits.
function matchesIssuerCriteria(row: BondDataRow, expected?: string) {
  const normalizedExpected = normalizeLabelKey(expected || '');
  if (!normalizedExpected) return true;

  const haystack = normalizeLabelKey(
    `${row.issuerName || ''} ${row.issuerSymbol || ''} ${row.bondCode || ''}`,
  );
  if (!haystack) return false;
  if (haystack.includes(normalizedExpected)) return true;

  const tokens = normalizedExpected.split(' ').filter((token) => token.length >= 2);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function filterBondRowsByCriteria(rows: BondDataRow[], criteria: AIBondFilterCriteria) {
  return rows.filter((row) => {
    if (!matchesTextCriteria(row.industry || '', criteria.industry)) {
      return false;
    }

    if (!matchesIssuerCriteria(row, criteria.issuer)) {
      return false;
    }

    if (!matchesTextCriteria(row.bondType || '', criteria.bondType)) {
      return false;
    }

    if (criteria.remainingDaysMin !== undefined || criteria.remainingDaysMax !== undefined) {
      const daysLeft = resolveRemainingDays(row);
      if (daysLeft !== undefined && !matchesMinMaxNumber(daysLeft, criteria.remainingDaysMin, criteria.remainingDaysMax)) {
        return false;
      }
    }

    if (!matchesMinMaxNumber(Number(row.tenorPeriod || 0), criteria.minTenorMonths, criteria.maxTenorMonths)) {
      return false;
    }

    if (!matchesDateRange(row.issueDate, criteria.issueDateFrom, criteria.issueDateTo)) {
      return false;
    }

    if (!matchesDateRange(row.maturityDate, criteria.maturityDateFrom, criteria.maturityDateTo)) {
      return false;
    }

    if (!matchesMinMaxNumber(Number(row.bondRate || 0), criteria.minBondRate, criteria.maxBondRate)) {
      return false;
    }

    if (criteria.bondRateType && getNormalizedBondRateTypeFromRow(row) !== criteria.bondRateType) {
      return false;
    }

    if (!matchesMinMaxNumber(Number(row.currentListedVolume || 0), criteria.minListedVolume, criteria.maxListedVolume)) {
      return false;
    }

    if (!matchesMinMaxNumber(Number(row.totalIssuedValue || 0) / 1000000000, criteria.minIssuedValueBillion, criteria.maxIssuedValueBillion)) {
      return false;
    }

    if (!matchesMinMaxNumber(Number(row.currentListedValue || 0) / 1000000000, criteria.minListedValueBillion, criteria.maxListedValueBillion)) {
      return false;
    }

    return true;
  });
}

function compareBondRowsBySort(left: BondDataRow, right: BondDataRow, sortBy: AIBondSortBy) {
  switch (sortBy) {
    case 0:
      return String(left.issuerName || left.issuerSymbol || '').localeCompare(String(right.issuerName || right.issuerSymbol || ''));
    case 1:
      return String(left.bondCode || '').localeCompare(String(right.bondCode || ''));
    case 2:
      return Number(right.raw?.totalIssuedVolume || right.raw?.TotalIssuedVolume || right.currentListedVolume || 0)
        - Number(left.raw?.totalIssuedVolume || left.raw?.TotalIssuedVolume || left.currentListedVolume || 0);
    case 3:
      return Number(right.totalIssuedValue || 0) - Number(left.totalIssuedValue || 0);
    case 4: {
      const leftTime = Date.parse(left.maturityDate || '');
      const rightTime = Date.parse(right.maturityDate || '');
      const safeLeft = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
      const safeRight = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
      return safeLeft - safeRight;
    }
    case 5: {
      const leftTime = Date.parse(left.issueDate || '');
      const rightTime = Date.parse(right.issueDate || '');
      const safeLeft = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime;
      const safeRight = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime;
      return safeRight - safeLeft;
    }
    case 6:
      return Number(right.bondRate || 0) - Number(left.bondRate || 0);
    case 7:
      return Number(right.currentListedVolume || 0) - Number(left.currentListedVolume || 0);
    case 8:
      return Number(right.currentListedValue || 0) - Number(left.currentListedValue || 0);
    default:
      return 0;
  }
}

export function sortBondRowsByCriteria(rows: BondDataRow[], criteria: AIBondFilterCriteria) {
  const sortSequence = getAIBondSortSequence(criteria);
  if (sortSequence.length === 0) return rows;

  return [...rows].sort((left, right) => {
    for (const sortBy of sortSequence) {
      const result = compareBondRowsBySort(left, right, sortBy);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export function hasAIBondFilterCriteria(criteria: AIBondFilterCriteria) {
  return Boolean(
    criteria.industry
    || criteria.issuer
    || criteria.bondType
    || criteria.remainingDaysMin !== undefined
    || criteria.remainingDaysMax !== undefined
    || criteria.minTenorMonths !== undefined
    || criteria.maxTenorMonths !== undefined
    || criteria.issueDateFrom
    || criteria.issueDateTo
    || criteria.maturityDateFrom
    || criteria.maturityDateTo
    || criteria.minBondRate !== undefined
    || criteria.maxBondRate !== undefined
    || criteria.bondRateType
    || criteria.minListedVolume !== undefined
    || criteria.maxListedVolume !== undefined
    || criteria.minIssuedValueBillion !== undefined
    || criteria.maxIssuedValueBillion !== undefined
    || criteria.minListedValueBillion !== undefined
    || criteria.maxListedValueBillion !== undefined
    || criteria.sortBy !== undefined
    || (Array.isArray(criteria.secondarySorts) && criteria.secondarySorts.length > 0)
  );
}

// Whether a bond-filter request is worth answering with the chat's filtered-list template. It must
// either NARROW the universe (any real constraint) or RANK it meaningfully (a non-default sort or
// secondary sorts). Sorting by the default bond-code (1) / issuer-name (0) order with no constraint
// would just dump the entire listed-bond list (~1000+ rows) — never a useful reply to a typed
// question — so those cases fall through to grounded Q&A instead of the list template.
export function hasActionableBondFilter(criteria: AIBondFilterCriteria) {
  const hasConstraint = Boolean(
    criteria.industry
    || criteria.issuer
    || criteria.bondType
    || criteria.remainingDaysMin !== undefined
    || criteria.remainingDaysMax !== undefined
    || criteria.minTenorMonths !== undefined
    || criteria.maxTenorMonths !== undefined
    || criteria.issueDateFrom
    || criteria.issueDateTo
    || criteria.maturityDateFrom
    || criteria.maturityDateTo
    || criteria.minBondRate !== undefined
    || criteria.maxBondRate !== undefined
    || criteria.bondRateType
    || criteria.minListedVolume !== undefined
    || criteria.maxListedVolume !== undefined
    || criteria.minIssuedValueBillion !== undefined
    || criteria.maxIssuedValueBillion !== undefined
    || criteria.minListedValueBillion !== undefined
    || criteria.maxListedValueBillion !== undefined,
  );
  if (hasConstraint) return true;

  // sortBy 0 = issuer name, 1 = bond code (neutral default orders); 2-8 rank by volume/value/rate/
  // maturity/issue date (a meaningful "top/nearest/newest" ranking that stands on its own).
  const hasRankingSort = criteria.sortBy !== undefined && criteria.sortBy !== 0 && criteria.sortBy !== 1;
  const hasSecondarySorts = Array.isArray(criteria.secondarySorts) && criteria.secondarySorts.length > 0;
  return hasRankingSort || hasSecondarySorts;
}

export function buildBondFilterResultPreview(rows: BondDataRow[], limit = 5) {
  return rows.slice(0, limit).map((row) => ({
    bondCode: row.bondCode,
    issuerName: row.issuerName || row.issuerSymbol,
    bondRate: row.bondRate,
    tenorPeriod: row.tenorPeriod,
    maturityDate: row.maturityDate,
    issuedValueBillion: Number(((Number(row.totalIssuedValue) || 0) / 1_000_000_000).toFixed(2)),
  }));
}

export function getBondFilterPresetSignature(criteria: AIBondFilterCriteria) {
  return JSON.stringify(pruneEmptyValues(criteria as Record<string, unknown>));
}

export function getTodayIsoForBondFilter() {
  return getTodayIso();
}
