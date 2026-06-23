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
    <div className={cn('min-w-0 max-w-full overflow-hidden rounded-lg border border-border-base bg-bg-surface shadow-md shadow-blue-950/5 transition-all duration-200 dark:bg-bg-surface dark:shadow-black/20', className)}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
  icon?: LucideIcon;
  tone?: 'blue' | 'purple' | 'green' | 'orange';
  sparklineValues?: number[];
}

const metricToneClass = {
  blue: {
    card: 'hover:border-blue-200 hover:shadow-blue-500/10',
    icon: 'from-ref-blue-start to-ref-blue-end shadow-blue-500/25',
    glow: 'from-blue-50/90 dark:from-blue-500/10',
    value: 'group-hover:text-blue-700',
    sparkline: 'text-ref-blue-start',
  },
  purple: {
    card: 'hover:border-violet-200 hover:shadow-violet-500/10',
    icon: 'from-ref-purple-start to-ref-purple-end shadow-violet-500/25',
    glow: 'from-violet-50/90 dark:from-violet-500/10',
    value: 'group-hover:text-violet-700',
    sparkline: 'text-ref-purple-start',
  },
  green: {
    card: 'hover:border-emerald-200 hover:shadow-emerald-500/10',
    icon: 'from-ref-green-start to-ref-green-end shadow-emerald-500/25',
    glow: 'from-emerald-50/90 dark:from-emerald-500/10',
    value: 'group-hover:text-emerald-700',
    sparkline: 'text-ref-green-start',
  },
  orange: {
    card: 'hover:border-orange-200 hover:shadow-orange-500/10',
    icon: 'from-ref-orange-start to-ref-orange-end shadow-orange-500/25',
    glow: 'from-orange-50/90 dark:from-orange-500/10',
    value: 'group-hover:text-orange-700',
    sparkline: 'text-ref-orange-start',
  },
};

const decorativeMetricLines = {
  blue: {
    line: '0,26 14,22 28,24 42,16 56,18 70,10 84,14 98,8 112,12 120,6',
    area: '0,28 0,26 14,22 28,24 42,16 56,18 70,10 84,14 98,8 112,12 120,6 120,28',
  },
  purple: {
    line: '0,20 16,24 30,18 46,22 60,12 74,16 88,10 102,14 114,8 120,11',
    area: '0,28 0,20 16,24 30,18 46,22 60,12 74,16 88,10 102,14 114,8 120,11 120,28',
  },
  green: {
    line: '0,24 12,18 26,20 40,12 54,16 68,8 82,10 96,6 110,10 120,7',
    area: '0,28 0,24 12,18 26,20 40,12 54,16 68,8 82,10 96,6 110,10 120,7 120,28',
  },
  orange: {
    line: '0,22 14,26 28,18 44,20 58,11 72,15 86,9 100,13 114,7 120,9',
    area: '0,28 0,22 14,26 28,18 44,20 58,11 72,15 86,9 100,13 114,7 120,9 120,28',
  },
};

export function MetricCard({ label, value, unit, icon: Icon = BarChart3, tone = 'blue' }: MetricCardProps) {
  const toneClass = metricToneClass[tone];
  const decorativeLine = decorativeMetricLines[tone];

  return (
    <Card className={cn('group relative p-4 transition-all duration-200 hover:shadow-lg', toneClass.card)}>
      <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent opacity-80', toneClass.glow)} />
      <div className="pointer-events-none absolute inset-x-4 bottom-3">
        <svg
          viewBox="0 0 120 28"
          preserveAspectRatio="none"
          className={cn('h-9 w-full', toneClass.sparkline)}
          aria-hidden="true"
        >
          <polygon points={decorativeLine.area} fill="currentColor" opacity="0.06" />
          <polyline points={decorativeLine.line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.32" />
        </svg>
      </div>
      <div className="relative flex min-w-0 min-h-32 flex-col justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-lg transition-colors duration-200', toneClass.icon)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-left text-xs font-bold uppercase leading-snug tracking-wider text-slate-950 transition-colors dark:text-text-base">
              {label}
            </p>
            <p className={cn('mt-2 break-words text-left text-3xl font-bold leading-tight text-slate-950 transition-colors duration-200 dark:text-text-base md:text-4xl', toneClass.value)}>
              {value}
            </p>
            <p className="mt-1 break-words text-left text-xs font-semibold uppercase leading-snug text-text-muted">{unit}</p>
          </div>
        </div>
        <div className="h-8" aria-hidden="true" />
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
