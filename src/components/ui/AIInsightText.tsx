import type { ReactNode } from 'react';
import { parseStructuredInsight } from '../../utils/aiInsightStructured';

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

// Vietnamese corporate-form abbreviations (Thương mại cổ phần, Công ty cổ phần, Trách nhiệm hữu
// hạn, ...) are NOT tickers or bond codes, so they must never be emphasised on their own — e.g. the
// "TMCP" inside "Ngân hàng TMCP Á Châu". The full issuer name is emphasised as one unit via boldTerms.
const NON_TICKER_ABBREVIATIONS = new Set([
  'TMCP', 'CTCP', 'CTCPTM', 'TNHH', 'MTV', 'NHTM', 'NHNN', 'DNNN', 'TPDN', 'HDQT', 'HĐQT', 'UBCK',
]);

// Build case-insensitive split + test regexes for a set of `|`-joined alternatives.
function buildMatchers(sources: string[]) {
  const source = sources.filter(Boolean).join('|');
  if (!source) return null;
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

// Static matchers for the built-in sentiment keywords (identical across every render).
const KEYWORD_MATCHERS = buildMatchers([KEYWORD_SOURCE])!;

// Matchers for caller-supplied literal terms (issuer name, bond code). Matched as WHOLE units before
// number/code tokenising so the full "Ngân hàng TMCP ..." name is bolded together, rather than only
// its ticker-shaped fragments — which previously left just "TMCP" emphasised inside the name.
function buildTermMatchers(boldTerms?: string[]) {
  const termSources = (boldTerms || [])
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 2)
    .map(escapeRegExp);
  return termSources.length ? buildMatchers(termSources) : null;
}

export default function AIInsightText({
  content,
  containerClassName = 'space-y-2.5',
  paragraphClassName = 'whitespace-pre-line break-words text-sm leading-6 text-text-base',
  boldTerms,
}: AIInsightTextProps) {
  const sections = parseStructuredInsight(content);

  if (sections.length === 0) {
    return null;
  }

  const termMatchers = buildTermMatchers(boldTerms);

  const renderKeywords = (text: string, keyPrefix: string): ReactNode[] =>
    text.split(KEYWORD_MATCHERS.split).map((part, index) => {
      if (!part) return null;
      const shouldHighlight = KEYWORD_MATCHERS.test.test(part);
      return (
        <span key={`${keyPrefix}-kw-${index}`} className={shouldHighlight ? EMPHASIS_CLASS_NAME : undefined}>
          {part}
        </span>
      );
    });

  const renderTokens = (text: string, keyPrefix: string): ReactNode[] =>
    text.split(TOKEN_PATTERN).flatMap<ReactNode>((part, index) => {
      if (!part) return [];

      // Emphasise numbers-with-units and ticker/bond codes — but never a corporate-form abbreviation
      // (TMCP, CTCP, ...), which is only ever part of a longer issuer name, not a code of its own.
      const isCode = CODE_TEST_PATTERN.test(part) && !NON_TICKER_ABBREVIATIONS.has(part.toUpperCase());
      if (NUMBER_WITH_UNIT_TEST_PATTERN.test(part) || isCode) {
        return [
          <span key={`${keyPrefix}-${index}-${part}`} className={EMPHASIS_CLASS_NAME}>
            {part}
          </span>,
        ];
      }

      return renderKeywords(part, `${keyPrefix}-${index}`);
    });

  // Emphasise whole caller-supplied terms (issuer name, bond code) as ONE unit before tokenising, so
  // the entire "Ngân hàng TMCP ..." name is bolded together. Non-term text falls through to the
  // number/code/keyword emphasis rules.
  const renderTerms = (text: string, keyPrefix: string): ReactNode[] => {
    if (!termMatchers) return renderTokens(text, keyPrefix);
    return text.split(termMatchers.split).flatMap<ReactNode>((part, index) => {
      if (!part) return [];
      if (termMatchers.test.test(part)) {
        return [
          <span key={`${keyPrefix}-term-${index}`} className={EMPHASIS_CLASS_NAME}>
            {part}
          </span>,
        ];
      }
      return renderTokens(part, `${keyPrefix}-t-${index}`);
    });
  };

  // Render inline text, honouring **bold** spans and the term/number/keyword emphasis rules.
  const renderInline = (text: string, keyPrefix: string): ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*)/g).flatMap<ReactNode>((segment, segmentIndex) => {
      if (!segment) return [];

      if (segment.startsWith('**') && segment.endsWith('**')) {
        return [
          <span key={`${keyPrefix}-bold-${segmentIndex}`} className={EMPHASIS_CLASS_NAME}>
            {renderTerms(segment.slice(2, -2), `${keyPrefix}-bold-${segmentIndex}`)}
          </span>,
        ];
      }

      return renderTerms(segment, `${keyPrefix}-plain-${segmentIndex}`);
    });

  return (
    <div className={containerClassName}>
      {sections.map((section, sectionIndex) => (
        <section key={`ai-section-${sectionIndex}`} className="space-y-1">
          {section.label ? (
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-blue-700/80 dark:text-blue-300/80">
              {section.label}
            </h4>
          ) : null}
          {section.blocks.map((block, blockIndex) =>
            block.type === 'bullet' ? (
              <div key={`ai-bullet-${sectionIndex}-${blockIndex}`} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/70 dark:bg-blue-400/70" />
                <p className={paragraphClassName}>{renderInline(block.text, `b-${sectionIndex}-${blockIndex}`)}</p>
              </div>
            ) : (
              <p key={`ai-para-${sectionIndex}-${blockIndex}`} className={paragraphClassName}>
                {renderInline(block.text, `p-${sectionIndex}-${blockIndex}`)}
              </p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}
