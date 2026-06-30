// Monochrome blue scheme. The primary tone (#006FEB) matches the selected
// sidebar-tab background; secondary series use lighter/darker blue shades.
export const CHART_BASE_PALETTE = [
  '#006FEB',
  '#4D9BF3',
  '#0B4EA2',
  '#80B8F7',
  '#1E63C9',
];

export const CHART_PALETTE = [...CHART_BASE_PALETTE];

// Pie slices ramp through the sidebar-tab gradient: indigo (#4F46E5) →
// blue (#006FEB) → cyan (#06B6D4), ending on a light cyan for the last slice.
export const PIE_PALETTE = [
  '#4F46E5',
  '#3554E7',
  '#1B61E9',
  '#006FEB',
  '#0287E3',
  '#049FDC',
  '#06B6D4',
  '#36C4DD',
  '#66D2E6',
  '#96E1F0',
];

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
    lineShadowColor: 'rgba(0,111,235,0)',
    barShadowBlur: 10,
    barShadowColor: 'rgba(0,111,235,0.18)',
    gradientStops: {
      blue: ['rgba(0,111,235,0.34)', 'rgba(0,111,235,0.02)'],
      green: ['rgba(77,155,243,0.28)', 'rgba(77,155,243,0.02)'],
      purple: ['rgba(11,78,162,0.18)', 'rgba(11,78,162,0.01)'],
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
    lineShadowColor: 'rgba(0,111,235,0.35)',
    barShadowBlur: 14,
    barShadowColor: 'rgba(0,111,235,0.25)',
    gradientStops: {
      blue: ['rgba(0,111,235,0.65)', 'rgba(0,111,235,0.02)'],
      green: ['rgba(77,155,243,0.55)', 'rgba(77,155,243,0.02)'],
      purple: ['rgba(11,78,162,0.45)', 'rgba(11,78,162,0.02)'],
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

export const getChartAreaGradient = (isDark: boolean, index = 0) => {
  const theme = getChartTheme(isDark);
  const stops = index % 3 === 1
    ? theme.gradientStops.green
    : index % 3 === 2
      ? theme.gradientStops.purple
      : theme.gradientStops.blue;

  return verticalGradient(stops[0], stops[1]);
};

// Bars use a 3-stop gradient: indigo → blue → cyan.
const BAR_GRADIENT_STOPS = ['#4F46E5', '#006FEB', '#06B6D4'] as const;

const multiStopGradient = (colors: readonly string[], horizontal: boolean): LinearGradient => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: horizontal ? 1 : 0,
  y2: horizontal ? 0 : 1,
  colorStops: colors.map((color, index) => ({
    offset: colors.length > 1 ? index / (colors.length - 1) : 0,
    color,
  })),
});

export const getChartBarGradient = (horizontal = false, _index = 0) =>
  multiStopGradient(BAR_GRADIENT_STOPS, horizontal);

export const getComparisonAreaSeriesStyle = (isDark: boolean, index = 0) => {
  const color = index % 2 === 0 ? '#006FEB' : '#0B4EA2';

  return {
    color,
    smooth: true,
    symbol: 'none',
    lineStyle: {
      color,
      width: getChartTheme(isDark).lineWidth,
    },
    areaStyle: {
      color: getChartAreaGradient(isDark, index % 2 === 0 ? 0 : 2),
    },
  };
};

export const getChartTooltip = (isDark: boolean) => {
  const theme = getChartTheme(isDark);

  return {
    backgroundColor: isDark ? 'rgba(19,28,49,0.96)' : 'rgba(255,255,255,0.96)',
    borderColor: theme.border,
    borderWidth: 1,
    extraCssText: `box-shadow: ${theme.tooltipShadow}; border-radius: 12px; backdrop-filter: blur(16px); padding: 10px 12px;`,
    textStyle: {
      color: theme.text,
      fontFamily: 'Manrope',
      fontSize: 12,
      fontWeight: 'normal' as const,
    },
  };
};

