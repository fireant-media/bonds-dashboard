export interface IndustryNavItem {
  id: string;
  labelKey: string;
  code: string;
  statsTop: number;
  statsLevel: number;
  targetNames: string[];
  priority: number;
  icbCode?: string;
}

export const INDUSTRY_NAV_ITEMS: IndustryNavItem[] = [
  { id: 'Technology', labelKey: 'technologyIndustry', code: '10', statsTop: 1000, statsLevel: 1, targetNames: ['Công nghệ'], priority: 40, icbCode: '10' },
  { id: 'Financials', labelKey: 'financialsOtherIndustry', code: '30', statsTop: 1000, statsLevel: 1, targetNames: ['Tài chính'], priority: 30, icbCode: '30' },
  { id: 'Banking', labelKey: 'Banking', code: '3010', statsTop: 10, statsLevel: 2, targetNames: ['Ngân hàng'], priority: 20, icbCode: '3010' },
  { id: 'Securities', labelKey: 'Securities', code: '30202005', statsTop: 20, statsLevel: 4, targetNames: ['Công ty chứng khoán'], priority: 10, icbCode: '30202005' },
  { id: 'RealEstate', labelKey: 'RealEstate', code: '35', statsTop: 10, statsLevel: 1, targetNames: ['Bất động sản'], priority: 70, icbCode: '35' },
  { id: 'ConsumerDiscretionary', labelKey: 'consumerDiscretionaryIndustry', code: '40', statsTop: 1000, statsLevel: 1, targetNames: ['Hàng tiêu dùng không thiết yếu'], priority: 80, icbCode: '40' },
  { id: 'ConsumerStaples', labelKey: 'consumerStaplesIndustry', code: '45', statsTop: 1000, statsLevel: 1, targetNames: ['Hàng tiêu dùng cơ bản'], priority: 90, icbCode: '45' },
  { id: 'Industrials', labelKey: 'industrialsIndustry', code: '50', statsTop: 1000, statsLevel: 1, targetNames: ['Công nghiệp'], priority: 100, icbCode: '50' },
  { id: 'BasicMaterials', labelKey: 'basicMaterialsIndustry', code: '55', statsTop: 1000, statsLevel: 1, targetNames: ['Vật liệu cơ bản'], priority: 110, icbCode: '55' },
  { id: 'Energy', labelKey: 'energyIndustry', code: '60', statsTop: 1000, statsLevel: 1, targetNames: ['Năng lượng'], priority: 120, icbCode: '60' },
  { id: 'InfrastructureServices', labelKey: 'infrastructureServicesIndustry', code: '65', statsTop: 1000, statsLevel: 1, targetNames: ['Các dịch vụ hạ tầng'], priority: 130, icbCode: '65' },
];

export const INDUSTRY_FILTER_CODE_GROUPS: Record<string, { include: string[]; exclude: string[] }> = {
  Financials: {
    include: ['30'],
    exclude: ['3010', '30202005'],
  },
  Banking: {
    include: ['3010'],
    exclude: [],
  },
  Securities: {
    include: ['30202005'],
    exclude: [],
  },
};

export const INDUSTRY_NAV_ITEM_BY_ID = INDUSTRY_NAV_ITEMS.reduce<Record<string, IndustryNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const INDUSTRY_LABEL_KEYS = INDUSTRY_NAV_ITEMS.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.labelKey;
  return acc;
}, {});

export const normalizeIndustryName = (value: unknown) =>
  String(value || '').trim().toLowerCase();

const INDUSTRY_LABEL_KEY_BY_ALIAS = INDUSTRY_NAV_ITEMS.reduce<Record<string, string>>((acc, item) => {
  const aliases = new Set<string>([
    item.id,
    item.labelKey,
    item.code,
    item.icbCode || '',
    ...item.targetNames,
  ]);

  if (item.id === 'Financials') {
    aliases.add('financialsIndustry');
    aliases.add('Tài chính');
    aliases.add('Tài chính khác');
  }

  aliases.forEach((alias) => {
    const normalized = normalizeIndustryName(alias);
    if (normalized) {
      acc[normalized] = item.labelKey;
    }
  });

  return acc;
}, {});

export const resolveIndustryLabelKey = (...candidates: Array<unknown>) => {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value || value.toLowerCase() === 'n/a') continue;

    const normalized = normalizeIndustryName(value);
    if (/^\d+$/.test(value)) {
      const byCode = INDUSTRY_NAV_ITEMS.find((item) => item.code === value || item.icbCode === value);
      if (byCode) return byCode.labelKey;
    }

    const resolved = INDUSTRY_LABEL_KEY_BY_ALIAS[normalized];
    if (resolved) return resolved;
  }

  return '';
};

