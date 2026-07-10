import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateAdaptiveInsightSentenceTarget } from './aiInsightStructured';

test('estimates shorter insight targets on compact cards', () => {
  assert.equal(estimateAdaptiveInsightSentenceTarget(360, 220), 3);
  assert.equal(estimateAdaptiveInsightSentenceTarget(720, 220), 4);
  assert.equal(estimateAdaptiveInsightSentenceTarget(1280, 260), 5);
  assert.equal(estimateAdaptiveInsightSentenceTarget(1440, 360), 6);
});
