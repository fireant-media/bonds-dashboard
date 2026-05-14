import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL, FIREANT_WEB_URL, STATIC_FIREANT_URL } from './_lib/config';

let cachedToken: string | null = null;
let lastTokenFetch = 0;

function getRequestToken(req: VercelRequest): string | null {
  const headerToken = req.headers.authorization;
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!rawToken) return null;
  const token = rawToken.replace(/^bearer\s+/i, '').trim();
  return token || null;
}

async function getFireantToken(force = false) {
  const now = Date.now();
  if (FIREANT_ACCESS_TOKEN && !force) return FIREANT_ACCESS_TOKEN;
  if (!force && cachedToken && (now - lastTokenFetch < 15 * 60 * 1000)) return cachedToken;

  try {
    const response = await axios.get(`${FIREANT_WEB_URL}/bai-viet`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 8000
    });
    const html = response.data;
    const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
    if (startIdx !== -1) {
      const jsonStart = html.indexOf('{', startIdx);
      const jsonEnd = html.indexOf('</script>', jsonStart);
      const data = JSON.parse(html.substring(jsonStart, jsonEnd));
      const token = data?.props?.pageProps?.initialState?.auth?.accessToken || data?.props?.pageProps?.initialState?.auth?.token;
      if (token) {
        cachedToken = token;
        lastTokenFetch = now;
        return token;
      }
    }
  } catch (e) {
    console.error("Token fetch failed in news API", (e as any).message);
  }
  return cachedToken || FIREANT_ACCESS_TOKEN || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const token = getRequestToken(req) || await getFireantToken();
    let posts = null;

    if (token) {
      const fetchPostsRaw = async (authToken: string) => {
        return axios.get(`${FIREANT_BASE_URL}/posts/get-posts-by-group`, {
          params: { groupID: 'NEWS_STREAM', offset: 0, limit: 40 },
          headers: {
            'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': `${FIREANT_WEB_URL}/`
          },
          timeout: 8000,
          validateStatus: (status) => status < 500
        });
      };

      let apiRes = await fetchPostsRaw(token);
      if (apiRes.status === 401) {
        const freshToken = await getFireantToken(true);
        if (freshToken) apiRes = await fetchPostsRaw(freshToken);
      }

      if (apiRes.status === 200 && Array.isArray(apiRes.data)) {
        posts = apiRes.data;
      }
    }

    if (!posts || !Array.isArray(posts)) {
      return res.status(500).json({ error: "Could not fetch news" });
    }

    const mappedNews = posts.map((post: any) => {
      const image = post.images?.[0]?.imageUrl || 
                   (post.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${post.images[0].imageID}` : null) ||
                   post.thumbnail || 
                   post.linkImage;
      
      return {
        id: post.postID?.toString(),
        source: post.postSource?.name || post.user?.name || 'Fireant',
        title: post.title || "",
        summary: post.description || post.summary || "",
        image: image,
        date: post.date
      };
    });

    return res.status(200).json(mappedNews);
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
