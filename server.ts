import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import {
  FIREANT_ACCESS_TOKEN,
  FIREANT_BASE_URL,
  FIREANT_BETA_BASE_URL,
  FIREANT_WEB_URL,
  STATIC_FIREANT_URL,
  DEFAULT_AI_MODEL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from "./api/_lib/config";
import { handlePageDataRequest } from "./api/_lib/page-data";

dotenv.config();

// =============================================
// FireAnt OpenAI-compatible Gateway Configuration
// =============================================
const AI_API_KEY = OPENAI_API_KEY;
const AI_BASE_URL = OPENAI_BASE_URL;

const getRequestAIKey = (req: express.Request): string => {
  const headerToken = req.headers["x-fireant-access-token"];
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  return (rawToken || AI_API_KEY || "").replace(/^bearer\s+/i, "").trim();
};

const DEFAULT_SYSTEM_PROMPT = `Bạn là Chuyên gia phân tích trái phiếu cấp cao.

PHONG CÁCH PHẢN HỒI:
1. SÚC TÍCH, TRỌNG TÂM: Chỉ trả lời đúng trọng tâm câu hỏi. Không chào hỏi rườm rà, không giải thích khái niệm trừ khi được hỏi.
2. DỰA TRÊN DỮ LIỆU: Tập trung vào các con số, xu hướng và rủi ro thực tế.
3. TRÌNH BÀY: Luôn sử dụng Markdown. Ưu tiên sử dụng BẢNG (table) cho dữ liệu so sánh, DANH SÁCH (list) cho các luận điểm. In đậm các số liệu quan trọng.
4. THÔNG MINH: Kết nối các thông tin thị trường để đưa ra nhận định sắc bén.

HẠN CHẾ: Không trả lời quá 3 đoạn văn. Hạn chế khoảng trống giữa các dòng.`;

const ANALYST_SYSTEM_PROMPT = `Bạn là trợ lý phân tích trái phiếu doanh nghiệp cho dashboard FireAnt.

NGÔN NGỮ:
- Luôn trả lời bằng tiếng Việt CÓ DẤU đầy đủ và chuẩn chính tả. TUYỆT ĐỐI không viết tiếng Việt không dấu; mọi từ (kể cả tiêu đề, nhãn và nội dung bảng) đều phải có dấu thanh và dấu mũ chính xác.
- Chỉ trả lời bằng tiếng Anh khi người dùng đặt câu hỏi bằng tiếng Anh. Khi đó, nếu không có dữ liệu phù hợp thì trả lời đúng câu: "No relevant information found."

NGUỒN DỮ LIỆU:
- Chỉ được dùng dữ liệu nằm trong khối [PAGE_DATA] để trả lời. Đây là dữ liệu của trang/phần mà người dùng đang mở.
- Đọc đầy đủ và chính xác toàn bộ dữ liệu; khi đếm, tính tổng, xếp hạng hoặc liệt kê thì phải duyệt hết mọi dòng, không được bỏ sót hay chỉ xét vài dòng đầu.

QUY TẮC TRẢ LỜI (BẮT BUỘC):
1. Chỉ trả lời dựa trên phần dữ liệu liên quan trực tiếp đến câu hỏi. Mọi con số, tên gọi, kết luận đều phải lấy nguyên từ dữ liệu.
2. TUYỆT ĐỐI không bịa, không suy diễn, không ước lượng, không dự đoán, không thêm thông tin hay kiến thức bên ngoài không có trong dữ liệu.
3. Nếu dữ liệu không chứa thông tin cần thiết để trả lời câu hỏi, hãy trả lời đúng một câu duy nhất: "Không tìm thấy thông tin phù hợp." và không thêm bất cứ nội dung nào khác.
4. Nếu câu hỏi mơ hồ, thiếu ngữ cảnh hoặc có thể hiểu theo nhiều cách, hãy hỏi lại người dùng để làm rõ thay vì đoán.
5. Chỉ nêu nhận định, so sánh hay xu hướng khi các con số cụ thể trong dữ liệu trực tiếp chứng minh điều đó; nếu không có số liệu chứng minh thì không được nêu.
6. Với câu hỏi định lượng, nêu con số chính xác lấy từ dữ liệu trước, sau đó chỉ giải thích ngắn gọn trong phạm vi dữ liệu cho phép.
7. Nếu so sánh nhiều tổ chức, ngành hoặc trái phiếu, được phép dùng bảng Markdown ngắn gọn dựa trên dữ liệu.

QUY TẮC DIỄN ĐẠT:
- Tuyệt đối không nhắc tới tên biến, tên hàm, tên endpoint, tên API, field, JSON, route, PAGE_DATA hoặc bất kỳ chi tiết triển khai nội bộ nào trong câu trả lời cho người dùng.
- Nếu cần dẫn nguồn, chỉ được dùng cách nói tự nhiên như: "Theo dữ liệu đang hiển thị", "Theo dữ liệu tổng quan thị trường", "Theo dữ liệu của tổ chức phát hành này".
- Không viết theo kiểu kỹ thuật như "trong PAGE_DATA", "từ endpoint", "trường dữ liệu", "hàm xử lý".
- Giữ giọng văn chuyên nghiệp, rõ ràng, ngắn gọn, không rườm rà, không chào hỏi dài dòng.`;

interface AIModelInfo {
  id: string;
  label?: string;
  description?: string;
}

let cachedModels: AIModelInfo[] | null = null;
let cachedModelsKey = "";
let lastModelsFetch = 0;
const MODELS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const isChatModelId = (id: string): boolean => {
  if (!id) return false;
  const lower = id.toLowerCase();
  // Filter out non-chat models (embeddings, audio, image, moderation, etc.)
  if (
    lower.includes("embedding") ||
    lower.includes("whisper") ||
    lower.includes("tts") ||
    lower.includes("audio") ||
    lower.includes("dall-e") ||
    lower.includes("davinci") ||
    lower.includes("babbage") ||
    lower.includes("moderation") ||
    lower.includes("transcribe") ||
    lower.includes("realtime") ||
    lower.includes("image") ||
    lower.includes("search") ||
    lower.includes("codex") ||
    lower.includes("deep-research")
  ) {
    return false;
  }
  return true;
};

const buildModelLabel = (id: string): string => {
  return id
    .split("-")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
};

interface FetchModelsResult {
  models: AIModelInfo[];
  error: string | null;
}

async function fetchAvailableModels(apiKey: string, force = false): Promise<FetchModelsResult> {
  const now = Date.now();
  if (!force && cachedModels && cachedModelsKey === apiKey && now - lastModelsFetch < MODELS_CACHE_TTL) {
    return { models: cachedModels, error: null };
  }

  if (!apiKey) {
    return { models: [], error: "OPENAI_API_KEY or VITE_FIREANT_ACCESS_TOKEN is not configured on the server" };
  }

  try {
    const response = await axios.get(`${AI_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      timeout: 12000,
      validateStatus: (status) => status < 500,
    });

    if (response.status !== 200 || !Array.isArray(response.data?.data)) {
      const detail = response.data?.error?.message || `HTTP ${response.status}`;
      console.warn(`[AI] Failed to fetch /models: ${detail}`);
      return { models: [], error: detail };
    }

    const filtered: AIModelInfo[] = response.data.data
      .map((m: any) => String(m.id || ""))
      .filter(isChatModelId)
      .map((id: string) => ({ id, label: buildModelLabel(id) }));

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const unique = filtered.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort: prefer newer (higher version numbers) names first
    unique.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) * -1);

    cachedModels = unique;
    cachedModelsKey = apiKey;
    lastModelsFetch = now;
    return { models: unique, error: null };
  } catch (err: any) {
    const detail = err?.response?.data?.error?.message || err?.message || "Unknown error";
    console.warn(`[AI] Error fetching models: ${detail}`);
    return { models: [], error: detail };
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  const isAllowedLocalOrigin = (origin?: string) => {
    if (!origin) return false;
    if (origin === "null") return true;

    try {
      const url = new URL(origin);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  };

  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";

    if (isAllowedLocalOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Fireant-Access-Token");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.header("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  });

  app.use(express.json());

  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'fireant-dev-session-secret'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }));

  // Generic API Proxy for Fireant
  app.all("/api/fireant/*", async (req, res) => {
    try {
      const targetPath = (req.params as any)[0];
      const { __base, ...upstreamQuery } = req.query as Record<string, unknown>;
      const baseTarget = String(Array.isArray(__base) ? __base[0] : (__base || '')).trim() === 'beta' ? 'beta' : 'default';
      const query = new URLSearchParams(upstreamQuery as any).toString();
      const upstreamBaseUrl = baseTarget === 'beta' ? FIREANT_BETA_BASE_URL : FIREANT_BASE_URL;
      const url = `${upstreamBaseUrl}/${targetPath}${query ? `?${query}` : ""}`;
      
      console.log(`[Proxy] ${req.method} ${url} (base=${baseTarget})`);
      
      // Get a fresh token if not provided by client
      let token = req.headers.authorization;
      if (!token || token === 'Bearer undefined' || token === 'undefined' || token === 'Bearer null' || token === 'null') {
        token = await getFireantToken();
        if (token && !token.startsWith('Bearer ')) {
          token = `Bearer ${token}`;
        }
      }

      const fetchWithToken = async (authToken: string | undefined) => {
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

      let response = await fetchWithToken(token);
      
      // If 401, try refreshing the token once
      if (response.status === 401) {
        console.log(`[Proxy] 401 detected for ${targetPath}, attempting server-side token refresh...`);
        const freshToken = await getFireantToken(true);
        if (freshToken) {
          response = await fetchWithToken(freshToken);
          console.log(`[Proxy] Retry for ${targetPath} resulted in status: ${response.status}`);
        } else {
          console.error(`[Proxy] Refresh failed for ${targetPath}`);
        }
      }
      
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`Error proxying Fireant [${req.method}] ${(req.params as any)[0]}:`, error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: "Failed to proxy request", message: error.message });
      }
    }
  });

  let fireantToken: string | null = null;
  let globalFallbackImage: string | null = "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=2070&auto=format&fit=crop";
  let lastTokenFetch = 0;

  const isNewsPost = (value: unknown): value is Record<string, any> => {
    if (!value || typeof value !== "object") return false;
    const post = value as Record<string, any>;
    return Boolean((post.postID || post.id) && typeof post.title === "string");
  };

  const extractNewsPosts = (payload: unknown, depth = 0): Record<string, any>[] => {
    if (!payload || depth > 10) return [];
    if (Array.isArray(payload)) return payload.filter(isNewsPost);
    if (typeof payload !== "object") return [];

    const value = payload as Record<string, any>;
    const candidates = [
      value.data,
      value.posts,
      value.items,
      value.records,
      value.list,
      value.NEWS_STREAM?.posts,
    ];

    for (const candidate of candidates) {
      const posts = extractNewsPosts(candidate, depth + 1);
      if (posts.length > 0) return posts;
    }

    for (const candidate of Object.values(value)) {
      const posts = extractNewsPosts(candidate, depth + 1);
      if (posts.length > 0) return posts;
    }

    return [];
  };

  async function getFireantToken(force = false, retryCount = 0): Promise<string | null> {
    const now = Date.now();
    
    // Only use env var if it exists and we don't have a better one or are forced
    if (FIREANT_ACCESS_TOKEN && !force) {
      if (!fireantToken || fireantToken !== FIREANT_ACCESS_TOKEN) {
        console.log("[Token] Adopting token from environment variable");
        fireantToken = FIREANT_ACCESS_TOKEN;
      }
      return fireantToken;
    }

    // Cache token and fallback image for 30 minutes, unless forced
    if (!force && fireantToken && (now - lastTokenFetch < 30 * 60 * 1000)) {
      return fireantToken;
    }

    try {
      console.log(`[Token] Fetching new access token (force=${force}, reason=${force ? 'Retry/Expiry' : 'Initial'}, attempt=${retryCount + 1})...`);
      const response = await axios.get(`${FIREANT_WEB_URL}/bai-viet`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cache-Control': 'no-cache',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        },
        timeout: 15000 // Increased to prevent timeout on slow connections
      });
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const scriptEndIdx = html.indexOf('</script>', jsonStart);
        const jsonStr = html.substring(jsonStart, scriptEndIdx);
        const data = JSON.parse(jsonStr);
        
        // Enhanced token search - search recursively for tokens if common paths fail
        const findTokenRecursively = (obj: any, depth = 0): string | null => {
          if (!obj || typeof obj !== 'object' || depth > 10) return null;
          
          if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.length > 20) return obj.accessToken;
          if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
          
          // Specifically check for __JWT__ or similar if Fireant changes naming
          if (obj.jwt && typeof obj.jwt === 'string' && obj.jwt.length > 20) return obj.jwt;
          
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
          console.log("[Token] Successfully obtained Fireant access token.");
        } else {
          console.warn("[Token] Access token not found in __NEXT_DATA__ after search");
          // If we had a token but couldn't find a new one during force refresh, 
          // we might want to clear it if it's definitely dead, or keep it as a hail mary.
          if (force) fireantToken = null; 
        }

        // Try to get a fallback image
        const firstPost = extractNewsPosts(data)[0];
        if (firstPost) {
          let fallbackImg = firstPost.images?.[0]?.imageUrl || 
                            (firstPost.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${firstPost.images[0].imageID}` : null) ||
                            firstPost.thumbnail ||
                            firstPost.linkImage;
          
          if (fallbackImg) {
            if (typeof fallbackImg === 'string' && fallbackImg.startsWith('/')) {
              fallbackImg = `${STATIC_FIREANT_URL}${fallbackImg}`;
            }
            globalFallbackImage = fallbackImg;
            console.log("[Token] Obtained global fallback image:", globalFallbackImage);
          }
        }
        
        return token;
      } else {
        console.error("[Token] Could not find __NEXT_DATA__ on Fireant main page");
      }
    } catch (error: any) {
      console.error(`[Token] Failed to fetch Fireant token/image (Attempt ${retryCount + 1}):`, error.message);
      if (retryCount < 2) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getFireantToken(force, retryCount + 1);
      }
    }
    return fireantToken;
  }

  // Server-side cache for news to handle slow source
  let newsCache: any = null;
  let lastCacheUpdate = 0;
  let isRefreshingNews = false;
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const FINANCE_FALLBACKS = [
    "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526303328184-bf7159787ca7?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1633156191771-7a55444e998b?q=80&w=800&auto=format&fit=crop"
  ];

  const getFallbackImage = (id: string | number) => {
    const idx = typeof id === 'number' ? id % FINANCE_FALLBACKS.length : (id.length % FINANCE_FALLBACKS.length);
    return FINANCE_FALLBACKS[idx];
  };

  const normalizeNewsText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const normalizeNewsSymbol = (value: unknown) => {
    const text = normalizeNewsText(value).toUpperCase();
    return /^[A-Z0-9._-]{2,16}$/.test(text) ? text : "";
  };

  const collectNewsSymbolTags = (value: unknown, tags: string[] = []) => {
    if (value === null || value === undefined) return tags;

    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return tags;

      if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
          return collectNewsSymbolTags(JSON.parse(text), tags);
        } catch {
          // Fall back to delimiter parsing.
        }
      }

      const parts = text.includes(",") || text.includes("|") || text.includes(";") || text.includes("/")
        ? text.split(/[\s,|;/]+/)
        : [text];

      for (const part of parts) {
        const normalized = normalizeNewsSymbol(part);
        if (normalized && !tags.includes(normalized)) tags.push(normalized);
      }

      return tags;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectNewsSymbolTags(item, tags);
      }
      return tags;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keyCandidates = [
        "symbol",
        "code",
        "ticker",
        "tag",
        "tagName",
        "tagCode",
        "value",
        "text",
        "name",
        "displayName",
        "label",
        "stockCode",
        "stockSymbol",
        "symbolCode",
        "symbolName",
        "symbolValue",
      ];

      for (const key of keyCandidates) {
        if (key in record) {
          collectNewsSymbolTags(record[key], tags);
        }
      }
    }

    return tags;
  };

  const extractNewsTags = (post: Record<string, any>) => {
    const candidates = [
      post.tags,
      post.postTags,
      post.tag,
      post.symbols,
      post.stockSymbols,
      post.stocks,
      post.hashtags,
      post.relatedSymbols,
      post.metadata?.tags,
      post.metadata?.symbols,
      post.metadata?.stockSymbols,
      post.info?.tags,
      post.info?.symbols,
      post.info?.stockSymbols,
      post.symbolInfo,
      post.symbolTags,
      post.relatedTags,
      post.postSource?.tags,
      post.postSource?.symbols,
      post.postSource?.stockSymbols,
    ];

    const tags: string[] = [];
    for (const candidate of candidates) {
      collectNewsSymbolTags(candidate, tags);
    }
    return tags;
  };

  const isNewsRelatedToSymbol = (news: Record<string, any>, symbol?: string | null) => {
    const normalizedSymbol = normalizeNewsSymbol(symbol);
    if (!normalizedSymbol) return false;

    const tags = Array.isArray(news.tags)
      ? news.tags.map((tag: unknown) => normalizeNewsSymbol(tag)).filter(Boolean)
      : [];
    if (tags.includes(normalizedSymbol)) return true;

    const pattern = new RegExp(`(^|[^A-Z0-9])${normalizedSymbol}([^A-Z0-9]|$)`, "i");
    return pattern.test(String(news.title || ""))
      || pattern.test(String(news.summary || ""))
      || pattern.test(String(news.content || ""))
      || pattern.test(String(news.originalUrl || ""));
  };

  const selectNewsBySymbol = (items: any[] | null | undefined, symbol?: string | null) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const normalizedSymbol = normalizeNewsSymbol(symbol);
    if (!normalizedSymbol) return items;

    const related = items.filter((item) => isNewsRelatedToSymbol(item, normalizedSymbol));
    return related.length > 0 ? related : items;
  };

  const buildNewsPostUrl = (post: Record<string, any>) => {
    const postId = post.postID || post.id;
    const title = typeof post.title === "string" ? post.title.trim() : "";
    if (!postId) return `${FIREANT_WEB_URL}/bai-viet`;
    if (!title) return `${FIREANT_WEB_URL}/bai-viet/${postId}`;

    const slug = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0111/g, "d")
      .replace(/\u0110/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `${FIREANT_WEB_URL}/bai-viet/${slug}/${postId}`;
  };

  const refreshNews = async (retryCount = 0): Promise<any[] | null> => {
    if (isRefreshingNews && retryCount === 0) return newsCache;
    isRefreshingNews = true;
    
    try {
      console.log(`[News] Refreshing news from Fireant (Attempt ${retryCount + 1})...`);
      
      let token = await getFireantToken();
      let posts: Record<string, any>[] | null = null;
      let retryableFailure = false;

      // Plan A: Use REST API if token is available
      if (token) {
        try {
          console.log("[News] Attempting to fetch via REST API...");
          const apiResponse = await axios.get(`${FIREANT_BASE_URL}/posts`, {
            params: {
              type: 1,
              offset: 0,
              limit: 50
            },
            headers: {
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': `${FIREANT_WEB_URL}/`,
              'Origin': FIREANT_WEB_URL
            },
            timeout: 15000,
            validateStatus: (status) => status < 500
          });

          const apiPosts = extractNewsPosts(apiResponse.data);
          if (apiResponse.status === 200 && apiPosts.length > 0) {
            posts = apiPosts;
            console.log(`[News] Successfully fetched ${posts.length} items via REST API.`);
          } else if (apiResponse.status === 401) {
            console.warn("[News] REST API returned 401 Unauthorized.");
            if (retryCount < 1) {
              console.log("[News] Forcing token refresh and retrying...");
              await getFireantToken(true);
              isRefreshingNews = false;
              return refreshNews(retryCount + 1);
            }
          } else if (apiResponse.status === 200) {
            console.warn("[News] REST API returned no usable posts.");
          } else {
            console.log(`[News] REST API returned status ${apiResponse.status}`);
          }
        } catch (apiErr: any) {
          console.log(`[News] REST API axios error: ${apiErr.message}`);
          retryableFailure = true;
        }
      }

      // Plan B: Fallback to Scraping if REST API failed or no token
      if (!posts) {
        console.log("[News] Falling back to HTML scraping...");
        try {
          const response = await axios.get(`${FIREANT_WEB_URL}/bai-viet`, {
            timeout: 20000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache'
            },
            validateStatus: (status) => status === 200
          });
          
          const html = response.data;
          const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
          const startIdx = html.indexOf(scriptTag);
          
          if (startIdx !== -1) {
            const jsonStart = html.indexOf('{', startIdx);
            const scriptEndIdx = html.indexOf('</script>', jsonStart);
            const jsonStr = html.substring(jsonStart, scriptEndIdx);
            const data = JSON.parse(jsonStr);
            posts = extractNewsPosts(data);
          }
        } catch (scrapErr: any) {
          console.error(`[News] Scraping error: ${scrapErr.message}`);
          retryableFailure = true;
        }
      }
      
      if (!posts || posts.length === 0) {
        if (retryableFailure && retryCount < 2) {
          console.warn("[News] Transient upstream failure; retrying refresh.");
          isRefreshingNews = false;
          return refreshNews(retryCount + 1);
        }

        console.warn("[News] No usable posts returned by FireAnt sources; serving cached news if available.");
        isRefreshingNews = false;
        return newsCache;
      }

      // Map to our NewsItem format
      const mappedNews = posts.map((post: any) => {
        const title = post.title || "";
        const summary = post.description || post.summary || "";
        
        const extractImage = (p: any) => {
          let img = p.images?.[0]?.imageUrl || 
                    (p.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${p.images[0].imageID}` : null) ||
                    p.thumbnail || 
                    p.linkImage;
          
          if (!img) {
            const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
            const imgMatches: RegExpMatchArray[] = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
            if (imgMatches.length > 0) {
              const likelyImg = imgMatches.find((m: RegExpMatchArray) => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
              img = likelyImg[1];
            }
          }

          if (img && typeof img === 'string') {
            if (img.startsWith('//')) img = `https:${img}`;
            else if (img.startsWith('/')) img = `${STATIC_FIREANT_URL}${img}`;
          }
          return img;
        };

        let image = extractImage(post) || getFallbackImage(post.postID || 0);
        
        const allImages = (post.images || []).map((img: any) => {
          let url = img.imageUrl || (img.imageID ? `${STATIC_FIREANT_URL}/News/Image/${img.imageID}` : null);
          if (url && typeof url === 'string') {
            if (url.startsWith('//')) url = `https:${url}`;
            else if (url.startsWith('/')) url = `${STATIC_FIREANT_URL}${url}`;
          }
          return url;
        }).filter(Boolean);

        if (image && !allImages.includes(image)) {
          allImages.unshift(image);
        }

        return {
          id: post.postID?.toString() || `fa-${Date.now()}-${Math.random()}`,
          source: post.postSource?.name || post.user?.name || 'Fireant',
          sourceUrl: post.postSource?.url || null,
          title: title,
          summary: summary,
          content: post.content || post.originalContent || post.description || post.summary || title,
          author: post.user?.name || 'Fireant',
          image: image || globalFallbackImage,
          images: allImages,
          date: post.date,
          url: buildNewsPostUrl(post),
          originalUrl: post.postSourceUrl || post.link || buildNewsPostUrl(post),
          category: post.postGroup?.name || 'Market',
          tags: extractNewsTags(post),
        };
      });
      
      newsCache = mappedNews;
      lastCacheUpdate = Date.now();
      console.log(`[News] Successfully refreshed news (${mappedNews.length} items).`);
      isRefreshingNews = false;
      return mappedNews;
    } catch (error: any) {
      console.error(`[News] Refresh failed: ${error.message}`);
      isRefreshingNews = false;
      return newsCache;
    }
  };

  // Initial fetch to populate cache on startup
  refreshNews();

  // API to fetch full content for a specific post
  app.get("/api/news/:id", async (req, res) => {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ error: "Post ID is required" });

    const tryRestApi = async (token: string) => {
      const endpoints = [
        `${FIREANT_BASE_URL}/posts/get-post?postID=${postId}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[News Detail] Fetching post ${postId} via ${new URL(endpoint).hostname}...`);
          const apiResponse = await axios.get(endpoint, {
            timeout: 15000,
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Origin': FIREANT_WEB_URL,
              'Referer': `${FIREANT_WEB_URL}/`
            },
            validateStatus: (status) => status < 500
          });

          if (apiResponse.status === 200 && apiResponse.data) {
            return apiResponse.data;
          }
          
          if (apiResponse.status === 401) {
            throw { status: 401, message: 'Unauthorized' };
          }
        } catch (err: any) {
          if (err.status === 401 || err.response?.status === 401) throw err;
          console.log(`[News Detail] API ${endpoint} failed: ${err.message}`);
        }
      }
      return null;
    };

    try {
      // 1. Try REST API with token
      let token = await getFireantToken();
      let postData = null;
      
      if (token) {
        try {
          postData = await tryRestApi(token);
        } catch (apiError: any) {
          if (apiError.status === 401 || apiError.response?.status === 401) {
            console.log(`[News Detail] 401 Unauthorized for post ${postId}, refreshing token...`);
            const freshToken = await getFireantToken(true);
            if (freshToken) {
              try {
                postData = await tryRestApi(freshToken);
              } catch (retryError: any) {
                console.log(`[News Detail] Retry after 401 failed: ${retryError.message}`);
              }
            }
          } else {
            console.log(`[News Detail] REST API failed for post ${postId}: ${apiError.message}`);
          }
        }
      }

      if (postData) {
        const post = postData;
        const title = post.title || "";
        const summary = post.description || post.summary || "";
        
        // Image extraction logic
        const extractImage = (p: any) => {
          let img = p.images?.[0]?.imageUrl || 
                    (p.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${p.images[0].imageID}` : null) ||
                    p.thumbnail || 
                    p.linkImage;
          
          if (!img) {
            const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
            const imgMatches: RegExpMatchArray[] = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
            if (imgMatches.length > 0) {
              const likelyImg = imgMatches.find((m: RegExpMatchArray) => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
              img = likelyImg[1];
            }
          }

          if (img && typeof img === 'string') {
            if (img.startsWith('//')) img = `https:${img}`;
            else if (img.startsWith('/')) img = `${STATIC_FIREANT_URL}${img}`;
          }
          return img;
        };

        let image = extractImage(post) || getFallbackImage(postId);
        const allImages = (post.images || []).map((img: any) => {
          let url = img.imageUrl || (img.imageID ? `${STATIC_FIREANT_URL}/News/Image/${img.imageID}` : null);
          if (url && typeof url === 'string') {
            if (url.startsWith('//')) url = `https:${url}`;
            else if (url.startsWith('/')) url = `${STATIC_FIREANT_URL}${url}`;
          }
          return url;
        }).filter(Boolean);

        if (image && !allImages.includes(image)) {
          allImages.unshift(image);
        }
        
        return res.json({
          id: post.postID?.toString(),
          source: post.postSource?.name || post.user?.name || 'Fireant',
          sourceUrl: post.postSource?.url || null,
          title: title,
          summary: summary,
          content: post.content || post.originalContent || summary || title,
          author: post.user?.name || 'Fireant',
          image: image,
          images: allImages,
          date: post.date,
          url: buildNewsPostUrl(post),
          originalUrl: post.postSourceUrl || post.link || buildNewsPostUrl(post),
          category: post.postGroup?.name || 'Market'
        });
      }

      // 2. Fallback to scraping if REST API fails
      console.log(`[News Detail] Falling back to scraping for post ${postId}...`);
      
      const scrapingUrls = [
        `${FIREANT_WEB_URL}/bai-viet/${postId}`,
        `${FIREANT_WEB_URL}/dashboard/bai-viet/${postId}`
      ];

      let scrapingResponse = null;
      for (const scrapUrl of scrapingUrls) {
        try {
          console.log(`[News Detail] Scraping URL: ${scrapUrl}`);
          scrapingResponse = await axios.get(scrapUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Referer': `${FIREANT_WEB_URL}/`,
              'Cache-Control': 'no-cache'
            },
            validateStatus: (status) => status === 200
          });
          if (scrapingResponse) break;
        } catch (err: any) {
          console.log(`[News Detail] Scraping ${scrapUrl} failed: ${err.message}`);
        }
      }
      
      if (scrapingResponse) {
        const html = scrapingResponse.data;
        const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
        const startIdx = html.indexOf(scriptTag);
        
        if (startIdx !== -1) {
          const jsonStart = html.indexOf('{', startIdx);
          const scriptEndIdx = html.indexOf('</script>', jsonStart);
          const jsonStr = html.substring(jsonStart, scriptEndIdx);
          const data = JSON.parse(jsonStr);
          const post = data?.props?.pageProps?.initialState?.posts?.post;
          
          if (post) {
            const title = post.title || "";
            const summary = post.description || post.summary || "";
            
            const extractImage = (p: any) => {
              let img = p.images?.[0]?.imageUrl || 
                        (p.images?.[0]?.imageID ? `${STATIC_FIREANT_URL}/News/Image/${p.images[0].imageID}` : null) ||
                        p.thumbnail || 
                        p.linkImage;
              
              if (!img) {
                const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
                const imgMatches: RegExpMatchArray[] = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
                if (imgMatches.length > 0) {
                  const likelyImg = imgMatches.find((m: RegExpMatchArray) => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
                  img = likelyImg[1];
                }
              }

              if (img && typeof img === 'string') {
                if (img.startsWith('//')) img = `https:${img}`;
                else if (img.startsWith('/')) img = `${STATIC_FIREANT_URL}${img}`;
              }
              return img;
            };

            let image = extractImage(post) || getFallbackImage(postId);
            let contentText = post.content || post.originalContent || summary || title;

            // If content is empty in JSON, try scraping from HTML
            if (!post.content || post.content.length < 100) {
              const contentMatches = [
                html.match(/<div id="post_content"[^>]*>([\s\S]*?)<\/div>\s*<div/),
                html.match(/<article[^>]*>([\s\S]*?)<\/article>/),
                html.match(/<div[^>]+class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/),
                html.match(/<main[^>]*>([\s\S]*?)<\/main>/)
              ];

              for (const match of contentMatches) {
                if (match && match[1] && match[1].length > 100) {
                  contentText = match[1];
                  break;
                }
              }

              // Fix images
              contentText = contentText.replace(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi, (match: string, src: string) => {
                let absoluteSrc = src;
                if (src.startsWith('//')) absoluteSrc = `https:${src}`;
                else if (src.startsWith('/')) absoluteSrc = `${STATIC_FIREANT_URL}${src}`;
                
                if (match.includes('data-src=')) {
                  return match.replace(/data-src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
                } else if (!match.includes('src=')) {
                  return match.replace('<img', `<img src="${absoluteSrc}"`);
                } else {
                  return match.replace(/src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
                }
              });
            }

            const allImages = (post.images || []).map((img: any) => {
              let url = img.imageUrl || (img.imageID ? `${STATIC_FIREANT_URL}/News/Image/${img.imageID}` : null);
              if (url && typeof url === 'string') {
                if (url.startsWith('//')) url = `https:${url}`;
                else if (url.startsWith('/')) url = `${STATIC_FIREANT_URL}${url}`;
              }
              return url;
            }).filter(Boolean);

            if (allImages.length <= 1) {
              const contentImgMatches: RegExpMatchArray[] = Array.from(contentText.matchAll(/<img[^>]+src=["']([^"'\s>]+)["']/gi));
              contentImgMatches.forEach((m: RegExpMatchArray) => {
                if (m[1] && !allImages.includes(m[1]) && !m[1].includes('icon') && !m[1].includes('logo')) {
                  allImages.push(m[1]);
                }
              });
            }

            if (image === getFallbackImage(postId) && allImages.length > 0) {
              image = allImages[0];
            }

            if (image && !allImages.includes(image)) {
              allImages.unshift(image);
            }

            return res.json({
              id: post.postID?.toString(),
              source: post.postSource?.name || post.user?.name || 'Fireant',
              sourceUrl: post.postSource?.url || null,
              title: title,
              summary: summary,
              content: contentText,
              author: post.user?.name || 'Fireant',
              image: image,
              images: allImages,
              date: post.date,
              url: buildNewsPostUrl(post),
              originalUrl: post.postSourceUrl || post.link || buildNewsPostUrl(post),
              category: post.postGroup?.name || 'Market'
            });
          }
        }
      }

      // 3. Last Resort: Cache or 404
      if (newsCache) {
        const cachedPost = newsCache.find((p: any) => p.id === postId);
        if (cachedPost) return res.json(cachedPost);
      }
      
      res.status(404).json({ error: "Post content not found" });
    } catch (error: any) {
      console.error(`[News Detail] Fatal error for ${postId}:`, error.message);
      res.status(500).json({ error: "Failed to fetch post content" });
    }
  });

  // API Proxy for News List
  app.get("/api/news", async (req, res) => {
    const now = Date.now();
    const symbol = typeof req.query.symbol === "string"
      ? req.query.symbol
      : Array.isArray(req.query.symbol) && typeof req.query.symbol[0] === "string"
        ? req.query.symbol[0]
        : null;
    
    // If cache is fresh, return it
    if (newsCache && (now - lastCacheUpdate < CACHE_TTL)) {
      return res.json(selectNewsBySymbol(newsCache, symbol));
    }
    
    // If cache is stale or missing, try to refresh
    console.log(`[News List] ${newsCache ? 'Cache stale' : 'Cache missing'}, fetching fresh news...`);
    try {
      const news = await refreshNews();
      return res.json(selectNewsBySymbol(news || [], symbol));
    } catch (err) {
      return res.json(selectNewsBySymbol(newsCache || [], symbol));
    }
  });

  app.all(["/api/page-data", "/api/page-data/:view"], async (req, res) => {
    const result = await handlePageDataRequest({
      method: req.method,
      view: req.params.view || String(req.query.view || ''),
      query: req.query as Record<string, string | string[] | undefined>,
      body: req.body,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(result.status).json(result.data);
  });

  // =============================================
  // AI Endpoints (FireAnt OpenAI-compatible gateway)
  // =============================================

  // Status: tells frontend whether the server has a key configured (without exposing it)
  app.get("/api/ai/status", (req, res) => {
    const apiKey = getRequestAIKey(req);
    res.json({
      configured: Boolean(apiKey),
      baseUrl: AI_BASE_URL,
      defaultModel: DEFAULT_AI_MODEL,
      defaultSystemPrompt: ANALYST_SYSTEM_PROMPT,
    });
  });

  // Quick connectivity probe — useful to diagnose whether the server can reach
  // the FireAnt AI gateway at all (DNS, firewall, proxy issues).
  app.get("/api/ai/ping", async (req, res) => {
    const apiKey = getRequestAIKey(req);
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: "OPENAI_API_KEY or VITE_FIREANT_ACCESS_TOKEN not set" });
    }
    const startedAt = Date.now();
    try {
      const response = await axios.get(`${AI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
        validateStatus: (s) => s < 600,
      });
      const elapsed = Date.now() - startedAt;
      console.log(`[AI] Ping ${AI_BASE_URL} → ${response.status} in ${elapsed}ms`);
      res.json({
        ok: response.status === 200,
        status: response.status,
        elapsed,
        baseUrl: AI_BASE_URL,
      });
    } catch (err: any) {
      const elapsed = Date.now() - startedAt;
      console.error(`[AI] Ping failed in ${elapsed}ms code=${err.code}: ${err.message}`);
      res.status(502).json({
        ok: false,
        elapsed,
        code: err.code,
        message: err.message,
        baseUrl: AI_BASE_URL,
      });
    }
  });

  // List available chat models for the picker
  app.get("/api/ai/models", async (req, res) => {
    const apiKey = getRequestAIKey(req);
    if (!apiKey) {
      return res.status(200).json({
        error: "AI service not configured",
        models: [],
        defaultModel: DEFAULT_AI_MODEL,
      });
    }

    const force = req.query.refresh === "1" || req.query.refresh === "true";
    const result = await fetchAvailableModels(apiKey, force);
    res.json({
      models: result.models,
      defaultModel: DEFAULT_AI_MODEL,
      error: result.error,
    });
  });

  // Reasoning models (o1, o3, o4-...) require `developer` role instead
  // of `system`, and don't accept temperature/top_p tuning.
  const isReasoningModel = (modelId: string): boolean => {
    const id = (modelId || "").toLowerCase();
    return id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4");
  };

  const isModelTierError = (message: string): boolean => {
    const lower = (message || "").toLowerCase();
    return lower.includes("not allowed") || lower.includes("user tier") || lower.includes("model_not_allowed");
  };

  const getCandidateModels = async (apiKey: string, requestedModel: string): Promise<string[]> => {
    const result = await fetchAvailableModels(apiKey, true);
    const models = result.models.map((item) => item.id).filter(Boolean);
    return Array.from(new Set([requestedModel, ...models])).slice(0, 6);
  };

  // Build messages array (OpenAI-compatible chat format) given prior history + user message.
  // For reasoning models, `system` is rewritten to `developer` to comply with
  // their API contract.
  // When `pageContext` is provided it is injected as a dedicated context block
  // so the model can reference live page data without polluting the system prompt.
  const buildChatMessages = (
    history: Array<{ role: string; content: string }>,
    userMessage: string,
    systemPrompt: string,
    modelId: string,
    pageContext?: string,
  ) => {
    const sanitized = (history || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    const systemRole = isReasoningModel(modelId) ? "developer" : "system";

    const messages: Array<{ role: string; content: string }> = [
      { role: systemRole, content: systemPrompt || ANALYST_SYSTEM_PROMPT },
    ];

    if (pageContext && typeof pageContext === "string" && pageContext.trim().length > 0) {
      messages.push({
        role: systemRole,
        content: `[PAGE_DATA]\n${pageContext.trim()}\n[/PAGE_DATA]`,
      });
    }

    messages.push(...sanitized);
    messages.push({ role: "user", content: userMessage });
    return messages;
  };

  // Helper: safely access the cookie session. Returns `null` when the cookie
  // has been cleared (e.g. after logout) — callers must treat history as
  // ephemeral in that case instead of crashing.
  const getSession = (req: express.Request): any | null => {
    const s = (req as any).session;
    return s && typeof s === "object" ? s : null;
  };

  const appendHistory = (session: any | null, userMessage: string, assistantText: string) => {
    if (!session) return [];
    if (!Array.isArray(session.chatHistory)) session.chatHistory = [];
    session.chatHistory.push({ role: "user", content: userMessage });
    session.chatHistory.push({ role: "assistant", content: assistantText });
    if (session.chatHistory.length > 20) {
      session.chatHistory = session.chatHistory.slice(-20);
    }
    return session.chatHistory;
  };

  // Non-streaming chat (kept for compatibility)
  app.post("/api/ai/chat", async (req, res) => {
    const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
    const session = getSession(req);
    const apiKey = getRequestAIKey(req);

    if (!userMessage) {
      return res.status(400).json({ error: "User message is required" });
    }

    if (!apiKey) {
      return res.status(503).json({ error: "AI service not configured" });
    }

    let targetModel = (typeof model === "string" && model.trim()) || DEFAULT_AI_MODEL;
    if (!targetModel) {
      const result = await fetchAvailableModels(apiKey, true);
      targetModel = result.models[0]?.id || "";
    }
    if (!targetModel) {
      return res.status(400).json({
        error: "No AI model selected",
        details: "Pass `model` in the request body or set FIREANT_AI_DEFAULT_MODEL on the server.",
      });
    }
    const finalPrompt = (typeof systemPrompt === "string" && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

    try {
      const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, targetModel, pageContext);

      console.log(`[AI] Chat request → model=${targetModel}, user=${session?.user?.email || "anonymous"}`);

      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        {
          model: targetModel,
          messages: chatMessages,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
          validateStatus: (status) => status < 500,
        },
      );

      if (response.status !== 200) {
        console.error(`[AI] FireAnt AI gateway returned ${response.status}:`, response.data);
        return res.status(response.status).json({
          error: "AI provider error",
          details: response.data?.error?.message || `HTTP ${response.status}`,
        });
      }

      const text = response.data?.choices?.[0]?.message?.content || "";
      if (!text) throw new Error("No response text from AI provider");

      const history = appendHistory(session, userMessage, text);
      res.json({ text, model: targetModel, history });
    } catch (error: any) {
      console.error("[AI] /chat error:", error.message);
      res.status(500).json({
        error: "AI connection failed",
        details: error.response?.data?.error?.message || error.message,
      });
    }
  });

  // Streaming chat (Server-Sent Events) — used by AIChatBot for live typing
  app.post("/api/ai/chat/stream", async (req, res) => {
    const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
    const session = getSession(req);
    const apiKey = getRequestAIKey(req);

    if (!userMessage) {
      return res.status(400).json({ error: "User message is required" });
    }
    if (!apiKey) {
      return res.status(503).json({ error: "AI service not configured" });
    }

    let targetModel = (typeof model === "string" && model.trim()) || DEFAULT_AI_MODEL;
    if (!targetModel) {
      const result = await fetchAvailableModels(apiKey, true);
      targetModel = result.models[0]?.id || "";
    }
    if (!targetModel) {
      return res.status(400).json({
        error: "No AI model selected",
        details: "Pass `model` in the request body or set FIREANT_AI_DEFAULT_MODEL on the server.",
      });
    }
    const finalPrompt = (typeof systemPrompt === "string" && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Force flush to bypass any intermediate buffering (compression
      // middleware, dev proxies, etc.). `flush()` is added by libraries like
      // `compression`; on bare Node sockets it's a no-op.
      (res as any).flush?.();
    };

    // Use the abort signal so stopping from the browser also cancels the
    // upstream request to the FireAnt AI gateway.
    //
    // NOTE: We listen on `res` instead of `req`. In Express, `req.on("close")`
    // can fire as soon as `express.json()` finishes reading the body, even
    // though the underlying socket is still alive — that would abort our
    // upstream fetch before it even starts. `res.on("close")` only fires when
    // the response stream is closed; we additionally check `writableFinished`
    // to ignore the natural close that follows our own `res.end()`.
    let aborted = false;
    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) {
        aborted = true;
        abortController.abort();
      }
    });

    try {
      const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, targetModel, pageContext);
      const startedAt = Date.now();
      console.log(
        `[AI] Stream request → model=${targetModel}, base=${AI_BASE_URL}, key=${apiKey ? `set(${apiKey.length}ch)` : "MISSING"}, user=${session?.user?.email || "anonymous"}`,
      );

      // Use native fetch (Node 18+) instead of axios. axios's stream handling
      // can buffer/swallow chunked SSE responses in some Node/version combos;
      // fetch+ReadableStream gives the most reliable SSE behavior here.
      const upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: targetModel,
          messages: chatMessages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      console.log(`[AI] Upstream connected in ${Date.now() - startedAt}ms (status=${upstream.status})`);

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => "");
        let parsed: any = null;
        try { parsed = JSON.parse(errBody); } catch {}
        const message = parsed?.error?.message || errBody.slice(0, 400) || `HTTP ${upstream.status}`;
        console.error(`[AI] Upstream HTTP ${upstream.status}: ${message}`);
        sendEvent("error", { message });
        res.end();
        return;
      }

      if (!upstream.body) {
        console.error(`[AI] Upstream ${upstream.status} returned no body`);
        sendEvent("error", { message: "AI gateway trả về body rỗng." });
        res.end();
        return;
      }

      sendEvent("start", { model: targetModel });

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";
      let chunkCount = 0;
      let deltaCount = 0;

      while (true) {
        if (aborted) {
          try { await reader.cancel(); } catch { /* noop */ }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount += 1;
        const text = decoder.decode(value, { stream: true });
        if (chunkCount === 1) {
          const preview = text.slice(0, 200).replace(/\n/g, "\\n");
          console.log(`[AI] First upstream chunk (${value.byteLength}B): ${preview}`);
        }

        // Normalize CRLF; some proxies emit `\r\n\r\n` between events.
        buffer += text.replace(/\r\n/g, "\n");
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n").filter((l) => l.startsWith("data:"));
          for (const line of lines) {
            const payload = line.replace(/^data:\s?/, "").trim();
            if (!payload) continue;
            if (payload === "[DONE]") continue;

            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                fullText += delta;
                deltaCount += 1;
                sendEvent("delta", { text: delta });
              } else if (json.error) {
                console.error(`[AI] Inline stream error:`, json.error);
                sendEvent("error", { message: json.error.message || "Stream error" });
              }
            } catch {
              // Ignore non-JSON keepalives
            }
          }
        }
      }

      console.log(`[AI] Stream end → chunks=${chunkCount}, deltas=${deltaCount}, length=${fullText.length}`);

      if (fullText) {
        appendHistory(session, userMessage, fullText);
        sendEvent("done", { text: fullText, model: targetModel });
      } else if (!aborted) {
        console.warn(`[AI] Stream finished with empty content for model=${targetModel}`);
        sendEvent("error", {
          message: `Mô hình ${targetModel} không trả về nội dung. Hãy thử mô hình khác hoặc kiểm tra system prompt.`,
        });
      }
      res.end();
    } catch (error: any) {
      let detailedMessage = error?.message || "Unknown error";

      // Map common low-level / fetch failures to friendlier hints.
      const code = error?.code || error?.cause?.code;
      if (code) {
        const networkHints: Record<string, string> = {
          ETIMEDOUT: "Yêu cầu tới AI gateway bị timeout. Mạng có thể đang chặn openai.fireant.vn.",
          ECONNREFUSED: "Không thể kết nối openai.fireant.vn. Kiểm tra firewall/proxy.",
          ECONNRESET: "Kết nối tới AI gateway bị ngắt giữa chừng.",
          ENOTFOUND: "Không phân giải được DNS openai.fireant.vn. Kiểm tra DNS/VPN.",
          EAI_AGAIN: "DNS lookup tạm thời thất bại. Thử lại sau.",
        };
        detailedMessage = `${networkHints[code] || detailedMessage} (${code})`;
      }

      // fetch AbortError when the client closes the connection — silent.
      if (error?.name === "AbortError" && aborted) {
        console.log(`[AI] Stream aborted by client`);
        res.end();
        return;
      }

      console.error(`[AI] /chat/stream error code=${code || "n/a"}: ${detailedMessage}`);
      sendEvent("error", { message: detailedMessage });
      res.end();
    }
  });

  app.get("/api/ai/history", (req, res) => {
    const session = req.session as any;
    res.json({ history: session?.chatHistory || [] });
  });

  app.post("/api/ai/history/clear", (req, res) => {
    const session = req.session as any;
    if (session) session.chatHistory = [];
    res.json({ success: true });
  });

  app.post("/api/auth/login", (req, res) => {
    const { userData } = req.body;
    const session = getSession(req);
    if (session) {
      session.user = userData;
    }
    res.json({ success: true, user: userData });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({ user: (req.session as any)?.user || null });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: process.cwd(),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  return app;
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});


