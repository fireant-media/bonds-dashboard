import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { X, MessageSquareText, Loader2 } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { sendChat } from '../api/ai';
import { useAIStore } from '../store/aiStore';

interface ChartPopupProps {
  title: string;
  option: any;
  dataSummary: string;
  onClose: () => void;
}

export default function ChartPopup({ title, option, dataSummary, onClose }: ChartPopupProps) {
  const { effectiveTheme } = useTheme();
  const { t, language } = useLanguage();
  const isDark = effectiveTheme === 'dark';
  const { selectedModel, defaultModel } = useAIStore();
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        // Nếu chiều cao lớn hơn chiều rộng đáng kể hoặc là biểu đồ cột dọc
        setIsPortrait(height > width * 0.8); 
      }
    });

    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const generateInsight = async () => {
      setLoading(true);
      try {
        const prompt = `
          ${t('aiChartPromptRole')} 
          ${t('aiChartPromptQuestion').replace('{title}', title)}
          
          ${dataSummary}
          
          ${t('aiChartPromptRequirements').replace('{language}', language === 'vi' ? 'Tiếng Việt' : 'English')}
        `;

        const response = await sendChat({
          userMessage: prompt,
          messages: [],
          model: selectedModel || defaultModel || undefined,
        });

        setInsight(response.text || '');
      } catch (error) {
        console.error('Error generating chart insight:', error);
        setInsight(t('unableToGenerateInsight'));
      } finally {
        setLoading(false);
      }
    };

    generateInsight();
  }, [title, dataSummary, language, t, selectedModel, defaultModel]);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-bg-surface rounded-[32px] w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 transition-colors">
        {/* Header */}
        <div className="px-4 md:px-8 py-4 md:py-6 border-b border-border-base flex items-center justify-between gap-3 bg-bg-surface sticky top-0 z-10 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-[#3634B3] transition-colors">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <h2 className="text-base md:text-xl font-bold text-text-base transition-colors truncate">{title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-bg-base rounded-full transition-colors text-text-muted hover:text-text-base"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 transition-colors">
          <div className={`grid ${isPortrait ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1'} gap-4 md:gap-8 h-full`}>
            {/* Chart Section */}
            <div 
              ref={chartContainerRef}
              className="bg-bg-base/50 rounded-[24px] p-3 md:p-6 flex items-center justify-center min-h-[320px] md:min-h-[400px] transition-colors"
            >
              <div className="w-full h-full min-h-[320px] md:min-h-[400px]">
                <ReactECharts 
                  option={{
                    ...option,
                    grid: { ...option.grid, top: '15%', bottom: '15%' },
                    legend: { ...option.legend, bottom: 0 }
                  }} 
                  style={{ height: '100%', minHeight: '400px' }} 
                />
              </div>
            </div>

            {/* Insight Section */}
            <div className="flex flex-col gap-6">
              <div className="bg-bg-base/30 rounded-[24px] p-4 md:p-8 h-full border border-border-base transition-colors">
                <div className="flex items-center gap-2 mb-4 text-[#3634B3] transition-colors">
                  <MessageSquareText className="h-5 w-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm transition-colors">{t('chartInsight')}</h3>
                </div>
                
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-text-muted transition-colors">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm font-medium transition-colors">{t('aiAnalyzingData')}</p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p className="text-text-base leading-relaxed text-base whitespace-pre-wrap transition-colors">
                      {insight}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}