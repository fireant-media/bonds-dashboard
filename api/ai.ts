import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export const config = {
  supportsResponseStreaming: true,
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const DEFAULT_AI_MODEL = (process.env.OPENAI_DEFAULT_MODEL || '').trim();

const DEFAULT_SYSTEM_PROMPT = `Bạn là Chuyên gia phân tích trái phiếu cấp cao.

PHONG CÁCH PHẢN HỒI:
1. SÚC TÍCH, TRỌNG TÂM: Chỉ trả lời đúng trọng tâm câu hỏi. Không chào hỏi rườm rà, không giải thích khái niệm trừ khi được hỏi.
2. DỰA TRÊN DỮ LIỆU: Tập trung vào các con số, xu hướng và rủi ro thực tế.
3. TRÌNH BÀY: Luôn sử dụng Markdown. Ưu tiên sử dụng BẢNG (table) cho dữ liệu so sánh, DANH SÁCH (list) cho các luận điểm. In đậm các số liệu quan trọng.
4. THÔNG MINH: Kết nối các thông tin thị trường để đưa ra nhận định sắc bén.

HẠN CHẾ: Không trả lời quá 3 đoạn văn. Hạn chế khoảng trống giữa các dòng.`;

interface AIModelInfo {
  id: string;
  label?: string;
}

let cachedModels: AIModelInfo[] | null = null;
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
    lower.includes('image')
  ) {
    return false;
  }
  return (
    lower.startsWith('gpt-') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('chatgpt')
  );
};

const buildModelLabel = (id: string): string =>
  id
    .split('-')
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');

async function fetchAvailableModels(force = false): Promise<{ models: AIModelInfo[]; error: string | null }> {
  const now = Date.now();
  if (!force && cachedModels && now - lastModelsFetch < MODELS_CACHE_TTL) {
    return { models: cachedModels, error: null };
  }
  if (!OPENAI_API_KEY) {
    return { models: [], error: 'OPENAI_API_KEY is not configured on the server' };
  }
  try {
    const response = await axios.get(`${OPENAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, Accept: 'application/json' },
      timeout: 12000,
      validateStatus: (s) => s < 500,
    });
    if (response.status !== 200 || !Array.isArray(response.data?.data)) {
      return { models: [], error: response.data?.error?.message || `HTTP ${response.status}` };
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
    lastModelsFetch = now;
    return { models: unique, error: null };
  } catch (err: any) {
    return { models: [], error: err?.response?.data?.error?.message || err?.message || 'Unknown error' };
  }
}

const isReasoningModel = (modelId: string): boolean => {
  const id = (modelId || '').toLowerCase();
  return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
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
    { role: systemRole, content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
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

async function handleStatus(res: VercelResponse) {
  res.json({
    configured: Boolean(OPENAI_API_KEY),
    baseUrl: OPENAI_BASE_URL,
    defaultModel: DEFAULT_AI_MODEL,
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  });
}

async function handleModels(req: VercelRequest, res: VercelResponse) {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured', models: [], defaultModel: DEFAULT_AI_MODEL });
  }
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const result = await fetchAvailableModels(force);
  res.json({ models: result.models, defaultModel: DEFAULT_AI_MODEL, error: result.error });
}

async function handleChat(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI service not configured' });

  const targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
  if (!targetModel) return res.status(400).json({ error: 'No AI model selected' });
  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || DEFAULT_SYSTEM_PROMPT;

  try {
    const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, targetModel, pageContext);
    const response = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      { model: targetModel, messages: chatMessages, stream: false },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 60000,
        validateStatus: (s) => s < 500,
      },
    );
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: 'AI provider error',
        details: response.data?.error?.message || `HTTP ${response.status}`,
      });
    }
    const text = response.data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('No response text from AI provider');
    res.json({ text, model: targetModel, history: [] });
  } catch (error: any) {
    res.status(500).json({ error: 'AI connection failed', details: error?.message });
  }
}

async function handleChatStream(req: VercelRequest, res: VercelResponse) {
  const { messages = [], userMessage, model, systemPrompt, pageContext } = req.body || {};
  if (!userMessage) return res.status(400).json({ error: 'User message is required' });
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI service not configured' });

  const targetModel = (typeof model === 'string' && model.trim()) || DEFAULT_AI_MODEL;
  if (!targetModel) return res.status(400).json({ error: 'No AI model selected' });
  const finalPrompt = (typeof systemPrompt === 'string' && systemPrompt.trim()) || DEFAULT_SYSTEM_PROMPT;

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
    const chatMessages = buildChatMessages(messages, userMessage, finalPrompt, targetModel, pageContext);
    const upstream = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ model: targetModel, messages: chatMessages, stream: true }),
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      let parsed: any = null;
      try { parsed = JSON.parse(errBody); } catch {}
      const message = parsed?.error?.message || errBody.slice(0, 400) || `HTTP ${upstream.status}`;
      sendEvent('error', { message });
      res.end();
      return;
    }

    if (!upstream.body) {
      sendEvent('error', { message: 'OpenAI trả về body rỗng.' });
      res.end();
      return;
    }

    sendEvent('start', { model: targetModel });

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
      sendEvent('done', { text: fullText, model: targetModel });
    } else if (!aborted) {
      sendEvent('error', {
        message: `Mô hình ${targetModel} không trả về nội dung. Hãy thử mô hình khác.`,
      });
    }
    res.end();
  } catch (error: any) {
    if (error?.name === 'AbortError' && aborted) { res.end(); return; }
    const code = error?.code || error?.cause?.code;
    const networkHints: Record<string, string> = {
      ETIMEDOUT: 'Yêu cầu tới OpenAI bị timeout.',
      ECONNREFUSED: 'Không thể kết nối api.openai.com.',
      ENOTFOUND: 'Không phân giải được DNS api.openai.com.',
    };
    const message = (code && networkHints[code]) || error?.message || 'Unknown error';
    sendEvent('error', { message });
    res.end();
  }
}

async function handlePing(res: VercelResponse) {
  if (!OPENAI_API_KEY) return res.status(503).json({ ok: false, error: 'OPENAI_API_KEY not set' });
  const startedAt = Date.now();
  try {
    const response = await axios.get(`${OPENAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
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

  if (req.method === 'GET' && subPath === 'status') return handleStatus(res);
  if (req.method === 'GET' && subPath === 'models') return handleModels(req, res);
  if (req.method === 'GET' && subPath === 'ping') return handlePing(res);
  if (req.method === 'GET' && subPath === 'history') return res.json({ history: [] });

  if (req.method === 'POST' && subPath === 'chat') return handleChat(req, res);
  if (req.method === 'POST' && subPath === 'chat/stream') return handleChatStream(req, res);
  if (req.method === 'POST' && subPath === 'history/clear') return res.json({ success: true });

  return res.status(404).json({ error: `AI route not found: ${subPath}` });
}
