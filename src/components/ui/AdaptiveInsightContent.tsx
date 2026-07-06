import { useEffect, useMemo, useRef, useState } from 'react';
import {
  countBlocks,
  granularizeSections,
  limitSections,
  parseStructuredInsight,
  serializeSections,
} from '../../utils/aiInsightStructured';
import AIInsightText from './AIInsightText';

interface AdaptiveInsightContentProps {
  content: string;
  boldTerms?: string[];
  // Classes for the measured wrapper — typically `flex-1 min-h-0 overflow-hidden` plus responsive
  // max-heights so the text fills a card stretched by a taller sibling yet caps to a summary when
  // the card sizes to its own content (e.g. stacked on small screens).
  className?: string;
}

// Renders an AI insight that adapts the amount of content shown to the card's measured height:
// it starts from the full structured insight and drops trailing WHOLE blocks (never cutting
// mid-text) until the text fits — full on large cards, key points on medium, just the lead
// summary on small — always keeping at least the summary so the card reads as complete.
export default function AdaptiveInsightContent({ content, boldTerms, className }: AdaptiveInsightContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitSections = useMemo(() => granularizeSections(parseStructuredInsight(content)), [content]);
  const totalBlocks = useMemo(() => countBlocks(fitSections), [fitSections]);
  const [visibleBlocks, setVisibleBlocks] = useState(totalBlocks);

  useEffect(() => {
    setVisibleBlocks(totalBlocks);
  }, [totalBlocks]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (element.scrollHeight > element.clientHeight + 1 && visibleBlocks > 1) {
      setVisibleBlocks((previous) => Math.max(1, previous - 1));
    }
  }, [visibleBlocks, content]);

  // Re-fit from scratch when the card is resized (width rewraps text, height changes the space).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setVisibleBlocks(totalBlocks));
    observer.observe(element);
    return () => observer.disconnect();
  }, [totalBlocks]);

  const displayed = serializeSections(limitSections(fitSections, visibleBlocks || totalBlocks));

  return (
    <div ref={containerRef} className={className}>
      <AIInsightText content={displayed} boldTerms={boldTerms} />
    </div>
  );
}
