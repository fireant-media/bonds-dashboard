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
    <div
      className={cn(
        'group relative isolate min-w-0 max-w-full overflow-hidden rounded-xl border border-border-base bg-bg-surface shadow-sm shadow-blue-950/5 ring-1 ring-transparent transition-all duration-300 motion-reduce:transition-none dark:bg-bg-surface dark:shadow-black/20 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/70 before:via-white/20 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-950/10 hover:ring-blue-100/80 hover:before:opacity-100 motion-reduce:hover:translate-y-0 dark:before:from-white/5 dark:before:via-white/0 dark:hover:border-blue-500/20 dark:hover:shadow-black/30 dark:hover:ring-blue-500/10',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  tone?: 'blue' | 'purple' | 'green' | 'cyan' | 'indigo' | 'orange';
  sparklineValues?: number[];
  className?: string;
  valueClassName?: string;
  unitClassName?: string;
}

const metricToneClass = {
  blue: {
    card: 'hover:border-blue-200 hover:shadow-blue-500/10',
    icon: 'from-ref-blue-start to-ref-blue-end shadow-blue-500/25',
    glow: 'from-blue-50/90 dark:from-blue-500/10',
    value: 'group-hover:text-blue-700',
  },
  purple: {
    card: 'hover:border-violet-200 hover:shadow-violet-500/10',
    icon: 'from-ref-purple-start to-ref-purple-end shadow-violet-500/25',
    glow: 'from-violet-50/90 dark:from-violet-500/10',
    value: 'group-hover:text-violet-700',
  },
  green: {
    card: 'hover:border-emerald-200 hover:shadow-emerald-500/10',
    icon: 'from-ref-green-start to-ref-green-end shadow-emerald-500/25',
    glow: 'from-emerald-50/90 dark:from-emerald-500/10',
    value: 'group-hover:text-emerald-700',
  },
  cyan: {
    card: 'hover:border-cyan-200 hover:shadow-cyan-500/10',
    icon: 'from-cyan-500 to-cyan-300 shadow-cyan-500/25',
    glow: 'from-cyan-50/90 dark:from-cyan-500/10',
    value: 'group-hover:text-cyan-700',
  },
  indigo: {
    card: 'hover:border-indigo-200 hover:shadow-indigo-500/10',
    icon: 'from-indigo-500 to-blue-400 shadow-indigo-500/25',
    glow: 'from-indigo-50/90 dark:from-indigo-500/10',
    value: 'group-hover:text-indigo-700',
  },
  orange: {
    card: 'hover:border-orange-200 hover:shadow-orange-500/10',
    icon: 'from-ref-orange-start to-ref-orange-end shadow-orange-500/25',
    glow: 'from-orange-50/90 dark:from-orange-500/10',
    value: 'group-hover:text-orange-700',
  },
};

export function MetricCard({ label, value, unit, icon: Icon = BarChart3, tone = 'blue', className, valueClassName, unitClassName }: MetricCardProps) {
  const toneClass = metricToneClass[tone];

  return (
    <Card className={cn('group relative p-4 transition-all duration-300', toneClass.card, className)}>
      <div className="relative flex min-h-24 min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/30 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 motion-reduce:transform-none', toneClass.icon)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 self-center">
            <p className="break-words text-xs font-bold uppercase leading-snug tracking-wider text-text-muted/80 transition-colors group-hover:text-text-muted dark:text-text-muted/80">
              {label}
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className={cn('break-words text-center text-3xl font-bold leading-none tracking-tight tabular-nums text-slate-950 drop-shadow-sm transition-colors duration-300 dark:text-text-base md:text-4xl', toneClass.value, valueClassName)}>
            {value}
          </p>
          {unit ? <p className={cn('mt-1.5 break-words text-center text-xs font-semibold uppercase leading-snug tracking-wide text-text-muted/80', unitClassName)}>{unit}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="relative p-4">
      <div className="flex min-h-24 animate-pulse flex-col justify-between gap-3">
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
