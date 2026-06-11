import { sendChat } from '../api/ai';
import type { BondDataRow, BondFilterQuery } from './bondData';
import { formatDate, formatInterestRate, formatNumber, normalizeInterestType } from '../utils/format';

const TODAY_ISO = '2026-06-11';
const FALLBACK_MODEL = 'gpt-5.4-mini';
const MAX_FILTER_SUMMARY_COUNT = 3;

export type AIBondRateType = 'fixed' | 'floating';
export type AIBondSortBy = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface AIBondFilterCriteria {
  minTenorMonths?: number;
  maxTenorMonths?: number;
  issueDateFrom?: string;
  issueDateTo?: string;
  maturityDateFrom?: string;
  maturityDateTo?: string;
  minBondRate?: number;
  maxBondRate?: number;
  bondRateType?: AIBondRateType;
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

const normalizeSearchText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text: string, patterns: string[]) => patterns.some((pattern) => text.includes(pattern));
const normalizeLabelKey = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripMarkdownCodeFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
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

  if (text.includes('co dinh') || text.includes('fixed')) return 'fixed';
  if (text.includes('tha noi') || text.includes('floating') || text.includes('variable')) return 'floating';
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

function inferHeuristicBondFilterCriteria(message: string): AIBondFilterCriteria {
  const text = normalizeSearchText(message);
  if (!text) return {};

  const sortPreferences = inferAIBondSortPreferences(message);
  const fallbackPrimarySort = inferAIBondSortByFromText(text);

  return pruneEmptyValues({
    bondRateType: normalizeAIBondRateType(text),
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
    minTenorMonths,
    maxTenorMonths,
    issueDateFrom,
    issueDateTo,
    maturityDateFrom,
    maturityDateTo,
    minBondRate,
    maxBondRate,
    bondRateType: normalizeAIBondRateType(source.bondRateType),
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
  const hasFieldKeyword = /(ky han|tenor|dao han|maturity|phat hanh|issue|lai suat|bond rate|ma trai phieu|bond code|khoi luong phat hanh|gia tri phat hanh|khoi luong niem yet|gia tri niem yet|listed volume|listed value|issued volume|issued value)/.test(text);
  const hasSortKeyword = /(sap xep|xep theo|giam dan|tang dan|cao nhat|thap nhat|gan nhat|moi nhat|top)/.test(text);
  const hasTypeKeyword = /(co dinh|fixed|tha noi|floating|variable)/.test(text);
  const hasRangeSignal = /(tu | den | duoi | tren | trong | khoang | sau | truoc | nho hon | lon hon | it nhat | toi da | toi thieu |\d{4}|\d+\s*%|\d+\s*thang)/.test(text);
  const isRankingQuestion = /(top|cao nhat|thap nhat|lon nhat|nho nhat|gan nhat|moi nhat)/.test(text);

  if (isRankingQuestion && !hasFilterVerb && !hasFieldKeyword) return false;
  if (hasSortKeyword && hasFieldKeyword) return true;
  if (hasFilterVerb && (hasFieldKeyword || hasTypeKeyword)) return true;
  if (hasTypeKeyword) return true;
  return hasFieldKeyword && hasRangeSignal;
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
        'Ngay hien tai la 2026-06-11. Neu nguoi dung noi hom nay, thang nay, quy nay, nam nay, 12 thang toi, 6 thang toi... thi phai quy doi ra ngay thang cu the.',
        'Chi ho tro cac truong: minTenorMonths, maxTenorMonths, issueDateFrom, issueDateTo, maturityDateFrom, maturityDateTo, minBondRate, maxBondRate, bondRateType, sortBy, secondarySorts.',
        'bondRateType chi nhan mot trong hai gia tri: "fixed" hoac "floating".',
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
        'summary la danh sach mo ta ngan gon bang tieng Viet. Neu yeu cau khong phai loc trai phieu thi tra ve {"isFilterRequest": false, "criteria": {}, "summary": []}.',
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
      .replace('Kỳ hạn', 'Tenor')
      .replace('tháng trở lên', 'months and above')
      .replace('tháng', 'months')
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
      .replace('Ưu tiên tiếp theo', 'Secondary priority'),
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

export function filterBondRowsByCriteria(rows: BondDataRow[], criteria: AIBondFilterCriteria) {
  if (!criteria.bondRateType) return rows;

  return rows.filter((row) => getNormalizedBondRateTypeFromRow(row) === criteria.bondRateType);
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
  return Object.keys(criteria).length > 0;
}

export function buildBondFilterResultPreview(rows: BondDataRow[], limit = 5) {
  return rows.slice(0, limit).map((row) => ({
    bondCode: row.bondCode,
    issuerName: row.issuerName || row.issuerSymbol,
    bondRate: row.bondRate,
    tenorPeriod: row.tenorPeriod,
    maturityDate: row.maturityDate,
  }));
}

export function getBondFilterPresetSignature(criteria: AIBondFilterCriteria) {
  return JSON.stringify(pruneEmptyValues(criteria as Record<string, unknown>));
}

export function getTodayIsoForBondFilter() {
  return TODAY_ISO;
}
