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

  const processTextForSpeech = (text: string) => {
    // 1. Loại bỏ các phần trong ngoặc đơn (ví dụ: (TPDN), (VBMA), ...)
    // Loại bỏ cả dấu ngoặc và nội dung bên trong
    let processedText = text.replace(/\([^)]*\)/g, ' ');

    const abbreviations: Record<string, string> = {
      'TPDN': 'Trái phiếu doanh nghiệp',
      'CK': 'Chứng khoán',
      'DN': 'Doanh nghiệp',
      'NH': 'Ngân hàng',
      'TMCP': 'Thương mại cổ phần',
      'BĐS': 'Bất động sản',
      'LS': 'Lãi suất',
      'VNĐ': 'Việt Nam đồng',
      'ĐVT': 'Đơn vị tính',
      'HĐQT': 'Hội đồng quản trị',
      'ĐHĐCĐ': 'Đại hội đồng cổ đông',
      'GĐ': 'Giám đốc',
      'TGĐ': 'Tổng giám đốc',
      'TCT': 'Tổng công ty',
      'MTV': 'Một thành viên',
      'CP': 'Cổ phần',
      'VN-Index': 'Việt Nam Index',
      'HNX': 'Sàn Hà Nội',
      'UPCoM': 'Sàn Up-com',
      'HNX-Index': 'Hắt nờ ích Index',
      'USD': 'Đô la Mỹ',
      'VND': 'Việt Nam đồng'
    };

    Object.entries(abbreviations).forEach(([abbr, full]) => {
      const regex = new RegExp(`\\b${abbr}\\b`, 'g');
      processedText = processedText.replace(regex, full);
    });

    // 2. Làm sạch khoảng trắng thừa
    processedText = processedText.replace(/\s+/g, ' ').trim();

    return processedText;
  };

  const toggleSpeech = () => {
    if (!window.speechSynthesis) {
      alert(t('ttsNotSupported'));
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      // Chuẩn bị nội dung đọc: Tiêu đề + Nội dung
      const titleText = processTextForSpeech(news.title);
      const contentText = processTextForSpeech(news.content || '');
      
      const fullText = `${titleText}. . . ${contentText}`;

      const utterance = new SpeechSynthesisUtterance(fullText);
      
      // Thiết lập ngôn ngữ
      utterance.lang = language === 'vi' ? 'vi-VN' : 'en-US';
      
      // Tìm giọng đọc phù hợp nhất trong hệ thống
      const voices = window.speechSynthesis.getVoices();
      
      // Một số trình duyệt có giọng đọc chất lượng cao (Google)
      const langCode = language === 'vi' ? 'vi-VN' : 'en-US';
      const preferredVoice = voices.find(v => v.lang.includes(langCode) && v.name.includes('Google')) || 
                           voices.find(v => v.lang.includes(langCode)) || 
                           voices.find(v => v.lang.startsWith(language));
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      // Điều chỉnh để giống giọng phát thanh viên:
      utterance.rate = 0.85; 
      utterance.pitch = 0.95; 

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = (event) => {
        console.error(t('newsSpeechError'), event);
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    }
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
              title={isSpeaking ? t("stopReading") : t("listenArticle")}
              className={`p-2.5 rounded-xl transition-all duration-300 ${
                isSpeaking 
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400' 
                  : 'bg-[#3634B3]/5 text-[#3634B3] hover:bg-[#3634B3] hover:text-white'
              }`}
            >
              {isSpeaking ? (
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
