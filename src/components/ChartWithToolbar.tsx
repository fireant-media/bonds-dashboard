import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import { formatNumber } from '../utils/format';
import { BarChart3, Download, EllipsisVertical, LineChart, Maximize2, RotateCcw, TableProperties, X, type LucideIcon } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { applyChartTheme, downloadChartImage, getChartTheme } from '../utils/chart';
import { ChartDataViewModal, type ChartDataTableColumn } from './ui/ChartDataViewModal';

interface ChartTableHeader {
  label: string;
  unit?: string;
  align?: 'left' | 'right' | 'center';
  kind?: 'text' | 'number';
}

interface ChartTable {
  headers: ChartTableHeader[];
  rows: string[][];
}

interface ChartDataViewConfig {
  categoryLabel?: string;
  categoryUnit?: string;
  categoryAlign?: 'left' | 'right' | 'center';
  categoryKind?: 'text' | 'number';
  columns?: ChartDataTableColumn[];
  rows?: Array<Array<string | number | null | undefined>>;
}

interface ChartWithToolbarProps {
  option: any;
  style?: CSSProperties;
  className?: string;
  allowMagicType?: boolean;
  showToolbar?: boolean;
  showZoomButton?: boolean;
  showDataZoomSliderOnHover?: boolean;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  title?: ReactNode;
  titleIcon?: LucideIcon;
  titleAlign?: 'left' | 'center' | 'right';
  actions?: ReactNode;
  actionsPlacement?: 'inline' | 'below';
  headerClassName?: string;
  belowActionsClassName?: string;
  chartContainerClassName?: string;
  onDataViewCategoryClick?: (categoryValue: string, row: Array<string | number | null | undefined>) => void;
  zoomConfig?: {
    shellClassName?: string;
    chartStyle?: CSSProperties;
    option?: any;
    scale?: number;
  };
}

function getSeriesArray(option: any): any[] {
  const series = option?.series;
  if (Array.isArray(series)) return series;
  if (series) return [series];
  return [];
}

function getAxisData(option: any, axisKey: 'xAxis' | 'yAxis'): string[] {
  const axis = Array.isArray(option?.[axisKey]) ? option[axisKey][0] : option?.[axisKey];
  const data = axis?.data;
  return Array.isArray(data) ? data.map((item: any) => String(item)) : [];
}

function getAxisUnit(option: any, axisKey: 'xAxis' | 'yAxis') {
  const axis = Array.isArray(option?.[axisKey]) ? option[axisKey][0] : option?.[axisKey];
  const unit = axis?.name;
  return typeof unit === 'string' && unit.trim() ? unit.trim() : '';
}

function getTitleText(title: ReactNode) {
  return typeof title === 'string' || typeof title === 'number' ? String(title) : '';
}

function formatCell(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'number') {
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatCell(item)).join(', ');
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if ('value' in item) return formatCell(item.value);
    if ('name' in item && Object.keys(item).length === 1) return formatCell(item.name);
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizePointValue(point: unknown) {
  if (point == null) return '';
  if (typeof point === 'number') return formatCell(point);
  if (Array.isArray(point)) {
    return point.map((item) => formatCell(item)).join(', ');
  }
  if (typeof point === 'object') {
    const item = point as Record<string, unknown>;
    if ('value' in item) return formatCell(item.value);
    if ('y' in item) return formatCell(item.y);
    if ('name' in item) return formatCell(item.name);
    return JSON.stringify(point);
  }
  return String(point);
}

function flattenTreemap(data: any[], t: (key: any) => string, prefix = ''): ChartTable {
  const rows: string[][] = [];

  data.forEach((item) => {
    const name = item?.name ? String(item.name) : '';
    const path = prefix ? `${prefix} / ${name}` : name;
    const value = formatCell(item?.value);
    rows.push([path, value]);

    if (Array.isArray(item?.children) && item.children.length > 0) {
      const childTable = flattenTreemap(item.children, t, path);
      rows.push(...childTable.rows);
    }
  });

  return {
    headers: [
      { label: t('name'), align: 'left', kind: 'text' },
      { label: t('value'), align: 'right', kind: 'number' },
    ],
    rows,
  };
}

