import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden rounded-lg border border-border-base bg-bg-surface/95 shadow-sm shadow-slate-900/5 transition-all duration-200 dark:bg-bg-surface/95 dark:shadow-black/20', className)}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
}

export function MetricCard({ label, value, unit }: MetricCardProps) {
  return (
    <Card className="group relative p-3">
      <div className="absolute inset-x-0 top-0 h-1 bg-action-accent" />
      <div className="flex min-w-0 min-h-28 flex-col justify-between gap-3 text-left">
        <p className="w-full whitespace-nowrap text-xs font-semibold uppercase leading-none tracking-wider text-text-muted/80">{label}</p>
        <p className="w-full whitespace-nowrap text-2xl font-bold leading-none text-text-base transition-colors sm:text-xl md:text-2xl">
          {value}
        </p>
        <p className="w-full whitespace-nowrap text-xs font-semibold uppercase leading-none text-text-muted">{unit}</p>
      </div>
    </Card>
  );
}
