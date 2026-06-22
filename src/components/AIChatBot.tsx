import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Bot, Lightbulb, Loader2, MessageSquare, Send, SlidersHorizontal, User, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '../LanguageContext';
import { streamChat } from '../api/ai';
import {
  buildBondFilterQueryFromCriteria,
  buildBondFilterResultPreview,
  extractBondFilterCriteria,
  filterBondRowsByCriteria,
  getAIBondSortByLabel,
  hasAIBondFilterCriteria,
  isBondFilterIntent,
  sortBondRowsByCriteria,
  summarizeBondFilterCriteria,
  type AIBondFilterCriteria,
} from '../services/aiBondFilter';
import { loadBondFilterRows, type BondDataRow } from '../services/bondData';
import { useAIStore } from '../store/aiStore';
import { formatDate, formatInterestRate, formatNumber } from '../utils/format';
import { getWatchlistItems, onWatchlistUpdated } from '../utils/watchlist';
import { cleanTokenString, getFireantToken, getFireantTokenDebugInfo } from '../utils/token';
import { safeSetLocalStorageItem } from '../utils/localStorageBudget';
import { getBondChatContext, subscribeBondChatContext } from '../utils/bondDetailChatContext';
import { getViewChatContext, subscribeViewChatContext } from '../utils/viewChatContext';

interface MessageAction {
  type: 'navigate';
  label: string;
  to: string;
  state?: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  action?: MessageAction;
}

interface PageContextSnapshot {
  pathname: string;
  label: string;
  text: string;
  error: string | null;
  fetchedAt: number;
}

interface PageDataRequestConfig {
  label: string;
  url?: string;
  init?: RequestInit;
  fallback?: Record<string, unknown>;
}

interface PageDatasetSummary {
  label: string;
  data: Record<string, unknown>;
}

const BILLION = 1_000_000_000;
const CHAT_HISTORY_KEY = 'sentinel_chat_history';
const CLIENT_FALLBACK_AI_MODEL = 'gpt-5.4-mini';
const CHAT_FILTER_FETCH_LIMIT = 1500;
const MAX_CARD_COUNT = 6;
const MAX_ROW_COUNT = 10;
const MAX_SUGGESTION_COUNT = 3;

const PAGE_DATA_API_CATALOG = [
  {
    view: 'market-overview',
    useWhen: 'tong quan thi truong, top to chuc phat hanh, top lai suat, gia tri/khoi luong theo nganh',
    endpoint: '/api/page-data?view=market-overview',
    mainFields: ['cards', 'topIssuers', 'topInterestBonds', 'valueByIndustry', 'volumeByIndustry'],
  },
  {
    view: 'industry',
    useWhen: 'phan tich mot nganh nhu ngan hang, chung khoan, bat dong san, tai chinh khac',
    endpoint: '/api/page-data?view=industry&industryId={industryId}',
    mainFields: ['cards', 'debtRanking', 'issuedValueLeaders', 'interestRates'],
  },
  {
    view: 'issuer',
    useWhen: 'phan tich mot to chuc phat hanh theo ma chung khoan',
    endpoint: '/api/page-data?view=issuer&symbol={symbol}',
    mainFields: ['profile', 'cards', 'bonds', 'termDistribution', 'interestTypeDistribution'],
  },
  {
    view: 'maturity',
    useWhen: 'trai phieu sap dao han, ap luc dao han, lich dao han theo thang/to chuc',
    endpoint: '/api/page-data?view=maturity&days={days}',
    mainFields: ['cards', 'bonds', 'byWarningStatus', 'byIssuer', 'byMaturityMonth'],
  },
  {
    view: 'watchlist',
    useWhen: 'danh muc theo doi cua nguoi dung',
    endpoint: '/api/page-data?view=watchlist',
    mainFields: ['cards', 'items', 'termDistribution', 'interestTypeDistribution'],
  },
];

const INDUSTRY_INTENTS = [
  { id: 'Banking', patterns: ['banking', 'ngan hang', 'ngân hàng', 'bank'] },
  { id: 'Securities', patterns: ['securities', 'chung khoan', 'chứng khoán'] },
  { id: 'RealEstate', patterns: ['real estate', 'bat dong san', 'bất động sản'] },
  { id: 'Financials', patterns: ['financials', 'tai chinh', 'tài chính'] },
  { id: 'Industrials', patterns: ['industrials', 'cong nghiep', 'công nghiệp'] },
  { id: 'ConsumerDiscretionary', patterns: ['tieu dung khong thiet yeu', 'tiêu dùng không thiết yếu'] },
  { id: 'ConsumerStaples', patterns: ['tieu dung co ban', 'tiêu dùng cơ bản'] },
  { id: 'BasicMaterials', patterns: ['vat lieu co ban', 'vật liệu cơ bản'] },
  { id: 'Energy', patterns: ['energy', 'nang luong', 'năng lượng'] },
  { id: 'InfrastructureServices', patterns: ['ha tang', 'hạ tầng'] },
  { id: 'Technology', patterns: ['technology', 'cong nghe', 'công nghệ'] },
];

let fireantTokenDebugLogged = false;

function safeReadLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage`, error);
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string) {
  safeSetLocalStorageItem(key, value, {
    maxLength: 240_000,
    preserveKeys: [CHAT_HISTORY_KEY],
    warnLabel: key,
  });
}

function buildPageDataHeaders() {
  const token = getFireantToken();
  return token ? { 'X-Fireant-Access-Token': cleanTokenString(token) } : {};
}

function logFireantTokenDebug() {
  if (!import.meta.env.DEV || fireantTokenDebugLogged) return;
  fireantTokenDebugLogged = true;
  console.log('[FireAnt token debug]', getFireantTokenDebugInfo());
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeDate(value: unknown): string {
  return normalizeText(value).split('T')[0];
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRoundedNumber(value: unknown, digits = 2): number {
  const numericValue = toNumber(value);
  const factor = 10 ** digits;
  return Math.round(numericValue * factor) / factor;
}

function toBillion(value: unknown): number {
  return toRoundedNumber(toNumber(value) / BILLION);
}

function getRows(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];

  const nested = value.rows;
  return Array.isArray(nested) ? nested.filter(isObject) : [];
}

function getChartRows(payload: unknown, chartKey: string): Record<string, any>[] {
  if (!isObject(payload) || !isObject(payload.charts)) return [];
  return getRows(payload.charts[chartKey]);
}

function takeTopRows(rows: Record<string, any>[], metricKey: string, limit = MAX_ROW_COUNT) {
  return [...rows]
    .sort((left, right) => toNumber(right[metricKey]) - toNumber(left[metricKey]))
    .slice(0, limit);
}

function takeEarliestRows(rows: Record<string, any>[], dateKey: string, limit = MAX_ROW_COUNT) {
  return [...rows]
    .sort((left, right) => {
      const leftTime = Date.parse(normalizeDate(left[dateKey]));
      const rightTime = Date.parse(normalizeDate(right[dateKey]));
      const safeLeft = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
      const safeRight = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
      return safeLeft - safeRight;
    })
    .slice(0, limit);
}

function mapCards(cards: unknown) {
  return getRows(cards).slice(0, MAX_CARD_COUNT).map((card) => {
    const label = normalizeText(card.label || card.key);
    const hasBillionValue = Number.isFinite(Number(card.valueBillionVnd));
    return {
      key: normalizeText(card.key || label),
      label,
      value: hasBillionValue ? toRoundedNumber(card.valueBillionVnd) : toRoundedNumber(card.value),
      unit: hasBillionValue ? 'ty VND' : normalizeText(card.unit),
    };
  });
}

function summarizeProfile(profile: unknown) {
  if (!isObject(profile)) return undefined;

  const summary = {
    symbol: normalizeText(profile.symbol || profile.ticker || profile.code),
    name: normalizeText(profile.name || profile.internationalName || profile.shortName),
    exchange: normalizeText(profile.exchange || profile.market || profile.comGroupCode),
    industry: normalizeText(
      profile.industryName ||
        profile.icbName ||
        profile.icbNameLv2 ||
        profile.icbNameLv1,
    ),
  };

  return Object.values(summary).some(Boolean) ? summary : undefined;
}

function buildMarketOverviewSummary(pathname: string, payload: Record<string, any>) {
  const topIssuers = takeTopRows(getChartRows(payload, 'topIssuers'), 'totalRemainingDebt').map((row) => ({
    issuerSymbol: normalizeText(row.issuerSymbol),
    issuerName: normalizeText(row.issuerName),
    totalRemainingDebtBillion: toBillion(row.totalRemainingDebt),
    totalIssuedValueBillion: toBillion(row.totalIssuedValue),
  }));

  const topInterestBonds = takeTopRows(getChartRows(payload, 'topInterestBonds'), 'bondRate').map((row) => ({
    bondCode: normalizeText(row.bondCode || row.code),
    issuerSymbol: normalizeText(row.issuerSymbol),
    bondRate: toRoundedNumber(row.bondRate),
  }));

  const valueByIndustry = takeTopRows(getChartRows(payload, 'valueByIndustry'), 'totalIssuedValue').map((row) => ({
    icbName: normalizeText(row.icbName),
    totalIssuedValueBillion: toRoundedNumber(row.totalIssuedValueBillion || toBillion(row.totalIssuedValue)),
    totalCurrentListedValueBillion: toRoundedNumber(
      row.totalCurrentListedValueBillion || toBillion(row.totalCurrentListedValue),
    ),
  }));

  const volumeByIndustry = takeTopRows(getChartRows(payload, 'volumeByIndustry'), 'totalIssuedVolume').map((row) => ({
    icbName: normalizeText(row.icbName),
    totalIssuedVolume: toRoundedNumber(row.totalIssuedVolume),
    totalCurrentListedVolume: toRoundedNumber(row.totalCurrentListedVolume),
  }));

  return {
    route: pathname,
    page: payload.page || 'market-overview',
    cards: mapCards(payload.cards),
    topIssuers,
    topInterestBonds,
    valueByIndustry,
    volumeByIndustry,
  };
}

function buildIndustrySummary(pathname: string, payload: Record<string, any>) {
  const debtRanking = takeTopRows(getChartRows(payload, 'debtRanking'), 'totalRemainingDebt').map((row) => ({
    issuerSymbol: normalizeText(row.issuerSymbol),
    issuerName: normalizeText(row.issuerName),
    totalRemainingDebtBillion: toBillion(row.totalRemainingDebt),
  }));

  const issuedValueLeaders = takeTopRows(getChartRows(payload, 'issuedValueTreemap'), 'value').map((row) => ({
    issuerSymbol: normalizeText(row.issuerSymbol),
    issuerName: normalizeText(row.issuerName),
    totalIssuedValueBillion: toRoundedNumber(row.valueBillionVnd || toBillion(row.value)),
  }));

  const interestRates = getChartRows(payload, 'interestRates').map((row) => ({
    metric: normalizeText(row.name),
    value: toRoundedNumber(row.value),
  }));

  return {
    route: pathname,
    page: payload.page || 'industry',
    params: isObject(payload.params)
      ? {
          industryId: normalizeText(payload.params.industryId),
          icbCode: normalizeText(payload.params.icbCode),
        }
      : undefined,
    cards: mapCards(payload.cards),
    debtRanking,
    issuedValueLeaders,
    interestRates,
  };
}

function buildIssuerSummary(pathname: string, payload: Record<string, any>) {
  const bonds = takeEarliestRows(getRows(payload.bonds), 'maturityDate').map((bond) => ({
    bondCode: normalizeText(bond.bondCode || bond.code),
    issuerSymbol: normalizeText(bond.issuerSymbol),
    maturityDate: normalizeDate(bond.maturityDate),
    bondRate: toRoundedNumber(bond.bondRate),
    currentListedValueBillion: toBillion(bond.currentListedValue),
    totalRemainingDebtBillion: toBillion(bond.totalRemainingDebt),
  }));

  const termDistribution = takeTopRows(getChartRows(payload, 'termDistribution'), 'value').map((row) => ({
    term: normalizeText(row.name),
    count: toRoundedNumber(row.value),
  }));

  const interestTypeDistribution = takeTopRows(getChartRows(payload, 'interestTypeDistribution'), 'value').map((row) => ({
    type: normalizeText(row.name),
    count: toRoundedNumber(row.value),
  }));

  return {
    route: pathname,
    page: payload.page || 'issuer',
    params: isObject(payload.params)
      ? { symbol: normalizeText(payload.params.symbol) }
      : undefined,
    profile: summarizeProfile(payload.profile),
    cards: mapCards(payload.cards),
    bonds,
    termDistribution,
    interestTypeDistribution,
  };
}

function buildWatchlistSummary(pathname: string, payload: Record<string, any>) {
  const items = takeEarliestRows(getRows(payload.items), 'maturityDate').map((bond) => ({
    bondCode: normalizeText(bond.bondCode || bond.code),
    issuerSymbol: normalizeText(bond.issuerSymbol),
    maturityDate: normalizeDate(bond.maturityDate),
    bondRate: toRoundedNumber(bond.bondRate),
    currentListedValueBillion: toBillion(bond.currentListedValue),
  }));

  return {
    route: pathname,
    page: payload.page || 'watchlist',
    cards: mapCards(payload.cards),
    items,
    termDistribution: takeTopRows(getChartRows(payload, 'termDistribution'), 'value').map((row) => ({
      term: normalizeText(row.name),
      count: toRoundedNumber(row.value),
    })),
    interestTypeDistribution: takeTopRows(getChartRows(payload, 'interestTypeDistribution'), 'value').map((row) => ({
      type: normalizeText(row.name),
      count: toRoundedNumber(row.value),
    })),
    note: normalizeText(payload.note),
  };
}

function buildMaturitySummary(pathname: string, payload: Record<string, any>) {
  const bonds = takeEarliestRows(getRows(payload.bonds), 'maturityDate').map((bond) => ({
    bondCode: normalizeText(bond.bondCode || bond.code),
    issuerSymbol: normalizeText(bond.issuerSymbol),
    maturityDate: normalizeDate(bond.maturityDate),
    daysLeft: toRoundedNumber(bond.daysLeft),
    bondRate: toRoundedNumber(bond.bondRate),
    currentListedValueBillion: toBillion(bond.currentListedValue),
  }));

  return {
    route: pathname,
    page: payload.page || 'maturity',
    params: isObject(payload.params)
      ? { days: toRoundedNumber(payload.params.days) }
      : undefined,
    cards: mapCards(payload.cards),
    bonds,
    byWarningStatus: takeTopRows(getChartRows(payload, 'byWarningStatus'), 'value').map((row) => ({
      status: normalizeText(row.name),
      count: toRoundedNumber(row.value),
    })),
    byIssuer: takeTopRows(getChartRows(payload, 'byIssuer'), 'value').map((row) => ({
      issuerSymbol: normalizeText(row.name),
      count: toRoundedNumber(row.value),
    })),
    byMaturityMonth: takeTopRows(getChartRows(payload, 'byMaturityMonth'), 'value').map((row) => ({
      month: normalizeText(row.name),
      count: toRoundedNumber(row.value),
    })),
  };
}

function summarizePageData(pathname: string, payload: unknown): Record<string, unknown> {
  if (!isObject(payload)) {
    return {
      route: pathname,
      page: 'unknown',
      note: 'page-data response is empty',
    };
  }

  if (payload.page === 'market-overview') return buildMarketOverviewSummary(pathname, payload);
  if (payload.page === 'industry') return buildIndustrySummary(pathname, payload);
  if (payload.page === 'issuer') return buildIssuerSummary(pathname, payload);
  if (payload.page === 'watchlist') return buildWatchlistSummary(pathname, payload);
  if (payload.page === 'maturity') return buildMaturitySummary(pathname, payload);

  return {
    route: pathname,
    page: normalizeText(payload.page || 'unknown'),
    note: normalizeText(payload.error || payload.message || 'Unsupported page-data payload'),
  };
}

function isBondRoute(pathname: string) {
  const segment = pathname.split('/').filter(Boolean)[0] || '';
  return segment.length >= 6 && !['industry', 'enterprise', 'filter', 'maturity', 'news', 'watchlist', 'profile', 'help'].includes(segment.toLowerCase());
}

function getActiveBondContext(pathname: string) {
  if (!isBondRoute(pathname)) return null;

  const activeContext = getBondChatContext();
  if (!activeContext) return null;

  const normalizedPathname = normalizeText(pathname);
  const contextPath = normalizeText(activeContext.routePathname || `/${activeContext.bondCode}`);

  if (contextPath && normalizedPathname && contextPath !== normalizedPathname) {
    return null;
  }

  return activeContext;
}

function getActiveViewContext(pathname: string) {
  return getViewChatContext(pathname);
}

function getFilterRouteState(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'filter') return null;

  return {
    subTab: parts[1] === 'bonds' ? 'bonds' : 'issuer',
    ticker: parts[1] === 'issuer' && parts[2] ? parts[2].toUpperCase() : '',
  };
}

function getPageLabel(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 0) return 'Tổng quan thị trường';
  if (isBondRoute(pathname)) {
    return getActiveBondContext(pathname)?.label || 'Chi tiết trái phiếu';
  }
  if (parts[0] === 'industry') return `Nhóm ngành ${getIndustryDisplayLabel(parts[1] || 'Banking')}`;
  if (parts[0] === 'enterprise' && parts[1]) return `Tổ chức phát hành ${parts[1].toUpperCase()}`;
  if (parts[0] === 'enterprise') return 'Danh sách tổ chức phát hành';
  if (parts[0] === 'watchlist') return 'Danh mục theo dõi';
  if (parts[0] === 'maturity') return 'Danh sách đáo hạn';
  if (parts[0] === 'news') return 'Tin tức';

  return 'Tổng quan thị trường';
}

function resolvePageLabel(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const activeBondContext = getActiveBondContext(pathname);
  const activeViewContext = getActiveViewContext(pathname);
  const filterRouteState = getFilterRouteState(pathname);

  if (activeBondContext?.kind === 'bond-comparison') return activeBondContext.label;
  if (parts.length === 0) return 'Tổng quan thị trường';
  if (isBondRoute(pathname)) {
    return activeBondContext?.label || 'Chi tiết trái phiếu';
  }
  if (parts[0] === 'industry') return `Nhóm ngành ${getIndustryDisplayLabel(parts[1] || 'Banking')}`;
  if (parts[0] === 'enterprise' && parts[1]) return `Tổ chức phát hành ${parts[1].toUpperCase()}`;
  if (parts[0] === 'enterprise') return 'Tổ chức phát hành';
  if (filterRouteState?.subTab === 'issuer' && filterRouteState.ticker) {
    return activeViewContext?.label || `Tổ chức phát hành ${filterRouteState.ticker}`;
  }
  if (filterRouteState?.subTab === 'issuer') {
    return activeViewContext?.label || 'Tổ chức phát hành';
  }
  if (filterRouteState?.subTab === 'bonds') {
    return activeViewContext?.label || 'Danh sách trái phiếu toàn thị trường';
  }
  if (parts[0] === 'watchlist') return 'Danh mục theo dõi';
  if (parts[0] === 'maturity') return 'Danh sách đáo hạn';
  if (parts[0] === 'news') return 'Tin tức';

  return 'Tổng quan thị trường';
}

function buildPageDataRequest(pathname: string): PageDataRequestConfig {
  const parts = pathname.split('/').filter(Boolean);
  const filterRouteState = getFilterRouteState(pathname);
  const activeViewContext = getActiveViewContext(pathname);

  if (parts.length === 0) {
    return {
      label: resolvePageLabel(pathname),
      url: '/api/page-data?view=market-overview',
    };
  }

  if (isBondRoute(pathname)) {
    const bondContext = getActiveBondContext(pathname);

    return {
      label: resolvePageLabel(pathname),
      fallback: bondContext
        ? {
            ...bondContext.dataset,
            route: pathname,
            page: bondContext.kind,
            contextLabel: bondContext.label,
            updatedAt: bondContext.updatedAt,
          }
        : {
            route: pathname,
            page: 'bond-detail',
            bondCode: normalizeText(parts[0]).toUpperCase(),
            note: 'bond detail context is not active yet',
          },
    };
  }

  if (parts[0] === 'industry') {
    const industryId = encodeURIComponent(parts[1] || 'Banking');
    return {
      label: resolvePageLabel(pathname),
      url: `/api/page-data?view=industry&industryId=${industryId}&includeCashFlows=0&detailLimit=80`,
    };
  }

  if (parts[0] === 'enterprise' && parts[1]) {
    const symbol = encodeURIComponent(parts[1].toUpperCase());
    return {
      label: resolvePageLabel(pathname),
      url: `/api/page-data?view=issuer&symbol=${symbol}&detailLimit=60`,
    };
  }

  if (parts[0] === 'enterprise') {
    return {
      label: resolvePageLabel(pathname),
      url: '/api/page-data?view=market-overview',
    };
  }

  if (filterRouteState?.subTab === 'issuer' && activeViewContext) {
    return {
      label: resolvePageLabel(pathname),
      fallback: {
        ...activeViewContext.dataset,
        route: pathname,
        contextLabel: activeViewContext.label,
        updatedAt: activeViewContext.updatedAt,
      },
    };
  }

  if (filterRouteState?.subTab === 'issuer' && filterRouteState.ticker) {
    return {
      label: resolvePageLabel(pathname),
      url: `/api/page-data?view=issuer&symbol=${encodeURIComponent(filterRouteState.ticker)}&detailLimit=60`,
    };
  }

  if (filterRouteState?.subTab === 'issuer') {
    return {
      label: resolvePageLabel(pathname),
      fallback: {
        route: pathname,
        page: 'issuer-list',
        title: 'Tổ chức phát hành',
        note: 'issuer list context is not active yet',
      },
    };
  }

  if (filterRouteState?.subTab === 'bonds' && activeViewContext) {
    return {
      label: resolvePageLabel(pathname),
      fallback: {
        ...activeViewContext.dataset,
        route: pathname,
        contextLabel: activeViewContext.label,
        updatedAt: activeViewContext.updatedAt,
      },
    };
  }

  if (filterRouteState?.subTab === 'bonds') {
    return {
      label: resolvePageLabel(pathname),
      fallback: {
        route: pathname,
        page: 'market-bond-list',
        title: 'Danh sách trái phiếu toàn thị trường',
        note: 'market bond list context is not active yet',
      },
    };
  }

  if (parts[0] === 'watchlist') {
    const codes = getWatchlistItems()
      .map((item) => normalizeText(item.code).toUpperCase())
      .filter(Boolean);

    if (codes.length === 0) {
      return {
        label: resolvePageLabel(pathname),
        fallback: {
          route: pathname,
          page: 'watchlist',
          cards: [],
          items: [],
          watchlistCodes: [],
          note: 'watchlist is empty',
        },
      };
    }

    return {
      label: resolvePageLabel(pathname),
      url: '/api/page-data?view=watchlist',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ codes }),
      },
    };
  }

  if (parts[0] === 'maturity') {
    return {
      label: resolvePageLabel(pathname),
      url: '/api/page-data?view=maturity&days=365',
    };
  }

  if (parts[0] === 'news') {
    return {
      label: resolvePageLabel(pathname),
      fallback: {
        route: pathname,
        page: 'news',
        note: 'news page has no page-data payload, so chatbot only uses current dashboard context',
      },
    };
  }

  return {
    label: resolvePageLabel(pathname),
    url: '/api/page-data?view=market-overview',
  };
}

function getRequestSignature(requestConfig: PageDataRequestConfig) {
  return [
    requestConfig.url || '',
    requestConfig.init?.method || 'GET',
    typeof requestConfig.init?.body === 'string' ? requestConfig.init.body : '',
    requestConfig.fallback ? JSON.stringify(requestConfig.fallback) : '',
  ].join('|');
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

function sanitizeAssistantContent(content: string): string {
  if (!content.trim()) return content;

  return content
    .replace(/Theo dữ liệu([^:\n]*?)trong\s+`?PAGE_DATA`?\s*:?/gi, 'Theo dữ liệu$1:')
    .replace(/Theo du lieu([^:\n]*?)trong\s+`?PAGE_DATA`?\s*:?/gi, 'Theo dữ liệu$1:')
    .replace(/\s+trong\s+`?PAGE_DATA`?/gi, '')
    .replace(/\s+từ\s+`?PAGE_DATA`?/gi, '')
    .replace(/`?PAGE_DATA`?/gi, 'dữ liệu hiện tại')
    .replace(/`?apiCatalog`?/gi, 'nguồn dữ liệu tổng hợp')
    .replace(/`?datasets?`?/gi, 'dữ liệu')
    .replace(/\/api\/page-data[^\s)`]*/gi, 'nguồn dữ liệu hiện tại')
    .replace(/\bendpoint(s)?\b/gi, 'nguồn dữ liệu')
    .replace(/\bJSON\b/gi, 'dữ liệu')
    .replace(/\bfield(s)?\b/gi, 'chỉ tiêu')
    .replace(/\bfunction(s)?\b/gi, 'xử lý nội bộ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getIndustryLabel(industryId: string) {
  const labels: Record<string, string> = {
    Banking: 'ngân hàng',
    Securities: 'chứng khoán',
    RealEstate: 'bất động sản',
    Financials: 'tài chính',
    Industrials: 'công nghiệp',
    ConsumerDiscretionary: 'tiêu dùng không thiết yếu',
    ConsumerStaples: 'tiêu dùng cơ bản',
    BasicMaterials: 'vật liệu cơ bản',
    Energy: 'năng lượng',
    InfrastructureServices: 'hạ tầng',
    Technology: 'công nghệ',
  };

  return labels[industryId] || industryId;
}

