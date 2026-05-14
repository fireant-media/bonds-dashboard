import type { VercelRequest, VercelResponse } from '@vercel/node';
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
    const response = await fetch(`${FIREANT_WEB_URL}/bai-viet`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000)
    });
    const html = await response.text();
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
    const token = getRequestToken(req) || await getFireantToken();
    let post = null;

    if (token) {
      const fetchPostRaw = async (authToken: string) => {
        const response = await fetch(`${FIREANT_BASE_URL}/posts/get-post?postID=${id}`, {
          headers: { 
            'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });

        const text = await response.text();
        let data: unknown = text;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = text;
        }

        return { status: response.status, data };
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
      return res.status(404).json({ error: "Post not found", message: "Upstream FireAnt news detail API returned no usable data" });
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
    console.error("[Detail API Error]", error?.stack || error?.message || error);
    res.status(500).json({ error: "Internal server error", message: error?.message || "Unknown error" });
  }
}
