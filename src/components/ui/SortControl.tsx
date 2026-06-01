import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SortOption {
  value: string;
  label: string;
  isDefault?: boolean;
}

interface SortControlProps {
  label: string;
  options: SortOption[];
  value: string | null;
  appliedValue: string | null;
  appliedDirection: 'asc' | 'desc' | null;
  onChange: (value: string | null) => void;
  onDirectionChange: (direction: 'asc' | 'desc' | null) => void;
  ascendingLabel: string;
  descendingLabel: string;
  className?: string;
  menuAlign?: 'left' | 'right';
  stretch?: boolean;
}

export function SortControl({
  label,
  options,
  value,
  appliedValue,
  appliedDirection,
  onChange,
  onDirectionChange,
  ascendingLabel,
  descendingLabel,
  className,
  menuAlign = 'right',
  stretch = true,
}: SortControlProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLButtonElement | null>(null);
  const [buttonMinWidth, setButtonMinWidth] = useState<number | null>(null);

  const selectedLabel = useMemo(() => {
    return options.find((option) => (option.isDefault && value == null) || option.value === value)?.label || label;
  }, [label, options, value]);

  const widestLabel = useMemo(() => {
    return options.reduce((currentWidest, option) => {
      if (option.label.length > currentWidest.length) return option.label;
      return currentWidest;
    }, label);
  }, [label, options]);

  useLayoutEffect(() => {
    if (!stretch && measureRef.current) {
      setButtonMinWidth(measureRef.current.offsetWidth);
      return;
    }

    setButtonMinWidth(null);
  }, [stretch, widestLabel]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={menuRef} className={cn('inline-flex flex-none items-center gap-2', className)}>
      <div className={cn('relative', stretch ? 'min-w-0 flex-1' : 'min-w-0')}>
        {!stretch ? (
          <button
            ref={measureRef}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 inline-flex h-11 w-auto items-center justify-between gap-2 rounded-lg border border-border-base bg-bg-surface px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-text-base shadow-sm"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <ArrowUpDown className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="whitespace-nowrap">{widestLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'inline-flex h-11 items-center justify-between gap-2 rounded-lg border border-border-base bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-base shadow-sm transition-colors hover:border-blue-200 hover:bg-surface-container-low',
            stretch ? 'w-full min-w-0' : 'w-auto whitespace-nowrap'
          )}
          style={!stretch && buttonMinWidth ? { minWidth: `${buttonMinWidth}px` } : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <ArrowUpDown className="h-4 w-4 shrink-0 text-blue-600" />
            <span className={stretch ? 'truncate' : 'whitespace-nowrap'}>{selectedLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        </button>

        {open && (
          <div
            className={cn(
              'absolute top-full z-20 mt-2 min-w-0 overflow-hidden rounded-lg border border-border-base bg-bg-surface p-2 text-left shadow-xl shadow-blue-950/10',
              menuAlign === 'right' ? 'right-0 w-full' : 'left-0 w-full'
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.isDefault ? null : option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  (option.isDefault && value == null) || value === option.value
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400'
                    : 'text-text-base hover:bg-surface-container-low'
                )}
              >
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (value == null) return;
          onDirectionChange('asc');
        }}
        title={ascendingLabel}
        aria-label={ascendingLabel}
        disabled={value == null}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-text-base shadow-sm transition-colors disabled:cursor-not-allowed',
          value != null && appliedValue === value && appliedDirection === 'asc'
            ? 'border-transparent bg-action-accent text-slate-950 shadow-md shadow-cyan-500/20'
            : 'border-border-base bg-transparent hover:border-blue-200 hover:bg-surface-container-low'
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (value == null) return;
          onDirectionChange('desc');
        }}
        title={descendingLabel}
        aria-label={descendingLabel}
        disabled={value == null}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-text-base shadow-sm transition-colors disabled:cursor-not-allowed',
          value != null && appliedValue === value && appliedDirection === 'desc'
            ? 'border-transparent bg-action-accent text-slate-950 shadow-md shadow-cyan-500/20'
            : 'border-border-base bg-transparent hover:border-blue-200 hover:bg-surface-container-low'
        )}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}