function getCurrentSuggestedSymbol(pathname: string, recentUserMessage: string) {
  const parts = pathname.split('/').filter(Boolean);
  const activeBondContext = getActiveBondContext(pathname);
  const filterRouteState = getFilterRouteState(pathname);

  if (activeBondContext?.kind === 'bond-detail') {
    return activeBondContext.bondCode;
  }

  if (activeBondContext?.kind === 'bond-comparison') {
    return activeBondContext.bondCodes[0] || '';
  }

  return (
    filterRouteState?.ticker ||
    extractCandidateSymbols(recentUserMessage)[0] ||
    (parts[0] === 'enterprise' && parts[1] ? parts[1].toUpperCase() : '')
  );
}

function buildFollowUpSuggestions(pathname: string, messages: Message[], input: string) {
  const parts = pathname.split('/').filter(Boolean);
  const recentUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const activeBondContext = getActiveBondContext(pathname);
  const recentSymbol = getCurrentSuggestedSymbol(pathname, recentUserMessage);

  let suggestions: string[] = [];

  if (activeBondContext?.kind === 'bond-comparison') {
    const compareCodes = activeBondContext.bondCodes.slice(0, 4);
    suggestions = [
      `Tóm tắt nhanh nhóm trái phiếu đang so sánh: ${compareCodes.join(', ')}.`,
      `Mã nào đang có lãi suất nổi bật nhất trong nhóm so sánh này?`,
      `Mã nào đáo hạn sớm nhất và cần theo dõi nhiều nhất?`,
      `So sánh nhanh rủi ro, kỳ hạn và quy mô phát hành của các mã này.`,
    ];
  } else if (activeBondContext?.kind === 'bond-detail' && recentSymbol) {
    const issuerSymbol = activeBondContext.issuerSymbol || activeBondContext.issuerName;
    suggestions = [
      `Tóm tắt nhanh mã trái phiếu ${recentSymbol}.`,
      `Lãi suất, kỳ hạn và điểm cần theo dõi của ${recentSymbol} là gì?`,
      `Lịch thanh toán và áp lực đáo hạn của ${recentSymbol} hiện ra sao?`,
      issuerSymbol
        ? `Mã ${recentSymbol} phản ánh gì về tình hình trái phiếu của ${issuerSymbol}?`
        : `Rủi ro chính của mã ${recentSymbol} hiện nay là gì?`,
    ];
  } else if (parts[0] === 'enterprise' && recentSymbol) {
    suggestions = [
      `${recentSymbol} hiện có bao nhiêu mã trái phiếu đang lưu hành?`,
      `Cơ cấu kỳ hạn và lãi suất của ${recentSymbol} hiện như thế nào?`,
      `Áp lực đáo hạn của ${recentSymbol} trong 12 tháng tới ra sao?`,
      `Đánh giá nhanh rủi ro và điểm cần theo dõi của ${recentSymbol}.`,
    ];
  } else if (parts[0] === 'industry' && parts[1]) {
    const industryLabel = getIndustryLabel(parts[1]);
    suggestions = [
      `Top tổ chức phát hành trong nhóm ${industryLabel} là ai?`,
      `Quy mô dư nợ của nhóm ${industryLabel} đang tập trung vào đâu?`,
      `Lãi suất phát hành của nhóm ${industryLabel} có điểm gì đáng chú ý?`,
      `Rủi ro chính của nhóm ${industryLabel} hiện nay là gì?`,
    ];
  } else if (parts[0] === 'maturity') {
    suggestions = [
      'Có bao nhiêu mã trái phiếu sắp đáo hạn trong 12 tháng tới?',
      'Những tổ chức nào có áp lực đáo hạn lớn nhất?',
      'Các tháng nào tập trung nhiều trái phiếu đáo hạn nhất?',
      'Đánh giá nhanh rủi ro thanh toán từ dữ liệu đáo hạn hiện tại.',
    ];
  } else if (parts[0] === 'watchlist') {
    suggestions = [
      'Tóm tắt nhanh rủi ro của danh mục theo dõi hiện tại.',
      'Mã nào trong danh mục theo dõi đáo hạn sớm nhất?',
      'Cơ cấu kỳ hạn của danh mục theo dõi đang nghiêng về đâu?',
      'Lãi suất các trái phiếu trong danh mục theo dõi có gì nổi bật?',
    ];
  } else {
    suggestions = [
      'Có bao nhiêu mã trái phiếu trên thị trường hiện tại?',
      'Top tổ chức phát hành theo dư nợ hiện nay là ai?',
      'Ngành nào đang có khối lượng trái phiếu lớn nhất?',
      'Những mã có lãi suất cao nhất hiện nay là mã nào?',
    ];

    if (recentSymbol) {
      suggestions.unshift(`Phân tích nhanh tình hình trái phiếu của ${recentSymbol}.`);
    }
  }

  const excluded = new Set(
    [input, recentUserMessage]
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean),
  );

  return Array.from(new Set(suggestions))
    .filter((question) => !excluded.has(question.toLowerCase()))
    .slice(0, MAX_SUGGESTION_COUNT);
}

