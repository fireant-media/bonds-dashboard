export const dashboardQueryKeys = {
  marketOverview: () => ['dashboard', 'market-overview'] as const,
  maturingBonds: (days: number) => ['dashboard', 'maturing-bonds', days] as const,
  industryDashboard: (industryId: string) => ['dashboard', 'industry', industryId] as const,
  sidebarIndustryIssuedValues: () => ['dashboard', 'sidebar-industry-issued-values'] as const,
  industrySymbols: () => ['dashboard', 'industry-symbols'] as const,
};

export const bondQueryKeys = {
  detail: (code: string) => ['bond', 'detail', code.toUpperCase()] as const,
  issuerProfile: (symbol: string) => ['bond', 'issuer-profile', symbol.toUpperCase()] as const,
  watchlist: (signature: string) => ['watchlist', 'enriched', signature] as const,
};

export const newsQueryKeys = {
  list: (symbol?: string | null) => ['news', symbol?.trim().toUpperCase() || 'all'] as const,
};
