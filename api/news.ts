import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FIREANT_ACCESS_TOKEN,
  FIREANT_BASE_URL,
  FIREANT_WEB_URL,
  STATIC_FIREANT_URL,
} from './_lib/config.js';

type FireantPost = Record<string, any>;

const isValidSymbol = (value: string) => /^[a-zA-Z0-9._-]{2,16}$/.test(value);

function getRequestToken(req: VercelRequest): string | null {
  const headerToken = req.headers.authorization;
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!rawToken) return null;
  const token = rawToken.replace(/^bearer\s+/i, '').trim();
  return token || null;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPostUrl(post: FireantPost) {
  const postID = post.postID || post.id;
  const title = normalizeText(post.title);
  if (!postID || !title) return null;
  return `${FIREANT_WEB_URL}/bai-viet/${slugify(title)}/${postID}`;
}

function appendImageSize(value: string, width = 210, height = 180) {
  try {
    const url = new URL(value);
    url.searchParams.set('width', String(width));
    url.searchParams.set('height', String(height));
    return url.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}width=${width}&height=${height}`;
  }
}

function normalizeFireantImageUrl(value: unknown, width = 210, height = 180) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;

  return appendImageSize(url, width, height);
}

function buildImageUrl(image: any, width = 210, height = 180) {
  if (!image) return null;
  if (typeof image === 'string') return normalizeFireantImageUrl(image, width, height);
  const imageUrl = normalizeFireantImageUrl(image.imageUrl, width, height);
  if (imageUrl) return imageUrl;
  const imageID = image.imageID || image.imageId || image.ImageID;
  if (imageID) return `${STATIC_FIREANT_URL}/posts/image/${imageID}?width=${width}&height=${height}`;
  return null;
}

function mapPost(post: FireantPost, index: number) {
  const title = normalizeText(post.title);
  const summary = normalizeText(post.description) || normalizeText(post.summary);
  const image =
    buildImageUrl(post.images?.[0]) ||
    buildImageUrl(post.image) ||
    normalizeFireantImageUrl(post.thumbnail) ||
    normalizeFireantImageUrl(post.linkImage);
  const images = Array.isArray(post.images)
    ? post.images.map((item: any) => buildImageUrl(item)).filter(Boolean)
    : [];

  return {
    id: String(post.postID || post.id || `news-${index}`),
    source: normalizeText(post.postSource?.name) || normalizeText(post.user?.name) || 'Fireant',
    sourceUrl: normalizeText(post.postSource?.url) || null,
    title,
    summary,
    content: normalizeText(post.content) || normalizeText(post.originalContent) || summary,
    author: normalizeText(post.user?.name) || normalizeText(post.userName) || 'Fireant',
    image: image || '',
    images,
    date:
      normalizeText(post.date) ||
      normalizeText(post.createdDate) ||
      normalizeText(post.publishedDate) ||
      normalizeText(post.updatedDate) ||
      new Date().toISOString(),
    url: buildPostUrl(post) || '',
    originalUrl: buildPostUrl(post),
    category: normalizeText(post.category?.name) || normalizeText(post.typeName) || 'Tin tuc',
  };
}

async function fetchPosts(url: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: `${FIREANT_WEB_URL}/`,
  };

  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = text;
  }

  return { status: response.status, ok: response.ok, data };
}

function extractPosts(data: unknown): FireantPost[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;
  for (const key of ['data', 'posts', 'items', 'records', 'list']) {
    if (Array.isArray(obj[key])) return obj[key] as FireantPost[];
  }

  return [];
}

function pushUniqueUrl(urls: string[], url: string) {
  if (!urls.includes(url)) urls.push(url);
}

async function fetchPostDetail(postId: string, token: string | null) {
  const urls = [
    `${FIREANT_BASE_URL}/posts/get-post?postID=${encodeURIComponent(postId)}`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchPosts(url, token);
      if (!result.ok) continue;

      const payload = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : null;
      const post = payload?.data || payload?.post || payload?.item || payload || null;
      if (post && typeof post === 'object') return post as FireantPost;
    } catch (error: any) {
      console.warn(`[News API] Failed to fetch detail ${postId} from ${new URL(url).hostname}: ${error?.message || error}`);
    }
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const token = getRequestToken(req) || FIREANT_ACCESS_TOKEN || null;
    const rawSymbol = Array.isArray(req.query.symbol) ? req.query.symbol[0] : req.query.symbol;
    const symbol = normalizeText(rawSymbol).toLowerCase();
    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const postId = normalizeText(rawId);

    if (postId) {
      const detail = await fetchPostDetail(postId, token);
      if (detail) return res.status(200).json(mapPost(detail, 0));
    }

    const urls: string[] = [];
    if (symbol && isValidSymbol(symbol)) {
      pushUniqueUrl(urls, `${FIREANT_BASE_URL}/posts?symbol=${encodeURIComponent(symbol)}&type=1`);
    }
    pushUniqueUrl(urls, `${FIREANT_BASE_URL}/posts?type=1`);

    let lastStatus = 502;
    let lastBodyType = 'empty';
    let lastError = '';

    for (const url of urls) {
      try {
        const result = await fetchPosts(url, token);
        lastStatus = result.status;
        lastBodyType = Array.isArray(result.data) ? 'array' : typeof result.data;

        const posts = extractPosts(result.data);
        if (result.ok && posts.length > 0) {
          const mappedPosts = posts.map(mapPost);
          if (postId) {
            const matchedPost = mappedPosts.find((post) => post.id === postId);
            if (matchedPost) return res.status(200).json(matchedPost);
            continue;
          }

          return res.status(200).json(mappedPosts);
        }
      } catch (error: any) {
        lastError = error?.message || 'Unknown fetch error';
        console.warn(`[News API] Failed to fetch ${new URL(url).hostname}: ${lastError}`);
      }
    }

    return res.status(postId ? 404 : 502).json({
      error: 'Could not fetch news',
      message: 'Upstream FireAnt news API returned no usable data',
      status: lastStatus,
      bodyType: lastBodyType,
      lastError,
    });
  } catch (error: any) {
    console.error('[News API Error]', error?.stack || error?.message || error);
    return res.status(500).json({ error: 'Internal server error', message: error?.message || 'Unknown error' });
  }
}
