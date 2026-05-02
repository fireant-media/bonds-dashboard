import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

async function getFireantToken() {
  if (process.env.FIREANT_ACCESS_TOKEN) return process.env.FIREANT_ACCESS_TOKEN;
  try {
    const response = await axios.get('https://fireant.vn/bai-viet', { timeout: 8000 });
    const html = response.data;
    const startIdx = html.indexOf('<script id="__NEXT_DATA__" type="application/json">');
    if (startIdx !== -1) {
      const jsonStart = html.indexOf('{', startIdx);
      const jsonEnd = html.indexOf('</script>', jsonStart);
      const data = JSON.parse(html.substring(jsonStart, jsonEnd));
      return data?.props?.pageProps?.initialState?.auth?.accessToken || data?.props?.pageProps?.initialState?.auth?.token;
    }
  } catch (e) {}
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.query.path as string;
  if (!path) return res.status(400).json({ error: "Path is required" });

  try {
    const token = await getFireantToken();
    const response = await axios({
      method: req.method,
      url: `https://betarest.fireant.vn/${path}`,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Origin': 'https://fireant.vn',
        'Referer': 'https://fireant.vn/'
      },
      data: req.body,
      timeout: 15000,
      validateStatus: (status) => status < 500
    });
    return res.status(response.status).json(response.data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
