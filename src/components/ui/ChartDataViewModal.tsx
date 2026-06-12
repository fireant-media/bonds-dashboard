import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { ArrowLeft, ChevronDown, Search, X } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';
import { exportRowsToExcel } from '../../utils/excel';
import { SortControl } from './SortControl';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ChartDataTableAlign = 'left' | 'center' | 'right';

export interface ChartDataTableColumn {
  label: string;
  unit?: string;
  align?: ChartDataTableAlign;
  kind?: 'text' | 'number';
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
}: ChartDataViewModalProps) {
  const { t } = useLanguage();
  const [searchText, setSearchText] = useState('');
  const [searchListOpen, setSearchListOpen] = useState(false);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const searchRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setSearchText('');
    setSortState(null);
    setSearchListOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!searchListOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!searchRootRef.current) return;
      if (!searchRootRef.current.contains(event.target as Node)) {
        setSearchListOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [searchListOpen]);

  const categoryOptions = useMemo(() => {
    const values = rows
      .map((row) => String(row[0] ?? '').trim())
      .filter(Boolean);

    return Array.from(new Set(values));
  }, [rows]);

  const filteredCategoryOptions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions.filter((item) => item.toLowerCase().includes(query));
  }, [categoryOptions, searchText]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => String(row[0] ?? '').toLowerCase().includes(query));
  }, [rows, searchText]);

  const visibleRows = useMemo(() => {
    if (!sortState || sortState.direction == null) return filteredRows;

    const column = columns[sortState.columnIndex];
    if (!column) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const comparison = compareSortValues(left[sortState.columnIndex], right[sortState.columnIndex]);
      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, filteredRows, sortState]);

  const handleExport = () => {
    exportRowsToExcel({
      fileNameBase,
      sheetName,
      rows: visibleRows as any,
      columns: columns.map((column, index) => ({
        header: column.unit ? `${column.label} (${column.unit})` : column.label,
        value: (row) => row[index] ?? '',
      })),
    });
  };

  const sortOptions = columns
    .map((column, index) => ({
      index,
      label: column.label,
      kind: column.kind || (column.align === 'right' ? 'number' : 'text'),
    }))
    .filter((option) => option.index > 0 && option.kind === 'number');

  const sortControlValue = sortState ? String(sortState.columnIndex) : null;
  const sortControlOptions = [
    {
      value: '__default__',
      label: t('sortBy'),
      isDefault: true,
    },
    ...sortOptions.map((option) => ({
      value: String(option.index),
      label: option.label,
    })),
  ];

  const updateSortColumn = (columnIndex: number) => {
    const column = columns[columnIndex];
    if (!column) return;

    setSortState((current) => ({
      columnIndex,
      direction: current?.direction ?? null,
    }));
  };

  const updateSortDirection = (direction: 'asc' | 'desc') => {
    if (!sortState) return;

    setSortState({
      columnIndex: sortState.columnIndex,
      direction,
    });
  };

  if (!isOpen) return null;

  const resolvedTitle = typeof title === 'string' || typeof title === 'number' ? title : t('dataView');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-screen w-fit max-w-full flex-col overflow-hidden rounded-lg border border-border-base bg-surface-bright shadow-2xl"
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
            <div className={cn('text-center', showBackButton ? 'px-10' : 'px-4')}>
              <h3 className="text-base font-bold leading-snug break-words text-text-base md:text-lg">
                {resolvedTitle}
              </h3>
              {subtitle ? (
                <p className="mt-1 text-xs font-medium text-text-muted">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 px-4">
              <div ref={searchRootRef} className="relative min-w-0 flex-1">
                <div className="flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-sm transition-colors hover:border-blue-200 hover:bg-surface-container-low">
                  <div className="flex h-full items-center pl-3 text-blue-600">
                    <Search className="h-4 w-4" />
                  </div>
                  <input
                    id="chart-data-view-search"
                    type="text"
                    value={searchText}
                    onChange={(event) => {
                      setSearchText(event.target.value);
                      setSearchListOpen(true);
                    }}
                    onFocus={() => setSearchListOpen(true)}
                    placeholder={t('searchPlaceholder')}
                    className="min-w-0 h-full flex-1 bg-transparent px-2 text-sm font-semibold text-text-base outline-none placeholder:text-text-muted/70"
                  />
                  <button
                    type="button"
                    onClick={() => setSearchListOpen((current) => !current)}
                    className="flex h-full items-center justify-center border-l border-border-base px-3 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-base"
                    aria-label={t('searchLabel')}
                    title={t('searchLabel')}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${searchListOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {searchListOpen ? (
                  <div className="absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-xl">
                    <div className="max-h-56 overflow-auto py-1">
                      {filteredCategoryOptions.length > 0 ? filteredCategoryOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setSearchText(item);
                            setSearchListOpen(false);
                          }}
                          className="flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-text-base transition-colors hover:bg-surface-container-low"
                        >
                          {item}
                        </button>
                      )) : (
                        <div className="px-3 py-2 text-sm text-text-muted">
                          {t('noData')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <SortControl
                className="w-fit max-w-full shrink-0"
                label={t('sortBy')}
                options={sortControlOptions}
                value={sortControlValue}
                appliedValue={sortControlValue}
                appliedDirection={sortState?.direction ?? null}
                onChange={(value) => {
                  if (value == null) {
                    setSortState(null);
                    return;
                  }

                  updateSortColumn(Number(value));
                }}
                onDirectionChange={updateSortDirection}
                ascendingLabel={t('ascending')}
                descendingLabel={t('descending')}
                stretch={false}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
            <div className="w-full overflow-x-auto rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 dark:shadow-black/20">
            <table className="w-full min-w-max border-collapse text-left">
              <thead className="border-b border-blue-500/30 bg-blue-600 text-white">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={`${column.label}-${column.unit || ''}-${index}`}
                      className={cn(
                        'px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap',
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      <span className="block leading-none">{column.label}</span>
                      {column.unit ? (
                        <span className={cn('mt-1 block text-xs font-semibold uppercase tracking-wider leading-none', column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left')}>
                          ({column.unit})
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {visibleRows.length > 0 ? visibleRows.map((row, rowIndex) => (
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
                        {row[columnIndex] ?? '-'}
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
  );
}