function getIndustryDisplayLabel(industryId: string) {
  const labels: Record<string, string> = {
    Banking: 'Ngân hàng',
    Securities: 'Chứng khoán',
    RealEstate: 'Bất động sản',
    Financials: 'Tài chính',
    Industrials: 'Công nghiệp',
    ConsumerDiscretionary: 'Tiêu dùng không thiết yếu',
    ConsumerStaples: 'Tiêu dùng cơ bản',
    BasicMaterials: 'Vật liệu cơ bản',
    Energy: 'Năng lượng',
    InfrastructureServices: 'Hạ tầng',
    Technology: 'Công nghệ',
  };

  return labels[industryId] || industryId;
}

function buildSuggestedQuestions(pathname: string, messages: Message[], input: string) {
  const parts = pathname.split('/').filter(Boolean);
  const recentUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const activeBondContext = getActiveBondContext(pathname);
  const recentSymbol = getCurrentSuggestedSymbol(pathname, recentUserMessage);

  let suggestions: string[] = [];

  if (activeBondContext?.kind === 'bond-comparison') {
    const compareCodes = activeBondContext.bondCodes.slice(0, 4);
    suggestions = [
      `Tóm tắt nhanh nhóm trái phiếu đang so sánh: ${compareCodes.join(', ')}.`,
      'Mã nào đang có lãi suất cao nhất trong nhóm này?',
      'Mã nào có ngày đáo hạn gần nhất trong nhóm này?',
    ];
  } else if (activeBondContext?.kind === 'bond-detail' && recentSymbol) {
    const issuerSymbol = activeBondContext.issuerSymbol || activeBondContext.issuerName;
    suggestions = [
      `Tóm tắt nhanh mã trái phiếu ${recentSymbol}.`,
      `Lãi suất, kỳ hạn và điểm cần theo dõi của ${recentSymbol} là gì?`,
      `Lịch thanh toán và áp lực đáo hạn của ${recentSymbol} hiện ra sao?`,
    ];

    if (issuerSymbol) {
      suggestions.unshift(`Mã ${recentSymbol} đang cho thấy điều gì về tổ chức phát hành ${issuerSymbol}?`);
    }
  } else if (parts[0] === 'enterprise' && recentSymbol) {
    suggestions = [
      `${recentSymbol} hiện có bao nhiêu mã trái phiếu đang lưu hành?`,
      `Cơ cấu kỳ hạn và lãi suất của ${recentSymbol} hiện như thế nào?`,
      `Áp lực đáo hạn của ${recentSymbol} trong 12 tháng tới ra sao?`,
    ];
  } else if (parts[0] === 'industry' && parts[1]) {
    const industryLabel = getIndustryDisplayLabel(parts[1]);
    suggestions = [
      `Top tổ chức phát hành trong nhóm ${industryLabel.toLowerCase()} là ai?`,
      `Quy mô dư nợ của nhóm ${industryLabel.toLowerCase()} đang tập trung vào đâu?`,
      `Lãi suất phát hành của nhóm ${industryLabel.toLowerCase()} có điểm gì đáng chú ý?`,
    ];
  } else if (parts[0] === 'maturity') {
    suggestions = [
      'Có bao nhiêu mã trái phiếu sắp đáo hạn trong 12 tháng tới?',
      'Những tổ chức nào có áp lực đáo hạn lớn nhất?',
      'Các tháng nào tập trung nhiều trái phiếu đáo hạn nhất?',
    ];
  } else if (parts[0] === 'watchlist') {
    suggestions = [
      'Tóm tắt nhanh rủi ro của danh mục theo dõi hiện tại.',
      'Mã nào trong danh mục theo dõi đáo hạn sớm nhất?',
      'Cơ cấu kỳ hạn của danh mục theo dõi đang nghiêng về đâu?',
    ];
  } else {
    suggestions = [
      'Có bao nhiêu mã trái phiếu trên thị trường hiện tại?',
      'Top tổ chức phát hành theo dư nợ hiện nay là ai?',
      'Ngành nào đang có khối lượng trái phiếu lớn nhất?',
    ];

    if (recentSymbol) {
      suggestions.unshift(`Phân tích nhanh tình hình trái phiếu của ${recentSymbol}.`);
    }
  }

  const excluded = new Set(
    [input, recentUserMessage]
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean),
  );

  return Array.from(new Set(suggestions))
    .filter((question) => !excluded.has(question.toLowerCase()))
    .slice(0, MAX_SUGGESTION_COUNT);
}

