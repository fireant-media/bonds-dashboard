import { useState, FormEvent, useEffect } from 'react';
import { NewsItem } from '../types';
import { ChevronLeft, Share2, MessageCircle, Bookmark, Send, Volume2, VolumeX, ExternalLink, Loader2 } from 'lucide-react';
import { formatDate } from '../utils/format';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { fetchNewsDetail } from '../services/newsService';

interface NewsDetailViewProps {
  news: NewsItem;
  onBack: () => void;
}

export default function NewsDetailView({ news: initialNews, onBack }: NewsDetailViewProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const [news, setNews] = useState<NewsItem>(initialNews);
  const [isLoading, setIsLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch full content on mount
  useEffect(() => {
    const loadFullContent = async () => {
      setIsLoading(true);
      setImageError(false);
      const fullNews = await fetchNewsDetail(initialNews.id);
      if (fullNews) {
        setNews(fullNews);
      }
      setIsLoading(false);
    };

    loadFullContent();
  }, [initialNews.id]);

  // Stop speech when component unmounts
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
  if (!window.speechSynthesis) return;

  // 👉 trigger load voice sớm
  const load = () => {
    const voices = window.speechSynthesis.getVoices();
    console.log("Voices loaded:", voices);
  };

  load();

  // 👉 Chrome cần event này
  window.speechSynthesis.onvoiceschanged = load;

  return () => {
    window.speechSynthesis.onvoiceschanged = null;
  };
}, []);

    // 👉 Load voices chuẩn (fix bug Chrome)
    const loadVoices = () => {
    return new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices.length) return resolve(voices);

      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        resolve(voices);
      };
    });
  };

  const extractMainContent = (text: string) => {
  if (!text) return '';

  let cleaned = text.trim();

  // 👉 bỏ dòng đầu nếu là nguồn / ngày / tác giả
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  // rule: bỏ tối đa 3 dòng đầu nếu ngắn (thường là metadata)
  const filtered = lines.filter((line, index) => {
    if (index > 2) return true;

    // nếu dòng quá ngắn hoặc chứa pattern metadata → bỏ
    if (
      line.length < 40 ||
      /ngày|date|tác giả|author|vietnam\+|vnexpress|cafef/i.test(line)
    ) {
      return false;
    }

    return true;
  });

  return filtered.join(' ');
};

  // 👉 Làm sạch text (UPGRADE VERSION)
