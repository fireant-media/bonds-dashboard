import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL } from './config.js';

type QueryValue = string | string[] | undefined;

interface PageDataRequest {
  method: string;
  view?: string;
  query: Record<string, QueryValue>;
  body?: any;
}

interface PageDataResponse {
  status: number;
  data: unknown;
}

interface IndustryItem {
  id: string;
  label: string;
  code: string;
  level: number;
  priority: number;
}

const BILLION = 1000000000;

const INDUSTRIES: IndustryItem[] = [
  { id: 'Technology', label: 'Cong nghe', code: '10', level: 1, priority: 40 },
  { id: 'Financials', label: 'Tai chinh khac', code: '30', level: 1, priority: 30 },
  { id: 'Banking', label: 'Ngan hang', code: '3010', level: 2, priority: 20 },
  { id: 'Securities', label: 'Chung khoan', code: '30202005', level: 4, priority: 10 },
  { id: 'RealEstate', label: 'Bat dong san', code: '35', level: 1, priority: 70 },
  { id: 'ConsumerDiscretionary', label: 'Hang tieu dung khong thiet yeu', code: '40', level: 1, priority: 80 },
  { id: 'ConsumerStaples', label: 'Hang tieu dung co ban', code: '45', level: 1, priority: 90 },
  { id: 'Industrials', label: 'Cong nghiep', code: '50', level: 1, priority: 100 },
  { id: 'BasicMaterials', label: 'Vat lieu co ban', code: '55', level: 1, priority: 110 },
  { id: 'Energy', label: 'Nang luong', code: '60', level: 1, priority: 120 },
  { id: 'InfrastructureServices', label: 'Cac dich vu ha tang', code: '65', level: 1, priority: 130 },
];

const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRIES.map((item) => [item.id, item]));
const INDUSTRY_BY_CODE = Object.fromEntries(INDUSTRIES.map((item) => [item.code, item]));

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toBillion = (value: unknown) => toNumber(value) / BILLION;

const normalizeText = (value: unknown) => String(value ?? '').trim();

const getQueryValue = (value: QueryValue) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
};

