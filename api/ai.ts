import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { DEFAULT_AI_MODEL, OPENAI_API_KEY, OPENAI_BASE_URL } from './_lib/config.js';

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

const FALLBACK_MODELS: AIModelInfo[] = [
  { id: DEFAULT_AI_MODEL, label: DEFAULT_AI_MODEL },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini' },
  { id: 'gpt-5.4', label: 'GPT 5.4' },
  { id: 'gpt-4.1-mini', label: 'GPT 4.1 Mini' },
  { id: 'gpt-4o-mini', label: 'GPT 4O Mini' },
  { id: 'gpt-4o', label: 'GPT 4O' },
  { id: 'gpt-3.5-turbo', label: 'GPT 3.5 Turbo' },
].filter((model, index, arr) => model.id && arr.findIndex((item) => item.id === model.id) === index);

const ANALYST_SYSTEM_PROMPT = `Ban la chuyen gia phan tich trai phieu doanh nghiep cho dashboard FireAnt.

MUC TIEU:
- Tra loi dung trong tam cau hoi cua nguoi dung, dua tren du lieu hien co.
- Voi cau hoi dinh luong, dua ra con so chinh truoc, sau do bo sung 1-3 y giai thich ngan gon va co ich.
- Voi cau hoi phan tich, tach ro 2 phan: Du lieu quan sat duoc va Nhan dinh/ham y theo doi.

NGUYEN TAC SU DUNG DU LIEU:
1. Chi duoc su dung du lieu nam trong khoi [PAGE_DATA] lam co so tra loi.
2. Khong bia so lieu, khong suy doan nhu mot su that neu du lieu chua du.
3. Neu du lieu chua du de ket luan, noi ro thieu du lieu gi theo cach noi tu nhien, khong lo chi tiet ky thuat noi bo.
4. Khi phan tich thi uu tien cac khia canh: quy mo du no, gia tri phat hanh, lai suat, dao han, muc do tap trung va rui ro thanh khoan.
5. Neu so sanh nhieu to chuc, nganh hoac trai phieu, duoc phep dung bang Markdown ngan gon.

QUY TAC DIEN DAT:
- Tuyet doi khong nhac toi ten bien, ten ham, ten endpoint, ten API, field, JSON, route, PAGE_DATA hoac bat ky chi tiet trien khai noi bo nao trong cau tra loi cho nguoi dung.
- Neu can dan nguon boi canh, chi duoc dung cach noi tu nhien nhu: "Theo du lieu tong quan thi truong", "Theo du lieu nhom nganh nay", "Theo du lieu danh sach dao han", "Theo du lieu cua to chuc phat hanh nay".
- Khong viet theo kieu ky thuat nhu "trong PAGE_DATA", "tu endpoint", "truong du lieu", "ham xu ly".
- Giu giong van chuyen nghiep, ro rang, khong ram ra, khong chao hoi dai dong.

CHAT LUONG CAU TRA LOI:
- Sau khi dua ra ket qua chinh, neu phu hop hay bo sung them boi canh ngan gon: nhom dan dau, muc do tap trung, xu huong lai suat, ap luc dao han hoac diem can theo doi.
- Neu dua ra nhan dinh, phai tach bach voi phan du lieu quan sat duoc.
- Neu muc do tin cay khong cao vi thieu du lieu, noi ro muc do tin cay do.`;

let cachedModels: AIModelInfo[] | null = null;
let cachedModelsKey = '';
let lastModelsFetch = 0;

const getRequestAIKey = (req: VercelRequest): string => {
  const headerToken = req.headers['x-fireant-access-token'];
  const rawToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  return (rawToken || AI_API_KEY || '').replace(/^bearer\s+/i, '').trim();
};

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
    return res.status(200).json({
      error: 'AI service not configured',
      models: [],
      defaultModel: DEFAULT_AI_MODEL,
    });
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
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
      if (!isModelTierError(lastDetail)) {
        return res.status(response.status).json({
          error: 'AI provider error',
          details: lastDetail,
        });
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

      const errorBody = await candidate.text().catch(() => '');
      let parsed: any = null;
      try {
        parsed = JSON.parse(errorBody);
      } catch {
        parsed = null;
      }

      lastMessage = parsed?.error?.message || errorBody.slice(0, 400) || `HTTP ${candidate.status}`;
      if (!isModelTierError(lastMessage)) {
        sendEvent('error', { message: lastMessage });
        res.end();
        return;
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
  const apiKey = getRequestAIKey(req);
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: 'FireAnt access token is required for AI ping',
    });
  }

  const startedAt = Date.now();
  try {
    const response = await axios.get(`${AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
      validateStatus: (status) => status < 600,
    });

    res.json({
      ok: response.status === 200,
      status: response.status,
      elapsed: Date.now() - startedAt,
    });
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      elapsed: Date.now() - startedAt,
      message: error.message,
    });
  }
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
