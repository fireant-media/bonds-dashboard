import type { VercelRequest, VercelResponse } from '@vercel/node';

export function handleAuthRequest(
  req: VercelRequest,
  res: VercelResponse,
  pathOverride?: string,
) {
  const pathParam = req.query.path;
  const subPath = (
    pathOverride ||
    (Array.isArray(pathParam) ? pathParam[0] : (pathParam as string) || '')
  ).replace(/^\//, '');

  if (subPath === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { userData } = req.body || {};
    return res.json({ success: true, user: userData || null });
  }

  if (subPath === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    return res.json({ success: true });
  }

  if (subPath === 'session') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    return res.json({ user: null });
  }

  return res.status(404).json({ error: `Auth route not found: ${subPath}` });
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleAuthRequest(req, res);
}
