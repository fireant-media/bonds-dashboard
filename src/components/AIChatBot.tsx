import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Loader2, Sparkles, Minimize2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAIStore } from '../store/aiStore';
import { streamChat } from '../api/ai';
import { getCache } from '../utils/cache';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

const CHAT_HISTORY_KEY = 'sentinel_chat_history';

// ──────────────────────────────────────────────────────────────
// Page context builder – reads from existing cache, no new fetches
// ──────────────────────────────────────────────────────────────
interface PageContextInfo {
  label: string;
  text: string;
}

function buildPageContext(pathname: string): PageContextInfo | null {
  const parts = pathname.split('/').filter(Boolean);

  // ── Market Overview ──────────────────────────────────────────
  if (parts.length === 0 || (parts.length === 1 && /^[A-Z]{6,}$/.test(parts[0]))) {
    const data = getCache('market_overview');
    if (!data) return null;
    const lines: string[] = ['Dữ liệu tổng quan thị trường trái phiếu:'];

    if (Array.isArray(data.topDebtData) && data.topDebtData.length > 0) {
      lines.push('\nTop doanh nghiệp dư nợ cao nhất:');
      (data.topDebtData as any[]).slice(0, 10).forEach((d: any, i: number) => {
        const debt = ((d.totalRemainingDebt || 0) / 1e9).toFixed(0);
        lines.push(`  ${i + 1}. ${d.issuerName} (${d.issuerSymbol}): ${debt} tỷ dư nợ, ${d.bondCount} TP`);
      });
    }

    if (Array.isArray(data.topInterestData) && data.topInterestData.length > 0) {
      lines.push('\nTop trái phiếu lãi suất cao:');
      (data.topInterestData as any[]).slice(0, 10).forEach((d: any, i: number) => {
        lines.push(`  ${i + 1}. ${d.code} – ${d.interestRate ?? d.couponRate ?? '?'}% – ${d.issuerSymbol || ''}`);
      });
    }

    if (Array.isArray(data.industryData) && data.industryData.length > 0) {
      lines.push('\nPhân bổ dư nợ theo ngành:');
      (data.industryData as any[]).slice(0, 10).forEach((d: any) => {
        const debt = ((d.totalRemainingDebt || 0) / 1e9).toFixed(0);
        lines.push(`  - ${d.icbName}: ${debt} tỷ, ${d.bondCount} TP`);
      });
    }

    return lines.length > 1 ? { label: 'Tổng quan thị trường', text: lines.join('\n') } : null;
  }

  // ── Industry view ────────────────────────────────────────────
  if (parts[0] === 'industry' && parts[1]) {
    const industry = parts[1];
    const industryNames: Record<string, string> = {
      Banking: 'Ngân hàng',
      Securities: 'Chứng khoán',
      RealEstate: 'Bất động sản',
    };
    const label = industryNames[industry] || industry;
    const data = getCache(`industry_stats_${industry}`);
    if (!data) return null;

    const lines: string[] = [`Dữ liệu ngành ${label}:`];

    const s = data.industryStats;
    if (s) {
      lines.push('\nThống kê tổng ngành:');
      if (s.totalRemainingDebt) lines.push(`  - Dư nợ: ${((s.totalRemainingDebt || 0) / 1e9).toFixed(0)} tỷ VNĐ`);
      if (s.bondCount) lines.push(`  - Số trái phiếu: ${s.bondCount}`);
      if (s.totalCurrentListedValue) lines.push(`  - Giá trị niêm yết: ${((s.totalCurrentListedValue || 0) / 1e9).toFixed(0)} tỷ VNĐ`);
    }

    if (Array.isArray(data.rankingData) && data.rankingData.length > 0) {
      lines.push('\nCác doanh nghiệp nổi bật trong ngành:');
      (data.rankingData as any[]).slice(0, 10).forEach((d: any, i: number) => {
        const debt = ((d.totalRemainingDebt || 0) / 1e9).toFixed(0);
        lines.push(`  ${i + 1}. ${d.issuerName || d.issuerSymbol} (${d.issuerSymbol}): ${debt} tỷ dư nợ, ${d.bondCount} TP`);
      });
    }

    return lines.length > 1 ? { label: `Ngành ${label}`, text: lines.join('\n') } : null;
  }

  // ── Enterprise view ──────────────────────────────────────────
  if (parts[0] === 'enterprise' && parts[1]) {
    const ticker = parts[1];
    const enterprises: any[] = getCache('enterprise_list') || [];
    const ent = enterprises.find((e) => e.ticker === ticker);
    if (!ent) return null;

    const lines: string[] = [`Dữ liệu doanh nghiệp ${ent.name || ticker} (${ticker}):`];
    lines.push(`  - Ngành: ${ent.industry}`);
    if (ent.issuedValue) lines.push(`  - Tổng phát hành: ${ent.issuedValue.toFixed(0)} tỷ VNĐ`);
    if (ent.remainingDebt) lines.push(`  - Dư nợ còn lại: ${ent.remainingDebt.toFixed(0)} tỷ VNĐ`);
    if (ent.bondCount) lines.push(`  - Số trái phiếu: ${ent.bondCount}`);

    // Bond list from top_debt_200
    const allDebt: any[] = getCache('top_debt_200') || [];
    const entDebt = allDebt.find((d) => d.issuerSymbol === ticker);
    if (entDebt?.bonds?.length) {
      lines.push('\nCác trái phiếu:');
      (entDebt.bonds as any[]).slice(0, 10).forEach((b: any) => {
        const rate = b.interestRate ?? b.couponRate ?? b.bondRate ?? '?';
        lines.push(`  - ${b.code}: Lãi ${rate}%, Đáo hạn ${b.maturityDate?.split('T')[0] || '?'}`);
      });
    }

    return { label: `Doanh nghiệp ${ent.name || ticker}`, text: lines.join('\n') };
  }

  return null;
}

