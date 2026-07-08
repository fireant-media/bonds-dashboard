import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  countBlocks,
  granularizeSections,
  type InsightSection,
  limitSections,
  parseStructuredInsight,
  serializeSections,
} from '../../utils/aiInsightStructured';
import AIInsightText from './AIInsightText';

interface AdaptiveInsightContentProps {
  content: string;
  boldTerms?: string[];
  // Classes for the measured wrapper — a FIXED height plus `overflow-hidden` (the box the text is fit
  // into). The card decides this height; the insight is trimmed to fit it.
  className?: string;
}

// The very last visible sentence is only ever word-trimmed as a floor safeguard (see below); we
// never trim below this many words so the fragment that remains still reads as a phrase, not noise.
const MIN_TAIL_WORDS = 5;

// Return the plain text of the last block across all sections (the sentence most at risk of being
// clipped), or '' when there is none.
function lastBlockText(sections: InsightSection[]): string {
  for (let s = sections.length - 1; s >= 0; s -= 1) {
    const blocks = sections[s].blocks;
    if (blocks.length) return blocks[blocks.length - 1].text;
  }
  return '';
}

// Clamp the final block to its first `wordLimit` words and append an ellipsis. Used only as a last
// resort when a single sentence is taller than the whole box, so it degrades to a clean word-boundary
// truncation instead of a raw mid-word clip by `overflow-hidden`.
function clampTailWords(sections: InsightSection[], wordLimit: number): InsightSection[] {
  const out = sections.map((section) => ({ label: section.label, blocks: section.blocks.slice() }));
  for (let s = out.length - 1; s >= 0; s -= 1) {
    const blocks = out[s].blocks;
    if (!blocks.length) continue;
    const last = blocks[blocks.length - 1];
    const words = last.text.split(/\s+/).filter(Boolean);
    if (words.length > wordLimit) {
      blocks[blocks.length - 1] = { ...last, text: `${words.slice(0, wordLimit).join(' ')}…` };
    }
    break;
  }
  return out;
}

// Renders an AI insight that adapts the amount of content shown to the card's measured height:
// it starts from the full structured insight and drops trailing WHOLE sentences (never cutting
// mid-sentence) until the text fits — full on large cards, key points on medium, just the lead
// summary on small — always keeping at least the summary so the card reads as complete.
export default function AdaptiveInsightContent({ content, boldTerms, className }: AdaptiveInsightContentProps) {
  // `boxRef` is the fixed-height clipping box; `contentRef` wraps the text and takes its NATURAL
  // (unclipped) height. We compare the two directly rather than relying on `scrollHeight`, so the
  // overflow test is correct regardless of how `overflow`/`height` resolve on the box.
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fitSections = useMemo(() => granularizeSections(parseStructuredInsight(content)), [content]);
  const totalBlocks = useMemo(() => countBlocks(fitSections), [fitSections]);
  const [visibleBlocks, setVisibleBlocks] = useState(totalBlocks);
  // `null` means "no word clamp"; a number is the last-resort word cap for the final sentence.
  const [tailWordLimit, setTailWordLimit] = useState<number | null>(null);
  // Bumped to restart the fit from the full text (content changed, card resized, fonts loaded).
  const [fitNonce, setFitNonce] = useState(0);

  const limited = useMemo(
    () => limitSections(fitSections, visibleBlocks || totalBlocks),
    [fitSections, visibleBlocks, totalBlocks],
  );
  const tailWords = useMemo(() => lastBlockText(limited).split(/\s+/).filter(Boolean).length, [limited]);

  // Restart from the full insight whenever the inputs that decide the fit change.
  useEffect(() => {
    setVisibleBlocks(totalBlocks);
    setTailWordLimit(null);
  }, [totalBlocks, fitNonce]);

  // Shrink until the text fits the fixed-height box, never cutting mid-sentence. useLayoutEffect
  // measures AFTER layout but BEFORE paint and runs on every commit (no deps), so the reduction
  // converges across synchronous re-renders: the browser never paints an overflowing frame, and any
  // restart back to the full text is immediately re-shrunk before it becomes visible. Primary lever:
  // drop whole trailing sentences. Floor safeguard: if a single sentence is itself taller than the
  // box, trim its trailing words to a word-boundary ellipsis rather than let `overflow-hidden` clip
  // it mid-word. Self-terminating — once it fits (or hits the word floor) no state changes.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = contentRef.current;
    if (!box || !inner) return;
    // Natural content height vs the fixed box height. `offsetHeight`/`clientHeight` are LAYOUT sizes,
    // so the test is immune to any CSS transform on an ancestor (e.g. a popup scale-in animation)
    // that would skew `getBoundingClientRect`. +1 tolerance absorbs sub-pixel rounding.
    if (inner.offsetHeight <= box.clientHeight + 1) return;

    if (visibleBlocks > 1) {
      setTailWordLimit(null);
      setVisibleBlocks((previous) => Math.max(1, previous - 1));
      return;
    }

    const current = tailWordLimit ?? tailWords;
    if (current > MIN_TAIL_WORDS) {
      setTailWordLimit(Math.max(MIN_TAIL_WORDS, current - 3));
    }
  });

  // Restart the fit when the card is resized (width rewraps text / height changes the space) or when
  // web fonts finish loading (text can reflow taller). We observe ONLY the fixed box: our own trimming
  // changes the inner content height but never the box size, so it can never retrigger the observer
  // (avoids a ResizeObserver feedback loop). The rAF debounce coalesces bursts of resize callbacks.
  useEffect(() => {
    let frame = 0;
    const refit = () => {
      if (typeof requestAnimationFrame === 'undefined') {
        setFitNonce((n) => n + 1);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setFitNonce((n) => n + 1));
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready?.then(refit).catch(() => {});

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && boxRef.current) {
      observer = new ResizeObserver(refit);
      observer.observe(boxRef.current);
    }
    return () => {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  const displayed = serializeSections(tailWordLimit == null ? limited : clampTailWords(limited, tailWordLimit));

  return (
    <div ref={boxRef} className={className}>
      <div ref={contentRef}>
        <AIInsightText content={displayed} boldTerms={boldTerms} />
      </div>
    </div>
  );
}