export const highlightChartTooltipValue = (value: string | number, unit = '') => (
  `<span class="chart-tooltip-value">${value}${unit}</span>`
);

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

export const splitEvenly = <T,>(items: T[], parts = 2): T[][] => {
  if (parts <= 1) return [items.slice()];
  const total = Array.isArray(items) ? items.length : 0;
  const baseSize = Math.floor(total / parts);
  const remainder = total % parts;
  const groups: T[][] = [];
  let cursor = 0;

  for (let index = 0; index < parts; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    groups.push(items.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups;
};

export const splitLegendItems = <T,>(items: T[], threshold = 5, parts = 2): T[][] => {
  if (!Array.isArray(items) || items.length <= threshold) {
    return [Array.isArray(items) ? items.slice() : []];
  }

  return splitEvenly(items, parts);
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
    const configuredColor = typeof series.lineStyle?.color === 'string'
      ? series.lineStyle.color
      : typeof series.color === 'string'
        ? series.color
        : '';
    const lineColor = configuredColor || (hasBarSeries ? '#0B4EA2' : baseColor);
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
      color: '#4D9BF3',
      color0: '#0B4EA2',
      borderColor: '#006FEB',
      borderColor0: '#0B3D91',
      ...itemStyle,
    };
  }

  if (!nextSeries.color && !itemStyle.color && type !== 'bar' && type !== 'pie') {
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
      fillerColor: isDark ? 'rgba(0,111,235,0.14)' : 'rgba(0,111,235,0.10)',
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

type DownloadChartImageOptions = {
  fileName: string;
  title?: string;
  backgroundColor: string;
  textColor: string;
  titleAlign?: 'left' | 'center' | 'right';
  pixelRatio?: number;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const nextLine = `${currentLine} ${words[index]}`;
    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = words[index];
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

export const downloadChartImage = async (instance: any, options: DownloadChartImageOptions) => {
  if (!instance) return;

  const {
    fileName,
    title = '',
    backgroundColor,
    textColor,
    titleAlign = 'center',
    pixelRatio = 2,
  } = options;

  const chartUrl = instance.getDataURL({
    type: 'png',
    pixelRatio,
    backgroundColor,
  });

  if (!title.trim()) {
    const link = document.createElement('a');
    link.href = chartUrl;
    link.download = fileName;
    link.click();
    return;
  }

  const image = new Image();
  image.src = chartUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load chart image'));
  });

  const titlePaddingX = 32;
  const titlePaddingTop = 24;
  const titlePaddingBottom = 20;
  const titleFontSize = 18;
  const titleLineHeight = 24;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.font = `700 ${titleFontSize}px Manrope, sans-serif`;
  const maxTitleWidth = Math.max(0, canvas.width - (titlePaddingX * 2));
  const lines = wrapText(context, title, maxTitleWidth);
  const titleHeight = Math.max(titleLineHeight, lines.length * titleLineHeight);
  canvas.height = image.height + titlePaddingTop + titleHeight + titlePaddingBottom;

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, titlePaddingTop + titleHeight + titlePaddingBottom, image.width, image.height);

  context.font = `700 ${titleFontSize}px Manrope, sans-serif`;
  context.fillStyle = textColor;
  context.textBaseline = 'top';
  context.textAlign = titleAlign;

  const baseY = titlePaddingTop;
  const centerX = canvas.width / 2;
  const leftX = titlePaddingX;
  const rightX = canvas.width - titlePaddingX;
  const startX = titleAlign === 'left' ? leftX : titleAlign === 'right' ? rightX : centerX;
  const availableWidth = Math.max(0, canvas.width - (titlePaddingX * 2));

  lines.forEach((line, index) => {
    let outputLine = line;
    if (context.measureText(outputLine).width > availableWidth) {
      while (outputLine.length > 1 && context.measureText(`${outputLine}…`).width > availableWidth) {
        outputLine = outputLine.slice(0, -1);
      }
      outputLine = `${outputLine}…`;
    }

    context.fillText(outputLine, startX, baseY + (index * titleLineHeight));
  });

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = fileName;
  link.click();
};
