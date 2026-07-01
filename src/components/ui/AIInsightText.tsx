import type { ReactNode } from 'react';

interface AIInsightTextProps {
  content: string;
  containerClassName?: string;
  paragraphClassName?: string;
  // Extra literal terms to bold (e.g. the issuer name) on top of the built-in patterns.
  boldTerms?: string[];
}

const EMPHASIS_CLASS_NAME = 'font-bold text-blue-700 dark:text-blue-300';
const NUMBER_WITH_UNIT_PATTERN =
  /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?:\s*(?:%|tỷ đồng|triệu đồng|nghìn tỷ đồng|đồng|trái phiếu|cổ phiếu|cp|năm|tháng|ngày|lần))?\b|\b\d+(?:[.,]\d+)?(?:\s*(?:%|tỷ đồng|triệu đồng|nghìn tỷ đồng|đồng|trái phiếu|cổ phiếu|cp|năm|tháng|ngày|lần))?\b/g;
const CODE_PATTERN = /\b(?:[A-Z]{3,6}|[A-Z]{2,6}\d[A-Z0-9]{0,10})\b/g;
const TOKEN_PATTERN = new RegExp(`(${NUMBER_WITH_UNIT_PATTERN.source}|${CODE_PATTERN.source})`, 'g');
const NUMBER_WITH_UNIT_TEST_PATTERN = new RegExp(`^${NUMBER_WITH_UNIT_PATTERN.source}$`);
const CODE_TEST_PATTERN = new RegExp(`^${CODE_PATTERN.source}$`);

// Qualitative / sentiment keywords to emphasise (Vietnamese + English).
const KEYWORD_SOURCE = [
  'ổn định', 'tăng trưởng', 'vượt trội', 'đáng chú ý', 'thận trọng', 'cải thiện',
  'suy giảm', 'lành mạnh', 'bền vững', 'rủi ro', 'an toàn', 'tích cực', 'tiêu cực',
  'cao', 'thấp', 'tăng', 'giảm', 'mạnh', 'lớn', 'nhỏ',
  'stable', 'rising', 'falling', 'positive', 'negative', 'healthy', 'strong', 'weak',
  'high', 'low', 'risk', 'sustainable',
  '(?<!thiết\\s)\\byếu\\b(?!\\s+tố\\b)',
].join('|');

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build case-insensitive split + test regexes for keywords plus any dynamic terms (issuer name).
function buildKeywordMatchers(boldTerms?: string[]) {
  const termSources = (boldTerms || [])
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 2)
    .map(escapeRegExp);
  const source = [...termSources, KEYWORD_SOURCE].filter(Boolean).join('|');

  try {
    return {
      split: new RegExp(`(?<![\\p{L}\\p{N}])(${source})(?![\\p{L}\\p{N}])`, 'giu'),
      test: new RegExp(`^(?:${source})$`, 'iu'),
    };
  } catch {
    return {
      split: new RegExp(`(${source})`, 'gi'),
      test: new RegExp(`^(?:${source})$`, 'i'),
    };
  }
}

export default function AIInsightText({
  content,
  containerClassName = 'space-y-1.5',
  paragraphClassName = 'whitespace-pre-line break-words text-sm leading-6 text-text-base',
  boldTerms,
}: AIInsightTextProps) {
  const paragraphs = content
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  const keywordMatchers = buildKeywordMatchers(boldTerms);

  const renderKeywords = (text: string, keyPrefix: string): ReactNode[] =>
    text.split(keywordMatchers.split).map((part, index) => {
      if (!part) return null;
      const shouldHighlight = keywordMatchers.test.test(part);
      return (
        <span key={`${keyPrefix}-kw-${index}`} className={shouldHighlight ? EMPHASIS_CLASS_NAME : undefined}>
          {part}
        </span>
      );
    });

  const renderHighlightedText = (text: string, keyPrefix: string, forceBold = false): ReactNode[] => {
    if (forceBold) {
      return [
        <span key={`${keyPrefix}-bold`} className={EMPHASIS_CLASS_NAME}>
          {text}
        </span>,
      ];
    }

    return text.split(TOKEN_PATTERN).flatMap<ReactNode>((part, index) => {
      if (!part) return [];

      if (NUMBER_WITH_UNIT_TEST_PATTERN.test(part) || CODE_TEST_PATTERN.test(part)) {
        return [
          <span key={`${keyPrefix}-${index}-${part}`} className={EMPHASIS_CLASS_NAME}>
            {part}
          </span>,
        ];
      }

      return renderKeywords(part, `${keyPrefix}-${index}`);
    });
  };

  return (
    <div className={containerClassName}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph.slice(0, 12)}-${index}`} className={paragraphClassName}>
          {paragraph.split(/(\*\*[^*]+\*\*)/g).map((segment, segmentIndex) => {
            if (!segment) return null;

            if (segment.startsWith('**') && segment.endsWith('**')) {
              return renderHighlightedText(segment.slice(2, -2), `bold-${index}-${segmentIndex}`, true);
            }

            return renderHighlightedText(segment, `plain-${index}-${segmentIndex}`);
          })}
        </p>
      ))}
    </div>
  );
}
