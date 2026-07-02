import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { sendChat } from '../api/ai';
import { useVisibleOnce } from '../hooks/useVisibleOnce';
import { useLanguage } from '../LanguageContext';
import { useAIStore } from '../store/aiStore';
import { readDailyAIInsight, sanitizeAIInsightText, writeDailyAIInsight } from '../utils/aiInsight';
import { Card } from './ui/Card';
import AIInsightText from './ui/AIInsightText';

interface AIInsightPanelProps {
  cacheKey: string;
  title: string;
  pageTitle: string;
  sectionTitle: string;
  payload: unknown;
  className?: string;
  expandContent?: boolean;
  layout?: 'default' | 'stacked';
  contentChrome?: 'boxed' | 'plain';
  // Ask the model for a shorter, key-points-only insight.
  concise?: boolean;
  // Cap the content area (px). Text is auto-trimmed to fit so the card height stays fixed and never grows.
  contentMaxHeight?: number;
  // Fully override the analyst brief (already localized by the caller). Takes precedence over `concise`.
  instructions?: string;
  // Extra literal terms to bold in the rendered text (e.g. the issuer name).
  boldTerms?: string[];
  // Keep the cached insight until the input data changes or the user refreshes (no daily expiry).
  persistCache?: boolean;
}

// Split an insight into sentences so trailing ones can be dropped to fit a fixed height.
function splitInsightSentences(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [trimmed];
}

let pendingAIStatusRequest: Promise<void> | null = null;

function ensureAIStatus(refreshStatus: () => Promise<void>) {
  if (!pendingAIStatusRequest) {
    pendingAIStatusRequest = refreshStatus().finally(() => {
      pendingAIStatusRequest = null;
    });
  }

  return pendingAIStatusRequest;
}

function hasMeaningfulPayload(payload: unknown) {
  if (payload == null) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload === 'object') return Object.keys(payload as Record<string, unknown>).length > 0;
  return Boolean(String(payload).trim());
}

function stableSerializePayload(payload: unknown) {
  const seen = new WeakSet<object>();

  const normalizeValue = (value: unknown): unknown => {
    if (value == null) return value;

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'object') return value;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalizeValue(item));
    }

    const record = value as Record<string, unknown>;
    if (seen.has(record)) return null;
    seen.add(record);

    return Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = normalizeValue(record[key]);
        if (normalized !== undefined) {
          result[key] = normalized;
        }
        return result;
      }, {});
  };

  return JSON.stringify(normalizeValue(payload));
}

