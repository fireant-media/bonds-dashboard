import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Search, X } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';
import { exportRowsToExcel } from '../../utils/excel';
import { ExportExcelButton } from './ExportExcelButton';

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
  direction: 'asc' | 'desc';
}

const parseSortValue = (value: string | number | null | undefined) => {
  if (value == null) return null;
  if (typeof value === 'number') return value;

  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(/%/g, '')
    .replace(/,/g, '');

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
    if (!sortState) return filteredRows;

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
      label: column.unit ? `${column.label} (${column.unit})` : column.label,
      kind: column.kind || (column.align === 'right' ? 'number' : 'text'),
    }))
    .filter((option) => option.index > 0 && option.kind === 'number');

  const selectedSortOption = sortOptions.find((option) => option.index === sortState?.columnIndex) || sortOptions[0] || null;

  const updateSort = (columnIndex: number, direction?: 'asc' | 'desc') => {
    const column = columns[columnIndex];
    if (!column) return;

    setSortState({
      columnIndex,
      direction: direction || 'desc',
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

          <div className={`flex flex-col gap-3 ${showBackButton ? 'px-10' : 'pr-10'}`}>
            <div className="text-center">
              <h3 className="text-base font-bold leading-snug break-words text-text-base md:text-lg">
                {resolvedTitle}
              </h3>
              {subtitle ? (
                <p className="mt-1 text-xs font-medium text-text-muted">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <div ref={searchRootRef} className="relative">
                <div className="flex min-w-72 items-stretch overflow-hidden rounded-lg border border-border-base bg-bg-surface">
                  <div className="flex items-center pl-3 text-text-muted">
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
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-medium text-text-base outline-none placeholder:text-text-muted/70"
                  />
                  <button
                    type="button"
                    onClick={() => setSearchListOpen((current) => !current)}
                    className="flex items-center justify-center border-l border-border-base px-3 text-text-muted transition-colors hover:bg-surface-container-low hover:text-text-base"
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
                          className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-text-base transition-colors hover:bg-surface-container-low"
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

              <div className="min-w-52">
                <select
                  value={sortState?.columnIndex ?? ''}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue === '') {
                      setSortState(null);
                      return;
                    }

                    updateSort(Number(rawValue), sortState?.direction || 'desc');
                  }}
                  className="w-full appearance-none rounded-lg border border-border-base bg-bg-surface px-3 py-2 text-sm font-semibold text-text-base outline-none transition-colors focus:border-blue-500/50"
                >
                  <option value="">{t('sortBy')}</option>
                  {sortOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex rounded-lg border border-border-base bg-surface-container-low p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedSortOption) return;
                    updateSort(selectedSortOption.index, 'asc');
                  }}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    sortState?.direction === 'asc'
                      ? 'bg-action-accent text-slate-950'
                      : 'text-text-muted hover:text-text-base'
                  }`}
                  title={t('ascending')}
                  aria-label={t('ascending')}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedSortOption) return;
                    updateSort(selectedSortOption.index, 'desc');
                  }}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    sortState?.direction === 'desc'
                      ? 'bg-action-accent text-slate-950'
                      : 'text-text-muted hover:text-text-base'
                  }`}
                  title={t('descending')}
                  aria-label={t('descending')}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <ExportExcelButton loading={false} onClick={handleExport} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="overflow-x-auto rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 dark:shadow-black/20">
            <table className="w-full min-w-max border-collapse text-left">
              <thead className="border-b border-border-base bg-surface-container-low text-text-muted">
                <tr className="border-b border-border-base">
                  {columns.map((column, index) => (
                    <th
                      key={`${column.label}-${column.unit || ''}-${index}`}
                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center"
                    >
                      <span className="block">{column.label}</span>
                      {column.unit ? (
                        <span className="block text-center text-xs font-semibold uppercase tracking-wider text-text-muted/80">
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
                        className={`px-6 py-5 text-sm font-medium text-text-base whitespace-nowrap ${
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
                      className="px-6 py-10 text-center text-sm font-medium text-text-muted"
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
