import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';
import { exportRowsToExcel } from '../../utils/excel';
import { twMerge } from 'tailwind-merge';
import { Portal } from './Portal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ChartDataTableAlign = 'left' | 'center' | 'right';

export interface ChartDataTableColumn {
  label: string;
  unit?: string;
  align?: ChartDataTableAlign;
  kind?: 'text' | 'number';
  sortable?: boolean;
}

interface ChartDataViewModalProps {
  isOpen: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  columns: ChartDataTableColumn[];
  rows: Array<Array<string | number | null | undefined>>;
  onClose: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
  fileNameBase: string;
  sheetName: string;
  onCategoryClick?: (categoryValue: string, row: Array<string | number | null | undefined>) => void;
}

interface SortState {
  columnIndex: number;
  direction: 'asc' | 'desc' | null;
}

const parseSortValue = (value: string | number | null | undefined) => {
  if (value == null) return null;
  if (typeof value === 'number') return value;

  const raw = String(value)
    .replace(/\s+/g, '')
    .replace(/%/g, '');

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(/,/g, '.')
    : raw.replace(/\./g, '');

  if (!normalized) return null;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : String(value).toLowerCase();
};

const compareSortValues = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) => {
  const leftValue = parseSortValue(left);
  const rightValue = parseSortValue(right);

  if (leftValue === rightValue) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue;
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

export function ChartDataViewModal({
  isOpen,
  title,
  subtitle,
  columns,
  rows,
  onClose,
  onBack,
  showBackButton = false,
  fileNameBase,
  sheetName,
  onCategoryClick,
}: ChartDataViewModalProps) {
  const { t } = useLanguage();
  const [sortState, setSortState] = useState<SortState | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setSortState(null);
  }, [isOpen]);

  const sortedRows = useMemo(() => {
    if (!sortState || sortState.direction == null) return rows;

    const column = columns[sortState.columnIndex];
    if (!column) return rows;

    return [...rows].sort((left, right) => {
      const comparison = compareSortValues(left[sortState.columnIndex], right[sortState.columnIndex]);
      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, rows, sortState]);

  const handleExport = () => {
    exportRowsToExcel({
      fileNameBase,
      sheetName,
      rows: sortedRows as any,
      columns: columns.map((column, index) => ({
        header: column.unit ? `${column.label} (${column.unit})` : column.label,
        value: (row) => row[index] ?? '',
      })),
    });
  };

  const updateSortColumn = (columnIndex: number) => {
    const column = columns[columnIndex];
    if (!column) return;

    setSortState((current) => ({
      columnIndex,
      direction: current?.columnIndex === columnIndex
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : 'asc',
    }));
  };

  if (!isOpen) return null;

  const resolvedTitle = typeof title === 'string' || typeof title === 'number' ? title : t('dataView');

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-screen w-fit max-w-full flex-col self-center overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-border-base px-4 py-4">
          {showBackButton ? (
            <button
              type="button"
              onClick={onBack || onClose}
              className="absolute left-4 top-4 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
              title={t('back')}
              aria-label={t('back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-highlight"
            title={t('close')}
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex w-full flex-col gap-3">
            <div className={cn('text-center', showBackButton ? 'px-14' : 'px-14')}>
              <h3 className="text-base font-bold leading-snug break-words text-black md:text-lg">
                {resolvedTitle}
              </h3>
              {subtitle ? (
                <p className="mt-1 text-xs font-medium text-text-muted">
                  {subtitle}
                </p>
              ) : null}
            </div>

          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
            <div className="w-full overflow-x-auto rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 dark:shadow-black/20">
            <table className="w-full min-w-max border-collapse text-left">
              <thead className="border-b border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={`${column.label}-${column.unit || ''}-${index}`}
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => updateSortColumn(index)}
                        className={cn(
                          'inline-flex w-full items-center gap-2',
                          column.align === 'right'
                            ? 'justify-end text-right'
                            : column.align === 'center'
                              ? 'justify-center text-center'
                              : 'justify-start text-left',
                        )}
                      >
                        <span className="inline-flex min-w-0 flex-col">
                          <span className="block leading-none">{column.label}</span>
                          {column.unit ? (
                            <span className="mt-1 block leading-none text-xs font-bold uppercase tracking-wider text-white/80">
                              ({column.unit})
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0">
                          {sortState?.columnIndex === index ? (
                            sortState.direction === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-white/80" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-white/80" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 text-white/70" />
                          )}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {sortedRows.length > 0 ? sortedRows.map((row, rowIndex) => (
                  <tr
                    key={`chart-data-row-${rowIndex}`}
                    className={`cursor-default transition-colors ${rowIndex % 2 === 1 ? 'bg-bg-base/50' : 'bg-bg-surface'} hover:bg-surface-container-low/70`}
                  >
                    {columns.map((column, columnIndex) => (
                      <td
                        key={`${rowIndex}-${columnIndex}`}
                        className={`px-6 py-5 text-sm font-semibold text-text-base whitespace-nowrap ${
                          column.align === 'right'
                            ? 'text-right tabular-nums'
                            : column.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        }`}
                      >
                        {columnIndex === 0 && onCategoryClick && String(row[columnIndex] ?? '').trim() ? (
                          <button
                            type="button"
                            onClick={() => onCategoryClick(String(row[columnIndex] ?? '').trim(), row)}
                            className="inline-flex max-w-full items-center justify-start text-left font-semibold text-blue-600 transition-colors hover:text-blue-500 hover:underline"
                          >
                            <span className="truncate">{row[columnIndex] ?? '-'}</span>
                          </button>
                        ) : (
                          row[columnIndex] ?? '-'
                        )}
                    </td>
                  ))}
                </tr>
                )) : (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-sm font-semibold text-text-muted"
                      colSpan={columns.length}
                    >
                      {t('noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
