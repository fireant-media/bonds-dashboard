import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { DEFAULT_AI_MODEL, FIREANT_ACCESS_TOKEN, FIREANT_WEB_URL, OPENAI_API_KEY, OPENAI_BASE_URL } from './_lib/config.js';

export const config = {
  supportsResponseStreaming: true,
};

interface AIModelInfo {
  id: string;
  label?: string;
}

const AI_API_KEY = OPENAI_API_KEY;
const AI_BASE_URL = OPENAI_BASE_URL;
const MODELS_CACHE_TTL = 30 * 60 * 1000;
const FIREANT_WEB_TOKEN_TTL = 15 * 60 * 1000;

const FALLBACK_MODELS: AIModelInfo[] = [
  { id: DEFAULT_AI_MODEL, label: DEFAULT_AI_MODEL },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini' },
  { id: 'gpt-5.4', label: 'GPT 5.4' },
  { id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini' },
  { id: 'gpt-4o-mini', label: 'GPT 4O Mini' },
  { id: 'gpt-4o', label: 'GPT 4O' },
  { id: 'gpt-3.5-turbo', label: 'GPT 3.5 Turbo' },
].filter((model, index, arr) => model.id && arr.findIndex((item) => item.id === model.id) === index);

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

let cachedModels: AIModelInfo[] | null = null;
let cachedModelsKey = '';
let lastModelsFetch = 0;
let cachedFireantWebToken = '';
let lastFireantWebTokenFetch = 0;

interface AIKeyCandidate {
  key: string;
  source: 'request' | 'openai_env' | 'fireant_env' | 'fireant_web';
  issuer: string | null;
}

const normalizeAIKey = (value: unknown): string => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '').replace(/^bearer\s+/i, '').trim();
};

const decodeTokenIssuer = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { iss?: unknown };
    return typeof payload.iss === 'string' ? payload.iss : null;
  } catch {
    return null;
  }
};

const getRequestAIKey = (req: VercelRequest): string =>
  normalizeAIKey(req.headers['x-fireant-access-token']) || normalizeAIKey(AI_API_KEY);

const isInvalidIssuerError = (message: string): boolean => {
  const lower = (message || '').toLowerCase();
  return lower.includes('not from a valid issuer') || lower.includes('invalid issuer');
};

const isUnauthorizedError = (message: string): boolean => {
  const lower = (message || '').toLowerCase();
  return lower.includes('unauthorized') || lower.includes('http 401') || lower === '401';
};

async function fetchFireantWebToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedFireantWebToken && now - lastFireantWebTokenFetch < FIREANT_WEB_TOKEN_TTL) {
    return cachedFireantWebToken;
  }

  try {
    const response = await axios.get(`${FIREANT_WEB_URL}/bai-viet`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    });

    const html = String(response.data || '');
    const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
    const startIdx = html.indexOf(scriptTag);
    if (startIdx === -1) return '';

    const jsonStart = html.indexOf('{', startIdx);
    const scriptEndIdx = html.indexOf('</script>', jsonStart);
    const data = JSON.parse(html.substring(jsonStart, scriptEndIdx));

    const findTokenRecursively = (value: unknown, depth = 0): string | null => {
      if (!value || typeof value !== 'object' || depth > 10) return null;

      const record = value as Record<string, unknown>;
      const directTokenCandidates = [record.accessToken, record.token, record.jwt];
      for (const candidate of directTokenCandidates) {
        const normalized = normalizeAIKey(candidate);
        if (normalized.length > 20) return normalized;
      }

      for (const child of Object.values(record)) {
        const nestedToken = findTokenRecursively(child, depth + 1);
        if (nestedToken) return nestedToken;
      }

      return null;
    };

    const token = normalizeAIKey(
      data?.props?.pageProps?.initialState?.auth?.accessToken
      || data?.props?.pageProps?.initialState?.auth?.token
      || findTokenRecursively(data),
    );

    if (token) {
      cachedFireantWebToken = token;
      lastFireantWebTokenFetch = now;
    }

    return token;
  } catch (error: any) {
    console.warn('[AI] Failed to fetch FireAnt web token:', error?.message || error);
    return '';
  }
}