function resolveSuggestedQuestions(pathname: string, messages: Message[], input: string) {
  const parts = pathname.split('/').filter(Boolean);
  const recentUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const activeBondContext = getActiveBondContext(pathname);
  const filterRouteState = getFilterRouteState(pathname);
  const activeViewContext = getActiveViewContext(pathname);
  const activeViewFilters = isObject(activeViewContext?.dataset?.filters) ? activeViewContext.dataset.filters : null;
  const recentSymbol = getCurrentSuggestedSymbol(pathname, recentUserMessage);

  let suggestions: string[] = [];

  if (activeBondContext?.kind === 'bond-comparison') {
    const compareCodes = activeBondContext.bondCodes.slice(0, 4);
    suggestions = [
      `Tóm tắt nhanh nhóm trái phiếu đang so sánh: ${compareCodes.join(', ')}.`,
      'Mã nào đang có lãi suất cao nhất trong nhóm này?',
      'Mã nào có ngày đáo hạn gần nhất trong nhóm này?',
    ];
  } else if (activeBondContext?.kind === 'bond-detail' && recentSymbol) {
    const issuerSymbol = activeBondContext.issuerSymbol || activeBondContext.issuerName;
    suggestions = [
      `Tóm tắt nhanh mã trái phiếu ${recentSymbol}.`,
      `Lãi suất, kỳ hạn và điểm cần theo dõi của ${recentSymbol} là gì?`,
      `Lịch thanh toán và áp lực đáo hạn của ${recentSymbol} hiện ra sao?`,
    ];

    if (issuerSymbol) {
      suggestions.unshift(`Mã ${recentSymbol} đang cho thấy điều gì về tổ chức phát hành ${issuerSymbol}?`);
    }
  } else if (filterRouteState?.subTab === 'issuer' && recentSymbol) {
    suggestions = [
      `${recentSymbol} hiện có bao nhiêu mã trái phiếu đang lưu hành?`,
      `Cơ cấu kỳ hạn và lãi suất của ${recentSymbol} hiện như thế nào?`,
      `Áp lực đáo hạn của ${recentSymbol} trong 12 tháng tới ra sao?`,
    ];
  } else if (filterRouteState?.subTab === 'issuer') {
    const hasFilters = Boolean(
      normalizeText(activeViewFilters?.searchTerm).length > 0 ||
      normalizeText(activeViewFilters?.industry).length > 0 ||
      (Array.isArray(activeViewFilters?.aiSummary) && activeViewFilters.aiSummary.length > 0),
    );
    suggestions = hasFilters
      ? [
          'Tóm tắt nhanh danh sách tổ chức phát hành đang được lọc hiện tại.',
          'Nhóm tổ chức phát hành nào đang nổi bật nhất trong kết quả lọc này?',
          'Bộ lọc hiện tại đang loại ra những nhóm tổ chức nào?',
        ]
      : [
          'Hiện có bao nhiêu tổ chức phát hành trong danh sách này?',
          'Tổ chức phát hành nào đang có dư nợ còn lại lớn nhất?',
          'Ngành nào đang tập trung nhiều tổ chức phát hành nhất?',
        ];
  } else if (filterRouteState?.subTab === 'bonds') {
    const hasFilters = Boolean(
      normalizeText(activeViewFilters?.searchTerm).length > 0 ||
      (Array.isArray(activeViewFilters?.aiSummary) && activeViewFilters.aiSummary.length > 0),
    );
    suggestions = hasFilters
      ? [
          'Tóm tắt nhanh danh sách trái phiếu theo bộ lọc hiện tại.',
          'Trong kết quả đang lọc, mã nào có lãi suất cao nhất?',
          'Trong kết quả đang lọc, mã nào đáo hạn sớm nhất?',
        ]
      : [
          'Hiện có bao nhiêu mã trái phiếu trong danh sách toàn thị trường?',
          'Mã nào đang có lãi suất cao nhất trên danh sách này?',
          'Nhóm ngành nào đang chiếm nhiều mã trái phiếu nhất?',
        ];
  } else if (parts[0] === 'enterprise' && recentSymbol) {
    suggestions = [
      `${recentSymbol} hiện có bao nhiêu mã trái phiếu đang lưu hành?`,
      `Cơ cấu kỳ hạn và lãi suất của ${recentSymbol} hiện như thế nào?`,
      `Áp lực đáo hạn của ${recentSymbol} trong 12 tháng tới ra sao?`,
    ];
  } else if (parts[0] === 'industry' && parts[1]) {
    const industryLabel = getIndustryDisplayLabel(parts[1]);
    suggestions = [
      `Top tổ chức phát hành trong nhóm ${industryLabel.toLowerCase()} là ai?`,
      `Quy mô dư nợ của nhóm ${industryLabel.toLowerCase()} đang tập trung vào đâu?`,
      `Lãi suất phát hành của nhóm ${industryLabel.toLowerCase()} có điểm gì đáng chú ý?`,
    ];
  } else if (parts[0] === 'maturity') {
    suggestions = [
      'Có bao nhiêu mã trái phiếu sắp đáo hạn trong 12 tháng tới?',
      'Những tổ chức nào có áp lực đáo hạn lớn nhất?',
      'Các tháng nào tập trung nhiều trái phiếu đáo hạn nhất?',
    ];
  } else if (parts[0] === 'watchlist') {
    suggestions = [
      'Tóm tắt nhanh rủi ro của danh mục theo dõi hiện tại.',
      'Mã nào trong danh mục theo dõi đáo hạn sớm nhất?',
      'Cơ cấu kỳ hạn của danh mục theo dõi đang nghiêng về đâu?',
    ];
  } else {
    suggestions = [
      'Tổng quy mô và điểm nổi bật của thị trường trái phiếu hiện tại là gì?',
      'Top tổ chức phát hành theo dư nợ hiện nay là ai?',
      'Ngành nào đang có khối lượng trái phiếu lớn nhất?',
    ];

    if (recentSymbol) {
      suggestions.unshift(`Phân tích nhanh tình hình trái phiếu của ${recentSymbol}.`);
    }
  }

  const excluded = new Set(
    [input, recentUserMessage]
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean),
  );

  return Array.from(new Set(suggestions))
    .filter((question) => !excluded.has(question.toLowerCase()))
    .slice(0, MAX_SUGGESTION_COUNT);
}

