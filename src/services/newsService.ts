import { NewsItem } from '../types';
import { buildAppApiUrl } from '../api/config';
import { cleanTokenString, getFireantToken } from '../utils/token';
import { dashboardQueryClient } from '../query/client';
import { newsQueryKeys } from '../query/keys';

const NEWS_API_URL = buildAppApiUrl('/api/news');
const CACHE_KEY = 'fireant_news_cache_v14';
const CACHE_TIME_KEY = 'fireant_news_last_update_v14';
const FIREANT_WEB_URL = 'https://fireant.vn';
const STATIC_FIREANT_URL = 'https://static.fireant.vn';

const normalizeSymbol = (symbol?: string | null) => {
  const value = symbol?.trim().toUpperCase();
  return value && /^[A-Z0-9._-]{2,16}$/.test(value) ? value : null;
};

const getCacheKey = (symbol?: string | null) => {
  const normalized = normalizeSymbol(symbol);
  return normalized ? `${CACHE_KEY}_${normalized}` : CACHE_KEY;
};

const getCacheTimeKey = (symbol?: string | null) => {
  const normalized = normalizeSymbol(symbol);
  return normalized ? `${CACHE_TIME_KEY}_${normalized}` : CACHE_TIME_KEY;
};

const extractFirstLinkFromContent = (html: string) => {
  if (!html) return null;
  const match = html.match(/<a[^>]+href=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

const extractFirstImageFromContent = (html: string) => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildPostUrl = (title: string, postID: string | number | null | undefined) => {
  if (!title || !postID) return null;
  return `${FIREANT_WEB_URL}/bai-viet/${slugify(title)}/${postID}`;
};

const appendImageSize = (value: string, width = 210, height = 180) => {
  try {
    const url = new URL(value);
    url.searchParams.set('width', String(width));
    url.searchParams.set('height', String(height));
    return url.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}width=${width}&height=${height}`;
  }
};

const normalizeFireantImageUrl = (value: unknown, width = 210, height = 180) => {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;

  return appendImageSize(url, width, height);
};

const buildPostImageUrl = (image: any, width = 210, height = 180) => {
  if (!image) return null;
  if (typeof image === 'string') return normalizeFireantImageUrl(image, width, height);
  const imageUrl = normalizeFireantImageUrl(image.imageUrl, width, height);
  if (imageUrl) return imageUrl;
  const imageID = image.imageID || image.imageId || image.ImageID;
  if (imageID) return `${STATIC_FIREANT_URL}/posts/image/${imageID}?width=${width}&height=${height}`;
  return null;
};

const SEED_NEWS: NewsItem[] = [
  {
    id: 'seed-1',
    source: 'Fireant',
    title: 'Thi truong trai phieu cap nhat',
    summary: 'Du lieu tin tuc dang tam thoi khong kha dung. Vui long thu lai sau.',
    content: 'Du lieu tin tuc dang tam thoi khong kha dung. Vui long thu lai sau.',
    author: 'Fireant',
    image: '',
    date: new Date().toISOString(),
    url: '#',
    category: 'Tin tuc',
  },
];

const buildNewsHeaders = () => {
  const token = getFireantToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${cleanTokenString(token)}`;
  }

  return headers;
};

const getNewsArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of ['data', 'news', 'items', 'records', 'News', 'List', 'articles', 'posts', 'list']) {
    if (Array.isArray(data[key])) return data[key];
    if (data[key] && typeof data[key] === 'object') {
      const nested = getNewsArray(data[key]);
      if (nested.length > 0) return nested;
    }
  }

  for (const value of Object.values(data)) {
    if (value && typeof value === 'object') {
      const nested = getNewsArray(value);
      if (nested.length > 0) return nested;
    }
  }

  const firstArrayKey = Object.keys(data).find((key) => Array.isArray(data[key]));
  return firstArrayKey ? data[firstArrayKey] : [];
};

