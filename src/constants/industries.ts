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

const PROFILE_ICB_PREFIX_TO_LABEL_KEY: Array<{ prefix: string; labelKey: string }> = [
  { prefix: '953', labelKey: 'technologyIndustry' },
  { prefix: '95', labelKey: 'technologyIndustry' },
  { prefix: '878', labelKey: 'Securities' },
  { prefix: '87', labelKey: 'Securities' },
  { prefix: '835', labelKey: 'Banking' },
  { prefix: '83', labelKey: 'Banking' },
  { prefix: '857', labelKey: 'financialsOtherIndustry' },
  { prefix: '85', labelKey: 'financialsOtherIndustry' },
  { prefix: '863', labelKey: 'RealEstate' },
  { prefix: '86', labelKey: 'RealEstate' },
  { prefix: '757', labelKey: 'energyIndustry' },
  { prefix: '753', labelKey: 'infrastructureServicesIndustry' },
  { prefix: '75', labelKey: 'infrastructureServicesIndustry' },
  { prefix: '653', labelKey: 'telecommunicationsIndustry' },
  { prefix: '65', labelKey: 'telecommunicationsIndustry' },
  { prefix: '537', labelKey: 'consumerDiscretionaryIndustry' },
  { prefix: '53', labelKey: 'consumerDiscretionaryIndustry' },
  { prefix: '376', labelKey: 'consumerDiscretionaryIndustry' },
  { prefix: '37', labelKey: 'consumerDiscretionaryIndustry' },
  { prefix: '357', labelKey: 'consumerStaplesIndustry' },
  { prefix: '35', labelKey: 'consumerStaplesIndustry' },
  { prefix: '457', labelKey: 'healthcareIndustry' },
  { prefix: '45', labelKey: 'healthcareIndustry' },
  { prefix: '277', labelKey: 'industrialsIndustry' },
  { prefix: '27', labelKey: 'industrialsIndustry' },
  { prefix: '235', labelKey: 'industrialsIndustry' },
  { prefix: '23', labelKey: 'industrialsIndustry' },
  { prefix: '175', labelKey: 'basicMaterialsIndustry' },
  { prefix: '17', labelKey: 'basicMaterialsIndustry' },
];

const resolveIndustryItemByCode = (value: string) => {
  const normalizedCode = String(value || '').trim();
  if (!normalizedCode || !/^\d+$/.test(normalizedCode)) return null;

  const directIndustry = [...INDUSTRY_NAV_ITEMS]
    .sort((left, right) => (right.icbCode || right.code).length - (left.icbCode || left.code).length)
    .find((item) => {
      const itemCode = String(item.icbCode || item.code || '').trim();
      return itemCode && normalizedCode.startsWith(itemCode);
    });

  if (directIndustry) return directIndustry;

  const profileMapped = PROFILE_ICB_PREFIX_TO_LABEL_KEY.find((entry) => normalizedCode.startsWith(entry.prefix));
  if (!profileMapped) return null;

  return INDUSTRY_NAV_ITEMS.find((item) => item.labelKey === profileMapped.labelKey) || null;
};

const BANKING_LABEL_KEY = 'Banking';
const SECURITIES_LABEL_KEY = 'Securities';
const FINANCIALS_OTHER_LABEL_KEY = 'financialsOtherIndustry';

const normalizeIndustryMatcherText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const BANKING_PATTERNS = [
  'ngan hang',
  'banking',
  'commercial bank',
  'joint stock commercial bank',
  'tmcp',
  'bank',
];

const SECURITIES_PATTERNS = [
  'chung khoan',
  'cong ty chung khoan',
  'ctck',
  'securities',
  'securites',
  'securities corporation',
  'securities joint stock company',
];

const FINANCIALS_OTHER_PATTERNS = [
  'tai chinh',
  'financial',
  'finance',
  'leasing',
  'bao hiem',
  'insurance',
  'asset management',
  'quan ly quy',
  'fund management',
];

const PUBLIC_ISSUER_PATTERNS = [
  'kho bac',
  'bo tai chinh',
  'bo ',
  'uy ban nhan dan',
  'ubnd',
  'chinh phu',
  'nha nuoc',
  'thanh pho',
  'tinh ',
  ' tinh',
  'so ',
  ' so ',
];

const matchesIndustryPattern = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));

const inferIndustryKeyFromText = (value: unknown) => {
  const normalized = normalizeIndustryMatcherText(value);
  if (!normalized) return '';

  if (matchesIndustryPattern(normalized, SECURITIES_PATTERNS)) {
    return SECURITIES_LABEL_KEY;
  }

  if (matchesIndustryPattern(normalized, BANKING_PATTERNS)) {
    return BANKING_LABEL_KEY;
  }

  if (
    !matchesIndustryPattern(normalized, PUBLIC_ISSUER_PATTERNS)
    && matchesIndustryPattern(normalized, FINANCIALS_OTHER_PATTERNS)
  ) {
    return FINANCIALS_OTHER_LABEL_KEY;
  }

  return '';
};

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
      const byCode = resolveIndustryItemByCode(value);
      if (byCode) return byCode.labelKey;
    }

    const resolved = INDUSTRY_LABEL_KEY_BY_ALIAS[normalized];
    if (resolved) return resolved;
  }

  return '';
};

export const resolveIndustryKeyFromCandidates = (...candidates: Array<unknown>) => {
  const resolvedKeys: string[] = [];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value || value.toLowerCase() === 'n/a') continue;

    if (/^\d+$/.test(value)) {
      const byCode = resolveIndustryItemByCode(value);
      if (byCode) {
        resolvedKeys.push(byCode.labelKey);
        continue;
      }
    }

    const resolved = resolveIndustryLabelKey(value);
    if (resolved) {
      resolvedKeys.push(resolved);
      continue;
    }

    const inferred = inferIndustryKeyFromText(value);
    if (inferred) resolvedKeys.push(inferred);
  }

  const prioritized = resolvedKeys.find((key) => key === SECURITIES_LABEL_KEY || key === BANKING_LABEL_KEY);
  if (prioritized) return prioritized;

  const firstNonFinancials = resolvedKeys.find((key) => key && key !== FINANCIALS_OTHER_LABEL_KEY);
  if (firstNonFinancials) return firstNonFinancials;

  return resolvedKeys[0] || '';
};

export const resolveEnterpriseIndustryFromCandidates = (...candidates: Array<unknown>) =>
  resolveIndustryKeyFromCandidates(...candidates);

export const buildIndustrySymbolLookup = (symbolGroups: Record<string, string[]>) => {
  const lookup = new Map<string, string>();

  INDUSTRY_NAV_ITEMS.forEach((item) => {
    (symbolGroups[item.id] || []).forEach((symbol) => {
      const key = String(symbol || '').trim().toUpperCase();
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
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
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
