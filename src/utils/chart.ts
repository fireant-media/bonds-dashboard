export const CHART_BASE_PALETTE = [
  '#3FB1E3',
  '#6BE6C1',
  '#626C91',
  '#A0A7E6',
  '#C4EBAD',
  '#96DEE8',
];

export const CHART_PALETTE = [...CHART_BASE_PALETTE];

export type ChartThemeMode = 'light' | 'dark';

export const chartThemes = {
  light: {
    bg: '#F5F7FB',
    panel: '#FFFFFF',
    text: '#1E293B',
    subText: '#64748B',
    disabledText: '#94A3B8',
    border: 'rgba(15,23,42,0.06)',
    grid: 'rgba(15,23,42,0.05)',
    axisLine: 'rgba(15,23,42,0.08)',
    tooltipShadow: '0 8px 30px rgba(15,23,42,0.08)',
    pieBorder: '#FFFFFF',
    lineWidth: 3,
    lineShadowBlur: 0,
    lineShadowColor: 'rgba(63,177,227,0)',
    barShadowBlur: 10,
    barShadowColor: 'rgba(63,177,227,0.12)',
    gradientStops: {
      blue: ['rgba(63,177,227,0.28)', 'rgba(63,177,227,0.01)'],
      green: ['rgba(107,230,193,0.24)', 'rgba(107,230,193,0.01)'],
      purple: ['rgba(160,167,230,0.22)', 'rgba(160,167,230,0.01)'],
    },
  },
  dark: {
    bg: '#0F172A',
    panel: '#131C31',
    text: '#E5E7EB',
    subText: '#94A3B8',
    disabledText: '#64748B',
    border: 'rgba(255,255,255,0.06)',
    grid: 'rgba(255,255,255,0.06)',
    axisLine: 'rgba(255,255,255,0.12)',
    tooltipShadow: '0 12px 36px rgba(0,0,0,0.28)',
    pieBorder: '#0F172A',
    lineWidth: 4,
    lineShadowBlur: 12,
    lineShadowColor: 'rgba(63,177,227,0.35)',
    barShadowBlur: 14,
    barShadowColor: 'rgba(63,177,227,0.25)',
    gradientStops: {
      blue: ['rgba(63,177,227,0.65)', 'rgba(63,177,227,0.02)'],
      green: ['rgba(107,230,193,0.55)', 'rgba(107,230,193,0.02)'],
      purple: ['rgba(160,167,230,0.55)', 'rgba(160,167,230,0.02)'],
    },
  },
} as const;

export const getChartTheme = (isDark: boolean) => chartThemes[isDark ? 'dark' : 'light'];

type LinearGradient = {
  type: 'linear';
  x: number;
  y: number;
  x2: number;
  y2: number;
  colorStops: Array<{ offset: number; color: string }>;
};

const verticalGradient = (start: string, end: string): LinearGradient => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: start },
    { offset: 1, color: end },
  ],
});

const horizontalGradient = (start: string, end: string): LinearGradient => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 1,
  y2: 0,
  colorStops: [
    { offset: 0, color: start },
    { offset: 1, color: end },
  ],
});

export const getChartAreaGradient = (isDark: boolean, index = 0) => {
  const theme = getChartTheme(isDark);
  const stops = index % 3 === 1
    ? theme.gradientStops.green
    : index % 3 === 2
      ? theme.gradientStops.purple
      : theme.gradientStops.blue;

  return verticalGradient(stops[0], stops[1]);
};

const BAR_GRADIENT_PAIRS = [
  ['#3FB1E3', '#96DEE8'],
  ['#626C91', '#A0A7E6'],
  ['#6BE6C1', '#C4EBAD'],
] as const;

export const getChartBarGradient = (horizontal = false, index = 0) => {
  const pair = BAR_GRADIENT_PAIRS[index % BAR_GRADIENT_PAIRS.length];
  return horizontal
    ? horizontalGradient(pair[0], pair[1])
    : verticalGradient(pair[0], pair[1]);
};

export const getChartTooltip = (isDark: boolean) => {
  const theme = getChartTheme(isDark);

  return {
    backgroundColor: isDark ? 'rgba(19,28,49,0.96)' : 'rgba(255,255,255,0.96)',
    borderColor: theme.border,
    borderWidth: 1,
    extraCssText: `box-shadow: ${theme.tooltipShadow}; border-radius: 12px; backdrop-filter: blur(16px);`,
    textStyle: {
      color: theme.text,
      fontFamily: 'Manrope',
      fontSize: 12,
      fontWeight: 'normal' as const,
    },
  };
};

