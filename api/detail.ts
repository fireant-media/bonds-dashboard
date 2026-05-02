import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

let detailCachedToken: string | null = null;
let lastDetailTokenFetch = 0;

async function getFireantToken(force = false) {
  const now = Date.now();
  if (process.env.FIREANT_ACCESS_TOKEN && !force) return process.env.FIREANT_ACCESS_TOKEN;
  if (!force && detailCachedToken && (now - lastDetailTokenFetch < 15 * 60 * 1000)) return detailCachedToken;

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

      const token = data?.props?.pageProps?.initialState?.auth?.accessToken || 
                    data?.props?.pageProps?.initialState?.auth?.token ||
                    findTokenRecursively(data);

      if (token) {
        detailCachedToken = token;
        lastDetailTokenFetch = now;
        return token;
      }
    }
  } catch (e) {
    console.error("Token fetch failed in detail API", (e as any).message);
  }
  return detailCachedToken || process.env.FIREANT_ACCESS_TOKEN || null;
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
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    let token = await getFireantToken();
    let post = null;

    if (token) {
      const fetchPostRaw = async (authToken: string) => {
        return axios.get(`https://restv2.fireant.vn/posts/get-post?postID=${id}`, {
          headers: { 
            'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 8000,
          validateStatus: (status) => status < 500
        });
      };

      let apiRes = await fetchPostRaw(token);
      if (apiRes.status === 401) {
        const freshToken = await getFireantToken(true);
        if (freshToken) apiRes = await fetchPostRaw(freshToken);
      }
      
      if (apiRes.status === 200 && apiRes.data) {
        post = apiRes.data;
      }
    }

    if (!post) {
      const response = await axios.get(`https://fireant.vn/bai-viet/${id}`, { timeout: 10000 });
      const html = response.data;
      const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const jsonEnd = html.indexOf('</script>', jsonStart);
        const data = JSON.parse(html.substring(jsonStart, jsonEnd));
        post = data?.props?.pageProps?.initialState?.posts?.post;
      }
    }

    if (!post) return res.status(404).json({ error: "Post not found" });

    const allImages = (post.images || []).map((img: any) => {
      let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
      if (url && typeof url === 'string') {
        if (url.startsWith('//')) url = `https:${url}`;
        else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
      }
      return url;
    }).filter(Boolean);

    const image = (post.images?.[0]?.imageUrl || 
                  (post.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${post.images[0].imageID}` : null) || 
                  post.thumbnail || 
                  post.linkImage);

    const content = post.originalContent || post.content || post.description || post.summary || "";
    const fixedContent = fixContentImages(content);

    return res.status(200).json({
      id: post.postID?.toString(),
      source: post.postSource?.name || post.user?.name || 'Fireant',
      sourceUrl: post.postSource?.url || null,
      title: post.title,
      summary: post.description || post.summary,
      content: fixedContent,
      author: post.user?.name || 'Fireant',
      image: image,
      images: allImages,
      date: post.date,
      url: `https://fireant.vn/bai-viet/${post.postID}`,
      originalUrl: post.postSourceUrl || post.link || null,
      category: post.postGroup?.name || 'Thị trường'
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
