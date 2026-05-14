import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { FIREANT_ACCESS_TOKEN, FIREANT_BASE_URL, FIREANT_WEB_URL } from './_lib/config';

let fireantToken: string | null = null;
let lastTokenFetch = 0;

async function getFireantToken(force = false) {
  const now = Date.now();
  if (FIREANT_ACCESS_TOKEN && !force) return FIREANT_ACCESS_TOKEN;
  if (!force && fireantToken && (now - lastTokenFetch < 15 * 60 * 1000)) return fireantToken;

  try {
    const response = await axios.get(`${FIREANT_WEB_URL}/bai-viet`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
      timeout: 8000
    });
    const html = response.data;
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

  const queryObj = new URLSearchParams();
  Object.entries(otherQuery).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => queryObj.append(key, v));
    } else if (value !== undefined) {
      queryObj.append(key, value as string);
    }
  });
  
  const queryString = queryObj.toString();
  const url = `${FIREANT_BASE_URL}/${path}${queryString ? `?${queryString}` : ""}`;

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

    return await axios({
      method: req.method,
      url: url,
      headers,
      data: req.body,
      timeout: 20000,
      validateStatus: (status) => status < 500
    });
  };

  try {
    let token = await getFireantToken();
    let response = await fetchWithToken(token);
    
    // If 401, try refreshing the token once
    if (response.status === 401) {
      console.log(`[Vercel Proxy] 401 for ${path}, refreshing token...`);
      const freshToken = await getFireantToken(true);
      if (freshToken) {
        response = await fetchWithToken(freshToken);
      }
    }
    
    return res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`[Vercel Proxy Error] ${path}:`, error.message);
    return res.status(500).json({ error: "Failed to proxy request", message: error.message });
  }
}