const mapNewsItem = (item: any, index: number): NewsItem => {
  const title = item.title || item.header || item.subject || item.Title || '';
  const summary = item.summary || item.description || item.abstract || item.Summary || '';
  const date = item.date || item.pubDate || item.time || item.createdAt || item.createdDate || new Date().toISOString();
  const firstPostImage = Array.isArray(item.images) ? buildPostImageUrl(item.images[0]) : null;
  const rawImage =
    firstPostImage ||
    normalizeFireantImageUrl(item.image) ||
    normalizeFireantImageUrl(item.imageUrl) ||
    normalizeFireantImageUrl(item.thumbnail) ||
    normalizeFireantImageUrl(item.Image) ||
    '';
  const contentImage = extractFirstImageFromContent(item.content || '');
  const image = rawImage || normalizeFireantImageUrl(contentImage) || '';
  const source = item.source || item.category || item.provider || item.Source || 'Fireant';
  const contentLink = extractFirstLinkFromContent(item.content || '');
  const postID = item.postID || item.id;
  const fireantUrl = buildPostUrl(title, postID);

  return {
    id: String(postID || item.bondCode || `news-${index}-${Date.now()}`),
    source,
    sourceUrl: item.sourceUrl,
    title,
    summary,
    content: item.content || item.body || item.text || summary || '',
    author: item.author || item.writer || item.user?.name || item.userName || 'Fireant',
    image,
    images: Array.isArray(item.images) ? item.images.map((img: any) => buildPostImageUrl(img)).filter(Boolean) : undefined,
    date,
    url: item.url || fireantUrl || '#',
    originalUrl: item.originalUrl || fireantUrl || item.url || contentLink || item.link || item.Url || null,
    category: source,
  };
};

export const fetchNewsData = async (symbol?: string | null): Promise<NewsItem[]> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const queryKey = newsQueryKeys.list(normalizedSymbol);

  const queryCached = dashboardQueryClient.getQueryData<NewsItem[]>(queryKey);
  if (queryCached && queryCached.length > 0) {
    return queryCached;
  }

  try {
    const params = new URLSearchParams();
    if (normalizedSymbol) params.set('symbol', normalizedSymbol);
    const url = params.toString() ? `${NEWS_API_URL}?${params.toString()}` : NEWS_API_URL;

    const response = await fetch(url, {
      cache: 'no-store',
      headers: buildNewsHeaders(),
    });

    if (!response.ok) {
      const cached = getCachedNews(normalizedSymbol);
      return cached || SEED_NEWS;
    }

    const text = await response.text();
    const trimmedText = text.trim();

    if (trimmedText.toLowerCase().startsWith('<!doctype') || trimmedText.toLowerCase().startsWith('<html')) {
      const cached = getCachedNews(normalizedSymbol);
      return cached || SEED_NEWS;
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      const cached = getCachedNews(normalizedSymbol);
      return cached || SEED_NEWS;
    }

    const newsArray = getNewsArray(data);
    if (newsArray.length === 0) {
      const cached = getCachedNews(normalizedSymbol);
      return cached || [];
    }

    const mappedNews = newsArray
      .map(mapNewsItem)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    localStorage.setItem(getCacheKey(normalizedSymbol), JSON.stringify(mappedNews));
    localStorage.setItem(getCacheTimeKey(normalizedSymbol), Date.now().toString());
    dashboardQueryClient.setQueryData(queryKey, mappedNews);

    return mappedNews;
  } catch (error) {
    if (error instanceof Error && !error.message.includes('fetch')) {
      console.error('Unexpected error in news service:', error);
    }

    const cached = getCachedNews(normalizedSymbol);
    if (cached) {
      dashboardQueryClient.setQueryData(queryKey, cached);
      return cached;
    }

    return SEED_NEWS;
  }
};

export const getCachedNews = (symbol?: string | null): NewsItem[] | null => {
  const cached = localStorage.getItem(getCacheKey(symbol));
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

export const getNewsLastUpdate = (symbol?: string | null): number | null => {
  if (!getCachedNews(symbol)) return null;
  const time = localStorage.getItem(getCacheTimeKey(symbol));
  return time ? parseInt(time) : null;
};