// ──────────────────────────────────────────────────────────────
// Blinking cursor shown at end of streaming message
// ──────────────────────────────────────────────────────────────
function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-3.5 bg-current align-middle ml-0.5 animate-pulse" />
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────
export default function AIChatBot() {
  const { t } = useLanguage();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshedModelsOnOpenRef = useRef(false);

  const {
    configured,
    selectedModel,
    defaultModel,
    models,
    systemPrompt,
    refreshStatus,
    refreshModels,
    setSelectedModel,
    isLoadingStatus,
    isLoadingModels,
    statusError,
  } = useAIStore();

  // Build page context from current route + existing cache without showing an attachment chip.
  const pageCtxInfo = useMemo(() => buildPageContext(location.pathname), [location.pathname]);

  // Initialize messages from localStorage or default
  useEffect(() => {
    const saved = localStorage.getItem(CHAT_HISTORY_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
        return;
      } catch {
        /* fallthrough to default */
      }
    }
    setMessages([{ role: 'assistant', content: t('chatBotWelcome') }]);
  }, [t]);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    }
  }, [messages]);

  // Bootstrap AI status when chat opens for the first time.
  // statusError is intentionally included so retries don't loop: once an error
  // is set we stop auto-retrying (user can retry manually via Settings).
  useEffect(() => {
    if (isOpen && !configured && !isLoadingStatus && !statusError) {
      void refreshStatus();
    }
  }, [isOpen, configured, isLoadingStatus, statusError, refreshStatus]);

  useEffect(() => {
    if (!isOpen) {
      refreshedModelsOnOpenRef.current = false;
      return;
    }
    if (configured && !isLoadingModels && !refreshedModelsOnOpenRef.current) {
      refreshedModelsOnOpenRef.current = true;
      void refreshModels(true);
    }
  }, [isOpen, configured, isLoadingModels, refreshModels]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const allowedModelIds = useMemo(() => new Set(models.map((model) => model.id)), [models]);
  const validSelectedModel = selectedModel && allowedModelIds.has(selectedModel) ? selectedModel : '';
  const validDefaultModel = defaultModel && allowedModelIds.has(defaultModel) ? defaultModel : '';
  const activeModel = validDefaultModel || validSelectedModel || models[0]?.id || '';
  const isStreaming = streamingIdx !== null;

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    if (!configured) {
      setErrorBanner(t('aiNotConfigured'));
      return;
    }

    if (!activeModel && !isLoadingModels) {
      await refreshModels(true);
    }

    const refreshedModels = useAIStore.getState().models;
    const refreshedSelectedModel = useAIStore.getState().selectedModel;
    const refreshedDefaultModel = useAIStore.getState().defaultModel;
    const refreshedAllowedIds = new Set(refreshedModels.map((model) => model.id));
    const sendModel =
      (refreshedDefaultModel && refreshedAllowedIds.has(refreshedDefaultModel) ? refreshedDefaultModel : '') ||
      (refreshedSelectedModel && refreshedAllowedIds.has(refreshedSelectedModel) ? refreshedSelectedModel : '') ||
      refreshedModels[0]?.id ||
      '';

    if (!sendModel) {
      setErrorBanner(t('aiNoModelSelected'));
      return;
    }

    const userMessage = input.trim();
    const priorHistory = messages.filter((m, i) => !(i === 0 && m.role === 'assistant'));

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setErrorBanner(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const assistantIdx = messages.length + 1; // user msg at length, assistant at +1
    setMessages((prev) => {
      const next = [...prev, { role: 'assistant' as const, content: '' }];
      return next;
    });
    setStreamingIdx(assistantIdx);

    let receivedAny = false;
    let aggregated = '';
    let serverError: string | null = null;
    let finalModel = sendModel;

    try {
      await streamChat(
        {
          userMessage,
          messages: priorHistory,
          model: sendModel,
          systemPrompt: systemPrompt || undefined,
          pageContext: pageCtxInfo?.text || undefined,
        },
        {
          signal: abortRef.current.signal,
          onStart: (data) => {
            finalModel = data.model || sendModel;
          },
          onDelta: (chunk) => {
            receivedAny = true;
            aggregated += chunk;
            setMessages((prev) => {
              const next = [...prev];
              if (next.length > 0) {
                next[next.length - 1] = { role: 'assistant', content: aggregated };
              }
              return next;
            });
          },
          onDone: (data) => {
            finalModel = data.model || finalModel;
          },
          onError: (msg) => {
            console.error('[AIChatBot] stream error:', msg);
            serverError = msg;
            setErrorBanner(msg);
            if (msg.toLowerCase().includes('not allowed')) {
              setSelectedModel('');
              void refreshModels(true);
            }
          },
        },
      );
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('AI Error:', error);
        serverError = serverError || error?.message || t('chatBotError');
      }
    } finally {
      abortRef.current = null;
      setStreamingIdx(null);
      // Stamp finished model on the last assistant message
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          if (!receivedAny) {
            next[next.length - 1] = {
              role: 'assistant',
              content: serverError || t('chatBotError'),
              model: finalModel,
            };
          } else {
            next[next.length - 1] = { ...last, model: finalModel };
          }
        }
        return next;
      });
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingIdx(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 md:bottom-6 md:right-6 md:z-200">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30, x: 20 }}
            className="mb-3 h-[70vh] max-h-[70vh] w-[calc(100vw-2rem)] bg-bg-surface border border-border-base rounded-2xl shadow-2xl overflow-hidden flex flex-col md:mb-4 md:h-[65vh] md:max-h-[65vh] md:w-96 md:rounded-3xl"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-bg-base/50 border-b border-border-base flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4.5 w-4.5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-text-base truncate leading-tight">{t('chatBotTitle')}</h3>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-bg-base/80 rounded-xl transition-colors text-text-muted shrink-0"
                title={t('chatBotMinimize') || 'Minimize'}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Status / error banner */}
            {(!configured || statusError || errorBanner || (!activeModel && !isLoadingModels)) && (
              <div className="px-4 py-2 bg-rose-500/10 text-rose-500 text-xs font-semibold border-b border-rose-500/20 flex items-center gap-2 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {!configured
                    ? t('aiNotConfigured')
                    : statusError
                    ? statusError
                    : !activeModel && !isLoadingModels
                    ? t('aiNoModelSelected')
                    : isLoadingModels
                    ? t('loading')
                    : errorBanner}
                </span>
              </div>
            )}

            {/* Page context is sent automatically from cache when available. */}
            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
              {messages.map((message, index) => {
                const isThisStreaming = isStreaming && index === messages.length - 1 && message.role === 'assistant';
                return (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex min-w-0 max-w-full gap-2 md:max-w-sm ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`h-7 w-7 rounded-lg shrink-0 flex items-center justify-center shadow-sm mt-0.5 ${
                        message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className={`max-w-full overflow-hidden break-words p-3 px-3.5 rounded-2xl text-sm leading-relaxed ${
                          message.role === 'user'
                            ? 'bg-blue-500 text-white rounded-tr-none'
                            : 'bg-bg-base text-text-base rounded-tl-none border border-border-base'
                        }`}>
                          {message.role === 'user' ? (
                            <span className="whitespace-pre-wrap break-words">{message.content}</span>
                          ) : message.content === '' ? (
                            <div className="flex items-center gap-1 py-0.5">
                              <div className="h-1.5 w-1.5 bg-text-muted/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                              <div className="h-1.5 w-1.5 bg-text-muted/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                              <div className="h-1.5 w-1.5 bg-text-muted/60 rounded-full animate-bounce" />
                            </div>
                          ) : (
                            <div className="prose prose-sm max-w-full overflow-x-auto break-words text-text-base prose-headings:my-2 prose-headings:text-text-base prose-p:my-1 prose-p:text-text-base prose-ul:my-1 prose-li:my-0 prose-li:text-text-base prose-strong:text-text-base prose-em:text-text-base prose-code:break-words prose-code:text-text-base prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-table:block prose-table:max-w-full prose-table:overflow-x-auto">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                              {isThisStreaming && <StreamingCursor />}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-bg-base/30 border-t border-border-base shrink-0">
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      !configured
                        ? t('aiNotConfiguredShort')
                        : !activeModel
                        ? isLoadingModels
                          ? t('loading')
                          : t('aiNoModelSelected')
                        : t('chatBotPlaceholder')
                    }
                    disabled={!configured || !activeModel || isStreaming}
                    className="w-full bg-bg-surface border border-border-base rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all text-text-base placeholder:text-text-muted/60 disabled:opacity-60 resize-none overflow-hidden leading-relaxed"
                    style={{ minHeight: '42px' }}
                  />
                </div>
                <button
                  onClick={isStreaming ? handleStop : handleSend}
                  disabled={(!input.trim() && !isStreaming) || !configured || !activeModel}
                  className="shrink-0 p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-all shadow-sm"
                  title={isStreaming ? (t('stop') || 'Dừng') : (t('send') || 'Gửi')}
                >
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center justify-center h-12 w-12 bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20 relative group md:h-14 md:w-14 md:rounded-2xl md:shadow-xl md:shadow-blue-500/30"
          >
            <div className="absolute inset-0 bg-blue-500 rounded-xl blur-lg opacity-10 group-hover:opacity-30 transition-opacity md:rounded-2xl md:opacity-20 md:group-hover:opacity-40" />
            <Sparkles className="h-5 w-5 relative z-10 md:h-6 md:w-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