async function getAIKeyCandidates(req: VercelRequest): Promise<AIKeyCandidate[]> {
  const candidates: AIKeyCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (key: string, source: AIKeyCandidate['source']) => {
    const normalized = normalizeAIKey(key);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({
      key: normalized,
      source,
      issuer: decodeTokenIssuer(normalized),
    });
  };

  addCandidate(normalizeAIKey(req.headers['x-fireant-access-token']), 'request');
  addCandidate(normalizeAIKey(AI_API_KEY), 'openai_env');
  addCandidate(normalizeAIKey(FIREANT_ACCESS_TOKEN), 'fireant_env');
  addCandidate(await fetchFireantWebToken(), 'fireant_web');

  return candidates;
}

const isChatModelId = (id: string): boolean => {
  if (!id) return false;

  const lower = id.toLowerCase();
  if (
    lower.includes('embedding') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('audio') ||
    lower.includes('dall-e') ||
    lower.includes('davinci') ||
    lower.includes('babbage') ||
    lower.includes('moderation') ||
    lower.includes('transcribe') ||
    lower.includes('realtime') ||
    lower.includes('image') ||
    lower.includes('search') ||
    lower.includes('codex') ||
    lower.includes('deep-research')
  ) {
    return false;
  }

  return true;
};

const buildModelLabel = (id: string): string =>
  id
    .split('-')
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');

async function fetchAvailableModels(
  apiKey: string,
  force = false,
): Promise<{ models: AIModelInfo[]; error: string | null }> {
  const now = Date.now();
  if (!force && cachedModels && cachedModelsKey === apiKey && now - lastModelsFetch < MODELS_CACHE_TTL) {
    return { models: cachedModels, error: null };
  }

  if (!apiKey) {
    return { models: [], error: 'FireAnt access token is missing for AI requests' };
  }

  try {
    const response = await axios.get(`${AI_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      timeout: 12000,
      validateStatus: (status) => status < 500,
    });

    if (response.status !== 200 || !Array.isArray(response.data?.data)) {
      return {
        models: FALLBACK_MODELS,
        error: response.data?.error?.message || `HTTP ${response.status}`,
      };
    }

    const filtered: AIModelInfo[] = response.data.data
      .map((item: any) => String(item.id || ''))
      .filter(isChatModelId)
      .map((id: string) => ({ id, label: buildModelLabel(id) }));

    const seen = new Set<string>();
    const unique = filtered.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });

    unique.sort((left, right) => right.id.localeCompare(left.id, undefined, { numeric: true }));
    cachedModels = unique;
    cachedModelsKey = apiKey;
    lastModelsFetch = now;

    return { models: unique, error: null };
  } catch (error: any) {
    return {
      models: FALLBACK_MODELS,
      error: error?.response?.data?.error?.message || error?.message || 'Unknown error',
    };
  }
}

const isReasoningModel = (modelId: string): boolean => {
  const id = (modelId || '').toLowerCase();
  return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
};

const isModelTierError = (message: string): boolean => {
  const lower = (message || '').toLowerCase();
  return lower.includes('not allowed') || lower.includes('user tier') || lower.includes('model_not_allowed');
};

const getCandidateModels = async (apiKey: string, requestedModel: string): Promise<string[]> => {
  const result = await fetchAvailableModels(apiKey, true);
  const discoveredModels = result.models.map((model) => model.id).filter(Boolean);
  return Array.from(
    new Set([requestedModel, DEFAULT_AI_MODEL, ...discoveredModels, ...FALLBACK_MODELS.map((model) => model.id)]),
  )
    .filter(Boolean)
    .slice(0, 8);
};

const buildChatMessages = (
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  systemPrompt: string,
  modelId: string,
  pageContext?: string,
) => {
  const sanitized = (history || [])
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));

  const systemRole = isReasoningModel(modelId) ? 'developer' : 'system';
  const messages: Array<{ role: string; content: string }> = [
    { role: systemRole, content: systemPrompt || ANALYST_SYSTEM_PROMPT },
  ];

  if (pageContext && pageContext.trim()) {
    messages.push({
      role: systemRole,
      content: `[PAGE_DATA]\n${pageContext.trim()}\n[/PAGE_DATA]`,
    });
  }

  messages.push(...sanitized);
  messages.push({ role: 'user', content: userMessage });
  return messages;
};

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const apiKey = getRequestAIKey(req) || normalizeAIKey(FIREANT_ACCESS_TOKEN);
  res.json({
    configured: Boolean(apiKey),
    baseUrl: AI_BASE_URL,
    defaultModel: DEFAULT_AI_MODEL,
    defaultSystemPrompt: ANALYST_SYSTEM_PROMPT,
  });
}

async function handleModels(req: VercelRequest, res: VercelResponse) {
  const candidates = await getAIKeyCandidates(req);
  if (candidates.length === 0) {
    return res.status(200).json({
      error: 'AI service not configured',
      models: [],
      defaultModel: DEFAULT_AI_MODEL,
    });
  }

  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  let lastResult: { models: AIModelInfo[]; error: string | null } = { models: [], error: null };

  for (const candidate of candidates) {
    const result = await fetchAvailableModels(candidate.key, force);
    lastResult = result;

    if (!result.error) {
      return res.json({ models: result.models, defaultModel: DEFAULT_AI_MODEL, error: null });
    }

    if (isInvalidIssuerError(result.error) || isUnauthorizedError(result.error)) {
      console.warn(`[AI] Rejected token from ${candidate.source}; issuer=${candidate.issuer || 'unknown'}; detail=${result.error}`);
      continue;
    }

    return res.json({ models: result.models, defaultModel: DEFAULT_AI_MODEL, error: result.error });
  }

  return res.json({
    models: lastResult.models,
    defaultModel: DEFAULT_AI_MODEL,
    error: lastResult.error || 'Khong tim thay FireAnt access token hop le cho AI gateway.',
  });
}

async function handleChat(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  const apiKeys = await getAIKeyCandidates(req);

  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (apiKeys.length === 0) return res.status(503).json({ error: 'AI service not configured' });

  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

  try {
    let lastDetail = '';

    for (const apiKey of apiKeys) {
      let targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
      if (!targetModel) {
        const result = await fetchAvailableModels(apiKey.key, true);
        targetModel = result.models[0]?.id || '';
      }

      if (!targetModel) continue;

      const candidateModels = await getCandidateModels(apiKey.key, targetModel);

      for (const candidateModel of candidateModels) {
        const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, candidateModel, pageContext);
        const response = await axios.post(
          `${AI_BASE_URL}/chat/completions`,
          { model: candidateModel, messages: chatMessages, stream: false },
          {
            headers: {
              Authorization: `Bearer ${apiKey.key}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
            validateStatus: (status) => status < 500,
          },
        );

        if (response.status === 200) {
          const text = response.data?.choices?.[0]?.message?.content || '';
          if (!text) throw new Error('No response text from AI provider');
          return res.json({ text, model: candidateModel, history: [] });
        }

        lastDetail = response.data?.error?.message || `HTTP ${response.status}`;

        if (isInvalidIssuerError(lastDetail) || isUnauthorizedError(lastDetail)) {
          console.warn(`[AI] Rejected token from ${apiKey.source}; issuer=${apiKey.issuer || 'unknown'}; detail=${lastDetail}`);
          break;
        }

        if (!isModelTierError(lastDetail)) {
          return res.status(response.status).json({
            error: 'AI provider error',
            details: lastDetail,
          });
        }
      }
    }

    return res.status(403).json({
      error: 'AI provider error',
      details: lastDetail || 'Khong tim thay model AI phu hop voi tai khoan.',
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'AI connection failed',
      details: error?.message,
    });
  }
}