function buildDataTable(option: any, t: (key: any) => string): ChartTable {
  const dataView = option?.__dataView as ChartDataViewConfig | undefined;
  const series = getSeriesArray(option);
  const xAxisData = getAxisData(option, 'xAxis');
  const yAxisData = getAxisData(option, 'yAxis');
  const xAxisUnit = getAxisUnit(option, 'xAxis');
  const yAxisUnit = getAxisUnit(option, 'yAxis');

  if (dataView?.columns) {
    return {
      headers: dataView.columns.map((column) => ({
        label: column.label,
        unit: column.unit,
        align: column.align,
        kind: column.kind,
      })),
      rows: (dataView.rows || []).map((row) => row.map((cell) => formatCell(cell))),
    };
  }

  const firstSeriesType = String(series[0]?.type || '');
  const firstSeriesData = Array.isArray(series[0]?.data) ? series[0].data : [];

  if (firstSeriesType === 'pie' || (firstSeriesData.length > 0 && firstSeriesData.every((item: any) => item && typeof item === 'object' && 'value' in item && 'name' in item))) {
    const rows = firstSeriesData.map((item: any) => [
      formatCell(item?.name),
      formatCell(item?.value),
      item?.percent != null ? `${formatCell(item.percent)}%` : '',
    ]);
    return {
      headers: [
        { label: t('name'), align: 'left', kind: 'text' },
        { label: t('value'), align: 'right', kind: 'number' },
        { label: t('percent'), align: 'right', kind: 'number' },
      ],
      rows
    };
  }

  if (firstSeriesType === 'treemap' && firstSeriesData.length > 0) {
    return flattenTreemap(firstSeriesData, t);
  }

  if (firstSeriesType === 'scatter' || firstSeriesType === 'effectScatter' || firstSeriesType === 'bubble') {
    const rows = firstSeriesData.map((item: any) => {
      if (Array.isArray(item)) {
        return [
          formatCell(item[0]),
          formatCell(item[1]),
          item.length > 2 ? formatCell(item[2]) : '',
          item.length > 3 ? formatCell(item[3]) : '',
        ];
      }

      return [
        formatCell(item?.name),
        formatCell(item?.value?.[0] ?? item?.x),
        formatCell(item?.value?.[1] ?? item?.y),
        formatCell(item?.value?.[2] ?? item?.z),
      ];
    });

    return {
      headers: [
        { label: t('name'), align: 'left', kind: 'text' },
        { label: 'X', align: 'right', kind: 'number' },
        { label: 'Y', align: 'right', kind: 'number' },
        { label: 'Z', align: 'right', kind: 'number' },
      ],
      rows
    };
  }

  const categoryData = xAxisData.length > 0 ? xAxisData : yAxisData;
  const valueUnit = xAxisData.length > 0 ? yAxisUnit : xAxisUnit;

  if (categoryData.length > 0 && series.length > 0) {
    const rows = categoryData.map((label, rowIndex) => [
      label,
      ...series.map((item) => normalizePointValue(Array.isArray(item?.data) ? item.data[rowIndex] : '')),
    ]);
    return {
      headers: [
        {
          label: dataView?.categoryLabel || t('category'),
          unit: dataView?.categoryUnit,
          align: dataView?.categoryAlign || 'left',
          kind: dataView?.categoryKind || 'text',
        },
        ...series.map((item, index) => ({
          label: String(item?.name || `${t('series')} ${index + 1}`),
          unit: valueUnit,
          align: 'right' as const,
          kind: 'number' as const,
        })),
      ],
      rows,
    };
  }

  if (series.length > 0) {
    const rows = series.flatMap((item, seriesIndex) => {
      const data = Array.isArray(item?.data) ? item.data : [];
      if (data.length === 0) return [[String(item?.name || `Series ${seriesIndex + 1}`), '']];

      return data.map((point: any, pointIndex: number) => [
        `${String(item?.name || `Series ${seriesIndex + 1}`)} ${pointIndex + 1}`,
        normalizePointValue(point),
      ]);
    });

    return {
      headers: [
        { label: t('series'), align: 'left', kind: 'text' },
        { label: t('value'), unit: yAxisUnit || xAxisUnit, align: 'right', kind: 'number' },
      ],
      rows
    };
  }

  return {
    headers: [
      { label: t('field'), align: 'left', kind: 'text' },
      { label: t('value'), unit: yAxisUnit || xAxisUnit, align: 'right', kind: 'number' },
    ],
    rows: []
  };
}

