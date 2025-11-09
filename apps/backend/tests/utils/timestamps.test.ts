import { describe, expect, it } from 'vitest';

import { normalizeTimestamp } from '../../src/utils/timestamps.js';

describe('normalizeTimestamp', () => {
  it('converts unix seconds to ISO string', () => {
    const seconds = 1_700_000_000;
    const expected = new Date(seconds * 1000).toISOString();
    expect(normalizeTimestamp(seconds)).toBe(expected);
    expect(normalizeTimestamp(String(seconds))).toBe(expected);
  });

  it('converts unix milliseconds to ISO string', () => {
    const millis = 1_700_000_000_000;
    const expected = new Date(millis).toISOString();
    expect(normalizeTimestamp(millis)).toBe(expected);
    expect(normalizeTimestamp(String(millis))).toBe(expected);
  });

  it('keeps ISO-like strings intact', () => {
    const iso = '2024-03-01T12:34:56.000Z';
    expect(normalizeTimestamp(iso)).toBe(iso);
  });

  it('returns null for invalid input', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('not-a-date')).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
  });
});
