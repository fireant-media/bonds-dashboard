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
  { id: 'Telecommunications', labelKey: 'telecommunicationsIndustry', code: '15', statsTop: 1000, statsLevel: 1, targetNames: ['Viễn thông'], priority: 50, icbCode: '15' },
  { id: 'HealthCare', labelKey: 'healthcareIndustry', code: '20', statsTop: 1000, statsLevel: 1, targetNames: ['Chăm sóc sức khỏe', 'Dược phẩm & Y tế', 'Dược phẩm và Y tế', 'Y tế'], priority: 60, icbCode: '20' },
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
