import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AlertCircle, ChevronRight, Newspaper, RotateCcw } from 'lucide-react';
import { useNewsQuery } from '../query/dashboardQueries';
import { useLanguage } from '../LanguageContext';
import { formatDate } from '../utils/format';
import { Card } from './ui/Card';

interface RelatedNewsPanelProps {
  title?: string;
  description?: string;
  symbol?: string | null;
  className?: string;
  limit?: number;
}

function NewsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-sm">
      <div className="h-36 animate-pulse bg-surface-container-low" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-20 animate-pulse rounded-full bg-surface-container-low" />
        <div className="h-5 w-full animate-pulse rounded-full bg-surface-container-low" />
        <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-container-low" />
        <div className="h-3 w-24 animate-pulse rounded-full bg-surface-container-low" />
      </div>
    </div>
  );
}

export default function RelatedNewsPanel({
  title,
  description,
  symbol,
  className,
  limit = 50,
}: RelatedNewsPanelProps) {
  const { t } = useLanguage();
  const newsQuery = useNewsQuery(symbol);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });
  const skipClickRef = useRef(false);

  const newsList = useMemo(
    () => (Array.isArray(newsQuery.data) ? newsQuery.data : []).filter((item) => typeof item?.title === 'string' && item.title.trim().length > 0),
    [newsQuery.data],
  );
  const visibleNews = newsList.slice(0, limit);
  const skeletonCount = Math.min(limit, 6);
  const loading = newsQuery.isLoading && visibleNews.length === 0;
  const error = newsQuery.error instanceof Error ? newsQuery.error.message : null;

  const handleImageError = (id: string) => {
    setImageErrors((previous) => ({ ...previous, [id]: true }));
  };

  const handleResetSearch = () => {
    setImageErrors({});
    void newsQuery.refetch();
  };

  const stopDragging = () => {
    dragStateRef.current.isDragging = false;
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!scrollContainerRef.current) return;

    dragStateRef.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: scrollContainerRef.current.scrollLeft,
    };
    skipClickRef.current = false;
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.isDragging || !scrollContainerRef.current) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    if (Math.abs(deltaX) > 6) {
      skipClickRef.current = true;
      event.preventDefault();
    }

    scrollContainerRef.current.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
  };

  const articleTitle = title || t('relatedNews');
  const articleDescription = description || t('newsDescription');

  return (
    <Card className={`p-4 md:p-5 ${className || ''}`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
            <Newspaper className="h-4 w-4" />
            <span>{articleTitle}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-text-muted">{articleDescription}</p>
        </div>
        <button
          type="button"
          onClick={handleResetSearch}
          disabled={newsQuery.isFetching && visibleNews.length === 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          title={t('reset')}
          aria-label={t('reset')}
        >
          <RotateCcw className={`h-4 w-4 ${newsQuery.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-2 cursor-grab select-none active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
        >
          {Array.from({ length: skeletonCount }, (_, index) => (
            <div key={index} className="w-72 shrink-0">
              <NewsSkeleton />
            </div>
          ))}
        </div>
      ) : error && visibleNews.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-base bg-bg-surface px-4 py-10 text-center">
          <div className="rounded-full bg-red-50 p-4 dark:bg-red-900/20">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-text-base">{error}</p>
          <button
            type="button"
            onClick={() => void newsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <RefreshCw className="h-4 w-4" />
            {t('retry')}
          </button>
        </div>
      ) : visibleNews.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-base bg-bg-surface px-4 py-10 text-center">
          <div className="rounded-full bg-bg-base p-4 text-text-muted">
            <Newspaper className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-text-muted">{t('noNewsAvailable')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto pb-2 cursor-grab select-none active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={stopDragging}
            onMouseLeave={stopDragging}
          >
            {visibleNews.map((news) => {
              const hasImage = Boolean(news.image && !imageErrors[news.id]);
              const articleUrl = news.originalUrl || news.url || '#';

              return (
                <a
                  key={news.id}
                  href={articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (!skipClickRef.current) return;
                    event.preventDefault();
                    skipClickRef.current = false;
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  className="group w-72 shrink-0 overflow-hidden rounded-2xl border border-border-base bg-bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <div className="relative h-36 overflow-hidden bg-blue-50 dark:bg-blue-950/20">
                    {hasImage ? (
                      <img
                        src={news.image}
                        alt={news.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        onError={() => handleImageError(news.id)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-blue-500">
                        <Newspaper className="h-10 w-10" />
                      </div>
                    )}
                  </div>

                  <div className="flex min-h-44 flex-col p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted/80">
                      {news.source || t('relatedNews')}
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-text-base transition-colors group-hover:text-blue-600">
                      {news.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-text-muted">
                      {news.summary || news.content || t('noNewsAvailable')}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-base pt-4">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted/80">
                        {formatDate(news.date)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-600 transition-transform group-hover:translate-x-0.5">
                        {t('readMore')}
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
