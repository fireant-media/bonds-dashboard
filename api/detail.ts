import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL, FIREANT_WEB_URL, STATIC_FIREANT_URL } from './_lib/config';

let cachedToken: string | null = null;
let lastTokenFetch = 0;

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
    console.error("Token fetch failed in detail API", (e as any).message);
  }
  return cachedToken || FIREANT_ACCESS_TOKEN || null;
}

function fixContentImages(content: string) {
  if (!content) return content;
  let fixed = content.replace(/(src|data-src|srcset)="\/\//g, '$1="https://');
  fixed = fixed.replace(/(src|data-src|srcset)="\/News\/Image\//g, `$1="${STATIC_FIREANT_URL}/News/Image/`);
  fixed = fixed.replace(/(src|data-src|srcset)="\/([^"]+)"/g, (match, attr, path) => {
    if (path.startsWith('http') || path.startsWith('data:')) return match;
    return `${attr}="${STATIC_FIREANT_URL}/${path}"`;
  });
  return fixed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "ID is required" });

  try {
    const token = await getFireantToken();
    let post = null;

    if (token) {
      const fetchPostRaw = async (authToken: string) => {
        return axios.get(`${FIREANT_BASE_URL}/posts/get-post?postID=${id}`, {
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
      return res.status(404).json({ error: "Post not found" });
    }

    const image = post.images?.[0]?.imageUrl || 
                 (post.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${post.images[0].imageID}` : null) ||
                 post.thumbnail || 
                 post.linkImage;

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
      date: post.date
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
