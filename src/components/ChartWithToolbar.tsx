import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import { formatNumber } from '../utils/format';
import { BarChart3, Download, LineChart, Maximize2, RotateCcw, Table2, X } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface ChartTable {
  headers: string[];
  rows: string[][];
}

interface ChartWithToolbarProps {
  option: any;
  style?: CSSProperties;
  className?: string;
  allowMagicType?: boolean;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
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

function flattenTreemap(data: any[], prefix = ''): ChartTable {
  const rows: string[][] = [];

  data.forEach((item) => {
    const name = item?.name ? String(item.name) : '';
    const path = prefix ? `${prefix} / ${name}` : name;
    const value = formatCell(item?.value);
    rows.push([path, value]);

    if (Array.isArray(item?.children) && item.children.length > 0) {
      const childTable = flattenTreemap(item.children, path);
      rows.push(...childTable.rows);
    }
  });

  return { headers: ['Name', 'Value'], rows };
}

function buildDataTable(option: any): ChartTable {
  const series = getSeriesArray(option);
  const xAxisData = getAxisData(option, 'xAxis');
  const yAxisData = getAxisData(option, 'yAxis');

  const firstSeriesType = String(series[0]?.type || '');
  const firstSeriesData = Array.isArray(series[0]?.data) ? series[0].data : [];

  if (firstSeriesType === 'pie' || (firstSeriesData.length > 0 && firstSeriesData.every((item: any) => item && typeof item === 'object' && 'value' in item && 'name' in item))) {
    const rows = firstSeriesData.map((item: any) => [
      formatCell(item?.name),
      formatCell(item?.value),
      item?.percent != null ? `${formatCell(item.percent)}%` : '',
    ]);
    return { headers: ['Name', 'Value', 'Percent'], rows };
  }

  if (firstSeriesType === 'treemap' && firstSeriesData.length > 0) {
    return flattenTreemap(firstSeriesData);
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

    return { headers: ['Name', 'X', 'Y', 'Z'], rows };
  }

  const categoryData = xAxisData.length > 0 ? xAxisData : yAxisData;

  if (categoryData.length > 0 && series.length > 0) {
    const rows = categoryData.map((label, rowIndex) => [
      label,
      ...series.map((item) => normalizePointValue(Array.isArray(item?.data) ? item.data[rowIndex] : '')),
    ]);
    return {
      headers: ['Category', ...series.map((item, index) => String(item?.name || `Series ${index + 1}`))],
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

    return { headers: ['Series', 'Value'], rows };
  }

  return { headers: ['Field', 'Value'], rows: [] };
}

function getSeriesType(series: any) {
  return String(series?.type || 'bar');
}

export default function ChartWithToolbar({
  option,
  style,
  className,
  allowMagicType = false,
  notMerge,
  lazyUpdate,
  title,
  actions,
}: ChartWithToolbarProps) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const chartRef = useRef<any>(null);
  const [showDataView, setShowDataView] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
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
  const dataTable = useMemo(() => buildDataTable(option), [option]);

  useEffect(() => {
    setChartMode(baseChartMode);
  }, [baseChartMode, magicTypeCapable]);

  const finalOption = useMemo(() => {
    if (!magicTypeCapable) {
      return { ...option };
    }

    if (chartMode === 'original') {
      return { ...option };
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
      return { ...option, series: transformedSeries };
    }

    if (option?.series) {
      return { ...option, series: transformedSeries[0] };
    }

    return { ...option };
  }, [chartMode, magicTypeCapable, option, seriesArray]);

  const toolbarButtonClass = (disabled = false, active = false) => (
    `rounded-md p-1.5 transition-colors ${
      disabled
        ? 'cursor-not-allowed text-text-muted/60 opacity-60'
        : active
          ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
          : 'text-text-muted hover:bg-bg-base hover:text-blue-600'
    }`
  );

  const handleDownload = () => {
    const instance = chartRef.current?.getEchartsInstance?.();
    if (!instance) return;
    const url = instance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: isDark ? '#0b1730' : '#ffffff',
    });
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chart.png';
    link.click();
  };

  const handleReset = () => {
    const instance = chartRef.current?.getEchartsInstance?.();
    instance?.restore?.();
    setChartMode(baseChartMode);
  };

  return (
    <div className={`flex min-h-0 flex-col ${className || ''}`} style={style}>
      <div className="mb-1 flex flex-col gap-1">
        <div className="flex items-center justify-end gap-1 text-text-muted">
          <button
            type="button"
            onClick={() => setShowDataView(true)}
            className={toolbarButtonClass()}
            title="Data"
          >
            <Table2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setChartMode('line')}
            disabled={!magicTypeCapable || (!isMixedMagicChart && chartMode === 'line')}
            className={toolbarButtonClass(!magicTypeCapable, !isMixedMagicChart && chartMode === 'line')}
            title="Line chart"
          >
            <LineChart className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setChartMode('bar')}
            disabled={!magicTypeCapable || (!isMixedMagicChart && chartMode === 'bar')}
            className={toolbarButtonClass(!magicTypeCapable, !isMixedMagicChart && chartMode === 'bar')}
            title="Column chart"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className={toolbarButtonClass()}
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className={toolbarButtonClass()}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowZoom(true)}
            className={toolbarButtonClass()}
            title="Zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        {title ? (
          <div className="min-w-0 text-center">
            <div className="text-sm md:text-base font-bold text-blue-600 dark:text-white leading-snug break-words">
              {title}
            </div>
          </div>
        ) : null}
        {actions ? (
          <div className="flex min-w-0 justify-center md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <ReactECharts
          ref={chartRef}
          option={finalOption}
          style={{ height: '100%', width: '100%' }}
          notMerge={notMerge}
          lazyUpdate={lazyUpdate}
        />
      </div>

      {showDataView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowDataView(false)}
        >
          <div
            className="flex h-full max-h-screen w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-container shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-base px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-blue-600 dark:text-white text-left leading-snug break-words">
                  Data view
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDataView(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-base hover:text-blue-600"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="overflow-x-auto rounded-xl border border-border-base">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-surface-container-low">
                    <tr className="border-b border-border-base">
                      {dataTable.headers.map((header) => (
                        <th
                          key={header}
                          className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-text-muted"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataTable.rows.length > 0 ? dataTable.rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className="border-b border-border-base/70 last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-3 text-sm font-medium text-text-base">
                            {cell || '-'}
                          </td>
                        ))}
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-4 text-sm text-text-muted" colSpan={dataTable.headers.length}>
                          No data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowZoom(false)}
        >
          <div
            className="flex h-full max-h-screen w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-container shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-base px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-blue-600 dark:text-white text-left leading-snug break-words">
                  Zoom
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowZoom(false)}
                className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-base hover:text-blue-600"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <ReactECharts
                option={finalOption}
                style={{ height: '100%', width: '100%' }}
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
