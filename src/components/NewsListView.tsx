import { useState, useEffect, useCallback, useRef } from 'react';
import { NewsItem } from '../types';
import { Newspaper, ChevronRight, ChevronLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchNewsData, getCachedNews, getNewsLastUpdate } from '../services/newsService';
import { formatDate } from '../utils/format';
import { useLanguage } from '../LanguageContext';

interface NewsListViewProps {
  onSelectNews: (news: NewsItem) => void;
}

const ITEMS_PER_PAGE = 12;
const REFRESH_INTERVAL = 300000; // 5 minutes

export default function NewsListView({ onSelectNews: _onSelectNews }: NewsListViewProps) {
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const loadingRef = useRef(false);
  const newsListRef = useRef<NewsItem[]>([]);

  useEffect(() => {
    const cached = getCachedNews();
    if (cached) {
      setNewsList(cached);
    }
  }, []);

  useEffect(() => {
    newsListRef.current = newsList;
  }, [newsList]);

  const loadData = useCallback(async (isAutoRefresh = false, force = false) => {
    if (loadingRef.current) return;

    if (!isAutoRefresh && !force) {
      const lastUpdate = getNewsLastUpdate();
      const now = Date.now();
      if (lastUpdate && now - lastUpdate < 120000) {
        return;
      }
    }

    const hasExistingNews = newsListRef.current.length > 0;
    if (!hasExistingNews) {
      setLoading(true);
    }

    loadingRef.current = true;
    setError(null);

    try {
      const data = await fetchNewsData();
      setNewsList(data);
    } catch (err) {
      if (!hasExistingNews) {
        setError(t('newsFetchError'));
      }
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadData]);

  const totalPages = Math.ceil(newsList.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentNews = newsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  const NewsSkeleton = () => (
    <div className="bg-bg-surface rounded-3xl border border-border-base shadow-sm overflow-hidden flex flex-col min-h-96 sm:min-h-[460px] md:min-h-[520px] animate-pulse transition-colors">
      <div className="h-64 bg-bg-base/50" />
      <div className="p-6 flex-1 flex flex-col gap-4">
        <div className="h-4 w-1/4 bg-bg-base/50 rounded-full" />
        <div className="h-6 w-full bg-bg-base/50 rounded" />
        <div className="h-6 w-3/4 bg-bg-base/50 rounded" />
        <div className="h-4 w-full bg-bg-base/30 rounded mt-2" />
        <div className="h-4 w-5/6 bg-bg-base/30 rounded" />
        <div className="mt-auto pt-6 border-t border-border-base flex justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-bg-base/50 rounded" />
            <div className="h-3 w-16 bg-bg-base/50 rounded" />
          </div>
          <div className="h-4 w-16 bg-bg-base/50 rounded" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 px-0 py-0 transition-colors animate-in fade-in slide-in-from-bottom-4 duration-700 md:space-y-8 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-text-base flex items-center gap-3 transition-colors">
            <Newspaper className="h-7 w-7 text-blue-600" />
            {t('relatedNews')}
          </h2>
          <p className="text-sm text-text-muted mt-1 transition-colors">{t('newsDescription')}</p>
        </div>
        {!loading && (
          <button
            onClick={() => loadData(false, true)}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-base text-text-muted transition-all hover:text-blue-600 active:scale-95"
            title={t('refresh')}
          >
            <RefreshCw className={`h-5 w-5 ${loadingRef.current ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading && newsList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {[...Array(6)].map((_, i) => <NewsSkeleton key={i} />)}
        </div>
      ) : error && newsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-bg-surface rounded-3xl border border-dashed border-border-base transition-colors">
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
            <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
          </div>
          <p className="text-text-base font-bold mb-4">{error}</p>
          <button
            onClick={() => loadData(false, true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-blue-600/20"
          >
            <RefreshCw className="h-4 w-4" /> {t('retry')}
          </button>
        </div>
      ) : newsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-bg-surface rounded-3xl border border-dashed border-border-base transition-colors">
          <div className="bg-bg-base p-4 rounded-full mb-4 text-text-muted">
            <Newspaper className="h-8 w-8" />
          </div>
          <p className="text-text-muted font-medium transition-colors">{t('noNewsAvailable')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
          {currentNews.map((news) => {
            const hasImage = Boolean(news.image && !imageErrors[news.id]);
            const articleUrl = news.originalUrl || news.url || '#';

            return (
              <a
                key={news.id}
                href={articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-bg-surface rounded-3xl border border-border-base shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col min-h-96 sm:min-h-[460px] md:min-h-[520px]"
              >
                <div className="relative h-48 md:h-64 w-full bg-blue-600">
                  {hasImage ? (
                    <img
                      src={news.image}
                      alt={news.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError(news.id)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-blue-50 text-blue-500">
                      <Newspaper className="h-10 w-10" />
                    </div>
                  )}
                </div>

                <div className="p-4 md:p-6 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-text-base leading-snug group-hover:text-blue-600 transition-colors line-clamp-2 min-h-[3rem]">
                      {news.title}
                    </h3>
                  </div>

                  <div className="mt-auto pt-6 border-t border-border-base transition-colors flex items-center justify-between">
                    <p className="text-[11px] text-text-muted transition-colors">
                      {formatDate(news.date)}
                    </p>
                    <div className="flex items-center gap-1 text-blue-600 text-[11px] font-bold uppercase tracking-wider group-hover:translate-x-1 transition-all">
                      {t('readMore')} <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8 pb-12 overflow-x-auto">
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="w-12 h-12 flex items-center justify-center rounded-2xl border border-border-base text-text-muted disabled:opacity-30 bg-bg-base/30 hover:bg-bg-base transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {[...Array(totalPages)].map((_, i) => {
            const page = i + 1;
            if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`w-12 h-12 rounded-2xl text-sm font-bold transition-all border ${
                    currentPage === page
                      ? 'bg-blue-600 text-white border-transparent shadow-xl shadow-blue-600/20 scale-110 z-10'
                      : 'bg-bg-surface text-text-base border-border-base hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  {page}
                </button>
              );
            }
            if (page === currentPage - 2 || page === currentPage + 2) {
              return <span key={page} className="px-1 text-text-muted font-bold">...</span>;
            }
            return null;
          })}

          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="w-12 h-12 flex items-center justify-center rounded-2xl border border-border-base text-text-muted disabled:opacity-30 bg-bg-base/30 hover:bg-bg-base transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