export const getChartColor = (index: number) => CHART_BASE_PALETTE[index % CHART_BASE_PALETTE.length];

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const mergePlain = (base: Record<string, any>, value: unknown) => (
  isPlainObject(value) ? { ...base, ...value } : base
);

const asArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
};

const getFirstAxis = (option: any, axisKey: 'xAxis' | 'yAxis') => {
  const axis = option?.[axisKey];
  return Array.isArray(axis) ? axis[0] : axis;
};

const isHorizontalBarChart = (option: any) => {
  const xAxis = getFirstAxis(option, 'xAxis');
  const yAxis = getFirstAxis(option, 'yAxis');
  return xAxis?.type === 'value' && yAxis?.type === 'category';
};

const getGradientLegendColor = (color: unknown) => {
  if (isPlainObject(color) && Array.isArray(color.colorStops) && color.colorStops[0]?.color) {
    return String(color.colorStops[0].color);
  }

  return typeof color === 'string' ? color : '';
};

export const resolveChartLegendColor = (color: unknown, fallbackIndex: number) => {
  return getGradientLegendColor(color) || getChartColor(fallbackIndex);
};

const styleAxis = (axis: unknown, isDark: boolean, axisRole: 'category' | 'value') => {
  if (!isPlainObject(axis)) return axis;
  const theme = getChartTheme(isDark);
  const nextAxis = { ...axis };

  nextAxis.axisLine = mergePlain({
    lineStyle: { color: theme.axisLine },
  }, nextAxis.axisLine);
  nextAxis.axisLine.lineStyle = {
    ...(isPlainObject(axis.axisLine?.lineStyle) ? axis.axisLine.lineStyle : {}),
    color: theme.axisLine,
  };

  nextAxis.axisLabel = {
    ...(isPlainObject(axis.axisLabel) ? axis.axisLabel : {}),
    color: theme.subText,
    fontFamily: 'Manrope',
    fontSize: 12,
  };

  if (axisRole === 'value') {
    nextAxis.splitLine = mergePlain({
      show: true,
      lineStyle: { color: theme.grid },
    }, nextAxis.splitLine);
    nextAxis.splitLine.lineStyle = {
      ...(isPlainObject(axis.splitLine?.lineStyle) ? axis.splitLine.lineStyle : {}),
      color: theme.grid,
    };
  } else if (nextAxis.splitLine) {
    nextAxis.splitLine = {
      show: false,
      ...(isPlainObject(axis.splitLine) ? axis.splitLine : {}),
    };
  }

  if (axis.nameTextStyle) {
    nextAxis.nameTextStyle = {
      ...axis.nameTextStyle,
      color: theme.text,
      fontFamily: 'Manrope',
      fontWeight: 'bold',
    };
  }

  return nextAxis;
};

const styleSeries = (series: any, index: number, isDark: boolean, horizontalBar: boolean, hasBarSeries: boolean) => {
  if (!isPlainObject(series)) return series;
  const theme = getChartTheme(isDark);
  const type = String(series.type || '');
  const baseColor = getChartColor(index);
  const nextSeries = { ...series };
  const itemStyle = isPlainObject(series.itemStyle) ? { ...series.itemStyle } : {};

  if (type === 'line') {
    const lineColor = hasBarSeries ? (isDark ? '#A0A7E6' : '#626C91') : baseColor;
    nextSeries.smooth = series.smooth ?? true;
    nextSeries.symbol = series.symbol ?? 'none';
    nextSeries.lineStyle = {
      width: theme.lineWidth,
      shadowBlur: theme.lineShadowBlur,
      shadowColor: theme.lineShadowColor,
      ...(isPlainObject(series.lineStyle) ? series.lineStyle : {}),
      color: series.lineStyle?.color ?? lineColor,
    };
    nextSeries.itemStyle = {
      ...itemStyle,
      color: itemStyle.color ?? lineColor,
    };
    if (!series.areaStyle && !hasBarSeries) {
      nextSeries.areaStyle = { color: getChartAreaGradient(isDark, index) };
    }
  }

  if (type === 'bar') {
    itemStyle.borderRadius = itemStyle.borderRadius ?? (horizontalBar ? [0, 10, 10, 0] : [10, 10, 0, 0]);
    itemStyle.color = itemStyle.color ?? getChartBarGradient(horizontalBar, index);
    itemStyle.shadowBlur = itemStyle.shadowBlur ?? theme.barShadowBlur;
    itemStyle.shadowColor = itemStyle.shadowColor ?? theme.barShadowColor;
    nextSeries.itemStyle = itemStyle;
  }

  if (type === 'pie') {
    nextSeries.radius = series.radius ?? ['62%', '82%'];
    nextSeries.itemStyle = {
      borderRadius: 8,
      borderColor: theme.pieBorder,
      borderWidth: 4,
      ...itemStyle,
    };
    nextSeries.label = {
      color: theme.text,
      ...(isPlainObject(series.label) ? series.label : {}),
    };
  }

  if (type === 'candlestick') {
    nextSeries.itemStyle = {
      color: '#6BE6C1',
      color0: '#626C91',
      borderColor: '#57D9B5',
      borderColor0: '#7D86B2',
      ...itemStyle,
    };
  }

  if (!nextSeries.color && !itemStyle.color && type !== 'bar') {
    nextSeries.color = baseColor;
  }

  return nextSeries;
};