function getSeriesType(series: any) {
  return String(series?.type || 'bar');
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeZoomOption(base: any, override: any): any {
  if (!isPlainObject(base)) return override;
  if (!isPlainObject(override)) return base;

  const result: Record<string, any> = { ...base };

  Object.entries(override).forEach(([key, value]) => {
    const baseValue = result[key];
    if (Array.isArray(value) && Array.isArray(baseValue)) {
      result[key] = value.map((item, index) => (
        isPlainObject(item) && isPlainObject(baseValue[index])
          ? mergeZoomOption(baseValue[index], item)
          : item
      ));
      return;
    }

    if (Array.isArray(value)) {
      result[key] = value;
      return;
    }

    if (isPlainObject(value) && isPlainObject(baseValue)) {
      result[key] = mergeZoomOption(baseValue, value);
      return;
    }

    result[key] = value;
  });

  return result;
}

function scaleNumeric(value: unknown, factor: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.round(value * factor * 10) / 10;
}

function scaleChartOption(value: any, factor: number): any {
  if (Array.isArray(value)) {
    return value.map((item) => scaleChartOption(item, factor));
  }

  if (!isPlainObject(value)) return value;

  const result: Record<string, any> = {};

  Object.entries(value).forEach(([key, entry]) => {
    if (key === 'data' || key === 'seriesLayoutBy') {
      result[key] = entry;
      return;
    }

    if (key === 'fontSize' || key === 'itemWidth' || key === 'itemHeight' || key === 'itemGap' || key === 'nameGap' || key === 'borderWidth' || key === 'radius') {
      result[key] = scaleNumeric(entry, factor);
      return;
    }

    if (key === 'width' && typeof entry === 'number') {
      result[key] = Math.round(entry * factor);
      return;
    }

    if (key === 'height' && typeof entry === 'number') {
      result[key] = Math.round(entry * factor);
      return;
    }

    if (key === 'textStyle' || key === 'axisLabel' || key === 'nameTextStyle' || key === 'label' || key === 'emphasis' || key === 'tooltip' || key === 'legend' || key === 'dataZoom' || key === 'title') {
      result[key] = scaleChartOption(entry, factor);
      return;
    }

    result[key] = scaleChartOption(entry, factor);
  });

  return result;
}

function setDataZoomSliderVisibility(option: any, visible: boolean): any {
  if (Array.isArray(option)) {
    return option.map((item) => setDataZoomSliderVisibility(item, visible));
  }

  if (!isPlainObject(option)) return option;

  const result: Record<string, any> = { ...option };

  if (Array.isArray(result.dataZoom)) {
    result.dataZoom = result.dataZoom.map((entry: any) => {
      if (!isPlainObject(entry)) return entry;
      if (String(entry.type || '') !== 'slider') return entry;
      return { ...entry, show: visible };
    });
  }

  Object.entries(result).forEach(([key, value]) => {
    if (key === 'dataZoom') return;
    result[key] = setDataZoomSliderVisibility(value, visible);
  });

  return result;
}

export default function ChartWithToolbar({
  option,
  style,
  className,
  allowMagicType = false,
  showToolbar = true,
  showZoomButton = true,
  showDataZoomSliderOnHover = false,
  notMerge,
  lazyUpdate,
  title,
  titleIcon: TitleIcon = BarChart3,
  titleAlign = 'left',
  actions,
  actionsPlacement = 'below',
  headerClassName,
  belowActionsClassName,
  chartContainerClassName,
  onDataViewCategoryClick,
  zoomConfig,
}: ChartWithToolbarProps) {
  const { effectiveTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const chartTheme = getChartTheme(isDark);
  const chartRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomChartContainerRef = useRef<HTMLDivElement | null>(null);
  const toolbarMenuRef = useRef<HTMLDivElement | null>(null);
  const zoomToolbarMenuRef = useRef<HTMLDivElement | null>(null);
  const [showDataView, setShowDataView] = useState(false);
  const [showDataViewBackButton, setShowDataViewBackButton] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [showToolbarMenu, setShowToolbarMenu] = useState(false);
  const [showZoomToolbarMenu, setShowZoomToolbarMenu] = useState(false);
  const [supportsHover, setSupportsHover] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });
  const [showSlider, setShowSlider] = useState(!showDataZoomSliderOnHover);
  const seriesArray = useMemo(() => getSeriesArray(option), [option]);
  const firstSeriesType = getSeriesType(seriesArray[0]);
  const magicTypeCapable = allowMagicType && seriesArray.length > 0 && seriesArray.every((series) => {
    const type = getSeriesType(series);
    return type === 'bar' || type === 'line';
  });
  const hasBarSeries = magicTypeCapable && seriesArray.some((series) => getSeriesType(series) === 'bar');
  const hasLineSeries = magicTypeCapable && seriesArray.some((series) => getSeriesType(series) === 'line');
  const isMixedMagicChart = Boolean(hasBarSeries && hasLineSeries);
  const baseChartMode = isMixedMagicChart ? 'original' : (firstSeriesType === 'line' ? 'line' : 'bar');
  const [chartMode, setChartMode] = useState<'original' | 'line' | 'bar'>(baseChartMode);
  const dataTable = useMemo(() => buildDataTable(option, t), [option, t]);
  const dataViewColumns: ChartDataTableColumn[] = useMemo(() => (
    dataTable.headers.map((header) => ({
      label: header.label,
      unit: header.unit,
      align: header.align,
      kind: header.kind,
    }))
  ), [dataTable.headers]);
  const dataViewTitle = getTitleText(title);
  const dataViewFileName = dataViewTitle || t('dataView');
  const titleWrapClass =
    titleAlign === 'left'
      ? 'min-w-0 text-left'
      : titleAlign === 'right'
        ? 'min-w-0 text-right'
        : 'min-w-0 text-center';

  useEffect(() => {
    setChartMode(baseChartMode);
  }, [baseChartMode, magicTypeCapable]);

  const finalOption = useMemo(() => {
    if (!magicTypeCapable) {
      return applyChartTheme({ ...option }, isDark);
    }

    if (chartMode === 'original') {
      return applyChartTheme({ ...option }, isDark);
    }

    const transformedSeries = seriesArray.map((series: any, index: number) => {
      const nextSeries = { ...series, type: chartMode };

      if (chartMode === 'bar') {
        return {
          ...nextSeries,
          barWidth: isMixedMagicChart ? '28%' : (series.barWidth || '38%'),
          barGap: isMixedMagicChart ? '24%' : series.barGap,
        };
      }

      return nextSeries;
    });

    if (Array.isArray(option?.series)) {
      return applyChartTheme({ ...option, series: transformedSeries }, isDark);
    }

    if (option?.series) {
      return applyChartTheme({ ...option, series: transformedSeries[0] }, isDark);
    }

    return applyChartTheme({ ...option }, isDark);
  }, [chartMode, isDark, magicTypeCapable, option, seriesArray]);
  const zoomSeriesArray = useMemo(() => getSeriesArray(finalOption), [finalOption]);
  const zoomSeriesTypes = useMemo(
    () => Array.from(new Set(zoomSeriesArray.map((series) => getSeriesType(series)).filter(Boolean))),
    [zoomSeriesArray]
  );
  const zoomChartType = zoomSeriesTypes[0] || firstSeriesType;
  const isComboZoomChart = zoomSeriesTypes.length > 1;
  const zoomScale = zoomConfig?.scale ?? 1.25;
  const zoomShellClass = useMemo(() => {
    if (zoomConfig?.shellClassName) return zoomConfig.shellClassName;

    if (zoomChartType === 'pie') {
      return 'flex h-full max-h-screen w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl';
    }

    if (zoomChartType === 'treemap' || zoomChartType === 'candlestick' || zoomChartType === 'scatter' || zoomChartType === 'effectScatter' || zoomChartType === 'bubble' || isComboZoomChart) {
      return 'flex h-full max-h-screen w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl';
    }

    return 'flex h-full max-h-screen w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl';
  }, [isComboZoomChart, zoomChartType, zoomConfig?.shellClassName]);
  const zoomChartStyle = useMemo<CSSProperties>(() => {
    if (zoomConfig?.chartStyle) return zoomConfig.chartStyle;

    if (zoomChartType === 'pie') {
      return { height: '100%', width: '100%' };
    }

    if (zoomChartType === 'treemap') {
      return { height: '100%', width: '100%' };
    }

    if (zoomChartType === 'candlestick') {
      return { height: '100%', width: '100%' };
    }

    if (zoomChartType === 'scatter' || zoomChartType === 'effectScatter' || zoomChartType === 'bubble') {
      return { height: '100%', width: '100%' };
    }

    if (isComboZoomChart) {
      return { height: '100%', width: '100%' };
    }

    return { height: '100%', width: '100%' };
  }, [isComboZoomChart, zoomChartType, zoomConfig?.chartStyle]);
  const zoomOption = useMemo(() => {
    const merged = zoomConfig?.option ? mergeZoomOption(finalOption, zoomConfig.option) : finalOption;
    return scaleChartOption(merged, zoomScale);
  }, [finalOption, zoomConfig?.option, zoomScale]);
  const renderedOption = useMemo(
    () => (showDataZoomSliderOnHover ? setDataZoomSliderVisibility(finalOption, showSlider) : finalOption),
    [finalOption, showDataZoomSliderOnHover, showSlider]
  );
  const renderedZoomOption = useMemo(
    () => (showDataZoomSliderOnHover ? setDataZoomSliderVisibility(zoomOption, showSlider) : zoomOption),
    [showDataZoomSliderOnHover, showSlider, zoomOption]
  );

  useEffect(() => {
    if (!showDataZoomSliderOnHover) return;

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updateSupportsHover = (event: MediaQueryList | MediaQueryListEvent) => {
      setSupportsHover(event.matches);
    };

    setSupportsHover(mediaQuery.matches);
    setShowSlider(!mediaQuery.matches);
    mediaQuery.addEventListener('change', updateSupportsHover);

    return () => {
      mediaQuery.removeEventListener('change', updateSupportsHover);
    };
  }, [showDataZoomSliderOnHover]);

  const toolbarButtonClass = (disabled = false, active = false) => (
    `rounded-md p-1.5 transition-colors ${
      disabled
        ? 'cursor-not-allowed text-text-muted/60 opacity-60'
        : active
          ? 'bg-action-accent text-slate-950 hover:bg-action-accent hover:text-slate-950'
          : 'text-text-muted hover:bg-surface-container-low hover:text-text-highlight'
    }`
  );

  const menuTriggerButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600';
  const menuPanelClass =
    'absolute right-0 top-full z-20 mt-2 min-w-44 rounded-lg border border-border-base bg-bg-surface p-1.5 shadow-lg shadow-blue-950/10 dark:shadow-black/30';
  const menuItemClass = (active = false) => (
    `flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
      active
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
        : 'text-text-base hover:bg-surface-container-low'
    }`
  );

  const closeToolbarMenus = () => {
    setShowToolbarMenu(false);
    setShowZoomToolbarMenu(false);
  };

  const handleDownload = async () => {
    closeToolbarMenus();
    const instance = chartRef.current?.getEchartsInstance?.();
    if (!instance) return;
    await downloadChartImage(instance, {
      fileName: 'chart.png',
      title: dataViewTitle,
      backgroundColor: chartTheme.bg,
      textColor: chartTheme.text,
      titleAlign,
    });
  };

  const handleReset = () => {
    closeToolbarMenus();
    const instance = chartRef.current?.getEchartsInstance?.();
    instance?.restore?.();
    setChartMode(baseChartMode);
  };

  const openDataView = (fromZoom = false) => {
    closeToolbarMenus();
    setShowDataViewBackButton(fromZoom);
    setShowDataView(true);
    if (fromZoom) {
      setShowZoom(false);
    }
  };

  const closeDataView = () => {
    setShowDataView(false);
    setShowDataViewBackButton(false);
  };

  const handleDataViewBack = () => {
    const shouldRestoreZoom = showDataViewBackButton;
    closeDataView();
    if (shouldRestoreZoom) {
      setShowZoom(true);
    }
  };

  const handleSetChartMode = (mode: 'line' | 'bar') => {
    closeToolbarMenus();
    setChartMode(mode);
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (toolbarMenuRef.current?.contains(target) || zoomToolbarMenuRef.current?.contains(target)) {
        return;
      }
      closeToolbarMenus();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeToolbarMenus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!showZoom) return;

    const frame = window.requestAnimationFrame(() => {
      chartRef.current?.getEchartsInstance?.()?.resize?.();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [showZoom, chartMode, finalOption, zoomChartType]);

  useEffect(() => {
    if (!showZoom) return;

    const handleResize = () => {
      chartRef.current?.getEchartsInstance?.()?.resize?.();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [showZoom]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance?.()?.resize?.();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [chartMode, renderedOption]);

  useEffect(() => {
    if (!showZoom) return undefined;

    const container = zoomChartContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance?.()?.resize?.();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [renderedZoomOption, showZoom]);

  useEffect(() => {
    if (!showZoom) {
      setShowZoomToolbarMenu(false);
    }
  }, [showZoom]);

  const renderToolbarMenuItems = (fromZoom = false) => (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => openDataView(fromZoom)}
        className={menuItemClass()}
      >
        <TableProperties className="h-4 w-4 shrink-0" />
        <span>{t('dataView')}</span>
      </button>
      {magicTypeCapable ? (
        <>
          <button
            type="button"
            onClick={() => handleSetChartMode('line')}
            disabled={!isMixedMagicChart && chartMode === 'line'}
            className={menuItemClass(!isMixedMagicChart && chartMode === 'line')}
          >
            <LineChart className="h-4 w-4 shrink-0" />
            <span>{t('lineChart')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetChartMode('bar')}
            disabled={!isMixedMagicChart && chartMode === 'bar'}
            className={menuItemClass(!isMixedMagicChart && chartMode === 'bar')}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>{t('columnChart')}</span>
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={handleReset}
        className={menuItemClass()}
      >
        <RotateCcw className="h-4 w-4 shrink-0" />
        <span>{t('reset')}</span>
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className={menuItemClass()}
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>{t('download')}</span>
      </button>
      {!fromZoom && showZoomButton ? (
        <button
          type="button"
          onClick={() => {
            closeToolbarMenus();
            setShowZoom(true);
          }}
          className={menuItemClass()}
        >
          <Maximize2 className="h-4 w-4 shrink-0" />
          <span>{t('zoom')}</span>
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={`group flex min-h-0 flex-col ${className || ''}`}
      style={style}
      onMouseEnter={showDataZoomSliderOnHover && supportsHover ? () => setShowSlider(true) : undefined}
      onMouseLeave={showDataZoomSliderOnHover && supportsHover ? () => setShowSlider(false) : undefined}
    >
      <div className="flex flex-col gap-1">
        {(title || actions || showToolbar) ? (
          <div className={`flex flex-col gap-2 ${headerClassName || ''}`}>
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={
                    titleAlign === 'left'
                      ? 'flex min-w-0 flex-1 justify-start'
                      : titleAlign === 'right'
                        ? 'flex min-w-0 flex-1 justify-end'
                        : 'flex min-w-0 flex-1 justify-center'
                  }
                >
                  {title ? (
                    <div className={titleWrapClass}>
                      <div
                        className={`inline-flex max-w-full items-center gap-2 transition-colors duration-200 ${
                          titleAlign === 'left'
                            ? 'justify-start'
                            : titleAlign === 'right'
                              ? 'justify-end'
                              : 'justify-center'
                        }`}
                      >
                        <TitleIcon className="h-4 w-4 shrink-0 text-blue-600 transition-colors duration-200 group-hover:text-blue-700" />
                        <div className="break-words text-base font-bold leading-snug text-black transition-colors duration-200 group-hover:text-blue-600">
                          {title}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {actions && actionsPlacement === 'inline' ? (
                  <div className="flex shrink-0 items-center justify-end gap-2 text-right">
                    {actions}
                  </div>
                ) : null}

                {showToolbar ? (
                  <div ref={toolbarMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowToolbarMenu((previous) => !previous)}
                      className={menuTriggerButtonClass}
                      title={t('moreOptions') || 'More options'}
                      aria-label={t('moreOptions') || 'More options'}
                      aria-expanded={showToolbarMenu}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                    {showToolbarMenu ? (
                      <div className={menuPanelClass}>
                        {renderToolbarMenuItems(false)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {actions && actionsPlacement === 'below' ? (
              <div className={`flex min-w-0 justify-end text-right ${belowActionsClassName || ''}`}>
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div ref={chartContainerRef} className={`min-h-0 flex-1 overflow-hidden ${chartContainerClassName || ''}`}>
          <ReactECharts
            ref={chartRef}
            option={renderedOption}
            style={{ height: '100%', width: '100%' }}
            autoResize
            notMerge={notMerge}
            lazyUpdate={lazyUpdate}
        />
      </div>

      <ChartDataViewModal
        isOpen={showDataView}
        title={dataViewTitle || t('dataView')}
        columns={dataViewColumns}
        rows={dataTable.rows}
        onClose={closeDataView}
        onBack={handleDataViewBack}
        showBackButton={showDataViewBackButton}
        fileNameBase={dataViewFileName}
        sheetName={dataViewFileName}
        onCategoryClick={onDataViewCategoryClick ? (categoryValue, row) => {
          closeDataView();
          onDataViewCategoryClick(categoryValue, row);
        } : undefined}
      />

      {showZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowZoom(false)}
        >
          <div
            className={`group ${zoomShellClass}`}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={showDataZoomSliderOnHover && supportsHover ? () => setShowSlider(true) : undefined}
            onMouseLeave={showDataZoomSliderOnHover && supportsHover ? () => setShowSlider(false) : undefined}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-base px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {title ? (
                      <div className="min-w-0 text-left">
                        <div className="inline-flex max-w-full items-center gap-2 transition-colors duration-200">
                          <TitleIcon className="h-5 w-5 shrink-0 text-blue-600 transition-colors duration-200 group-hover:text-blue-700" />
                          <div className="line-clamp-2 text-lg font-bold leading-snug text-black transition-colors duration-200 group-hover:text-blue-600 md:text-2xl">
                            {title}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <h3 className="line-clamp-2 text-left text-sm font-bold leading-snug text-black">
                        {t('zoom')}
                      </h3>
                    )}
                  </div>
                  {showToolbar ? (
                    <div ref={zoomToolbarMenuRef} className="relative shrink-0 text-right">
                      <button
                        type="button"
                        onClick={() => setShowZoomToolbarMenu((previous) => !previous)}
                        className={menuTriggerButtonClass}
                        title={t('moreOptions') || 'More options'}
                        aria-label={t('moreOptions') || 'More options'}
                        aria-expanded={showZoomToolbarMenu}
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </button>
                      {showZoomToolbarMenu ? (
                        <div className={menuPanelClass}>
                          {renderToolbarMenuItems(true)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {actions ? (
                  <div className="mt-2 flex min-w-0 justify-end text-right">
                    {actions}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowZoom(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
                title={t('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div ref={zoomChartContainerRef} className="flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-2">
              <ReactECharts
                ref={chartRef}
                option={renderedZoomOption}
                style={zoomChartStyle}
                autoResize
                notMerge={notMerge}
                lazyUpdate={lazyUpdate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
