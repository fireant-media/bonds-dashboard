import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const FINANCE_FALLBACKS = [
  "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1526303328184-bf7159787ca7?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1633156191771-7a55444e998b?q=80&w=800&auto=format&fit=crop"
];

const getFallbackImage = (id: string | number) => {
  const idx = typeof id === 'number' ? id % FINANCE_FALLBACKS.length : (id.toString().length % FINANCE_FALLBACKS.length);
  return FINANCE_FALLBACKS[idx];
};

let cachedToken: string | null = null;
let lastTokenFetch = 0;

const findTokenRecursively = (obj: any, depth = 0): string | null => {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;
  if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.length > 20) return obj.accessToken;
  if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
      const res = findTokenRecursively(obj[key], depth + 1);
      if (res) return res;
    }
  }
  return null;
};

async function getFireantToken(force = false) {
  const now = Date.now();
  if (process.env.FIREANT_ACCESS_TOKEN && !force) return process.env.FIREANT_ACCESS_TOKEN;
  if (!force && cachedToken && (now - lastTokenFetch < 15 * 60 * 1000)) return cachedToken;

  try {
    const response = await axios.get('https://fireant.vn/bai-viet', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
      timeout: 8000
    });
    const html = response.data;
    const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
    if (startIdx !== -1) {
      const jsonStart = html.indexOf('{', startIdx);
      const jsonEnd = html.indexOf('</script>', jsonStart);
      const data = JSON.parse(html.substring(jsonStart, jsonEnd));
      const token = data?.props?.pageProps?.initialState?.auth?.accessToken || 
                    data?.props?.pageProps?.initialState?.auth?.token ||
                    findTokenRecursively(data);
      if (token) {
        cachedToken = token;
        lastTokenFetch = now;
        return token;
      }
    }
  } catch (e) {
    console.error("Token fetch failed in news API", (e as any).message);
  }
  return cachedToken || process.env.FIREANT_ACCESS_TOKEN || null;
}

function fixContentImages(content: string) {
  if (!content) return content;
  // Fix relative image URLs in src, data-src, and srcset
  let fixed = content.replace(/(src|data-src|srcset)="\/\//g, '$1="https://');
  fixed = fixed.replace(/(src|data-src|srcset)="\/News\/Image\//g, '$1="https://static.fireant.vn/News/Image/');
  
  fixed = fixed.replace(/(src|data-src|srcset)="\/([^"]+)"/g, (match, attr, path) => {
    if (path.startsWith('http') || path.startsWith('data:')) return match;
    return `${attr}="https://static.fireant.vn/${path}"`;
  });

  return fixed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    let token = await getFireantToken();
    let posts = null;

    if (token) {
      const fetchPostsRaw = async (authToken: string) => {
        return axios.get("https://restv2.fireant.vn/posts/get-posts-by-group", {
          params: { groupID: 'NEWS_STREAM', offset: 0, limit: 40 },
          headers: {
            'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fireant.vn/'
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

    if (!posts) {
      const response = await axios.get("https://fireant.vn/bai-viet", {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'text/html'
        }
      });
      const html = response.data;
      const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const jsonEnd = html.indexOf('</script>', jsonStart);
        const data = JSON.parse(html.substring(jsonStart, jsonEnd));
        posts = data?.props?.pageProps?.initialState?.posts?.posts?.NEWS_STREAM?.posts;
      }
    }

    if (!posts || !Array.isArray(posts)) {
      return res.status(200).json([]);
    }

    const mappedNews = posts.map((post: any) => {
      const extractImage = (p: any) => {
        let img = p.images?.[0]?.imageUrl || (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) || p.thumbnail || p.linkImage;
        if (img && typeof img === 'string') {
          if (img.startsWith('//')) img = `https:${img}`;
          else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
        }
        return img;
      };
      const image = extractImage(post) || getFallbackImage(post.postID || 0);
      const allImages = (post.images || []).map((img: any) => {
        let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
        if (url && typeof url === 'string') {
          if (url.startsWith('//')) url = `https:${url}`;
          else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
        }
        return url;
      }).filter(Boolean);

      if (image && !allImages.includes(image)) {
        allImages.unshift(image);
      }

      const content = post.originalContent || post.content || post.description || post.summary || post.title;
      const fixedContent = fixContentImages(content);

      return {
        id: post.postID?.toString(),
        source: post.postSource?.name || post.user?.name || 'Fireant',
        sourceUrl: post.postSource?.url || null,
        title: post.title || "",
        summary: post.description || post.summary || "",
        content: fixedContent,
        author: post.user?.name || 'Fireant',
        image: image,
        images: allImages,
        date: post.date,
        url: `https://fireant.vn/bai-viet/${post.postID}`,
        originalUrl: post.postSourceUrl || post.link || null,
        category: post.postGroup?.name || 'Thị trường'
      };
    });

    return res.status(200).json(mappedNews);
  } catch (error: any) {
    console.error("Vercel Function Error:", error.message);
    return res.status(200).json([]);
  }
}