const cleanVietnameseText = (text: string) => {
  if (!text) return '';

  let processed = text;

  // =========================
  // XỬ LÝ SỐ
  // =========================

  // 3.000 → 3000
  processed = processed.replace(/(\d{1,3}(?:\.\d{3})+)/g, (match: string) => {
    return match.replace(/\./g, '');
  });

  // 1,5 → 1.5
  processed = processed.replace(/(\d+),(\d+)/g, '$1.$2');

  const numberToVietnamese = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1000000) return `${Math.floor(num / 1000)} nghìn`;
    if (num < 1000000000) return `${Math.floor(num / 1000000)} triệu`;
    return `${Math.floor(num / 1000000000)} tỷ`;
  };

  processed = processed.replace(/\b\d+(\.\d+)?\b/g, (match: string) => {
    const num = Number(match);
    if (isNaN(num)) return match;

    if (match.includes('.')) {
      const [int, dec] = match.split('.');
      return `${numberToVietnamese(Number(int))} phẩy ${dec}`;
    }

    return numberToVietnamese(num);
  });

  return processed;
};

  // 👉 TTS chính
  const toggleSpeech = async () => {
  const synth = window.speechSynthesis;

  if (!synth) {
    alert(t('ttsNotSupported'));
    return;
  }

  // 👉 stop nếu đang đọc
  if (isSpeaking) {
    synth.cancel();
    setIsSpeaking(false);
    return;
  }

  // =========================
  // TEXT
  // =========================
  const titleText = cleanVietnameseText(news.title);

  const rawContent = extractMainContent(news.content || '');
  const contentText = cleanVietnameseText(rawContent);

  // 👉 GỘP 1 utterance (tránh bug + đọc tự nhiên hơn)
  const fullText = `${titleText}. ... ${contentText}`;

  // =========================
  // LOAD VOICE CHUẨN
  // =========================
  const voices = await loadVoices();

  // 👉 debug (có thể log ra xem)
  console.log("Available voices:", voices);

  // 👉 chọn giọng tiếng Việt thật
  let voice =
    voices.find(v => v.lang === 'vi-VN' && v.name.includes('Google')) ||
    voices.find(v => v.lang === 'vi-VN') ||
    voices.find(v => v.lang.startsWith('vi'));

  // ❗ nếu không có tiếng Việt → KHÔNG đọc
  if (!voice) {
    alert("Không tìm thấy giọng tiếng Việt trên trình duyệt này");
    return;
  }

  // =========================
  // CREATE UTTERANCE
  // =========================
  const utter = new SpeechSynthesisUtterance(fullText);

  utter.lang = 'vi-VN';
  utter.voice = voice;

  // 👉 tuning để tránh đọc kiểu robot
  utter.rate = 0.95;
  utter.pitch = 1;
  utter.volume = 1;

  // =========================
  // EVENTS
  // =========================
  utter.onstart = () => setIsSpeaking(true);
  utter.onend = () => setIsSpeaking(false);
  utter.onerror = (e) => {
    console.error("TTS error:", e);
    setIsSpeaking(false);
  };

  // =========================
  // RESET ENGINE (QUAN TRỌNG)
  // =========================
  synth.cancel();

  setTimeout(() => {
    synth.speak(utter);
  }, 150);
};

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: news.title,
        text: t('shareText'),
        url: window.location.href,
      }).catch(console.error);
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert(t('linkCopied'));
    }
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
    // Placeholder for actual save functionality
    console.log(isSaved ? 'Unsaved article' : 'Saved article');
  };

  const handleComment = (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    
    // Placeholder for actual comment submission
    console.log('Submitted comment:', comment);
    alert(t('commentThanks'));
    setComment('');
  };

  // Process content to extract first image as cover
  let displayContent = news.content || news.summary || "";
  let currentCoverImage = news.image;

  if (currentCoverImage) {
    const escaped = currentCoverImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    displayContent = displayContent.replace(
      new RegExp(`<img[^>]+src=["']${escaped}["'][^>]*>`, 'i'),
      ''
    );
  }
  
  // Filter out images that are already displayed as cover or present in content
  const contentImages = Array.from(displayContent.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi)).map(m => m[1]);
  const extraImages = (news.images || []).filter(img => 
    img !== currentCoverImage && 
    !contentImages.some(contentImg => contentImg.includes(img) || img.includes(contentImg))
  );

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-left-4 duration-700 transition-colors">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-[#3634B3] hover:gap-3 transition-all mb-8 bg-bg-surface px-4 py-2 rounded-xl border border-border-base shadow-sm hover:shadow-md"
      >
        <ChevronLeft className="h-4 w-4" /> {t('back')}
      </button>

      <article className="bg-bg-surface rounded-3xl border border-border-base shadow-sm overflow-hidden p-8 md:p-12 transition-colors">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-text-base leading-tight mb-6 transition-colors">
            {news.title}
          </h1>

          <div className="flex items-center justify-between pb-6">
            {/* LEFT */}
            <div className="flex flex-col gap-1">
              {/* Nguồn + Ngày */}
              <p className="text-sm text-text-base">
                <span className="font-semibold">{news.source || 'Không rõ nguồn'}</span>
                <span className="mx-2 text-text-muted">•</span>
                <span className="text-text-muted text-xs">{formatDate(news.date)}</span>
              </p>

              {/* Tác giả */}
              <p className="text-xs text-text-muted">{news.author || 'Đang cập nhật'}</p>
            </div>

            {/* RIGHT - Speech */}
            <button
              onClick={toggleSpeech}
              disabled={isLoading}
              aria-pressed={isSpeaking}
              aria-label={
                isLoading
                  ? 'Đang chuẩn bị'
                  : isSpeaking
                  ? t("stopReading")
                  : t("listenArticle")
              }
              title={
                isLoading
                  ? 'Đang chuẩn bị'
                  : isSpeaking
                  ? t("stopReading")
                  : t("listenArticle")
              }
              className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${
                isSpeaking
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
                  : 'bg-[#3634B3]/5 text-[#3634B3] hover:bg-[#3634B3] hover:text-white'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSpeaking ? (
                <VolumeX className="h-4 w-4 animate-pulse" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        {!imageError && (news.image || currentCoverImage) && (
          <div className="relative aspect-video rounded-2xl overflow-hidden mb-8 bg-bg-base border border-border-base transition-colors">
            <img 
              src={currentCoverImage || news.image} 
              alt={news.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
            />
          </div>
        )}

        <div className="prose prose-blue dark:prose-invert max-w-none mb-12">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-8 w-8 text-[#3634B3] animate-spin" />
              <p className="text-sm font-medium text-text-muted">{t('loading')}...</p>
            </div>
          ) : (
            <div 
              className="text-base text-text-base leading-relaxed font-normal transition-colors fireant-content"
              dangerouslySetInnerHTML={{ __html: displayContent || t('updateContent') }}
            />
          )}
          
          {extraImages.length > 0 && (
            <div className="mt-8 space-y-6">
              {extraImages.map((img, idx) => (
                <div key={idx} className="rounded-2xl overflow-hidden border border-border-base transition-colors bg-bg-base">
                  <img 
                    src={img} 
                    alt={`${news.title} - extra ${idx + 1}`} 
                    className="w-full h-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-8 border-t border-border-base transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-12">
            <div className="flex items-center gap-4">
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#3634B3] text-white rounded-xl font-bold text-sm hover:translate-y-[-2px] hover:shadow-lg transition-all active:translate-y-0"
              >
                <Share2 className="h-4 w-4" /> {t('share')}
              </button>
              <button 
                onClick={handleSave}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                  isSaved 
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-400/30' 
                    : 'bg-bg-surface text-text-muted border-border-base hover:border-[#3634B3] hover:text-[#3634B3]'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} /> 
                {isSaved ? t('saved') : t('saveNews')}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-text-base flex items-center gap-2 transition-colors">
              <MessageCircle className="h-6 w-6 text-[#3634B3]" />
              {t('comments')}
            </h3>
            
            <form onSubmit={handleComment} className="relative group">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('commentPlaceholder')}
                className="w-full p-5 pt-6 pb-16 bg-bg-base/50 dark:bg-bg-base/20 rounded-3xl border border-border-base focus:bg-bg-surface focus:border-[#3634B3]/30 focus:ring-4 focus:ring-[#3634B3]/5 transition-all resize-none min-h-[140px] text-text-base placeholder:text-text-muted outline-none"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-3">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wide transition-colors">
                  {comment.length} {t('characters')}
                </span>
                <button 
                  type="submit"
                  disabled={!comment.trim()}
                  className="p-3 bg-[#3634B3] text-white rounded-xl disabled:opacity-30 disabled:translate-y-0 hover:translate-y-[-2px] hover:shadow-lg transition-all"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </article>
      
      <div className="mt-12 text-center transition-colors">
        <p className="text-xs text-text-muted font-medium transition-colors">{t('platformFooter')}</p>
      </div>
    </div>
  );
}