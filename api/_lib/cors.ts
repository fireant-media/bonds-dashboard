import type { VercelRequest, VercelResponse } from '@vercel/node';

// Single source of truth for cross-origin access, shared by the Vercel serverless functions and the
// Express dev server (server.ts).
//
// External hosts are matched by EXACT origin (scheme + host) and are https-only: an insecure
// http:// page on the same host is NOT trusted. This matters because responses set
// Access-Control-Allow-Credentials: true, so reflecting an insecure origin would be a weakness.
// Local dev hosts are matched by hostname alone, so any scheme/port works while developing.
const ALLOWED_ORIGINS = new Set<string>([
  'https://answer.fireant.vn',
]);
const ALLOWED_LOCAL_HOSTS = new Set<string>(['localhost', '127.0.0.1']);

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return false;
  if (origin === 'null') return true; // sandboxed iframes / file:// documents

  try {
    const url = new URL(origin);
    if (ALLOWED_LOCAL_HOSTS.has(url.hostname)) return true;
    // url.origin is scheme + host (+ non-default port), so http:// is rejected for external hosts.
    return ALLOWED_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

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