export const resolveIndustryKeyFromCandidates = (...candidates: Array<unknown>) => {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value || value.toLowerCase() === 'n/a') continue;

    if (/^\d+$/.test(value)) {
      const byCode = INDUSTRY_NAV_ITEMS.find((item) => item.code === value || item.icbCode === value);
      if (byCode) return byCode.labelKey;
    }

    const resolved = resolveIndustryLabelKey(value);
    if (resolved) return resolved;
  }

  return '';
};

export const resolveEnterpriseIndustryFromCandidates = (...candidates: Array<unknown>) =>
  resolveIndustryKeyFromCandidates(...candidates);

export const buildIndustrySymbolLookup = (symbolGroups: Record<string, string[]>) => {
  const lookup = new Map<string, string>();

  INDUSTRY_NAV_ITEMS.forEach((item) => {
    (symbolGroups[item.id] || []).forEach((symbol) => {
      const key = String(symbol || '').trim();
      if (key) {
        lookup.set(key, item.labelKey);
      }
    });
  });

  return lookup;
};

export const resolveIndustryKeyFromSymbolGroups = (
  symbol: unknown,
  symbolLookup: Map<string, string>,
  ...candidates: Array<unknown>
) => {
  const normalizedSymbol = String(symbol || '').trim();
  if (normalizedSymbol) {
    const resolved = symbolLookup.get(normalizedSymbol);
    if (resolved) return resolved;
  }

  return resolveIndustryKeyFromCandidates(...candidates);
};

export const buildEnterpriseIndustryOptions = (
  enterprises: Array<{ industry?: string; issuedValue?: number }>,
  excluded = new Set(['telecommunicationsIndustry', 'healthcareIndustry'])
) => {
  const totals = enterprises.reduce<Record<string, { issuedValue: number }>>((acc, enterprise) => {
    const industry = resolveEnterpriseIndustryFromCandidates(enterprise.industry);
    if (!industry || excluded.has(industry)) return acc;
    if (!acc[industry]) acc[industry] = { issuedValue: 0 };
    acc[industry].issuedValue += Number(enterprise.issuedValue || 0);
    return acc;
  }, {});

  return INDUSTRY_NAV_ITEMS
    .filter((item) => !excluded.has(item.labelKey))
    .map((item, index) => ({
      value: item.labelKey,
      label: item.labelKey,
      issuedValue: totals[item.labelKey]?.issuedValue || 0,
      order: index,
    }))
    .sort((a, b) => b.issuedValue - a.issuedValue || a.order - b.order);
};

export const findIndustryStats = (stats: unknown, item: IndustryNavItem) => {
  const list = Array.isArray(stats) ? stats : [];
  const targetNames = item.targetNames.map(normalizeIndustryName);
  return list.find((entry: any) => String(entry?.icbCode || '') === item.code)
    || list.find((entry: any) => targetNames.includes(normalizeIndustryName(entry?.icbName)))
    || null;
};

export const getIndustryIssuedValue = (stats: any) => {
  const value = Number(stats?.totalIssuedValue);
  return Number.isFinite(value) ? value : 0;
};

export const hasBondIssuers = (stats: any) => {
  if (!stats || getIndustryIssuedValue(stats) <= 0) return false;

  return [
    stats.bondCount,
    stats.totalIssuedVolume,
    stats.totalCurrentListedVolume,
    stats.totalRemainingDebt,
    stats.totalDebtFull,
  ].some((value) => Number(value) > 0);
};

export const getIndustryStatsIcbCode = (stats: any) => {
  const candidate =
    stats?.icbCode ??
    stats?.icbId ??
    stats?.icbCodeLv1 ??
    stats?.icbCodeLv2 ??
    stats?.industryCode;

  return candidate ? String(candidate) : undefined;
};

export const getIndustryFilterCodes = (industryId: string) => {
  const industry = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  const override = INDUSTRY_FILTER_CODE_GROUPS[industry.id];

  const include = (override?.include?.length ? override.include : [industry.icbCode || industry.code]).filter(Boolean);
  const exclude = (override?.exclude || []).filter(Boolean);

  return {
    include: Array.from(new Set(include.map(String))),
    exclude: Array.from(new Set(exclude.map(String))),
  };
};

export const isFinancialsResidualIndustry = (industryId: string) => {
  const industry = INDUSTRY_NAV_ITEM_BY_ID[industryId] || INDUSTRY_NAV_ITEMS[0];
  return industry.id === 'Financials';
};