const getQueryNumber = (value: QueryValue, fallback: number) => {
  const parsed = Number(getQueryValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getCodes = (request: PageDataRequest) => {
  const queryCodes = getQueryValue(request.query.codes)
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  const bodyCodes = Array.isArray(request.body?.codes)
    ? request.body.codes.map(normalizeText).filter(Boolean)
    : [];
  const itemCodes = Array.isArray(request.body?.items)
    ? request.body.items.map((item: any) => normalizeText(item?.code || item?.bondCode)).filter(Boolean)
    : [];

  return Array.from(new Set([...queryCodes, ...bodyCodes, ...itemCodes].map((code) => code.toUpperCase())));
};

const buildQueryString = (query?: Record<string, string | number | boolean | null | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
};

async function fireantFetch<T>(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const method = options.method || 'GET';
  const url = `${FIREANT_BASE_URL}/${path.replace(/^\/+/, '')}${buildQueryString(options.query)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  if (FIREANT_ACCESS_TOKEN) {
    headers.Authorization = FIREANT_ACCESS_TOKEN.startsWith('Bearer ')
      ? FIREANT_ACCESS_TOKEN
      : `Bearer ${FIREANT_ACCESS_TOKEN}`;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(options.body || {}),
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `FireAnt HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

const getRows = <T>(payload: T[] | { data?: T[]; rows?: T[]; items?: T[]; result?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.data || payload.rows || payload.items || payload.result || [];
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      try {
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      } catch {
        results[currentIndex] = undefined as R;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results.filter(Boolean);
}

const getBondCode = (bond: any) => normalizeText(bond?.bondCode || bond?.BondCode || bond?.code || bond?.id).toUpperCase();

const getIssuerSymbol = (bond: any, fallback = '') =>
  normalizeText(
    bond?.issuerSymbol ||
    bond?.IssuerSymbol ||
    bond?.bondInfos?.IssuerSymbol ||
    bond?.bondInfos?.Symbol ||
    bond?.infoObj?.issuerSymbol ||
    bond?.raw?.issuerSymbol ||
    fallback,
  ).toUpperCase();

const getIssuerName = (bond: any, fallback = '') =>
  normalizeText(
    bond?.issuerName ||
    bond?.IssuerName ||
    bond?.bondInfos?.IssuerName ||
    bond?.bondInfos?.Name ||
    bond?.infoObj?.issuerName ||
    bond?.raw?.issuerName ||
    fallback,
  );

const getIndustryCodes = (bond: any) => {
  const candidates = [
    bond?.icbCode,
    bond?.ICBCode,
    bond?.icbCodeLv4,
    bond?.ICBCodeLv4,
    bond?.icbCodeLv3,
    bond?.ICBCodeLv3,
    bond?.icbCodeLv2,
    bond?.ICBCodeLv2,
    bond?.icbCodeLv1,
    bond?.ICBCodeLv1,
    bond?.bondInfos?.ICBCode,
    bond?.bondInfos?.icbCode,
    bond?.bondInfos?.ICBCodeLv4,
    bond?.bondInfos?.icbCodeLv4,
    bond?.bondInfos?.ICBCodeLv3,
    bond?.bondInfos?.icbCodeLv3,
    bond?.bondInfos?.ICBCodeLv2,
    bond?.bondInfos?.icbCodeLv2,
    bond?.bondInfos?.ICBCodeLv1,
    bond?.bondInfos?.icbCodeLv1,
    bond?.raw?.icbCode,
    bond?.raw?.ICBCode,
    bond?.raw?.icbCodeLv4,
    bond?.raw?.ICBCodeLv4,
    bond?.raw?.icbCodeLv3,
    bond?.raw?.ICBCodeLv3,
    bond?.raw?.icbCodeLv2,
    bond?.raw?.ICBCodeLv2,
    bond?.raw?.icbCodeLv1,
    bond?.raw?.ICBCodeLv1,
    bond?.infoObj?.icbCode,
    bond?.infoObj?.ICBCode,
    bond?.infoObj?.icbCodeLv4,
    bond?.infoObj?.ICBCodeLv4,
    bond?.infoObj?.icbCodeLv3,
    bond?.infoObj?.ICBCodeLv3,
    bond?.infoObj?.icbCodeLv2,
    bond?.infoObj?.ICBCodeLv2,
    bond?.infoObj?.icbCodeLv1,
    bond?.infoObj?.ICBCodeLv1,
  ];

  return Array.from(new Set(candidates.map(normalizeText).filter(Boolean)));
};

const normalizeBondRow = (bond: any) => ({
  bondCode: getBondCode(bond),
  issuerSymbol: getIssuerSymbol(bond),
  issuerName: getIssuerName(bond),
  issueDate: normalizeText(bond?.issueDate || bond?.IssueDate).split('T')[0],
  maturityDate: normalizeText(bond?.maturityDate || bond?.MaturityDate).split('T')[0],
  tenorPeriod: toNumber(bond?.tenorPeriod || bond?.TenorPeriod),
  bondRate: toNumber(bond?.bondRate || bond?.BondRate || bond?.interestRate || bond?.couponRate),
  bondRateType: normalizeText(bond?.bondRateType || bond?.BondRateType || bond?.interestRateType || bond?.couponRateType),
  currentListedVolume: toNumber(bond?.currentListedVolume || bond?.CurrentListedVolume || bond?.listedVolume),
  currentListedValue: toNumber(bond?.currentListedValue || bond?.CurrentListedValue || bond?.listedValue),
  totalIssuedValue: toNumber(bond?.totalIssuedValue || bond?.TotalIssuedValue || bond?.issuedValue),
  totalRemainingDebt: toNumber(bond?.totalRemainingDebt || bond?.TotalRemainingDebt),
  totalDebtFull: toNumber(bond?.totalDebtFull || bond?.TotalDebtFull),
  status: normalizeText(bond?.status || bond?.Status),
  icbCodes: getIndustryCodes(bond),
});

const normalizeIndustryStat = (stat: any) => ({
  icbCode: normalizeText(stat?.icbCode || stat?.ICBCode || stat?.icbCodeLv1 || stat?.ICBCodeLv1 || stat?.icbCodeLv2 || stat?.ICBCodeLv2 || stat?.icbCodeLv3 || stat?.ICBCodeLv3 || stat?.icbCodeLv4 || stat?.ICBCodeLv4),
  icbName: normalizeText(stat?.icbName || stat?.ICBName || stat?.icbNameLv1 || stat?.ICBNameLv1 || stat?.icbNameLv2 || stat?.ICBNameLv2 || stat?.icbNameLv3 || stat?.ICBNameLv3 || stat?.icbNameLv4 || stat?.ICBNameLv4),
  bondCount: toNumber(stat?.bondCount || stat?.BondCount),
  totalIssuedVolume: toNumber(stat?.totalIssuedVolume || stat?.TotalIssuedVolume),
  totalIssuedValue: toNumber(stat?.totalIssuedValue || stat?.TotalIssuedValue),
  totalCurrentListedVolume: toNumber(stat?.totalCurrentListedVolume || stat?.TotalCurrentListedVolume),
  totalCurrentListedValue: toNumber(stat?.totalCurrentListedValue || stat?.TotalCurrentListedValue),
  totalDebtFull: toNumber(stat?.totalDebtFull || stat?.TotalDebtFull),
  totalRemainingDebt: toNumber(stat?.totalRemainingDebt || stat?.TotalRemainingDebt),
  avgRate: toNumber(stat?.avgRate || stat?.AvgRate),
  avgCouponRate: toNumber(stat?.avgCouponRate || stat?.AvgCouponRate),
  floatingRate: toNumber(stat?.floatingRate || stat?.avgFloatingRate || stat?.FloatingRate || stat?.AvgFloatingRate),
});

const buildKpiCards = (stats: any) => [
  { key: 'bondCount', label: 'Tong so ma trai phieu', value: stats.bondCount, unit: 'ma' },
  { key: 'totalIssuedVolume', label: 'Tong khoi luong phat hanh', value: stats.totalIssuedVolume, unit: 'trai phieu' },
  { key: 'totalIssuedValue', label: 'Tong gia tri phat hanh', value: stats.totalIssuedValue, valueBillionVnd: toBillion(stats.totalIssuedValue), unit: 'VND' },
  { key: 'totalRemainingDebt', label: 'Tong du no con lai', value: stats.totalRemainingDebt, valueBillionVnd: toBillion(stats.totalRemainingDebt), unit: 'VND' },
];

const aggregateIndustryStats = (stats: any[]) => stats.reduce(
  (acc, stat) => ({
    bondCount: acc.bondCount + toNumber(stat.bondCount),
    totalIssuedVolume: acc.totalIssuedVolume + toNumber(stat.totalIssuedVolume),
    totalIssuedValue: acc.totalIssuedValue + toNumber(stat.totalIssuedValue),
    totalRemainingDebt: acc.totalRemainingDebt + toNumber(stat.totalRemainingDebt),
  }),
  { bondCount: 0, totalIssuedVolume: 0, totalIssuedValue: 0, totalRemainingDebt: 0 },
);

async function getLevel1IndustryStats() {
  return getRows<any>(await fireantFetch('bonds/stats/industries', { query: { top: 1000, level: 1 } }))
    .map(normalizeIndustryStat)
    .filter((stat) => stat.icbCode);
}

async function getIssuerStats(top = 200) {
  return getRows<any>(await fireantFetch('bonds/stats/issuers/top-debt', { query: { top } }))
    .map((issuer) => ({
      issuerName: normalizeText(issuer?.issuerName || issuer?.name || issuer?.issuerSymbol),
      issuerSymbol: normalizeText(issuer?.issuerSymbol || issuer?.symbol).toUpperCase(),
      bondCount: toNumber(issuer?.bondCount),
      totalIssuedVolume: toNumber(issuer?.totalIssuedVolume),
      totalIssuedValue: toNumber(issuer?.totalIssuedValue),
      totalCurrentListedVolume: toNumber(issuer?.totalCurrentListedVolume),
      totalCurrentListedValue: toNumber(issuer?.totalCurrentListedValue),
      totalDebtFull: toNumber(issuer?.totalDebtFull),
      totalRemainingDebt: toNumber(issuer?.totalRemainingDebt),
      avgRate: toNumber(issuer?.avgRate),
      avgCouponRate: toNumber(issuer?.avgCouponRate),
      floatingRate: toNumber(issuer?.avgFloatingRate || issuer?.floatingRate),
    }))
    .filter((issuer) => issuer.issuerSymbol || issuer.issuerName);
}

async function getIssuerBonds(symbol: string) {
  const rows = getRows<any>(await fireantFetch(`bonds/issuer/${encodeURIComponent(symbol)}`));
  return rows.map(normalizeBondRow).filter((bond) => bond.bondCode);
}

async function getBondDetail(code: string) {
  return fireantFetch<any>(`bonds/${encodeURIComponent(code)}`);
}

const buildIssuerSummaries = (bonds: any[]) => {
  const issuers = new Map<string, any>();
  bonds.forEach((bond) => {
    const issuerSymbol = bond.issuerSymbol;
    if (!issuerSymbol) return;
    const current = issuers.get(issuerSymbol) || {
      issuerSymbol,
      issuerName: bond.issuerName || issuerSymbol,
      bondCount: 0,
      totalIssuedValue: 0,
      totalRemainingDebt: 0,
      totalDebtFull: 0,
      totalIssuedVolume: 0,
      totalCurrentListedValue: 0,
      totalCurrentListedVolume: 0,
    };

    const remainingDebt = bond.totalRemainingDebt || bond.currentListedValue || 0;
    const issuedValue = bond.totalIssuedValue || 0;
    current.bondCount += 1;
    current.totalIssuedValue += issuedValue;
    current.totalRemainingDebt += remainingDebt;
    current.totalDebtFull += bond.totalDebtFull || issuedValue;
    current.totalIssuedVolume += bond.currentListedVolume || 0;
    current.totalCurrentListedValue += bond.currentListedValue || 0;
    current.totalCurrentListedVolume += bond.currentListedVolume || 0;
    issuers.set(issuerSymbol, current);
  });

  return Array.from(issuers.values()).sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
};

const buildProjectedCashFlowBuckets = (bonds: any[]) => {
  const buckets = new Map<string, any>();
  const ensureBucket = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!buckets.has(key)) buckets.set(key, { key, label: `T${month}/${year}`, interest: 0, principal: 0, total: 0 });
    return buckets.get(key);
  };

  bonds.forEach((bond) => {
    if (Array.isArray(bond.cashFlows) && bond.cashFlows.length > 0) {
      bond.cashFlows.forEach((cashFlow: any) => {
        const bucket = ensureBucket(cashFlow.paymentDate);
        if (!bucket) return;
        bucket.interest += toBillion(cashFlow.interestAmount);
        bucket.principal += toBillion(cashFlow.principalAmount);
        bucket.total = bucket.interest + bucket.principal;
      });
      return;
    }

    const fallbackDate = bond.maturityDate || bond.paymentDate;
    const fallbackPrincipal = bond.currentListedValue || bond.totalRemainingDebt || bond.totalIssuedValue;
    const bucket = fallbackDate ? ensureBucket(fallbackDate) : null;
    if (!bucket || !fallbackPrincipal) return;
    bucket.principal += toBillion(fallbackPrincipal);
    bucket.total = bucket.interest + bucket.principal;
  });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
};

const buildTermDistribution = (bonds: any[]) => {
  const counts = new Map<string, number>();
  bonds.forEach((bond) => {
    const key = bond.tenorPeriod ? String(bond.tenorPeriod) : 'N/A';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
};

const buildInterestTypeDistribution = (bonds: any[]) => {
  const counts = new Map<string, number>();
  bonds.forEach((bond) => {
    const raw = String(bond.bondRateType || '').toLowerCase();
    const key = raw.includes('tha') || raw.includes('float') || raw.includes('thả') ? 'floating' : raw ? 'fixed' : 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
};

async function attachCashFlows(bonds: any[], detailLimit: number) {
  const limited = bonds.slice(0, detailLimit);
  const details = await mapWithConcurrency(limited, 8, async (bond) => {
    const detailData = await getBondDetail(bond.bondCode);
    const detail = detailData?.detail || {};
    const cashFlows = Array.isArray(detailData?.cashFlows) ? detailData.cashFlows : [];
    return {
      ...bond,
      issuerSymbol: normalizeText(detail.issuerSymbol || detail.IssuerSymbol || bond.issuerSymbol).toUpperCase(),
      issuerName: normalizeText(detail.issuerName || detail.IssuerName || bond.issuerName),
      issueDate: normalizeText(detail.issueDate || detail.IssueDate || bond.issueDate).split('T')[0],
      tenorPeriod: toNumber(detail.tenorPeriod || detail.TenorPeriod || bond.tenorPeriod),
      bondRate: toNumber(detail.bondRate || detail.BondRate || detail.interestRate || detail.couponRate || bond.bondRate),
      bondRateType: normalizeText(
        detail.bondRateType ||
          detail.BondRateType ||
          detail.interestRateType ||
          detail.couponRateType ||
          bond.bondRateType,
      ),
      totalIssuedValue: toNumber(detail.totalIssuedValue || bond.totalIssuedValue),
      currentListedValue: toNumber(detail.currentListedValue || bond.currentListedValue),
      currentListedVolume: toNumber(detail.currentListedVolume || bond.currentListedVolume),
      totalRemainingDebt: toNumber(detail.totalRemainingDebt || bond.totalRemainingDebt),
      totalDebtFull: toNumber(detail.totalDebtFull || bond.totalDebtFull),
      status: normalizeText(detail.status || detail.Status || bond.status),
      maturityDate: normalizeText(detail.maturityDate || bond.maturityDate).split('T')[0],
      cashFlows,
    };
  });

  const detailByCode = new Map(details.map((bond) => [bond.bondCode, bond]));
  return bonds.map((bond) => detailByCode.get(bond.bondCode) || bond);
}

async function fetchIndustryBonds(icbCode: string, includeDetails: boolean, detailLimit: number) {
  const includeCodes = icbCode === '30' ? ['30'] : [icbCode];
  const excludeCodes = icbCode === '30' ? new Set(['3010', '30202005']) : new Set<string>();
  const batches = await mapWithConcurrency(includeCodes, 3, async (code) => {
    const rows = getRows<any>(await fireantFetch('bonds/filter', {
      method: 'POST',
      body: { icbCode: code, statusID: 1 },
    }));
    return rows.map(normalizeBondRow);
  });

  const deduped = new Map<string, any>();
  batches.flat().forEach((bond) => {
    if (!bond.bondCode || bond.icbCodes.some((code: string) => excludeCodes.has(code))) return;
    if (!deduped.has(bond.bondCode)) deduped.set(bond.bondCode, bond);
  });

  const bonds = Array.from(deduped.values());
  return includeDetails ? attachCashFlows(bonds, detailLimit) : bonds;
}

async function getIndustryStatsForPage(industry: IndustryItem) {
  const [level1, level2, level4] = await Promise.all([
    fireantFetch<any[]>('bonds/stats/industries', { query: { top: 1000, level: 1 } }).catch(() => []),
    industry.id === 'Banking' || industry.id === 'Financials'
      ? fireantFetch<any[]>('bonds/stats/industries', { query: { top: 1000, level: 2 } }).catch(() => [])
      : Promise.resolve([]),
    industry.id === 'Securities' || industry.id === 'Financials'
      ? fireantFetch<any[]>('bonds/stats/industries', { query: { top: 1000, level: 4 } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const byCode = new Map(
    [...getRows(level1), ...getRows(level2), ...getRows(level4)].map((row: any) => {
      const normalized = normalizeIndustryStat(row);
      return [String(normalized.icbCode), normalized];
    }),
  );

  if (industry.id === 'Financials') {
    const financials = byCode.get('30') || normalizeIndustryStat({});
    const banking = byCode.get('3010') || normalizeIndustryStat({});
    const securities = byCode.get('30202005') || normalizeIndustryStat({});
    const issuedValue = Math.max(0, financials.totalIssuedValue - banking.totalIssuedValue - securities.totalIssuedValue);
    const weightedRate = (field: 'avgRate' | 'avgCouponRate' | 'floatingRate') => {
      if (!issuedValue) return 0;
      return (
        financials[field] * financials.totalIssuedValue -
        banking[field] * banking.totalIssuedValue -
        securities[field] * securities.totalIssuedValue
      ) / issuedValue;
    };
    return {
      ...financials,
      icbName: 'Tai chinh khac',
      bondCount: Math.max(0, financials.bondCount - banking.bondCount - securities.bondCount),
      totalIssuedVolume: Math.max(0, financials.totalIssuedVolume - banking.totalIssuedVolume - securities.totalIssuedVolume),
      totalIssuedValue: issuedValue,
      totalCurrentListedVolume: Math.max(0, financials.totalCurrentListedVolume - banking.totalCurrentListedVolume - securities.totalCurrentListedVolume),
      totalCurrentListedValue: Math.max(0, financials.totalCurrentListedValue - banking.totalCurrentListedValue - securities.totalCurrentListedValue),
      totalDebtFull: Math.max(0, financials.totalDebtFull - banking.totalDebtFull - securities.totalDebtFull),
      totalRemainingDebt: Math.max(0, financials.totalRemainingDebt - banking.totalRemainingDebt - securities.totalRemainingDebt),
      avgRate: weightedRate('avgRate'),
      avgCouponRate: weightedRate('avgCouponRate'),
      floatingRate: weightedRate('floatingRate'),
    };
  }

  return byCode.get(industry.code) || normalizeIndustryStat({});
}

function getSchema() {
  return {
    version: '1.0',
    basePath: '/api/page-data',
    endpoints: [
      {
        path: '/api/page-data/schema',
        method: 'GET',
        description: 'Mo ta schema cac page-data API cho AI/chatbot.',
      },
      {
        path: '/api/page-data/market-overview',
        method: 'GET',
        query: { includeCashFlows: '0|1 optional', detailLimit: 'number optional, default 120' },
        returns: ['cards', 'charts.topIssuers', 'charts.topInterestBonds', 'charts.valueByIndustry', 'charts.volumeByIndustry', 'charts.projectedCashFlow'],
      },
      {
        path: '/api/page-data/industry',
        method: 'GET',
        query: { industryId: 'Banking|Financials|RealEstate|...', icbCode: 'optional', includeCashFlows: '0|1 optional', detailLimit: 'number optional, default 150' },
        returns: ['cards', 'charts.debtRanking', 'charts.marketShare', 'charts.interestRates', 'charts.issuedValueTreemap', 'charts.debtAndLots', 'charts.projectedCashFlow'],
      },
      {
        path: '/api/page-data/issuer',
        method: 'GET',
        query: { symbol: 'issuer stock symbol, e.g. STB', q: 'optional search term' },
        returns: ['profile', 'financialData', 'bonds', 'cards', 'charts.termDistribution', 'charts.interestTypeDistribution', 'charts.projectedCashFlow'],
      },
      {
        path: '/api/page-data/watchlist',
        method: 'GET or POST',
        query: { codes: 'comma-separated bond codes for GET' },
        body: { codes: ['bond code list'], items: ['optional local watchlist items'] },
        returns: ['items', 'cards', 'charts.projectedCashFlow'],
      },
      {
        path: '/api/page-data/maturity',
        method: 'GET',
        query: { days: 'number, default 365' },
        returns: ['cards', 'bonds', 'charts.byWarningStatus', 'charts.byIssuer', 'charts.byMaturityMonth'],
      },
    ],
  };
}

async function buildMarketOverview(request: PageDataRequest) {
  const includeCashFlows = getQueryValue(request.query.includeCashFlows) === '1';
  const detailLimit = Math.min(getQueryNumber(request.query.detailLimit, 120), 300);
  const [industryStats, issuerStats, highYield] = await Promise.all([
    getLevel1IndustryStats(),
    getIssuerStats(200).catch(() => []),
    fireantFetch<any[]>('bonds/stats/bonds/high-yield', { query: { top: 10 } }).catch(() => []),
  ]);
  const totals = aggregateIndustryStats(industryStats);
  const topIssuers = issuerStats.slice(0, 10);
  const bondsForCashFlow = includeCashFlows
    ? await mapWithConcurrency(issuerStats.slice(0, 30), 6, async (issuer) => getIssuerBonds(issuer.issuerSymbol)).then((batches) => batches.flat())
    : [];
  const projectedBonds = includeCashFlows ? await attachCashFlows(bondsForCashFlow, detailLimit) : [];

  return {
    page: 'market-overview',
    source: { industryStats: '/bonds/stats/industries?top=1000&level=1' },
    cards: buildKpiCards(totals),
    charts: {
      topIssuers: {
        title: 'Top doanh nghiep theo du no / gia tri phat hanh',
        rows: topIssuers,
      },
      topInterestBonds: {
        title: 'Top trai phieu lai suat cao',
        rows: getRows(highYield),
      },
      valueByIndustry: {
        title: 'Gia tri phat hanh va gia tri niem yet theo nganh',
        unit: 'VND',
        rows: industryStats.map((item) => ({
          icbCode: item.icbCode,
          icbName: item.icbName,
          totalIssuedValue: item.totalIssuedValue,
          totalCurrentListedValue: item.totalCurrentListedValue,
          totalIssuedValueBillion: toBillion(item.totalIssuedValue),
          totalCurrentListedValueBillion: toBillion(item.totalCurrentListedValue),
        })),
      },
      volumeByIndustry: {
        title: 'Khoi luong trai phieu theo nganh',
        unit: 'trai phieu',
        rows: industryStats.map((item) => ({
          icbCode: item.icbCode,
          icbName: item.icbName,
          totalIssuedVolume: item.totalIssuedVolume,
          totalCurrentListedVolume: item.totalCurrentListedVolume,
        })),
      },
      projectedCashFlow: {
        title: 'Dong tien du kien',
        rows: buildProjectedCashFlowBuckets(projectedBonds),
        note: includeCashFlows ? undefined : 'Set includeCashFlows=1 de hydrate chi tiet cash flow.',
      },
    },
    raw: { industryStats, issuerStats },
  };
}

async function buildIndustry(request: PageDataRequest) {
  const industryId = getQueryValue(request.query.industryId);
  const icbCode = getQueryValue(request.query.icbCode);
  const industry = INDUSTRY_BY_ID[industryId] || INDUSTRY_BY_CODE[icbCode] || INDUSTRY_BY_ID.Banking;
  const includeCashFlows = getQueryValue(request.query.includeCashFlows) !== '0';
  const detailLimit = Math.min(getQueryNumber(request.query.detailLimit, 150), 500);
  const [industryStats, bonds] = await Promise.all([
    getIndustryStatsForPage(industry),
    fetchIndustryBonds(industry.code, includeCashFlows, detailLimit),
  ]);
  const issuerSummaries = buildIssuerSummaries(bonds);

  return {
    page: 'industry',
    params: { industryId: industry.id, icbCode: industry.code },
    source: {
      stats: `/bonds/stats/industries?level=${industry.level}`,
      bonds: '/bonds/filter',
    },
    cards: [
      { key: 'totalIssuedVolume', label: 'Khoi luong phat hanh', value: industryStats.totalIssuedVolume, unit: 'trai phieu' },
      { key: 'totalIssuedValue', label: 'Tong gia tri phat hanh', value: industryStats.totalIssuedValue, valueBillionVnd: toBillion(industryStats.totalIssuedValue), unit: 'VND' },
      { key: 'totalDebtFull', label: 'Tong du no ban dau', value: industryStats.totalDebtFull, valueBillionVnd: toBillion(industryStats.totalDebtFull), unit: 'VND' },
      { key: 'totalCurrentListedVolume', label: 'Khoi luong niem yet', value: industryStats.totalCurrentListedVolume, unit: 'trai phieu' },
      { key: 'totalCurrentListedValue', label: 'Gia tri niem yet', value: industryStats.totalCurrentListedValue, valueBillionVnd: toBillion(industryStats.totalCurrentListedValue), unit: 'VND' },
      { key: 'totalRemainingDebt', label: 'Du no con lai', value: industryStats.totalRemainingDebt, valueBillionVnd: toBillion(industryStats.totalRemainingDebt), unit: 'VND' },
    ],
    charts: {
      debtRanking: issuerSummaries.map((issuer) => ({ issuerSymbol: issuer.issuerSymbol, issuerName: issuer.issuerName, totalRemainingDebt: issuer.totalRemainingDebt, totalRemainingDebtBillion: toBillion(issuer.totalRemainingDebt) })),
      marketShare: issuerSummaries.map((issuer) => ({ issuerSymbol: issuer.issuerSymbol, issuerName: issuer.issuerName, value: issuer.totalRemainingDebt })),
      interestRates: [
        { name: 'avgRate', value: industryStats.avgRate },
        { name: 'avgCouponRate', value: industryStats.avgCouponRate },
        { name: 'floatingRate', value: industryStats.floatingRate },
      ],
      issuedValueTreemap: issuerSummaries.map((issuer) => ({ issuerSymbol: issuer.issuerSymbol, issuerName: issuer.issuerName, value: issuer.totalIssuedValue, valueBillionVnd: toBillion(issuer.totalIssuedValue) })),
      debtAndLots: issuerSummaries.map((issuer) => ({ issuerSymbol: issuer.issuerSymbol, issuerName: issuer.issuerName, totalRemainingDebt: issuer.totalRemainingDebt, bondCount: issuer.bondCount })),
      projectedCashFlow: buildProjectedCashFlowBuckets(bonds),
    },
    raw: { industryStats, issuerSummaries, bonds },
  };
}

async function buildIssuer(request: PageDataRequest) {
  const symbol = getQueryValue(request.query.symbol).toUpperCase();
  const q = getQueryValue(request.query.q);
  if (!symbol && q) {
    const results = await fireantFetch<any>('symbols/search', { query: { q } }).catch(() => []);
    return { page: 'issuer-search', query: q, results: getRows(results) };
  }
  if (!symbol) return { page: 'issuer', error: 'Missing symbol query parameter' };

  const [bonds, profile, financialData] = await Promise.all([
    getIssuerBonds(symbol),
    fireantFetch<any>(`symbols/${encodeURIComponent(symbol)}/profile`).catch(() => null),
    fireantFetch<any>(`symbols/${encodeURIComponent(symbol)}/financial-data`, { query: { type: 'Q', count: 4 } }).catch(() => null),
  ]);
  const detailedBonds = await attachCashFlows(bonds, Math.min(getQueryNumber(request.query.detailLimit, 120), 300));
  const totals = buildIssuerSummaries(detailedBonds)[0] || {};

  return {
    page: 'issuer',
    params: { symbol },
    profile,
    financialData,
    cards: [
      { key: 'bondCount', label: 'So ma trai phieu', value: totals.bondCount || detailedBonds.length, unit: 'ma' },
      { key: 'totalIssuedValue', label: 'Tong gia tri phat hanh', value: totals.totalIssuedValue || 0, valueBillionVnd: toBillion(totals.totalIssuedValue), unit: 'VND' },
      { key: 'totalRemainingDebt', label: 'Du no con lai', value: totals.totalRemainingDebt || 0, valueBillionVnd: toBillion(totals.totalRemainingDebt), unit: 'VND' },
    ],
    charts: {
      termDistribution: buildTermDistribution(detailedBonds),
      interestTypeDistribution: buildInterestTypeDistribution(detailedBonds),
      projectedCashFlow: buildProjectedCashFlowBuckets(detailedBonds),
    },
    bonds: detailedBonds,
  };
}

async function buildWatchlist(request: PageDataRequest) {
  const codes = getCodes(request);
  if (codes.length === 0) {
    return {
      page: 'watchlist',
      items: [],
      note: 'Watchlist nam trong localStorage cua browser; gui codes=AAA,BBB hoac POST { codes: [...] } de hydrate du lieu.',
    };
  }
  const bonds = await attachCashFlows(codes.map((code) => ({ bondCode: code })), Math.min(codes.length, 200));
  const totals = bonds.reduce(
    (acc, bond) => ({
      bondCount: acc.bondCount + 1,
      totalIssuedValue: acc.totalIssuedValue + toNumber(bond.totalIssuedValue),
      totalCurrentListedValue: acc.totalCurrentListedValue + toNumber(bond.currentListedValue),
    }),
    { bondCount: 0, totalIssuedValue: 0, totalCurrentListedValue: 0 },
  );

  return {
    page: 'watchlist',
    cards: [
      { key: 'bondCount', label: 'So ma theo doi', value: totals.bondCount, unit: 'ma' },
      { key: 'totalIssuedValue', label: 'Tong gia tri phat hanh', value: totals.totalIssuedValue, valueBillionVnd: toBillion(totals.totalIssuedValue), unit: 'VND' },
      { key: 'totalCurrentListedValue', label: 'Tong gia tri niem yet', value: totals.totalCurrentListedValue, valueBillionVnd: toBillion(totals.totalCurrentListedValue), unit: 'VND' },
    ],
    charts: {
      projectedCashFlow: buildProjectedCashFlowBuckets(bonds),
      termDistribution: buildTermDistribution(bonds),
      interestTypeDistribution: buildInterestTypeDistribution(bonds),
    },
    items: bonds,
  };
}

async function buildMaturity(request: PageDataRequest) {
  const days = getQueryNumber(request.query.days, 365);
  const rows = getRows<any>(await fireantFetch('bonds/stats/bonds/maturing-soon', { query: { days } }))
    .map(normalizeBondRow)
    .filter((bond) => bond.bondCode);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bonds = rows.map((bond) => {
    const maturityDate = new Date(bond.maturityDate);
    maturityDate.setHours(0, 0, 0, 0);
    const daysLeft = Number.isNaN(maturityDate.getTime())
      ? 0
      : Math.max(0, Math.ceil((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const warningStatus = daysLeft < 30 ? 'very-near' : daysLeft <= 90 ? 'near' : daysLeft <= 180 ? 'monitor' : daysLeft <= 270 ? 'medium-term' : 'long-term';
    return { ...bond, daysLeft, warningStatus };
  });
  const byWarningStatus = Object.entries(bonds.reduce<Record<string, number>>((acc, bond) => {
    acc[bond.warningStatus] = (acc[bond.warningStatus] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));
  const byIssuer = Object.entries(bonds.reduce<Record<string, number>>((acc, bond) => {
    const key = bond.issuerSymbol || 'N/A';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 20);
  const byMaturityMonth = Object.entries(bonds.reduce<Record<string, number>>((acc, bond) => {
    const month = bond.maturityDate ? bond.maturityDate.slice(0, 7) : 'N/A';
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));

  return {
    page: 'maturity',
    params: { days },
    cards: [
      { key: 'bondCount', label: 'So ma sap dao han', value: bonds.length, unit: 'ma' },
      { key: 'veryNearCount', label: 'Dao han duoi 30 ngay', value: byWarningStatus.find((item) => item.name === 'very-near')?.value || 0, unit: 'ma' },
    ],
    charts: { byWarningStatus, byIssuer, byMaturityMonth },
    bonds,
  };
}

export async function handlePageDataRequest(request: PageDataRequest): Promise<PageDataResponse> {
  const view = request.view || getQueryValue(request.query.view) || 'schema';
  try {
    if (view === 'schema') return { status: 200, data: getSchema() };
    if (view === 'market-overview') return { status: 200, data: await buildMarketOverview(request) };
    if (view === 'industry') return { status: 200, data: await buildIndustry(request) };
    if (view === 'issuer') return { status: 200, data: await buildIssuer(request) };
    if (view === 'watchlist') return { status: 200, data: await buildWatchlist(request) };
    if (view === 'maturity') return { status: 200, data: await buildMaturity(request) };

    return { status: 404, data: { error: 'Unknown page-data view', view, schema: getSchema() } };
  } catch (error: any) {
    return {
      status: 500,
      data: {
        error: 'Failed to build page data',
        view,
        message: error?.message || 'Unknown error',
      },
    };
  }
}
