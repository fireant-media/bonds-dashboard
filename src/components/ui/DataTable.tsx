import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Remembers the current page per table (keyed by `persistKey`) so a table that UNMOUNTS and remounts
// — e.g. the bond list is replaced by the bond-detail view, then restored on "back" — returns to the
// page the user was on instead of resetting to page 1. Module-scoped so it survives the remount;
// resets on a full reload, which is the desired "fresh session" behaviour.
const dataTablePageStore = new Map<string, number>();

type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  unit?: string;
  accessor?: (row: T) => string | number | Date | null | undefined;
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  widthClassName?: string;
  stickyHeaderClassName?: string;
  stickyCellClassName?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  pageSize?: number;
  initialSort?: {
    columnId: string;
    direction: SortDirection;
  } | null;
  hiddenColumnIds?: string[];
  emptyState?: ReactNode;
  noColumnsState?: ReactNode;
  className?: string;
  onVisibleRowsChange?: (rows: T[]) => void;
  onRowClick?: (row: T) => void;
  hideEmptyStateRow?: boolean;
  // When set, the current page is remembered under this key across unmount/remount (e.g. opening a
  // row's detail view and coming back), so the table restores that page instead of resetting to 1.
  persistKey?: string;
}

const compareValues = (
  left: string | number | Date | null | undefined,
  right: string | number | Date | null | undefined,
) => {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;

  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue;
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const buildPageItems = (currentPage: number, totalPages: number): Array<number | 'ellipsis'> => {
  if (totalPages <= 4) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 'ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', currentPage, 'ellipsis', totalPages];
};

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  pageSize = 20,
  initialSort,
  hiddenColumnIds = [],
  emptyState,
  noColumnsState,
  className,
  onVisibleRowsChange,
  onRowClick,
  hideEmptyStateRow = false,
  persistKey,
}: DataTableProps<T>) {
  const [page, setPage] = useState(() => (persistKey && dataTablePageStore.get(persistKey)) || 1);
  const [sort, setSort] = useState(initialSort ?? null);
  const headerViewportRef = useRef<HTMLDivElement | null>(null);
  const headerTableRef = useRef<HTMLTableElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumnIds.includes(column.id)),
    [columns, hiddenColumnIds],
  );

  // Reset to the first page when the incoming sort ACTUALLY changes. Tracked by a signature ref
  // (not a "skip first run" flag) so it is idempotent: the initial value is adopted without a reset,
  // and StrictMode's double-invoked mount effect — which re-runs with the same value — does NOT fire
  // the reset and wipe a page restored from `persistKey`. Only a genuinely new sort resets to page 1.
  const lastSortSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = initialSort ? `${initialSort.columnId}:${initialSort.direction}` : 'none';
    if (lastSortSignatureRef.current === signature) return;
    const isFirstAdoption = lastSortSignatureRef.current === null;
    lastSortSignatureRef.current = signature;
    setSort(initialSort ?? null);
    if (!isFirstAdoption) setPage(1);
  }, [initialSort?.columnId, initialSort?.direction]);

  // Remember the page for this table so a remount (e.g. returning from a row's detail view) restores it.
  useEffect(() => {
    if (persistKey) dataTablePageStore.set(persistKey, page);
  }, [persistKey, page]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;

    const column = columns.find((item) => item.id === sort.columnId);
    if (!column?.accessor) return rows;

    return [...rows].sort((left, right) => {
      const result = compareValues(column.accessor?.(left), column.accessor?.(right));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [columns, rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageItems = useMemo(() => buildPageItems(safePage, totalPages), [safePage, totalPages]);

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [onVisibleRowsChange, visibleRows]);

  useEffect(() => {
    const headerViewportElement = headerViewportRef.current;
    const headerTableElement = headerTableRef.current;
    const bodyElement = bodyScrollRef.current;
    if (!headerViewportElement || !headerTableElement || !bodyElement) return undefined;

    const syncHeaderPosition = () => {
      headerTableElement.style.transform = `translateX(-${bodyElement.scrollLeft}px)`;
      headerTableElement.style.width = `${bodyElement.scrollWidth}px`;
      headerViewportElement.scrollLeft = 0;
    };

    syncHeaderPosition();

    bodyElement.addEventListener('scroll', syncHeaderPosition, { passive: true });
    window.addEventListener('resize', syncHeaderPosition);

    return () => {
      bodyElement.removeEventListener('scroll', syncHeaderPosition);
      window.removeEventListener('resize', syncHeaderPosition);
    };
  }, [visibleColumns.length]);

  const handleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !column.accessor) return;

    setPage(1);
    setSort((current) => {
      if (current?.columnId !== column.id) {
        return { columnId: column.id, direction: 'asc' };
      }

      return {
        columnId: column.id,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  };

  const renderHeaderCell = (column: DataTableColumn<T>) => {
    const isSorted = sort?.columnId === column.id;
    const SortIcon = !isSorted ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

    return (
      <th
        key={column.id}
        className={cn(
          "bg-transparent px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center text-white",
          column.stickyHeaderClassName,
        )}
      >
        <button
          type="button"
          onClick={() => handleSort(column)}
          disabled={!column.sortable || !column.accessor}
          className={cn(
            "w-full text-center disabled:cursor-default",
            column.unit
              ? "grid grid-cols-[minmax(0,1fr)_auto] grid-rows-2 items-center justify-center gap-x-1"
              : "inline-flex items-center justify-center gap-1",
          )}
        >
          <span className={cn(
            "leading-none",
            column.unit ? "col-start-1 row-start-1" : "block",
          )}>
            {column.header}
          </span>
          {column.unit ? (
            <span className="col-start-1 row-start-2 block text-xs font-bold tracking-wider text-white/80 normal-case leading-none">
              {column.unit}
            </span>
          ) : null}
          {column.sortable ? (
            <span className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center",
              column.unit ? "col-start-2 row-span-2 self-center" : "",
            )}>
              <SortIcon className="h-3.5 w-3.5 text-white/80" />
            </span>
          ) : null}
        </button>
      </th>
    );
  };

  return (
    <div className={cn("overflow-visible rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 dark:shadow-black/20", className)}>
      {visibleColumns.length > 0 ? (
        <div ref={headerViewportRef} className="sticky top-0 z-20 overflow-hidden border-b border-cyan-400/30 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 transition-colors">
          <table ref={headerTableRef} className="min-w-full table-fixed text-left will-change-transform">
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column.id} className={column.widthClassName} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map(renderHeaderCell)}
              </tr>
            </thead>
          </table>
        </div>
      ) : null}

      <div ref={bodyScrollRef} className="overflow-x-auto">
        <table className="w-full min-w-full table-fixed text-left">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} className={column.widthClassName} />
            ))}
          </colgroup>
          <tbody className="divide-y divide-border-base">
            {visibleColumns.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm font-medium text-text-muted" colSpan={1}>
                  {noColumnsState || 'No columns selected'}
                </td>
              </tr>
            ) : visibleRows.length > 0 ? (
              visibleRows.map((row, index) => (
                  <tr
                    key={getRowKey(row, index)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={cn(
                    "group h-16 transition-colors odd:bg-bg-base/50 even:bg-bg-surface hover:bg-surface-container-low/70",
                    onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:bg-surface-container-low/70",
                  )}
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-4 py-3 align-middle text-sm font-medium text-text-base whitespace-nowrap transition-colors group-hover:text-blue-600",
                        column.align === 'right' && "text-right",
                        column.align === 'center' && "text-center",
                        column.className,
                        column.stickyCellClassName,
                      )}
                    >
                      {column.cell(row, (safePage - 1) * pageSize + index)}
                    </td>
                  ))}
                </tr>
              ))
            ) : hideEmptyStateRow ? null : (
              <tr>
                <td className="px-4 py-10 text-center text-sm font-medium text-text-muted" colSpan={Math.max(1, visibleColumns.length)}>
                  {emptyState || 'No data'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <>
          <div className="hidden items-center justify-between gap-3 border-t border-border-base bg-bg-surface px-4 py-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-border-base px-3 py-2 font-bold text-text-muted transition-colors disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-bold text-text-base">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-border-base px-3 py-2 font-bold text-text-muted transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>

          <div className="flex items-center justify-center overflow-x-auto border-t border-border-base bg-surface-container-low/70 px-4 py-4 transition-colors md:px-6">
            <div className="flex min-w-max items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1">
                {pageItems.map((item, index) => (
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="px-2 py-1 text-xs font-bold text-text-muted">...</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      className={cn(
                        "rounded-lg border px-3 py-1 text-xs font-bold transition-colors",
                        safePage === item
                          ? "border-transparent bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-none"
                          : "border-border-base bg-bg-base text-text-base hover:bg-bg-surface",
                      )}
                    >
                      {item}
                    </button>
                  )
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