export const applyChartTheme = (option: any, isDark: boolean) => {
  if (!isPlainObject(option)) return option;
  const theme = getChartTheme(isDark);
  const horizontalBar = isHorizontalBarChart(option);
  const seriesArray = asArray(option.series);
  const hasBarSeries = seriesArray.some((series: any) => series?.type === 'bar');
  const nextOption: any = {
    ...option,
    backgroundColor: option.backgroundColor ?? 'transparent',
    color: Array.isArray(option.color) ? option.color : CHART_PALETTE,
    textStyle: {
      ...(isPlainObject(option.textStyle) ? option.textStyle : {}),
      color: theme.text,
      fontFamily: 'Manrope',
    },
    tooltip: {
      ...getChartTooltip(isDark),
      ...(isPlainObject(option.tooltip) ? option.tooltip : {}),
      textStyle: {
        ...getChartTooltip(isDark).textStyle,
        ...(isPlainObject(option.tooltip?.textStyle) ? option.tooltip.textStyle : {}),
        color: theme.text,
      },
    },
  };

  if (option.grid) {
    nextOption.grid = Array.isArray(option.grid)
      ? option.grid.map((gridItem: any) => ({
          borderColor: theme.border,
          ...(isPlainObject(gridItem) ? gridItem : {}),
        }))
      : {
          borderColor: theme.border,
          ...(isPlainObject(option.grid) ? option.grid : {}),
        };
  }

  if (option.xAxis) {
    nextOption.xAxis = Array.isArray(option.xAxis)
      ? option.xAxis.map((axis: any) => styleAxis(axis, isDark, axis?.type === 'value' ? 'value' : 'category'))
      : styleAxis(option.xAxis, isDark, option.xAxis?.type === 'value' ? 'value' : 'category');
  }

  if (option.yAxis) {
    nextOption.yAxis = Array.isArray(option.yAxis)
      ? option.yAxis.map((axis: any) => styleAxis(axis, isDark, axis?.type === 'category' ? 'category' : 'value'))
      : styleAxis(option.yAxis, isDark, option.yAxis?.type === 'category' ? 'category' : 'value');
  }

  if (option.legend) {
    nextOption.legend = Array.isArray(option.legend)
      ? option.legend.map((legend: any) => ({
          ...(isPlainObject(legend) ? legend : {}),
          textStyle: {
            ...(isPlainObject(legend?.textStyle) ? legend.textStyle : {}),
            color: theme.subText,
            fontFamily: 'Manrope',
          },
        }))
      : {
          ...(isPlainObject(option.legend) ? option.legend : {}),
          textStyle: {
            ...(isPlainObject(option.legend?.textStyle) ? option.legend.textStyle : {}),
            color: theme.subText,
            fontFamily: 'Manrope',
          },
        };
  }

  if (option.dataZoom) {
    nextOption.dataZoom = asArray(option.dataZoom).map((zoom: any) => ({
      ...(isPlainObject(zoom) ? zoom : {}),
      borderColor: theme.border,
      fillerColor: isDark ? 'rgba(63,177,227,0.14)' : 'rgba(63,177,227,0.10)',
      textStyle: {
        color: theme.subText,
        ...(isPlainObject(zoom?.textStyle) ? zoom.textStyle : {}),
      },
    }));
  }

  if (option.series) {
    nextOption.series = Array.isArray(option.series)
      ? option.series.map((series: any, index: number) => styleSeries(series, index, isDark, horizontalBar, hasBarSeries))
      : styleSeries(option.series, 0, isDark, horizontalBar, hasBarSeries);
  }

  return nextOption;
};

export const getAdaptiveBarWidth = (categoryCount: number) => {
  if (categoryCount <= 1) return '20%';
  if (categoryCount <= 2) return '35%';
  if (categoryCount <= 3) return '45%';
  if (categoryCount <= 5) return '55%';
  return '65%';
};
