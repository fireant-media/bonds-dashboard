import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';
import { BarChart3, type LucideIcon } from 'lucide-react';

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
  icon?: LucideIcon;
}

export function MetricCard({ label, value, unit, icon: Icon = BarChart3 }: MetricCardProps) {
  return (
    <Card className="group relative p-3 transition-all duration-200 hover:-translate-y-1 hover:border-blue-500/25 hover:shadow-lg hover:shadow-blue-500/10">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100/80 via-blue-50/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:from-blue-500/15 dark:via-blue-500/5" />
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-200/30 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-blue-500/10" />
      <div className="relative flex min-w-0 min-h-28 flex-col gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-blue-500/15 group-hover:text-blue-700">
            <Icon className="h-5 w-5" />
          </div>
          <p className="min-w-0 flex-1 break-words text-left text-xs font-semibold uppercase leading-snug tracking-wider text-text-muted/80 transition-colors group-hover:text-text-muted">
            {label}
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="break-words text-center text-3xl font-bold leading-tight text-text-base transition-all duration-200 group-hover:scale-105 group-hover:text-blue-700 md:text-4xl">
            {value}
          </p>
        </div>
        <p className="break-words text-center text-xs font-semibold uppercase leading-snug text-text-muted">{unit}</p>
      </div>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="relative p-3">
      <div className="absolute inset-x-0 top-0 h-1 bg-blue-500/20" />
      <div className="flex min-h-28 animate-pulse flex-col justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-surface-container-low" />
          <div className="h-3 w-24 rounded-full bg-surface-container-low" />
        </div>
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
