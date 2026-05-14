import axios from "axios";
import { cleanTokenString, getFireantToken } from "../utils/token";

export interface AIModelInfo {
  id: string;
  label?: string;
  description?: string;
}

export interface AIStatus {
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  defaultSystemPrompt: string;
}

export interface AIModelsResponse {
  models: AIModelInfo[];
  defaultModel: string;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  userMessage: string;
  messages?: ChatMessage[];
  model?: string;
  systemPrompt?: string;
  /** Serialized live page data injected as context before the user message */
  pageContext?: string;
}

export interface ChatResponse {
  text: string;
  model: string;
  history: ChatMessage[];
}

function buildAIHeaders(): Record<string, string> {
  const token = getFireantToken();
  return token ? { "X-Fireant-Access-Token": cleanTokenString(token) } : {};
}

export async function getAIStatus(): Promise<AIStatus> {
  const { data } = await axios.get<AIStatus>("/api/ai/status", {
    headers: buildAIHeaders(),
    timeout: 8000,
  });
  return data;
}

export async function listAIModels(refresh = false): Promise<AIModelsResponse> {
  const { data } = await axios.get<AIModelsResponse>("/api/ai/models", {
    headers: buildAIHeaders(),
    timeout: 15000,
    params: refresh ? { refresh: 1 } : undefined,
    validateStatus: (status) => status < 600,
  });
  return data;
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  const { data } = await axios.post<ChatResponse>("/api/ai/chat", payload, {
    headers: buildAIHeaders(),
    timeout: 60000,
  });
  return data;
}

export async function clearChatHistory(): Promise<void> {
  await axios.post("/api/ai/history/clear", {}, { headers: buildAIHeaders(), timeout: 8000 });
}

export interface StreamHandlers {
  onStart?: (data: { model: string }) => void;
  onDelta: (text: string) => void;
  onDone?: (data: { text: string; model: string }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a chat completion via Server-Sent Events from /api/ai/chat/stream.
 * Uses fetch + ReadableStream to parse incremental tokens.
 */
export async function streamChat(
  payload: ChatRequest,
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...buildAIHeaders(),
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });

  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    try {
      const j = await response.json();
      detail = j?.error || j?.details || detail;
    } catch {
      /* noop */
    }
    handlers.onError?.(detail);
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const dispatch = (event: string, data: any) => {
    if (event === "start") handlers.onStart?.(data);
    else if (event === "delta") {
      if (typeof data?.text === "string") handlers.onDelta(data.text);
    } else if (event === "done") handlers.onDone?.(data);
    else if (event === "error") handlers.onError?.(data?.message || "Unknown error");
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length > 0) {
        try {
          dispatch(eventName, JSON.parse(dataLines.join("\n")));
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}
