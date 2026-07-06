import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { sendChat } from '../api/ai';
import { useVisibleOnce } from '../hooks/useVisibleOnce';
import { useLanguage } from '../LanguageContext';
import { useAIStore } from '../store/aiStore';
import { readDailyAIInsight, sanitizeAIInsightText, writeDailyAIInsight } from '../utils/aiInsight';
import { buildParagraphDirective } from '../utils/aiInsightStructured';
import { Card } from './ui/Card';
import AIInsightText from './ui/AIInsightText';
import AdaptiveInsightContent from './ui/AdaptiveInsightContent';

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
  // Ask the model for a shorter, key-points-only insight (non-adaptive mode only).
  concise?: boolean;
  // Adaptive mode: the model returns a rich, structured insight (lead summary + labelled
  // sections with bullets) and the card reveals as many blocks as fit its measured height —
  // full on large cards, key points on medium, just the summary on small — so the text always
  // fills the card without overflowing or leaving big gaps.
  adaptive?: boolean;
  // Tailwind classes controlling how tall the adaptive content area may grow at each breakpoint.
  // `flex-1` lets it fill a card stretched by a taller sibling; the responsive max-heights cap it
  // when the card sizes to its own content (e.g. stacked on small screens → summary only).
  contentAreaClassName?: string;
  // Fully override the analyst brief (already localized by the caller).
  instructions?: string;
  // Extra literal terms to bold in the rendered text (e.g. the issuer name).
  boldTerms?: string[];
  // Keep the cached insight until the input data changes or the user refreshes (no daily expiry).
  persistCache?: boolean;
}

