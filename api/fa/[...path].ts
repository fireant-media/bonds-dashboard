import type { VercelRequest, VercelResponse } from '@vercel/node';
import proxyHandler from '../proxy.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return proxyHandler(req, res);
}
