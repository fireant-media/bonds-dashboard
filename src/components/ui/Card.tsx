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
    <div className={cn('min-w-0 max-w-full overflow-hidden bg-surface-bright rounded-lg border border-border-base shadow-sm transition-colors', className)}>
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
    <Card className="p-4">
      <div className="min-w-0 space-y-3 text-center">
        <p className="text-xs font-semibold uppercase text-text-muted/80 leading-snug break-words">{label}</p>
        <div className="min-w-0">
          <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-white leading-tight break-words">{value}</p>
          <p className="text-xs font-semibold text-text-muted mt-2 leading-snug break-words">{unit}</p>
        </div>
      </div>
    </Card>
  );
}