function extractCandidateSymbols(text: string) {
  const reserved = new Set(['AI', 'API', 'CEO', 'CFO', 'VND', 'VNĐ', 'USD', 'GDP', 'TPDN', 'ICB', 'GPT']);
  return Array.from(new Set((text.match(/\b[A-Z0-9]{2,8}\b/g) || [])
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => !reserved.has(symbol))
    .filter((symbol) => /[A-Z]/.test(symbol))
    .slice(0, 3)));
}

function buildIndustryIntentRequests(normalizedQuestion: string) {
  return INDUSTRY_INTENTS
    .filter((industry) => industry.patterns.some((pattern) => normalizedQuestion.includes(pattern)))
    .map((industry) => ({
      label: `Nhóm ngành ${getIndustryDisplayLabel(industry.id)}`,
      url: `/api/page-data?view=industry&industryId=${encodeURIComponent(industry.id)}&includeCashFlows=0&detailLimit=80`,
    }));
}

function buildQuestionDataRequests(pathname: string, userMessage?: string): PageDataRequestConfig[] {
  const question = normalizeText(userMessage);
  const normalizedQuestion = question.toLowerCase();
  const requests: PageDataRequestConfig[] = [buildPageDataRequest(pathname)];
  const activeBondContext = getActiveBondContext(pathname);

  if (activeBondContext?.kind === 'bond-detail' && activeBondContext.issuerSymbol) {
    requests.push({
      label: `Tổ chức phát hành ${activeBondContext.issuerSymbol}`,
      url: `/api/page-data?view=issuer&symbol=${encodeURIComponent(activeBondContext.issuerSymbol)}&detailLimit=60`,
    });
  }

  if (activeBondContext?.kind === 'bond-comparison') {
    activeBondContext.issuerSymbols
      .filter(Boolean)
      .slice(0, 4)
      .forEach((issuerSymbol) => {
        requests.push({
          label: `Tổ chức phát hành ${issuerSymbol}`,
          url: `/api/page-data?view=issuer&symbol=${encodeURIComponent(issuerSymbol)}&detailLimit=60`,
        });
      });
  }

  if (
    activeBondContext?.kind === 'bond-comparison' &&
    (normalizedQuestion.includes('so sánh') ||
      normalizedQuestion.includes('so sanh') ||
      normalizedQuestion.includes('nhom nay') ||
      normalizedQuestion.includes('group') ||
      normalizedQuestion.includes('trong nhom'))
  ) {
    requests.push({
      label: 'Tổng quan thị trường',
      url: '/api/page-data?view=market-overview',
    });
  }

  if (!question) return requests;

  if (
    normalizedQuestion.includes('tong quan') ||
    normalizedQuestion.includes('tổng quan') ||
    normalizedQuestion.includes('thi truong') ||
    normalizedQuestion.includes('thị trường') ||
    normalizedQuestion.includes('top') ||
    normalizedQuestion.includes('cao nhat') ||
    normalizedQuestion.includes('cao nhất') ||
    normalizedQuestion.includes('du no') ||
    normalizedQuestion.includes('dư nợ') ||
    normalizedQuestion.includes('lai suat') ||
    normalizedQuestion.includes('lãi suất')
  ) {
    requests.push({
      label: 'Tổng quan thị trường',
      url: '/api/page-data?view=market-overview',
    });
  }

  if (
    normalizedQuestion.includes('dao han') ||
    normalizedQuestion.includes('đáo hạn') ||
    normalizedQuestion.includes('maturity') ||
    normalizedQuestion.includes('ap luc thanh toan') ||
    normalizedQuestion.includes('áp lực thanh toán')
  ) {
    requests.push({
      label: 'Danh sách đáo hạn',
      url: '/api/page-data?view=maturity&days=365',
    });
  }

  if (
    normalizedQuestion.includes('watchlist') ||
    normalizedQuestion.includes('danh muc') ||
    normalizedQuestion.includes('danh mục') ||
    normalizedQuestion.includes('theo doi') ||
    normalizedQuestion.includes('theo dõi')
  ) {
    requests.push(buildPageDataRequest('/watchlist'));
  }

  requests.push(...buildIndustryIntentRequests(normalizedQuestion));

  extractCandidateSymbols(question).forEach((symbol) => {
    requests.push({
      label: `Tổ chức phát hành ${symbol}`,
      url: `/api/page-data?view=issuer&symbol=${encodeURIComponent(symbol)}&detailLimit=60`,
    });
  });

  const seen = new Set<string>();
  return requests.filter((request) => {
    const signature = getRequestSignature(request);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

async function fetchPageDatasetSummary(
  requestConfig: PageDataRequestConfig,
  pathname: string,
): Promise<{ summary: PageDatasetSummary; error: string | null }> {
  if (requestConfig.fallback) {
    return {
      summary: {
        label: requestConfig.label,
        data: requestConfig.fallback,
      },
      error: null,
    };
  }

  try {
    const response = await fetch(requestConfig.url || '/api/page-data?view=schema', {
      ...requestConfig.init,
      headers: {
        Accept: 'application/json',
        ...buildPageDataHeaders(),
        ...((requestConfig.init?.headers as Record<string, string> | undefined) || {}),
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        normalizeText(isObject(payload) ? payload.message || payload.error : '') ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    return {
      summary: {
        label: requestConfig.label,
        data: summarizePageData(pathname, payload),
      },
      error: null,
    };
  } catch (error: any) {
    return {
      summary: {
        label: requestConfig.label,
        data: {
          route: pathname,
          page: 'context-unavailable',
          note: 'khong tai duoc page-data',
          error: error?.message || 'Unknown error',
        },
      },
      error: error?.message || 'Khong tai duoc page-data hien tai',
    };
  }
}

async function fetchPageContextSnapshot(pathname: string, userMessage?: string): Promise<PageContextSnapshot> {
  const requestConfigs = buildQuestionDataRequests(pathname, userMessage);
  const fetchedAt = Date.now();

  logFireantTokenDebug();

  const summaries = await Promise.all(
    requestConfigs.map((requestConfig) => fetchPageDatasetSummary(requestConfig, pathname)),
  );

  const errors = summaries.map((item) => item.error).filter(Boolean);
  const context = {
    instruction:
      'Chon dataset phu hop voi cau hoi. Uu tien so lieu trong datasets; neu thieu du lieu thi noi ro thieu gi.',
    apiCatalog: PAGE_DATA_API_CATALOG,
    currentRoute: pathname,
    datasets: summaries.map((item) => item.summary),
  };

  return {
    pathname,
    label: buildPageDataRequest(pathname).label,
    text: JSON.stringify(context),
    error: errors[0] || null,
    fetchedAt,
  };
}

function getActiveModelId(models: Array<{ id: string }>, selectedModel: string, defaultModel: string) {
  const allowedModelIds = new Set(models.map((model) => model.id));

  const validSelectedModel = selectedModel && allowedModelIds.has(selectedModel) ? selectedModel : '';
  const validDefaultModel =
    defaultModel && (models.length === 0 || allowedModelIds.has(defaultModel)) ? defaultModel : '';

  return validSelectedModel || validDefaultModel || models[0]?.id || CLIENT_FALLBACK_AI_MODEL;
}

function buildBondFilterAssistantContent(
  criteria: AIBondFilterCriteria,
  rows: BondDataRow[],
  language: 'vi' | 'en',
) {
  const summary = summarizeBondFilterCriteria(criteria, language);
  const summaryText = summary.join(', ');
  const sortText = getAIBondSortByLabel(criteria.sortBy, language);

  if (rows.length === 0) {
    if (language === 'en') {
      return `I did not find any listed bond matching ${summaryText || 'the requested conditions'}. You can widen the tenor, coupon, issue date, or maturity date range and try again.`;
    }

    return `Toi chua tim thay ma trai phieu niem yet nao phu hop voi ${summaryText || 'dieu kien da mo ta'}. Ban co the mo rong khoang ky han, lai suat, ngay phat hanh hoac ngay dao han de lay them ket qua.`;
  }

  const avgRate = rows.reduce((total, row) => total + Number(row.bondRate || 0), 0) / rows.length;
  const tenorValues = rows.map((row) => Number(row.tenorPeriod || 0)).filter((value) => value > 0);
  const maturityDates = rows
    .map((row) => row.maturityDate)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const previewRows = buildBondFilterResultPreview(sortBondRowsByCriteria(rows, criteria), 5);
  const previewLines = previewRows.map((row) => {
    if (language === 'en') {
      return `- \`${row.bondCode}\` | ${row.issuerName} | ${formatInterestRate(row.bondRate)}% | ${formatNumber(row.tenorPeriod, 0)} months | maturity ${formatDate(row.maturityDate)}`;
    }

    return `- \`${row.bondCode}\` | ${row.issuerName} | ${formatInterestRate(row.bondRate)}% | ${formatNumber(row.tenorPeriod, 0)} thang | dao han ${formatDate(row.maturityDate)}`;
  });

  const tenorRange = tenorValues.length > 0
    ? `${formatNumber(Math.min(...tenorValues), 0)} - ${formatNumber(Math.max(...tenorValues), 0)}`
    : language === 'en'
      ? 'n/a'
      : 'chua ro';
  const maturityRange = maturityDates.length > 0
    ? `${formatDate(maturityDates[0])} - ${formatDate(maturityDates[maturityDates.length - 1])}`
    : language === 'en'
      ? 'n/a'
      : 'chua ro';

  if (language === 'en') {
    return [
      `I filtered the listed bond universe by ${summaryText || 'the requested conditions'} and found **${formatNumber(rows.length, 0)} matching bonds**.`,
      `This group has an average coupon of **${formatInterestRate(avgRate)}%**, a tenor range around **${tenorRange} months**, and maturities spanning **${maturityRange}**${sortText ? `. Current result order: **${sortText}**` : ''}.`,
      `A few bonds worth reviewing next:\n${previewLines.join('\n')}`,
    ].join('\n\n');
  }

  return [
    `Toi da loc tap trai phieu niem yet theo ${summaryText || 'cac tieu chi ban mo ta'} va hien co **${formatNumber(rows.length, 0)} ma phu hop**.`,
    `Nhom ket qua nay co lai suat binh quan **${formatInterestRate(avgRate)}%**, ky han trai trong khoang **${tenorRange} thang**, va lich dao han trai tu **${maturityRange}**${sortText ? `. Thu tu hien tai: **${sortText}**` : ''}.`,
    `Mot so ma nen xem tiep:\n${previewLines.join('\n')}`,
  ].join('\n\n');
}

export default function AIChatBot() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<PageContextSnapshot | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [runtimeContextVersion, setRuntimeContextVersion] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshedModelsOnOpenRef = useRef(false);

  const {
    configured,
    selectedModel,
    defaultModel,
    models,
    refreshStatus,
    refreshModels,
    setSelectedModel,
    isLoadingStatus,
    isLoadingModels,
    statusError,
  } = useAIStore();

  useEffect(() => {
    const saved = safeReadLocalStorage(CHAT_HISTORY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages(
            parsed.map((message) =>
              message?.role === 'assistant'
                ? { ...message, content: sanitizeAssistantContent(String(message.content || '')) }
                : message,
            ),
          );
          return;
        }
      } catch {
        // ignore invalid history
      }
    }

    setMessages([{ role: 'assistant', content: t('chatBotWelcome') }]);
  }, [t]);

  useEffect(() => {
    if (messages.length > 0) {
      safeWriteLocalStorage(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    }
  }, [messages]);

  useEffect(() => {
    const unsubscribeBondContext = subscribeBondChatContext(() => {
      setRuntimeContextVersion((current) => current + 1);
    });
    const unsubscribeViewContext = subscribeViewChatContext(() => {
      setRuntimeContextVersion((current) => current + 1);
    });

    return () => {
      unsubscribeBondContext();
      unsubscribeViewContext();
    };
  }, []);

  useEffect(() => {
    if (isOpen && !configured && !isLoadingStatus && !statusError) {
      void refreshStatus();
    }
  }, [configured, isLoadingStatus, isOpen, refreshStatus, statusError]);

  useEffect(() => {
    if (!isOpen) {
      refreshedModelsOnOpenRef.current = false;
      return;
    }

    if (configured && !isLoadingModels && !refreshedModelsOnOpenRef.current) {
      refreshedModelsOnOpenRef.current = true;
      void refreshModels(true);
    }
  }, [configured, isLoadingModels, isOpen, refreshModels]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setIsLoadingContext(true);

    void fetchPageContextSnapshot(location.pathname).then((snapshot) => {
      if (!active) return;
      setPageContext(snapshot);
      setContextError(snapshot.error);
      setIsLoadingContext(false);
    });

    return () => {
      active = false;
    };
  }, [isOpen, location.pathname, runtimeContextVersion]);

  useEffect(() => {
    if (!isOpen || location.pathname !== '/watchlist') return undefined;

    const unsubscribe = onWatchlistUpdated(() => {
      setIsLoadingContext(true);
      void fetchPageContextSnapshot(location.pathname).then((snapshot) => {
        setPageContext(snapshot);
        setContextError(snapshot.error);
        setIsLoadingContext(false);
      });
    });

    return unsubscribe;
  }, [isOpen, location.pathname, runtimeContextVersion]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  const activeModel = getActiveModelId(models, selectedModel, defaultModel);
  const isStreaming = streamingIdx !== null;
  const suggestedQuestions = resolveSuggestedQuestions(location.pathname, messages, input);

  const fillSuggestedQuestion = (question: string) => {
    setInput(question);
    requestAnimationFrame(() => {
      resizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    });
  };

  const replaceLastAssistantMessage = (content: string, model?: string, action?: MessageAction) => {
    setMessages((previous) => {
      const next = [...previous];
      const lastMessage = next[next.length - 1];
      if (lastMessage?.role === 'assistant') {
        next[next.length - 1] = {
          ...lastMessage,
          content,
          model: model || lastMessage.model,
          action,
        };
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    if (!configured) {
      setErrorBanner(t('aiNotConfigured'));
      return;
    }

    if (!activeModel && !isLoadingModels) {
      await refreshModels(true);
    }

    const refreshedState = useAIStore.getState();
    const sendModel = getActiveModelId(
      refreshedState.models,
      refreshedState.selectedModel,
      refreshedState.defaultModel || activeModel,
    );

    if (!sendModel) {
      setErrorBanner(t('aiNoModelSelected'));
      return;
    }

    const userMessage = input.trim();
    const priorHistory = messages.filter((message, index) => !(index === 0 && message.role === 'assistant'));
    const shouldHandleFilter = isBondFilterIntent(userMessage);

    if (!shouldHandleFilter) {
      setIsLoadingContext(true);
      const contextSnapshot = await fetchPageContextSnapshot(location.pathname, userMessage);
      setPageContext(contextSnapshot);
      setContextError(contextSnapshot.error);
      setIsLoadingContext(false);

      setInput('');
      requestAnimationFrame(() => resizeTextarea(textareaRef.current));
      setErrorBanner(null);
      setMessages((previous) => [...previous, { role: 'user', content: userMessage }]);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const assistantIdx = messages.length + 1;
      setMessages((previous) => [...previous, { role: 'assistant', content: '' }]);
      setStreamingIdx(assistantIdx);

      let receivedAny = false;
      let aggregated = '';
      let serverError: string | null = null;
      let finalModel = sendModel;

      try {
        await streamChat(
          {
            userMessage,
            messages: priorHistory,
            model: sendModel,
            pageContext: contextSnapshot?.text || undefined,
          },
          {
            signal: abortRef.current.signal,
            onStart: (data) => {
              finalModel = data.model || sendModel;
            },
            onDelta: (chunk) => {
              receivedAny = true;
              aggregated += chunk;
              const sanitizedContent = sanitizeAssistantContent(aggregated);
              replaceLastAssistantMessage(sanitizedContent);
            },
            onDone: (data) => {
              finalModel = data.model || finalModel;
            },
            onError: (message) => {
              serverError = message;
              setErrorBanner(message);
              if (message.toLowerCase().includes('not allowed')) {
                setSelectedModel('');
                void refreshModels(true);
              }
            },
          },
        );
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          serverError = serverError || error?.message || t('chatBotError');
        }
      } finally {
        abortRef.current = null;
        setStreamingIdx(null);
        setMessages((previous) => {
          const next = [...previous];
          const lastMessage = next[next.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            const finalContent = receivedAny ? sanitizeAssistantContent(lastMessage.content) : serverError || t('chatBotError');
            next[next.length - 1] = {
              role: 'assistant',
              content: finalContent,
              model: finalModel,
            };
          }
          return next;
        });
      }
      return;
    }

    setInput('');
    requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    setErrorBanner(null);
    setMessages((previous) => [...previous, { role: 'user', content: userMessage }]);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const assistantIdx = messages.length + 1;
    setMessages((previous) => [...previous, { role: 'assistant', content: '' }]);
    setStreamingIdx(assistantIdx);

    let serverError: string | null = null;
    let finalModel = sendModel;

    try {
      const extraction = await extractBondFilterCriteria({
        message: userMessage,
        model: sendModel,
      });

      if (!extraction.isFilterRequest || !hasAIBondFilterCriteria(extraction.criteria)) {
        throw new Error(t('aiFilterNoCriteria'));
      }

      const matchedRows = filterBondRowsByCriteria(
        await loadBondFilterRows(
          buildBondFilterQueryFromCriteria(extraction.criteria, {
            statusID: 1,
            isListing: 1,
            top: CHAT_FILTER_FETCH_LIMIT,
          }),
        ),
        extraction.criteria,
      );

      const criteriaSummary = extraction.summary.length > 0
        ? extraction.summary.slice(0, MAX_SUGGESTION_COUNT)
        : summarizeBondFilterCriteria(extraction.criteria, language === 'en' ? 'en' : 'vi').slice(0, MAX_SUGGESTION_COUNT);
      const assistantContent = buildBondFilterAssistantContent(
        extraction.criteria,
        matchedRows,
        language === 'en' ? 'en' : 'vi',
      );

      replaceLastAssistantMessage(
        assistantContent,
        finalModel,
        {
          type: 'navigate',
          label: t('openBondFilterPage'),
          to: '/filter/bonds',
          state: {
            aiBondFilterPreset: {
              criteria: extraction.criteria,
              prompt: userMessage,
              summary: criteriaSummary,
            },
          },
        },
      );
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        serverError = serverError || error?.message || t('chatBotError');
      }
    } finally {
      abortRef.current = null;
      setStreamingIdx(null);
      if (serverError) {
        replaceLastAssistantMessage(serverError || t('chatBotError'), finalModel);
      }
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingIdx(null);
  };

  return (
    <div className="ai-chatbot-shell fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-6">
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            className="mb-3 flex h-96 w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-xl sm:mb-4 sm:h-[32rem] sm:max-w-md"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border-base bg-bg-base/80 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-muted">
                  {isLoadingContext ? t('loading') : pageContext?.label || 'AI'}
                </p>
                <h3 className="truncate text-sm font-bold text-text-base">{t('chatBotTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-base bg-bg-base text-text-muted shadow-sm transition-colors hover:border-blue-500/40 hover:bg-blue-50 hover:text-blue-600"
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(!configured || statusError || errorBanner || (!activeModel && !isLoadingModels)) && (
              <div className="flex items-start gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {!configured
                    ? t('aiNotConfigured')
                    : statusError
                    ? statusError
                    : !activeModel && !isLoadingModels
                    ? t('aiNoModelSelected')
                    : errorBanner}
                </span>
              </div>
            )}

            {contextError && (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-600">
                {contextError}
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.map((message, index) => {
                const isCurrentStream = isStreaming && index === messages.length - 1 && message.role === 'assistant';

                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={`flex max-w-xs gap-2 sm:max-w-sm ${
                        message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div
                        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
                        }`}
                      >
                        {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>

                      <div
                        className={`overflow-hidden rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === 'user'
                            ? 'rounded-tr-none bg-blue-500 text-white'
                            : 'rounded-tl-none border border-border-base bg-bg-base text-text-base'
                        }`}
                      >
                        {message.role === 'user' ? (
                          <span className="whitespace-pre-wrap break-words">{message.content}</span>
                        ) : message.content === '' ? (
                          <div className="flex items-center gap-2 text-text-muted">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('chatBotThinking')}</span>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="prose prose-sm max-w-none text-text-base prose-headings:text-text-base prose-p:text-text-base prose-strong:text-text-base prose-li:text-text-base prose-code:text-text-base">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                              {isCurrentStream && <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current align-middle" />}
                            </div>
                            {message.action && (
                              <button
                                type="button"
                                onClick={() => navigate(message.action!.to, { state: message.action!.state })}
                                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span>{message.action.label}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {suggestedQuestions.length > 0 && (
                <div className="ml-10 flex flex-col gap-2">
                  <div className="hidden">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Gợi ý tiếp theo</p>
                    <p className="text-xs text-text-muted">Chạm để điền nhanh câu hỏi.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {suggestedQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => fillSuggestedQuestion(question)}
                        className="w-full rounded-2xl border border-border-base bg-bg-base px-3 py-2 text-left text-xs font-medium leading-snug text-text-muted shadow-sm transition-colors hover:border-blue-500/30 hover:text-text-base"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {false && (
                <div className="flex justify-start">
                  <div className="flex max-w-xs gap-2 sm:max-w-sm">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div className="space-y-1.5 rounded-2xl rounded-tl-none border border-border-base bg-bg-base px-3 py-2">
                      <p className="hidden">
                        Gợi ý tiếp theo
                      </p>
                      <div className="grid gap-1">
                        {suggestedQuestions.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => fillSuggestedQuestion(question)}
                            className="rounded-xl border border-border-base bg-bg-surface px-3 py-1.5 text-left text-xs font-medium leading-tight text-text-base transition-colors hover:border-blue-500/40 hover:bg-blue-500/10"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border-base bg-bg-base/60 p-3">
              {false && (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted/80">
                    <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                    <span>Gợi ý tiếp theo</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => fillSuggestedQuestion(question)}
                        className="rounded-full border border-border-base bg-bg-surface px-3 py-2 text-left text-xs font-medium text-text-base transition-colors hover:border-blue-500/40 hover:bg-blue-500/10"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    resizeTextarea(event.target);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={
                    !configured
                      ? t('aiNotConfiguredShort')
                      : !activeModel
                      ? isLoadingModels
                        ? t('loading')
                        : t('aiNoModelSelected')
                      : t('chatBotPlaceholder')
                  }
                  disabled={!configured || !activeModel || isStreaming}
                  className="max-h-28 min-h-11 flex-1 resize-none overflow-hidden rounded-2xl border border-border-base bg-bg-surface px-4 py-3 text-sm text-text-base outline-none transition-colors placeholder:text-text-muted/70 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={isStreaming ? handleStop : () => void handleSend()}
                  disabled={(!input.trim() && !isStreaming) || !configured || !activeModel}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
                  title={isStreaming ? t('stop') : t('send')}
                >
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setIsOpen(true)}
            className="ml-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg transition-colors hover:bg-blue-600"
            title={t('chatBotTitle')}
          >
            <MessageSquare className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
