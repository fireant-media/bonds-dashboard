export const dashboardQueryKeys = {
  marketOverview: () => ['dashboard', 'market-overview'] as const,
  marketOverviewIssuerStats: () => ['dashboard', 'market-overview', 'issuer-stats'] as const,
  marketOverviewTopInterest: () => ['dashboard', 'market-overview', 'top-interest'] as const,
  marketOverviewIndustryData: () => ['dashboard', 'market-overview', 'industry-data'] as const,
  marketOverviewProjectedCashFlows: () => ['dashboard', 'market-overview', 'projected-cash-flows'] as const,
  maturingBonds: (days: number) => ['dashboard', 'maturing-bonds', days] as const,
  industryDashboard: (industryId: string) => ['dashboard', 'industry', industryId] as const,
  industryDashboardBase: (industryId: string) => ['dashboard', 'industry', 'base', industryId] as const,
  industryDashboardFull: (industryId: string) => ['dashboard', 'industry', 'full', industryId] as const,
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
