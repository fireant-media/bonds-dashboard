import type { VercelRequest, VercelResponse } from '@vercel/node';

// Origins allowed to call these serverless endpoints cross-origin. Mirrors the Express dev server
// (server.ts) allowlist: local dev hosts plus the FireAnt AI widget host (answer.fireant.vn), so the
// embedded aip-widget can fetch the dashboard's data from another origin without a CORS error.
const ALLOWED_CORS_HOSTS = new Set(['localhost', '127.0.0.1', 'answer.fireant.vn']);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return false;
  if (origin === 'null') return true;

  try {
    return ALLOWED_CORS_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};

/**
 * Set CORS response headers for allowed origins and answer preflight (OPTIONS) requests.
 * Returns `true` when the request was a preflight that has been fully handled — the caller must
 * `return` immediately in that case and not run its normal logic.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Fireant-Access-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
