import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePageDataRequest } from './_lib/page-data.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const viewParam = req.query.view;
  const view = Array.isArray(viewParam) ? viewParam[0] : viewParam;

  const result = await handlePageDataRequest({
    method: req.method || 'GET',
    view,
    query: req.query as Record<string, string | string[] | undefined>,
    body: req.body,
  });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(result.status).json(result.data);
}
