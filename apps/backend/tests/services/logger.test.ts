import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import logger from '../../src/services/logger.js';
import { logBuffer } from '../../src/services/logBuffer.js';

describe('logger redaction', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logBuffer.clear();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    logBuffer.clear();
  });

  it('redacts sensitive query parameters embedded in URL string values', () => {
    logger.info('URL test', {
      callbackUrl: 'https://example.test/api?apiKey=secret&q=visible',
      relativeUrl: '/admin/api/logs?token=secret&limit=100',
    });

    const entry = logBuffer.getAll().at(-1);

    expect(entry?.context?.callbackUrl).toContain('apiKey=');
    expect(entry?.context?.callbackUrl).toContain('q=visible');
    expect(entry?.context?.callbackUrl).not.toContain('secret');
    expect(entry?.context?.relativeUrl).toContain('token=');
    expect(entry?.context?.relativeUrl).toContain('limit=100');
    expect(entry?.context?.relativeUrl).not.toContain('secret');
  });
});
