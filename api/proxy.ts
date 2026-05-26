import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL, FIREANT_WEB_URL } from './_lib/config.js';

let fireantToken: string | null = null;
let lastTokenFetch = 0;

type QueryValue = string | string[] | undefined;

interface UpstreamTarget {
  path: string;
  query: Record<string, string | string[] | number | boolean | null | undefined>;
  method?: string;
  body?: unknown;
}

const getQueryValue = (value: QueryValue) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
};

const getQueryNumber = (value: QueryValue) => {
  const numberValue = Number(getQueryValue(value));
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const getMaturityDays = (fromDate: string, toDate: string) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined;

  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
};

function resolveUpstreamTarget(path: string, query: Record<string, QueryValue>, req: VercelRequest): UpstreamTarget {
  if (path === 'bond_Filter') {
    const issuerSymbol = getQueryValue(query.IssuerSymbol);
    if (issuerSymbol) {
      return {
        path: `bonds/issuer/${encodeURIComponent(issuerSymbol)}`,
        query: {},
        method: 'GET',
      };
    }

    const icbCode = getQueryValue(query.ICBCode);
    if (icbCode) {
      return {
        path: 'bonds/filter',
        query: {},
        method: 'POST',
        body: {
          icbCode,
          statusID: getQueryNumber(query.StatusID) ?? 1,
        },
      };
    }

    const maturityFrom = getQueryValue(query.MaturityDateFrom);
    const maturityTo = getQueryValue(query.MaturityDateTo);
    const days = maturityFrom && maturityTo ? getMaturityDays(maturityFrom, maturityTo) : undefined;
    if (days) {
      return {
        path: 'bonds/stats/bonds/maturing-soon',
        query: { days },
        method: 'GET',
      };
    }
  }

  if (path === 'bond_StatisticsByIssuer') {
    return {
      path: 'bonds/stats/issuers/top-debt',
      query: { top: getQueryNumber(query.Top) ?? 200 },
      method: 'GET',
    };
  }

  if (path === 'bond_GetCategoryList') {
    const option = getQueryNumber(query.Option);
    if (option === 5) {
      return {
        path: 'bonds/stats/industries',
        query: {
          top: getQueryNumber(query.Top) ?? 1000,
          level: getQueryNumber(query.ICBLevel) ?? 1,
        },
        method: 'GET',
      };
    }

    if (option === 0) {
      return {
        path: 'bonds/stats/issuers/top-debt',
        query: { top: getQueryNumber(query.Top) ?? 200 },
        method: 'GET',
      };
    }
  }

  return {
    path,
    query,
    method: req.method,
    body: req.body,
  };
}

function getRequestToken(req: VercelRequest): string | null {
  const headerToken = req.headers.authorization;
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!rawToken) return null;
  const token = rawToken.replace(/^bearer\s+/i, '').trim();
  return token || null;
}

function sendUpstreamResponse(res: VercelResponse, status: number, data: unknown) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  if (data === undefined) {
    return res.status(status).json({});
  }

  if (typeof data === 'string') {
    try {
      return res.status(status).json(JSON.parse(data));
    } catch {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(status).send(data);
    }
  }

  return res.status(status).json(data);
}

async function getFireantToken(force = false) {
  const now = Date.now();
  if (FIREANT_ACCESS_TOKEN && !force) return FIREANT_ACCESS_TOKEN;
  if (!force && fireantToken && (now - lastTokenFetch < 15 * 60 * 1000)) return fireantToken;

  try {
    const response = await fetch(`${FIREANT_WEB_URL}/bai-viet`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000)
    });
    const html = await response.text();
    const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
    if (startIdx !== -1) {
      const jsonStart = html.indexOf('{', startIdx);
      const jsonEnd = html.indexOf('</script>', jsonStart);
      const data = JSON.parse(html.substring(jsonStart, jsonEnd));
      
      const findTokenRecursively = (obj: any, depth = 0): string | null => {
        if (!obj || typeof obj !== 'object' || depth > 10) return null;
        if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.length > 20) return obj.accessToken;
        if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            const res = findTokenRecursively(obj[key], depth + 1);
            if (res) return res;
          }
        }
        return null;
      };

      const token = data?.props?.pageProps?.initialState?.auth?.accessToken || 
                    data?.props?.pageProps?.initialState?.auth?.token ||
                    findTokenRecursively(data);
                    
      if (token) {
        fireantToken = token;
        lastTokenFetch = now;
        return token;
      }
    }
  } catch (e) {
    console.error("Token fetch failed", (e as any).message);
  }
  return fireantToken || FIREANT_ACCESS_TOKEN || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path: pathParam, ...otherQuery } = req.query;
  const path = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam as string);
  
  if (!path) return res.status(400).json({ error: "Path is required" });

  const target = resolveUpstreamTarget(path, otherQuery as Record<string, QueryValue>, req);

  const queryObj = new URLSearchParams();
  Object.entries(target.query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => queryObj.append(key, v));
    } else if (value !== undefined && value !== null) {
      queryObj.append(key, value as string);
    }
  });
  
  const queryString = queryObj.toString();
  const url = `${FIREANT_BASE_URL}/${target.path}${queryString ? `?${queryString}` : ""}`;

  console.log(`[Vercel Proxy] ${req.method} ${url}`);

  const fetchWithToken = async (authToken: string | null) => {
    const headers: any = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${FIREANT_WEB_URL}/`,
      'Origin': FIREANT_WEB_URL,
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    if (target.method !== 'GET' && target.method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method: target.method || req.method,
      headers,
      body: target.method === 'GET' || target.method === 'HEAD' ? undefined : JSON.stringify(target.body),
      signal: AbortSignal.timeout(20000),
    });

    const text = await response.text();
    let data: unknown = text;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    return {
      status: response.status,
      data,
    };
  };

  try {
    let token = getRequestToken(req) || await getFireantToken();
    let response = await fetchWithToken(token);
    
    // If 401, try refreshing the token once
    if (response.status === 401) {
      console.log(`[Vercel Proxy] 401 for ${path}, refreshing token...`);
      const freshToken = await getFireantToken(true);
      if (freshToken) {
        response = await fetchWithToken(freshToken);
      }
    }
    
    return sendUpstreamResponse(res, response.status, response.data);
  } catch (error: any) {
    console.error(`[Vercel Proxy Error] ${target.path}:`, error?.stack || error?.message || error);
    return res.status(500).json({
      error: "Failed to proxy request",
      message: error?.message || "Unknown error",
    });
  }
}
