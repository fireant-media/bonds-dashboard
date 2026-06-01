import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { OPENAI_API_KEY, OPENAI_BASE_URL, DEFAULT_AI_MODEL } from './_lib/config.js';

export const config = {
  supportsResponseStreaming: true,
};

const AI_API_KEY = OPENAI_API_KEY;
const AI_BASE_URL = OPENAI_BASE_URL;
const FALLBACK_MODELS: AIModelInfo[] = [
  { id: DEFAULT_AI_MODEL, label: DEFAULT_AI_MODEL },
  { id: 'gpt-4o-mini', label: 'GPT 4O Mini' },
  { id: 'gpt-4o', label: 'GPT 4O' },
  { id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini' },
  { id: 'gpt-3.5-turbo', label: 'GPT 3.5 Turbo' },
].filter((model, index, arr) => model.id && arr.findIndex((item) => item.id === model.id) === index);

const getRequestAIKey = (req: VercelRequest): string => {
  const headerToken = req.headers['x-fireant-access-token'];
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  return (rawToken || AI_API_KEY || '').replace(/^bearer\s+/i, '').trim();
};

const DEFAULT_SYSTEM_PROMPT = `Bạn là Chuyên gia phân tích trái phiếu cấp cao.

PHONG CÁCH PHẢN HỒI:
1. SÚC TÍCH, TRỌNG TÂM: Chỉ trả lời đúng trọng tâm câu hỏi. Không chào hỏi rườm rà, không giải thích khái niệm trừ khi được hỏi.
2. DỰA TRÊN DỮ LIỆU: Tập trung vào các con số, xu hướng và rủi ro thực tế.
3. TRÌNH BÀY: Luôn sử dụng Markdown. Ưu tiên sử dụng BẢNG (table) cho dữ liệu so sánh, DANH SÁCH (list) cho các luận điểm. In đậm các số liệu quan trọng.
4. THÔNG MINH: Kết nối các thông tin thị trường để đưa ra nhận định sắc bén.

HẠN CHẾ: Không trả lời quá 3 đoạn văn. Hạn chế khoảng trống giữa các dòng.`;

const ANALYST_SYSTEM_PROMPT = `Ban la chuyen gia phan tich trai phieu doanh nghiep.

NGUYEN TAC TRA LOI:
1. Doc ky cau hoi va tu chon dung tap du lieu trong phan [DU LIEU MAN HINH HIEN TAI].
2. Neu nguoi dung hoi ve tong quan thi uu tien market_overview va market_projected_cash_flows.
3. Neu hoi ve nhom nganh thi uu tien industry_stats_<industry> va rankingData.
4. Neu hoi ve doanh nghiep thi uu tien enterprise_list, enterprise_bonds_<ticker>, enterprise_financial_<ticker>, enterprise_profile_<ticker>.
5. Khong bia so lieu. Neu du lieu trong context chua du, noi ro "chua co du lieu trong man hinh hien tai" va neu co the thi neu loai du lieu can nap them.
6. Tra loi ngan, truc tiep, dung Markdown. Dung bang khi so sanh nhieu ma/doanh nghiep/trai phieu. In dam cac so lieu quan trong.

HAN CHE: Khong tra loi qua 3 doan van neu khong can bang. Khong chao hoi dai dong.`;

interface AIModelInfo {
  id: string;
  label?: string;
}

let cachedModels: AIModelInfo[] | null = null;
let cachedModelsKey = '';
let lastModelsFetch = 0;
const MODELS_CACHE_TTL = 30 * 60 * 1000;

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
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');

async function fetchAvailableModels(apiKey: string, force = false): Promise<{ models: AIModelInfo[]; error: string | null }> {
  const now = Date.now();
  if (!force && cachedModels && cachedModelsKey === apiKey && now - lastModelsFetch < MODELS_CACHE_TTL) {
    return { models: cachedModels, error: null };
  }
  if (!apiKey) {
    return { models: [], error: 'OPENAI_API_KEY or VITE_FIREANT_ACCESS_TOKEN is not configured on the server' };
  }
  try {
    const response = await axios.get(`${AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      timeout: 12000,
      validateStatus: (s) => s < 500,
    });
    if (response.status !== 200 || !Array.isArray(response.data?.data)) {
      return { models: FALLBACK_MODELS, error: response.data?.error?.message || `HTTP ${response.status}` };
    }
    const filtered: AIModelInfo[] = response.data.data
      .map((m: any) => String(m.id || ''))
      .filter(isChatModelId)
      .map((id: string) => ({ id, label: buildModelLabel(id) }));
    const seen = new Set<string>();
    const unique = filtered.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    unique.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) * -1);
    cachedModels = unique;
    cachedModelsKey = apiKey;
    lastModelsFetch = now;
    return { models: unique, error: null };
  } catch (err: any) {
    return { models: FALLBACK_MODELS, error: err?.response?.data?.error?.message || err?.message || 'Unknown error' };
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
  const models = result.models.map((model) => model.id).filter(Boolean);
  return Array.from(new Set([requestedModel, DEFAULT_AI_MODEL, ...models, ...FALLBACK_MODELS.map((model) => model.id)])).filter(Boolean).slice(0, 8);
};

const buildChatMessages = (
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  systemPrompt: string,
  modelId: string,
  pageContext?: string,
) => {
  const sanitized = (history || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const systemRole = isReasoningModel(modelId) ? 'developer' : 'system';
  const messages: Array<{ role: string; content: string }> = [
    { role: systemRole, content: systemPrompt || ANALYST_SYSTEM_PROMPT },
    ...sanitized,
  ];

  if (pageContext && typeof pageContext === 'string' && pageContext.trim().length > 0) {
    messages.push({
      role: 'user',
      content: `[DỮ LIỆU TRANG HIỆN TẠI]\n${pageContext.trim()}\n[/DỮ LIỆU TRANG HIỆN TẠI]`,
    });
    messages.push({
      role: 'assistant',
      content: 'Tôi đã ghi nhận dữ liệu từ trang bạn đang xem. Hãy đặt câu hỏi.',
    });
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
};

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const apiKey = getRequestAIKey(req);
  res.json({
    configured: Boolean(apiKey),
    baseUrl: AI_BASE_URL,
    defaultModel: DEFAULT_AI_MODEL,
    defaultSystemPrompt: ANALYST_SYSTEM_PROMPT,
  });
}

async function handleModels(req: VercelRequest, res: VercelResponse) {
  const apiKey = getRequestAIKey(req);
  if (!apiKey) {
    return res.status(200).json({ error: 'AI service not configured', models: [], defaultModel: DEFAULT_AI_MODEL });
  }
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const result = await fetchAvailableModels(apiKey, force);
  res.json({ models: result.models, defaultModel: DEFAULT_AI_MODEL, error: result.error });
}

async function handleChat(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  const apiKey = getRequestAIKey(req);
  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

  let targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
  if (!targetModel) {
    const result = await fetchAvailableModels(apiKey, true);
    targetModel = result.models[0]?.id || '';
  }
  if (!targetModel) return res.status(400).json({ error: 'No AI model selected' });
  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

  try {
    const candidateModels = await getCandidateModels(apiKey, targetModel);
    let lastDetail = '';

    for (const candidateModel of candidateModels) {
      const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, candidateModel, pageContext);
      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        { model: candidateModel, messages: chatMessages, stream: false },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 60000,
          validateStatus: (s) => s < 500,
        },
      );
      if (response.status === 200) {
        const text = response.data?.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('No response text from AI provider');
        return res.json({ text, model: candidateModel, history: [] });
      }

      lastDetail = response.data?.error?.message || `HTTP ${response.status}`;
      if (!isModelTierError(lastDetail)) {
        return res.status(response.status).json({
          error: 'AI provider error',
          details: lastDetail,
        });
      }
    }

    return res.status(403).json({
      error: 'AI provider error',
      details: lastDetail || 'Không tìm thấy model AI phù hợp với tài khoản.',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'AI connection failed', details: error?.message });
  }
}

async function handleChatStream(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  const apiKey = getRequestAIKey(req);
  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (!apiKey) return res.status(503).json({ error: 'AI service not configured' });

  let targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
  if (!targetModel) {
    const result = await fetchAvailableModels(apiKey, true);
    targetModel = result.models[0]?.id || '';
  }
  if (!targetModel) return res.status(400).json({ error: 'No AI model selected' });
  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || ANALYST_SYSTEM_PROMPT;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();

  const sendEvent = (event: string, data: any) => {
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
    const candidateModels = await getCandidateModels(apiKey, targetModel);
    let upstream: Response | null = null;
    let finalModel = targetModel;
    let lastMessage = '';

    for (const candidateModel of candidateModels) {
      const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, candidateModel, pageContext);
      const candidate = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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

      const errBody = await candidate.text().catch(() => '');
      let parsed: any = null;
      try { parsed = JSON.parse(errBody); } catch {}
      lastMessage = parsed?.error?.message || errBody.slice(0, 400) || `HTTP ${candidate.status}`;
      if (!isModelTierError(lastMessage)) {
        sendEvent('error', { message: lastMessage });
        res.end();
        return;
      }
    }

    if (!upstream) {
      sendEvent('error', { message: lastMessage || 'Không tìm thấy model AI phù hợp với tài khoản.' });
      res.end();
      return;
    }

    if (!upstream.body) {
      sendEvent('error', { message: 'AI gateway trả về body rỗng.' });
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
        try { await reader.cancel(); } catch {}
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const line of part.split('\n').filter((l) => l.startsWith('data:'))) {
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
          } catch {}
        }
      }
    }

    if (fullText) {
      sendEvent('done', { text: fullText, model: finalModel });
    } else if (!aborted) {
      sendEvent('error', {
        message: `Mô hình ${finalModel} không trả về nội dung. Hãy thử mô hình khác.`,
      });
    }
    res.end();
  } catch (error: any) {
    if (error?.name === 'AbortError' && aborted) { res.end(); return; }
    const code = error?.code || error?.cause?.code;
    const networkHints: Record<string, string> = {
      ETIMEDOUT: 'Yêu cầu tới AI gateway bị timeout.',
      ECONNREFUSED: 'Không thể kết nối openai.fireant.vn.',
      ENOTFOUND: 'Không phân giải được DNS openai.fireant.vn.',
    };
    const message = (code && networkHints[code]) || error?.message || 'Unknown error';
    sendEvent('error', { message });
    res.end();
  }
}

async function handlePing(req: VercelRequest, res: VercelResponse) {
  const apiKey = getRequestAIKey(req);
  if (!apiKey) return res.status(503).json({ ok: false, error: 'OPENAI_API_KEY or VITE_FIREANT_ACCESS_TOKEN not set' });
  const startedAt = Date.now();
  try {
    const response = await axios.get(`${AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
      validateStatus: (s) => s < 600,
    });
    res.json({ ok: response.status === 200, status: response.status, elapsed: Date.now() - startedAt });
  } catch (err: any) {
    res.status(502).json({ ok: false, elapsed: Date.now() - startedAt, message: err.message });
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

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


