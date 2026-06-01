import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_HOSTS = new Set([
  'fireant.vn',
  'www.fireant.vn',
]);

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!ALLOWED_HOSTS.has(parsed.hostname) && !parsed.hostname.endsWith('.fireant.vn')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const url = normalizeUrl(rawUrl);

  if (!url) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://fireant.vn/',
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();

    if (!response.ok || !html.trim()) {
      return res.status(response.status || 502).json({ error: 'Failed to load html' });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal server error', message: error?.message || 'Unknown error' });
  }
}
