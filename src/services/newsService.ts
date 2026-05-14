import { NewsItem } from '../types';
import { cleanTokenString, getFireantToken } from '../utils/token';
import { readJsonResponse } from '../utils/http';

const NEWS_API_URL = '/api/news';
const CACHE_KEY = 'fireant_news_cache';
const CACHE_TIME_KEY = 'fireant_news_last_update';

const extractFirstLinkFromContent = (html: string) => {
  if (!html) return null;

  const match = html.match(/<a[^>]+href=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

const SEED_NEWS: NewsItem[] = [
  {
    id: 'seed-1',
    source: 'VBMA',
    title: 'Thị trường TPDN ghi nhận sự hồi phục mạnh mẽ trong tháng 10',
    summary: 'Tổng giá trị phát hành trái phiếu doanh nghiệp đạt mức cao nhất kể từ đầu năm, cho thấy sự khởi sắc của thị trường vốn.',
    content: 'Theo báo cáo từ Hiệp hội Thị trường Trái phiếu Việt Nam (VBMA), trong tháng 10, thị trường trái phiếu doanh nghiệp đã có những diễn biến tích cực với sự gia tăng cả về số lượng và giá trị phát hành. Nhóm Ngân hàng vẫn đóng vai trò dẫn dắt với tỷ trọng lớn nhất, tiếp theo là nhóm Bất động sản.\n\nSự hồi phục này được hỗ trợ bởi các chính sách tháo gỡ khó khăn của Chính phủ và sự ổn định của mặt bằng lãi suất. Các nhà đầu tư tổ chức đang bắt đầu tăng tỷ trọng nắm giữ trái phiếu chất lượng cao có tài sản đảm bảo.',
    author: 'Phân tích viên VBMA',
    image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1000',
    date: new Date().toISOString(),
    url: '#',
    category: 'Thị trường'
  },
  {
    id: 'seed-2',
    source: 'Tài chính 24H',
    title: 'Dự báo lãi suất huy động duy trì ở mức thấp tới hết năm 2024',
    summary: 'Mặt bằng lãi suất thấp tiếp tục được duy trì nhằm hỗ trợ doanh nghiệp tiếp cận nguồn vốn giá rẻ phục hồi sản xuất.',
    content: 'Các chuyên gia kinh tế nhận định rằng thanh khoản hệ thống ngân hàng vẫn đang ở mức dồi dào. Điều này cho phép các ngân hàng thương mại giữ lãi suất huy động ở mức thấp kỷ lục. Việc lãi suất tiết kiệm giảm khiến dòng tiền có xu hướng chuyển sang các kênh đầu tư khác như chứng khoán và trái phiếu doanh nghiệp có lãi suất hấp dẫn hơn.',
    author: 'Nguyễn Văn A',
    image: 'https://images.unsplash.com/photo-1611974717482-480928544e3b?auto=format&fit=crop&q=80&w=1000',
    date: new Date(Date.now() - 86400000).toISOString(),
    url: '#',
    category: 'Ngân hàng'
  },
  {
    id: 'seed-3',
    source: 'Fireant News',
    title: 'Top 10 doanh nghiệp có dư nợ trái phiếu lớn nhất hệ thống',
    summary: 'Danh sách các doanh nghiệp đang nắm giữ khối lượng trái phiếu lưu hành lớn nhất, tập trung ở nhóm Tài chính và BĐS.',
    content: 'Thống kê mới nhất từ Sentinel cho thấy danh sách 10 doanh nghiệp có khối lượng trái phiếu đang lưu hành lớn nhất không có nhiều thay đổi. Tuy nhiên, kỳ hạn các trái phiếu mới đang có xu hướng kéo dài hơn để giảm áp lực trả nợ ngắn hạn cho các tổ chức phát hành.',
    author: 'Đội ngũ Sentinel',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1000',
    date: new Date(Date.now() - 172800000).toISOString(),
    url: '#',
    category: 'Doanh nghiệp'
  }
];

const extractFirstImageFromContent = (html: string) => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

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

export const fetchNewsData = async (): Promise<NewsItem[]> => {
  try {
    const response = await fetch(NEWS_API_URL, {
      headers: buildNewsHeaders(),
    });
    if (!response.ok) {
      console.warn('Network response for news was not ok, checking cache...');
      const cached = getCachedNews();
      if (cached) return cached;
      return SEED_NEWS;
    }
    
    const text = await response.text();
    const trimmedText = text.trim();
    
    // Check if the response is actually an HTML error page (case-insensitive)
    if (trimmedText.toLowerCase().startsWith('<!doctype') || trimmedText.toLowerCase().startsWith('<html')) {
      console.warn('News API returned HTML instead of JSON, using cache or seed data');
      const cached = getCachedNews();
      if (cached) return cached;
      return SEED_NEWS;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      const cached = getCachedNews();
      if (cached) return cached;
      return SEED_NEWS;
    }

    // Robust data extraction: look for any array in the response
    let newsArray: any[] = [];
    
    if (Array.isArray(data)) {
      newsArray = data;
    } else if (data && typeof data === 'object') {
      // Check for common wrappers like 'data', 'news', 'items', 'records', 'List'
      const possibleKeys = ['data', 'news', 'items', 'records', 'News', 'List', 'articles'];
      for (const key of possibleKeys) {
        if (data[key] && Array.isArray(data[key])) {
          newsArray = data[key];
          break;
        }
      }
      
      // If still not found, take the first property that is an array
      if (!newsArray || newsArray.length === 0) {
        const firstArrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
        if (firstArrayKey) {
          newsArray = data[firstArrayKey];
        }
      }
    }

    if (!newsArray || !Array.isArray(newsArray) || newsArray.length === 0) {
      console.warn('News API returned no news items or unexpected format');
      return getCachedNews() || [];
    }

    // Map fields flexibly
    const mappedNews: NewsItem[] = newsArray.map((item: any, index: number) => {
      const title = item.title || item.header || item.subject || item.Title || '';
      const summary = item.summary || item.description || item.abstract || item.Summary || '';
      const date = item.date || item.pubDate || item.time || item.createdAt || new Date().toISOString();
      const rawImage = item.image || item.imageUrl || item.thumbnail || item.Image || '';
      const contentImage = extractFirstImageFromContent(item.content || '');
      const finalImage =
            rawImage && rawImage.trim() !== ''
              ? rawImage
              : contentImage && contentImage.trim() !== ''
              ? contentImage
              : null;
      const source = item.source || item.category || item.provider || item.Source || 'Tin tức';
      const contentLink = extractFirstLinkFromContent(item.content || '');
      
      return {
        id: item.id || item.bondCode || `news-${index}-${Date.now()}`,
        source,
        sourceUrl: item.sourceUrl,
        title,
        summary,
        content: item.content || item.body || item.text || summary || '',
        author: item.author || item.writer || item.Source || 'Fireant',
        image: finalImage || `https://picsum.photos/seed/${encodeURIComponent(title.slice(0, 10))}/800/600`,
        date,
        url:
          item.url || '#', // giữ lại cho internal
        originalUrl:
          contentLink ||
          item.originalUrl ||
          item.link ||
          item.Url ||
          null,
        category: source
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update cache
    localStorage.setItem(CACHE_KEY, JSON.stringify(mappedNews));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());

    return mappedNews;
  } catch (error) {
    // Only log if it's not a standard network failure (Failed to fetch)
    if (error instanceof Error && !error.message.includes('fetch')) {
      console.error('Unexpected error in news service:', error);
    }
    const cached = getCachedNews();
    if (cached) return cached;
    return SEED_NEWS;
  }
};

export const fetchNewsDetail = async (id: string): Promise<NewsItem | null> => {
  try {
    const response = await fetch(`${NEWS_API_URL}/${id}`, {
      headers: buildNewsHeaders(),
    });
    if (!response.ok) return null;
    
    const data = await readJsonResponse<any>(response, `News detail ${id}`);
    if (!data || data.error) return null;

    // 🔥 DEBUG LINK
    console.log("DETAIL LINK:", data.originalUrl, data.link, data.url);
    
    return {
      ...data,
      originalUrl:
        extractFirstLinkFromContent(data.content || '') ||
        data.originalUrl ||
        data.link ||
        data.Url ||
        null
    };
  } catch (error) {
    console.error(`Error fetching news detail for ${id}:`, error);
    return null;
  }
};

export const getCachedNews = (): NewsItem[] | null => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

export const getNewsLastUpdate = (): number | null => {
  const time = localStorage.getItem(CACHE_TIME_KEY);
  return time ? parseInt(time) : null;
};
