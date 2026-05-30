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
      <div className="flex min-w-0 min-h-28 flex-col items-center justify-between gap-3 text-center">
        <p className="w-full break-words text-xs font-semibold uppercase leading-snug tracking-wider text-text-muted/80">{label}</p>
        <p className="w-full break-words text-xl font-bold leading-tight text-text-base transition-colors md:text-2xl">
          {value}
        </p>
        <p className="w-full break-words text-xs font-semibold uppercase leading-snug text-text-muted">{unit}</p>
      </div>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="relative p-3">
      <div className="absolute inset-x-0 top-0 h-1 bg-blue-500/20" />
      <div className="flex min-h-28 animate-pulse flex-col items-center justify-between gap-3 text-center">
        <div className="h-3 w-24 rounded-full bg-surface-container-low" />
        <div className="h-8 w-32 rounded-full bg-surface-container-low" />
        <div className="h-3 w-20 rounded-full bg-surface-container-low" />
      </div>
    </Card>
  );
}

interface SectionCardSkeletonProps {
  className?: string;
}

export function SectionCardSkeleton({ className }: SectionCardSkeletonProps) {
  return (
    <Card className={cn('p-3 md:p-4', className)}>
      <div className="flex min-h-80 animate-pulse flex-col gap-4 md:min-h-96">
        <div className="h-4 w-40 rounded-full bg-surface-container-low" />
        <div className="flex-1 rounded-lg bg-surface-container-low" />
      </div>
    </Card>
  );
}
