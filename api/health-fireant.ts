import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL } from './_lib/config';

function getRequestToken(req: VercelRequest): string | null {
  const headerToken = req.headers.authorization;
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!rawToken) return null;
  const token = rawToken.replace(/^bearer\s+/i, '').trim();
  return token || null;
}

async function probe(path: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  try {
    const response = await axios.get(`${FIREANT_BASE_URL}${path}`, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
    });

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      bodyType: Array.isArray(response.data) ? 'array' : typeof response.data,
    };
  } catch (error: any) {
    return {
      status: -1,
      ok: false,
      error: error?.message || 'Unknown error',
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestToken = getRequestToken(req);
  const envToken = FIREANT_ACCESS_TOKEN || null;
  const token = requestToken || envToken;

  const [account, topDebt] = await Promise.all([
    probe('/me/account', token),
    probe('/bonds/stats/issuers/top-debt?top=1', token),
  ]);

  return res.status(200).json({
    runtime: 'vercel-node',
    tokenSource: requestToken ? 'request' : envToken ? 'env' : 'none',
    tokenPresent: Boolean(token),
    tokenLength: token?.length || 0,
    account,
    topDebt,
  });
}
