import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleProxyRequest } from '../../proxy.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleProxyRequest(req, res, 'bonds/filter');
}
