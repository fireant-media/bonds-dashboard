// Parsing / trimming helpers for the adaptive AI commentary cards.
//
// The model is asked to return a *rich, structured* insight (a lead summary plus a few
// labelled sections with short bullets). The card then reveals as many blocks as fit its
// measured height — full on large cards, key points on medium ones, just the summary on
// small ones — so the text always fills the card without overflowing or leaving big gaps.

export interface InsightBlock {
  type: 'paragraph' | 'bullet';
  text: string;
}

export interface InsightSection {
  // `null` for the headerless lead/summary that opens the insight.
  label: string | null;
  blocks: InsightBlock[];
}

// Directive appended to an analyst brief so the model returns FLOWING PROSE (like the industry
// "Nhận định ngành" commentary) — no bullets, lists, or headings. It asks for enough sentences to
// fill a large card, ordered most-important-first so the fitter can drop trailing sentences to fit
// a smaller card without losing the key conclusion.
export function buildParagraphDirective(language: 'en' | 'vi', targetSentences?: number) {
  const target = targetSentences && targetSentences >= 3 ? Math.round(targetSentences) : 0;

  if (language === 'en') {
    const lengthRule = target
      ? `Write about ${target} concise sentences — enough to fill the card without leaving empty space; it is fine to slightly exceed since the end may be trimmed to fit.`
      : 'Aim for 5 to 8 concise sentences.';
    return [
      'Write the insight as flowing analytical prose, exactly like a professional market commentary paragraph.',
      'Do NOT use bullet points, dashes, numbered lists, headings, section labels, or line-by-line items. You may use at most two short paragraphs.',
      'Lead with the single most important conclusion and its key figures, then add supporting points in decreasing order of importance.',
      `${lengthRule} Every sentence must pair a figure with its interpretation, never a bare number.`,
    ].join(' ');
  }

  const lengthRule = target
    ? `Viết khoảng ${target} câu súc tích — đủ để lấp đầy khung card, không để lại khoảng trống; có thể dài hơn một chút vì phần cuối sẽ được cắt cho vừa.`
    : 'Viết khoảng 5 đến 8 câu súc tích.';
  return [
    'Viết nhận định thành đoạn văn mạch lạc, đúng phong cách một đoạn bình luận thị trường chuyên nghiệp.',
    'KHÔNG dùng gạch đầu dòng, dấu gạch ngang, đánh số, tiêu đề, nhãn mục hay liệt kê theo dòng. Có thể dùng tối đa hai đoạn ngắn.',
    'Nêu kết luận quan trọng nhất cùng số liệu chính trước, rồi bổ sung các ý theo mức độ giảm dần.',
    `${lengthRule} Mỗi câu phải gắn số liệu với nhận định, tuyệt đối không nêu số trơ.`,
  ].join(' ');
}

// A line is a heading when it is a markdown heading (`## Label`) or a standalone bold label
// (`**Label**`), optionally followed by a colon. Returns the label text, or null otherwise.
function matchHeading(line: string): string | null {
  const md = line.match(/^#{1,6}\s+(.+?)\s*:?\s*$/);
  if (md) return md[1].trim();
  const bold = line.match(/^\*\*(.+?)\*\*\s*:?\s*$/);
  if (bold) return bold[1].trim();
  return null;
}

function matchBullet(line: string): string | null {
  const bullet = line.match(/^[-•*]\s+(.*)$/);
  return bullet ? bullet[1].trim() : null;
}

// Parse the raw insight text into ordered sections. Consecutive wrapped paragraph lines are
// merged (so blank-line separated paragraphs stay distinct) while bullets stay separate.
export function parseStructuredInsight(text: string): InsightSection[] {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const sections: InsightSection[] = [];
  let current: InsightSection | null = null;
  let sawBlank = true;

  const ensureSection = (label: string | null) => {
    current = { label, blocks: [] };
    sections.push(current);
  };

  for (const rawLine of clean.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      sawBlank = true;
      continue;
    }

    const heading = matchHeading(line);
    if (heading !== null) {
      ensureSection(heading);
      sawBlank = true;
      continue;
    }

    if (!current) ensureSection(null);

    const bullet = matchBullet(line);
    if (bullet !== null) {
      current!.blocks.push({ type: 'bullet', text: bullet });
      sawBlank = false;
      continue;
    }

    const last = current!.blocks[current!.blocks.length - 1];
    if (!sawBlank && last && last.type === 'paragraph') {
      last.text = `${last.text}\n${line}`;
    } else {
      current!.blocks.push({ type: 'paragraph', text: line });
    }
    sawBlank = false;
  }

  return sections.filter((section) => section.blocks.length > 0);
}

// Split a paragraph into sentences so trailing ones can be dropped to fit a card height.
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [trimmed];
}

// Expand paragraph blocks into one block per sentence so the fitter can trim at sentence
// granularity (bullets are already atomic and stay whole).
export function granularizeSections(sections: InsightSection[]): InsightSection[] {
  return sections.map((section) => ({
    label: section.label,
    blocks: section.blocks.flatMap((block) =>
      block.type === 'bullet'
        ? [block]
        : splitSentences(block.text).map((sentence) => ({ type: 'paragraph' as const, text: sentence })),
    ),
  }));
}

export function countBlocks(sections: InsightSection[]): number {
  return sections.reduce((total, section) => total + section.blocks.length, 0);
}

// Keep only the first `maxBlocks` blocks (top-down, across sections). A section's heading is
// dropped automatically when none of its blocks survive.
export function limitSections(sections: InsightSection[], maxBlocks: number): InsightSection[] {
  let budget = Math.max(1, maxBlocks);
  const out: InsightSection[] = [];

  for (const section of sections) {
    if (budget <= 0) break;
    const blocks = section.blocks.slice(0, budget);
    if (blocks.length === 0) continue;
    budget -= blocks.length;
    out.push({ label: section.label, blocks });
  }

  return out;
}

// Serialize sections back to the `## Label` / `- bullet` text format. Consecutive paragraph
// blocks in a section are recombined into a single flowing paragraph so sentence-level
// trimming does not leave one <p> per sentence.
export function serializeSections(sections: InsightSection[]): string {
  return sections
    .filter((section) => section.blocks.length > 0)
    .map((section) => {
      const parts: string[] = [];
      if (section.label) parts.push(`## ${section.label}`);

      let paragraphBuffer: string[] = [];
      const flushParagraph = () => {
        if (paragraphBuffer.length) {
          parts.push(paragraphBuffer.join(' '));
          paragraphBuffer = [];
        }
      };

      for (const block of section.blocks) {
        if (block.type === 'bullet') {
          flushParagraph();
          parts.push(`- ${block.text}`);
        } else {
          paragraphBuffer.push(block.text);
        }
      }
      flushParagraph();

      return parts.join('\n');
    })
    .join('\n\n');
}