async function handleChatStream(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  const apiKeys = await getAIKeyCandidates(req);

  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (apiKeys.length === 0) return res.status(503).json({ error: 'AI service not configured' });

  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    (res as any).flush?.();
  };

  let aborted = false;
  const abortController = new AbortController();
  res.on('close', () => {
    if (!(res as any).writableFinished) {
      aborted = true;
      abortController.abort();
    }
  });

  try {
    let upstream: Response | null = null;
    let finalModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
    let lastMessage = '';

    for (const apiKey of apiKeys) {
      let targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
      if (!targetModel) {
        const result = await fetchAvailableModels(apiKey.key, true);
        targetModel = result.models[0]?.id || '';
      }

      if (!targetModel) continue;

      const candidateModels = await getCandidateModels(apiKey.key, targetModel);

      for (const candidateModel of candidateModels) {
        const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, candidateModel, pageContext);
        const candidate = await fetch(`${AI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.key}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ model: candidateModel, messages: chatMessages, stream: true }),
          signal: abortController.signal,
        });

        if (candidate.ok) {
          upstream = candidate;
          finalModel = candidateModel;
          break;
        }

        const errorBody = await candidate.text().catch(() => '');
        let parsed: any = null;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = null;
        }

        lastMessage = parsed?.error?.message || errorBody.slice(0, 400) || `HTTP ${candidate.status}`;

        if (isInvalidIssuerError(lastMessage) || isUnauthorizedError(lastMessage)) {
          console.warn(`[AI] Rejected token from ${apiKey.source}; issuer=${apiKey.issuer || 'unknown'}; detail=${lastMessage}`);
          break;
        }

        if (!isModelTierError(lastMessage)) {
          sendEvent('error', { message: lastMessage });
          res.end();
          return;
        }
      }

      if (upstream) {
        break;
      }
    }

    if (!upstream) {
      sendEvent('error', { message: lastMessage || 'Khong tim thay model AI phu hop voi tai khoan.' });
      res.end();
      return;
    }

    if (!upstream.body) {
      sendEvent('error', { message: 'AI gateway tra ve body rong.' });
      res.end();
      return;
    }

    sendEvent('start', { model: finalModel });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      if (aborted) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const line of part.split('\n').filter((item) => item.startsWith('data:'))) {
          const payload = line.replace(/^data:\s?/, '').trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              sendEvent('delta', { text: delta });
            } else if (json.error) {
              sendEvent('error', { message: json.error.message || 'Stream error' });
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    }

    if (fullText) {
      sendEvent('done', { text: fullText, model: finalModel });
    } else if (!aborted) {
      sendEvent('error', {
        message: `Mo hinh ${finalModel} khong tra ve noi dung. Hay thu model khac.`,
      });
    }

    res.end();
  } catch (error: any) {
    if (error?.name === 'AbortError' && aborted) {
      res.end();
      return;
    }

    const code = error?.code || error?.cause?.code;
    const networkHints: Record<string, string> = {
      ETIMEDOUT: 'Yeu cau toi AI gateway bi timeout.',
      ECONNREFUSED: 'Khong the ket noi openai.fireant.vn.',
      ENOTFOUND: 'Khong phan giai duoc DNS openai.fireant.vn.',
    };

    const message = (code && networkHints[code]) || error?.message || 'Unknown error';
    sendEvent('error', { message });
    res.end();
  }
}

async function handlePing(req: VercelRequest, res: VercelResponse) {
  const apiKeys = await getAIKeyCandidates(req);
  if (apiKeys.length === 0) {
    return res.status(503).json({
      ok: false,
      error: 'FireAnt access token is required for AI ping',
    });
  }

  const startedAt = Date.now();
  for (const apiKey of apiKeys) {
    try {
      const response = await axios.get(`${AI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey.key}` },
        timeout: 15000,
        validateStatus: (status) => status < 600,
      });

      if (response.status === 200) {
        return res.json({
          ok: true,
          status: response.status,
          elapsed: Date.now() - startedAt,
        });
      }

      const detail = response.data?.error?.message || `HTTP ${response.status}`;
      if (isInvalidIssuerError(detail) || isUnauthorizedError(detail)) {
        console.warn(`[AI] Rejected token from ${apiKey.source}; issuer=${apiKey.issuer || 'unknown'}; detail=${detail}`);
        continue;
      }

      return res.json({
        ok: false,
        status: response.status,
        elapsed: Date.now() - startedAt,
        message: detail,
      });
    } catch (error: any) {
      if (isInvalidIssuerError(error?.message || '') || isUnauthorizedError(error?.message || '')) {
        continue;
      }

      return res.status(502).json({
        ok: false,
        elapsed: Date.now() - startedAt,
        message: error.message,
      });
    }
  }

  return res.status(502).json({
    ok: false,
    elapsed: Date.now() - startedAt,
    message: 'Khong tim thay FireAnt access token hop le cho AI gateway.',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query.path;
  const subPath = (Array.isArray(pathParam) ? pathParam.join('/') : (pathParam as string) || '').replace(/^\//, '');

  if (req.method === 'GET' && subPath === 'status') return handleStatus(req, res);
  if (req.method === 'GET' && subPath === 'models') return handleModels(req, res);
  if (req.method === 'GET' && subPath === 'ping') return handlePing(req, res);
  if (req.method === 'GET' && subPath === 'history') return res.json({ history: [] });

  if (req.method === 'POST' && subPath === 'chat') return handleChat(req, res);
  if (req.method === 'POST' && subPath === 'chat/stream') return handleChatStream(req, res);
  if (req.method === 'POST' && subPath === 'history/clear') return res.json({ success: true });

  return res.status(404).json({ error: `AI route not found: ${subPath}` });
}
