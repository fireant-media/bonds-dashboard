import type { ReactNode } from 'react';

interface AIInsightTextProps {
  content: string;
  containerClassName?: string;
  paragraphClassName?: string;
}

const EMPHASIS_CLASS_NAME = 'font-bold text-blue-700 dark:text-blue-300';
const NUMBER_WITH_UNIT_PATTERN =
  /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?:\s*(?:%|tỷ đồng|triệu đồng|nghìn tỷ đồng|đồng|trái phiếu|cổ phiếu|cp|năm|tháng|ngày|lần))?\b|\b\d+(?:[.,]\d+)?(?:\s*(?:%|tỷ đồng|triệu đồng|nghìn tỷ đồng|đồng|trái phiếu|cổ phiếu|cp|năm|tháng|ngày|lần))?\b/g;
const CODE_PATTERN = /\b(?:[A-Z]{3,6}|[A-Z]{2,6}\d[A-Z0-9]{0,10})\b/g;
const TOKEN_PATTERN = new RegExp(`(${NUMBER_WITH_UNIT_PATTERN.source}|${CODE_PATTERN.source})`, 'g');
const NUMBER_WITH_UNIT_TEST_PATTERN = new RegExp(`^${NUMBER_WITH_UNIT_PATTERN.source}$`);
const CODE_TEST_PATTERN = new RegExp(`^${CODE_PATTERN.source}$`);

function renderHighlightedText(text: string, keyPrefix: string, forceBold = false): ReactNode[] {
  return text.split(TOKEN_PATTERN).map((part, index) => {
    if (!part) return null;

    const shouldHighlight = forceBold
      || NUMBER_WITH_UNIT_TEST_PATTERN.test(part)
      || CODE_TEST_PATTERN.test(part);

    return (
      <span
        key={`${keyPrefix}-${index}-${part}`}
        className={shouldHighlight ? EMPHASIS_CLASS_NAME : undefined}
      >
        {part}
      </span>
    );
  });
}

export default function AIInsightText({
  content,
  containerClassName = 'space-y-1.5',
  paragraphClassName = 'whitespace-pre-line break-words text-sm leading-6 text-text-base',
}: AIInsightTextProps) {
  const paragraphs = content
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

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