function createPayloadSignature(payloadText: string) {
  let hash = 2166136261;

  for (let index = 0; index < payloadText.length; index += 1) {
    hash ^= payloadText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `ai-${payloadText.length}-${(hash >>> 0).toString(36)}`;
}

function toSentenceCase(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return normalized;
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export default function AIInsightPanel({
  cacheKey,
  title,
  pageTitle,
  sectionTitle,
  payload,
  className,
  expandContent = false,
  layout = 'default',
  contentChrome = 'boxed',
  concise = false,
  contentMaxHeight,
  instructions,
  boldTerms,
  persistCache = false,
}: AIInsightPanelProps) {
  const { t, language } = useLanguage();
  const { ref, isVisible } = useVisibleOnce<HTMLDivElement>();
  const {
    configured,
    baseUrl,
    defaultModel,
    defaultSystemPrompt,
    selectedModel,
    systemPrompt,
    isLoadingStatus,
    statusError,
    refreshStatus,
  } = useAIStore();
  const [insight, setInsight] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const activeModel = selectedModel || defaultModel;
  const activeSystemPrompt = systemPrompt || defaultSystemPrompt;

  // Fixed-height mode: adapt the GENERATED length to the panel size so the text fits the card at
  // the normal font (no shrinking, no cutting) — smaller panels get fewer sentences.
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    if (!contentMaxHeight) return;
    const element = ref.current;
    if (!element) return;
    // Measure once on mount so the density (and cache key) is stable before the first generation.
    const initialWidth = element.getBoundingClientRect().width;
    if (initialWidth) setPanelWidth(initialWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setPanelWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [contentMaxHeight]);
  const insightDensity = !contentMaxHeight || panelWidth === 0 || panelWidth >= 360
    ? 'full'
    : panelWidth >= 300
      ? 'compact'
      : 'mini';
  const expandedContentMaxHeight = contentMaxHeight ? Math.round(contentMaxHeight * 1.2) : undefined;
  const lengthDirective = !contentMaxHeight
    ? ''
    : language === 'en'
      ? ` Length: write ${insightDensity === 'mini' ? '1 to 2' : insightDensity === 'compact' ? '2 to 3' : '3 to 4'} complete, meaningful sentences. Each sentence must connect a figure to an interpretation and avoid bare numbers. Keep each sentence short and easy to scan, and allow the card to grow slightly if needed to fit the content without exceeding the available space.`
      : ` Độ dài: viết ${insightDensity === 'mini' ? '1-2' : insightDensity === 'compact' ? '2-3' : '3-4'} câu trọn vẹn, có ý nghĩa. Mỗi câu phải kết nối số liệu với nhận xét, không được chỉ nêu số trơ. Giữ mỗi câu ngắn, dễ đọc và cho phép card nở nhẹ nếu cần để vừa toàn bộ nội dung trong phạm vi không gian sẵn có.`;

  const payloadText = useMemo(() => {
    if (!hasMeaningfulPayload(payload)) return '';

    try {
      return stableSerializePayload({
        pageTitle,
        sectionTitle,
        data: payload,
      });
    } catch (serializeError) {
      console.warn('Failed to serialize AI insight payload', serializeError);
      return '';
    }
  }, [pageTitle, payload, sectionTitle]);
  const payloadSignature = useMemo(
    () => (payloadText ? createPayloadSignature(payloadText) : ''),
    [payloadText],
  );
  const localizedCacheKey = useMemo(
    () => `${cacheKey}-${language}${contentMaxHeight ? `-${insightDensity}` : ''}`,
    [cacheKey, language, contentMaxHeight, insightDensity],
  );
  const cachedInsight = useMemo(
    () => (payloadSignature ? readDailyAIInsight(localizedCacheKey, payloadSignature, { ignoreDate: persistCache }) : null),
    [localizedCacheKey, payloadSignature, persistCache],
  );

  const updatedLabel = useMemo(() => {
    if (!updatedAt) return '';

    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return '';

    return `${t('updated')}: ${new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
      timeZone: 'Asia/Saigon',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)}`;
  }, [language, t, updatedAt]);

  useEffect(() => {
    if (!payloadSignature) {
      setInsight('');
      setUpdatedAt('');
      setError(null);
      return;
    }

    if (!cachedInsight) {
      setInsight('');
      setUpdatedAt('');
      setError(null);
      return;
    }

    setInsight(cachedInsight.text);
    setUpdatedAt(cachedInsight.updatedAt);
    setError(null);
  }, [cachedInsight, payloadSignature]);

  useEffect(() => {
    if (!isVisible || configured || baseUrl || isLoadingStatus || statusError) return;
    void ensureAIStatus(refreshStatus);
  }, [baseUrl, configured, isLoadingStatus, isVisible, refreshStatus, statusError]);

  const generateInsight = async (force = false) => {
    if (!payloadText) return;

    if (!configured) {
      setError(t('aiNotConfiguredShort'));
      return;
    }

    if (!force) {
      const cachedInsight = readDailyAIInsight(localizedCacheKey, payloadSignature, { ignoreDate: persistCache });
      if (cachedInsight) {
        setInsight(cachedInsight.text);
        setUpdatedAt(cachedInsight.updatedAt);
        setError(null);
        return;
      }
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const basePrompt = instructions
        ? instructions
        : concise
        ? (language === 'en'
          ? 'You are a professional fixed-income analyst. Respond in English only. Only use the provided data. Do not mention JSON, APIs, endpoints, variable names, functions, internal code structure, or implementation details. Write 2 to 3 very short sentences focusing ONLY on the key points, no filler. The first sentence must surface the most important figures (scale, concentration, notable risk).'
          : 'Ban la chuyen gia phan tich thi truong trai phieu doanh nghiep. Chi tra loi bang tieng Viet. Chi su dung du lieu duoc cung cap. Khong nhac toi JSON, API, endpoint, ten bien, ten ham hay cau truc noi bo. Viet 2 den 3 cau that ngan, chi tap trung vao cac y chinh, khong lan man. Cau dau phai neu cac so lieu quan trong nhat (quy mo, muc do tap trung, rui ro dang chu y).')
        : (language === 'en'
          ? 'You are a professional fixed-income analyst. Respond in English only. Only use the provided data. Do not mention JSON, APIs, endpoints, variable names, functions, internal code structure, or implementation details. Write 3 to 4 short sentences in a concise professional tone. The first sentence must surface the most important figures. Prioritize concrete numbers, concentration, risk, and the next point to monitor.'
          : 'Ban la chuyen gia phan tich thi truong trai phieu doanh nghiep. Chi tra loi bang tieng Viet. Chi su dung du lieu duoc cung cap. Khong nhac toi JSON, API, endpoint, ten bien, ten ham hay cau truc noi bo cua he thong. Viet 3 den 4 cau ngan, giong chuyen nghiep. Cau dau phai lam noi bat cac so lieu quan trong nhat. Uu tien neu con so cu the, muc do tap trung, diem rui ro va yeu to can theo doi tiep theo.');
      const analystPrompt = `${basePrompt}${lengthDirective}`;

      const response = await sendChat({
        model: activeModel,
        systemPrompt: `${activeSystemPrompt ? `${activeSystemPrompt}\n\n` : ''}${analystPrompt}`,
        userMessage: language === 'en'
          ? `Write a short insight in English for the section "${sectionTitle}" on the page "${pageTitle}". Use only the provided data and present the analysis as a compact paragraph.`
          : `Hay viet nhan dinh ngan bang tieng Viet cho muc "${sectionTitle}" tren trang "${pageTitle}". Chi dung du lieu da cung cap va trinh bay thanh doan phan tich ngan gon.`,
        pageContext: payloadText,
      });

      if (requestIdRef.current !== requestId) return;

      const nextInsight = sanitizeAIInsightText(String(response.text || ''), language === 'en' ? 'en' : 'vi');
      const generatedAt = new Date().toISOString();
      setInsight(nextInsight);
      setUpdatedAt(generatedAt);
      writeDailyAIInsight(localizedCacheKey, {
        signature: payloadSignature,
        text: nextInsight,
        model: response.model || activeModel,
        updatedAt: generatedAt,
      });
    } catch (requestError: any) {
      if (requestIdRef.current !== requestId) return;
      setError(requestError?.response?.data?.details || requestError?.response?.data?.error || requestError?.message || t('aiCannotGenerateInsight'));
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isVisible || !payloadText || !configured || isLoading || insight || error || cachedInsight) return;
    // In fixed-height mode wait until the width is measured so density (and the cache key) is final,
    // otherwise we'd generate once for the wrong density and again after measuring.
    if (contentMaxHeight && panelWidth === 0) return;
    void generateInsight(false);
  }, [cachedInsight, configured, contentMaxHeight, error, insight, isLoading, isVisible, panelWidth, payloadText]);

  // Fixed-height safety net: the generated length is already sized to the panel, but if the text
  // still slightly overflows we drop a trailing WHOLE sentence (never cut mid-text), keeping a
  // minimum so the insight always reads as complete. Font/color/style stay the default (same as
  // the cash-flow commentary panel).
  const MIN_VISIBLE_SENTENCES = 2;
  const contentRef = useRef<HTMLDivElement>(null);
  const insightSentences = useMemo(
    () => (contentMaxHeight ? splitInsightSentences(insight) : []),
    [contentMaxHeight, insight],
  );
  const [visibleSentenceCount, setVisibleSentenceCount] = useState(0);

  useEffect(() => {
    if (!contentMaxHeight) return;
    setVisibleSentenceCount(insightSentences.length);
  }, [contentMaxHeight, insightSentences]);

  useEffect(() => {
    if (!contentMaxHeight) return;
    const element = contentRef.current;
    if (!element) return;
    if (element.scrollHeight > element.clientHeight && visibleSentenceCount > MIN_VISIBLE_SENTENCES) {
      setVisibleSentenceCount((previous) => Math.max(MIN_VISIBLE_SENTENCES, previous - 1));
    }
  }, [contentMaxHeight, visibleSentenceCount, insight]);

  // Re-fit from scratch when the card is resized (width changes rewrap the text).
  useEffect(() => {
    if (!contentMaxHeight || typeof ResizeObserver === 'undefined') return;
    const element = contentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setVisibleSentenceCount(insightSentences.length));
    observer.observe(element);
    return () => observer.disconnect();
  }, [contentMaxHeight, insightSentences]);

  // Keep the original text (with its paragraph breaks) unless we actually need to drop trailing
  // sentences as a last resort; only then fall back to a flattened prefix.
  const displayedInsight = !contentMaxHeight || visibleSentenceCount >= insightSentences.length
    ? insight
    : insightSentences.slice(0, Math.max(MIN_VISIBLE_SENTENCES, visibleSentenceCount)).join(' ');

  const isStackedLayout = layout === 'stacked';
  const insightContentClassName = contentMaxHeight
    ? 'overflow-y-auto pr-1'
    : expandContent || isStackedLayout
      ? 'overflow-visible'
      : 'max-h-28 overflow-y-auto pr-1';
  const boxedContentClassName = 'rounded-xl bg-bg-surface/70 px-4 py-3 shadow-sm ring-1 ring-blue-100/70 dark:bg-slate-900/20 dark:ring-blue-900/30';
  const plainContentClassName = 'px-1 py-1';
  const contentClassName = contentChrome === 'plain' ? plainContentClassName : boxedContentClassName;
  const displayTitle = toSentenceCase(title);

  return (
    <Card className={`group relative flex flex-col overflow-hidden rounded-xl border border-blue-100/80 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-4 shadow-sm shadow-blue-500/10 transition-all duration-300 dark:border-blue-900/40 dark:from-slate-900 dark:via-blue-950/30 dark:to-cyan-950/20 dark:shadow-black/20 ${className || ''}`}>
      <div className="relative flex min-h-0 flex-col" ref={ref}>
        <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-surface text-blue-600 shadow-sm ring-1 ring-blue-100 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-6 motion-reduce:transform-none dark:bg-slate-900/40 dark:ring-blue-900/40">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-text-base">
                {displayTitle}
              </h3>
              {updatedLabel ? (
                <div className="mt-0.5 text-xs font-medium text-text-muted/80">{updatedLabel}</div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generateInsight(true)}
            disabled={!payloadText || isLoading}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-base bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:hover:translate-y-0"
            title={t('refresh')}
            aria-label={t('refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 px-1 py-2 text-sm font-semibold text-text-muted">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
            <span>{t('aiGeneratingInsight')}</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl bg-bg-surface/70 px-4 py-3 text-sm text-text-muted shadow-sm ring-1 ring-amber-200/80 dark:bg-slate-900/20 dark:ring-amber-500/20">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>{error}</span>
          </div>
        ) : insight ? (
          <div
            ref={contentRef}
            className={`${contentClassName} ${insightContentClassName}`}
            style={contentMaxHeight ? { maxHeight: expandedContentMaxHeight } : undefined}
          >
            <AIInsightText content={displayedInsight} boldTerms={boldTerms} />
          </div>
        ) : (
          <div className={`${contentClassName} text-sm text-text-muted`}>
            {payloadText ? t('aiNoInsight') : t('noData')}
          </div>
        )}
      </div>
    </Card>
  );
}
