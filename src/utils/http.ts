const HTML_PREFIXES = ['<!doctype', '<html'];

export class ResponseFormatError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ResponseFormatError';
    this.status = status;
  }
}

export const isHtmlResponseText = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return HTML_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export async function readJsonResponse<T>(response: Response, context = 'API'): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    throw new ResponseFormatError(response.status, `${context} returned an empty response body.`);
  }

  if (isHtmlResponseText(trimmed)) {
    throw new ResponseFormatError(
      response.status,
      `${context} returned HTML instead of JSON. This usually means Vercel served an error page or index.html.`,
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ResponseFormatError(
      response.status,
      `${context} returned invalid JSON.`,
    );
  }
}
