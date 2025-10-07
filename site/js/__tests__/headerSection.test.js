import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runtimeText } from '../modal/headerSection.js';

describe('headerSection runtimeText', () => {
  it('returns runtime for string minute values', () => {
    const result = runtimeText({ runtimeMin: '45' });
    assert.strictEqual(result, '45 min');
  });

  it('returns tv runtime with string minutes', () => {
    const result = runtimeText({ type: 'tv', runtimeMin: '50' });
    assert.strictEqual(result, '~50 min/Ep');
  });
});
