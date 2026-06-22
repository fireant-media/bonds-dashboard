import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort ?? null);
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumnIds.includes(column.id)),
    [columns, hiddenColumnIds],
  );

  useEffect(() => {
    setSort(initialSort ?? null);
    setPage(1);
  }, [initialSort?.columnId, initialSort?.direction]);

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

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 dark:shadow-black/20", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-full table-fixed text-left">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} className={column.widthClassName} />
            ))}
          </colgroup>
          <thead className="border-b border-blue-500/30 bg-blue-600 text-white transition-colors">
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sort?.columnId === column.id;
                const SortIcon = !isSorted ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

                return (
                  <th
                    key={column.id}
                    className={cn(
                      "px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-center",
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
                        <span className="col-start-1 row-start-2 block text-xs font-semibold tracking-wider text-white/80 normal-case leading-none">
                          {column.unit}
                        </span>
                      ) : null}
                      {column.sortable ? (
                        <span className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center",
                          column.unit ? "col-start-2 row-span-2 self-center" : "",
                        )}>
                          <SortIcon className="h-3.5 w-3.5 text-white/90" />
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
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
            ) : (
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
          <div className="flex items-center justify-between gap-3 border-t border-border-base bg-bg-surface px-4 py-3 text-sm lg:hidden">
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

          <div className="hidden overflow-x-auto border-t border-border-base bg-surface-container-low/70 px-4 py-4 transition-colors md:px-6 lg:flex lg:items-center lg:justify-end lg:pr-8 xl:pr-12">
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
                          ? "border-transparent bg-action-accent text-slate-950 shadow-md shadow-cyan-500/20"
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
