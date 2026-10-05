import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_lib/cors.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);

  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  res.json({
    receivedOrigin: origin,
    corsHeadersSet: !!res.getHeader('Access-Control-Allow-Origin'),
    corsOriginHeader: res.getHeader('Access-Control-Allow-Origin'),
    allHeaders: req.headers
  });
}
