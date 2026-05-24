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
    <Card className="p-2">
      <div className="flex min-w-0 min-h-28 flex-col items-center justify-center gap-4 text-center">
        <p className="w-full whitespace-nowrap text-sm font-semibold leading-none tracking-wider text-text-muted/80">{label}</p>
        <p className="w-full whitespace-nowrap text-2xl font-bold leading-none text-blue-600 dark:text-white sm:text-xl md:text-2xl">
          {value}
        </p>
        <p className="w-full whitespace-nowrap text-sm font-semibold leading-none text-text-muted">{unit}</p>
      </div>
    </Card>
  );
}