// A FIXED height at every breakpoint (never `flex-1`/`max-h`/`h-auto`): the card size is fully
// decided by the layout, and the insight is trimmed to fit it — content can never stretch or
// change the card height. Values grow with the breakpoint so bigger screens show more.
const DEFAULT_ADAPTIVE_CONTENT_CLASS = 'overflow-hidden h-[220px] sm:h-[240px] lg:h-[320px]';

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
  adaptive = false,
  contentAreaClassName,
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

  // Adaptive mode: measure the fixed-height content box (height fixed by the card, width responsive
  // to the screen) and turn it into a target sentence count so the model writes just enough to fill
  // the card at the current size — not so long it gets trimmed, not so short it leaves whitespace.
  const [adaptiveLengthTarget, setAdaptiveLengthTarget] = useState(0);
  const adaptiveResizeObserverRef = useRef<ResizeObserver | null>(null);
  const measureAdaptiveBox = useCallback((node: HTMLDivElement | null) => {
    adaptiveResizeObserverRef.current?.disconnect();
    adaptiveResizeObserverRef.current = null;
    if (!node) return;

    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (!width || !height) return;
      const lines = Math.max(3, Math.floor(height / 24)); // leading-6 ≈ 24px per line
      const charsPerLine = Math.max(24, Math.floor(width / 7.2)); // ≈ text-sm avg char width
      // ≈ chars in a concise 15-20 word sentence; higher divisor → fewer sentences requested, so
      // the model doesn't over-write and get trimmed (which was dropping the cash-flow point).
      const sentences = Math.min(14, Math.max(3, Math.round((lines * charsPerLine) / 120)));
      setAdaptiveLengthTarget((previous) => (previous === sentences ? previous : sentences));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    adaptiveResizeObserverRef.current = observer;
  }, []);

  const activeModel = selectedModel || defaultModel;
  const activeSystemPrompt = systemPrompt || defaultSystemPrompt;

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
    () => `${cacheKey}-${language}${adaptive ? `-prose-len${adaptiveLengthTarget}` : ''}`,
    [cacheKey, language, adaptive, adaptiveLengthTarget],
  );
  const cachedInsight = useMemo(
    () => (payloadSignature ? readDailyAIInsight(localizedCacheKey, payloadSignature, { ignoreDate: persistCache }) : null),
    [localizedCacheKey, payloadSignature, persistCache],
  );

  // Track the latest payload signature so an in-flight generation can tell whether the input
  // changed under it (e.g. async cash-flow data arriving after the request started).
  const payloadSignatureRef = useRef(payloadSignature);
  useEffect(() => {
    payloadSignatureRef.current = payloadSignature;
  }, [payloadSignature]);

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
    if (!payloadSignature || !cachedInsight) {
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
          ? 'You are a professional fixed-income analyst. Respond in English only. Only use the provided data. Do not mention JSON, APIs, endpoints, variable names, functions, internal code structure, or implementation details. Focus ONLY on the key points, no filler. Surface the most important figures first (scale, concentration, notable risk).'
          : 'Ban la chuyen gia phan tich thi truong trai phieu doanh nghiep. Chi tra loi bang tieng Viet. Chi su dung du lieu duoc cung cap. Khong nhac toi JSON, API, endpoint, ten bien, ten ham hay cau truc noi bo. Chi tap trung vao cac y chinh, khong lan man. Neu cac so lieu quan trong nhat truoc (quy mo, muc do tap trung, rui ro dang chu y).')
        : (language === 'en'
          ? 'You are a professional fixed-income analyst. Respond in English only. Only use the provided data. Do not mention JSON, APIs, endpoints, variable names, functions, internal code structure, or implementation details. Surface the most important figures first. Prioritize concrete numbers, concentration, risk, and the next point to monitor.'
          : 'Ban la chuyen gia phan tich thi truong trai phieu doanh nghiep. Chi tra loi bang tieng Viet. Chi su dung du lieu duoc cung cap. Khong nhac toi JSON, API, endpoint, ten bien, ten ham hay cau truc noi bo cua he thong. Lam noi bat cac so lieu quan trong nhat truoc. Uu tien neu con so cu the, muc do tap trung, diem rui ro va yeu to can theo doi tiep theo.');

      const analystPrompt = adaptive
        ? `${basePrompt}\n\n${buildParagraphDirective(language === 'en' ? 'en' : 'vi', adaptiveLengthTarget)}`
        : `${basePrompt}${language === 'en'
          ? ' Write 3 to 4 short sentences in a concise professional tone.'
          : ' Viet 3 den 4 cau ngan, giong chuyen nghiep.'}`;

      const response = await sendChat({
        model: activeModel,
        systemPrompt: `${activeSystemPrompt ? `${activeSystemPrompt}\n\n` : ''}${analystPrompt}`,
        userMessage: language === 'en'
          ? `Write a short insight in English for the section "${sectionTitle}" on the page "${pageTitle}". Use only the provided data.`
          : `Hay viet nhan dinh ngan bang tieng Viet cho muc "${sectionTitle}" tren trang "${pageTitle}". Chi dung du lieu da cung cap.`,
        pageContext: payloadText,
      });

      if (requestIdRef.current !== requestId) return;
      // The input changed while the model was responding (e.g. cash-flow data finished loading) —
      // discard this now-stale output; the effect will regenerate for the current data. Prevents a
      // "no data" insight generated on incomplete data from sticking after the real data arrives.
      if (payloadSignatureRef.current !== payloadSignature) return;

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
    // In adaptive mode wait until the card has been measured so the requested length fits it.
    if (adaptive && !adaptiveLengthTarget) return;
    void generateInsight(false);
  }, [adaptive, adaptiveLengthTarget, cachedInsight, configured, error, insight, isLoading, isVisible, payloadText]);

  const isStackedLayout = layout === 'stacked';
  const adaptiveContentClassName = contentAreaClassName || DEFAULT_ADAPTIVE_CONTENT_CLASS;
  const insightContentClassName = adaptive
    ? adaptiveContentClassName
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

        {adaptive ? (
          // Persistent fixed-height box (measured for the length target) that holds every state, so
          // the card height never changes and measurement is ready before the first generation.
          <div ref={measureAdaptiveBox} className={`${contentClassName} ${insightContentClassName}`}>
            {isLoading ? (
              <div className="flex items-center gap-3 py-2 text-sm font-semibold text-text-muted">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span>{t('aiGeneratingInsight')}</span>
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 text-sm text-text-muted">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{error}</span>
              </div>
            ) : insight ? (
              <AdaptiveInsightContent content={insight} boldTerms={boldTerms} className="h-full overflow-hidden" />
            ) : (
              <div className="text-sm text-text-muted">{payloadText ? t('aiNoInsight') : t('noData')}</div>
            )}
          </div>
        ) : isLoading ? (
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
          <div className={`${contentClassName} ${insightContentClassName}`}>
            <AIInsightText content={insight} boldTerms={boldTerms} />
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
