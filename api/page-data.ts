import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePageDataRequest } from './_lib/page-data.js';
import { applyCors } from './_lib/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const viewParam = req.query.view;
  const view = Array.isArray(viewParam) ? viewParam[0] : viewParam;

  const result = await handlePageDataRequest({
    method: req.method || 'GET',
    view,
    query: req.query as Record<string, string | string[] | undefined>,
    body: req.body,
    headers: req.headers as Record<string, string | string[] | undefined>,
  });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(result.status).json(result.data);
}
