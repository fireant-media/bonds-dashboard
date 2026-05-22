export const CHART_BASE_PALETTE = [
  '#3fb1e3',
  '#6be6c1',
  '#626c91',
  '#a0a7e6',
  '#c4ebad',
  '#96dee8',
];
export const CHART_PALETTE = [...CHART_BASE_PALETTE];

export const getChartTooltip = (isDark: boolean) => ({
  backgroundColor: isDark ? '#0f172a' : '#ffffff',
  borderColor: isDark ? '#334155' : '#e5e7eb',
  borderWidth: 1,
  extraCssText: 'box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16); border-radius: 8px;',
  textStyle: {
    color: isDark ? '#f8fafc' : '#111827',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: 'normal' as const,
  },
});

export const getChartColor = (index: number) => CHART_BASE_PALETTE[index % CHART_BASE_PALETTE.length];

export const getAdaptiveBarWidth = (categoryCount: number) => {
  if (categoryCount <= 1) return '20%';
  if (categoryCount <= 2) return '35%';
  if (categoryCount <= 3) return '45%';
  if (categoryCount <= 5) return '55%';
  return '65%';
};
