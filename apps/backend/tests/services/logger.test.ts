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

  it('redacts sensitive keys in nested structured context', () => {
    logger.info('Nested context test', {
      apiKey: 'top-secret',
      headers: {
        authorization: 'Bearer top-secret',
      },
      nested: {
        accessToken: 'top-secret',
        password: 'top-secret',
        safeValue: 'visible',
      },
    });

    const entry = logBuffer.getAll().at(-1);

    expect(entry?.context?.apiKey).toBe('[redacted]');
    expect((entry?.context?.headers as Record<string, unknown> | undefined)?.authorization).toBe('[redacted]');
    expect((entry?.context?.nested as Record<string, unknown> | undefined)?.accessToken).toBe('[redacted]');
    expect((entry?.context?.nested as Record<string, unknown> | undefined)?.password).toBe('[redacted]');
    expect((entry?.context?.nested as Record<string, unknown> | undefined)?.safeValue).toBe('visible');
  });

  it('redacts sensitive query parameters across URL variants', () => {
    logger.info('URL variant test', {
      absoluteUrl: 'https://example.test/api?token=absolute-secret&ok=visible#details',
      protocolRelativeUrl: '//example.test/api?secret=protocol-secret&name=visible',
      relativeUrl: 'admin/api?password=relative-secret&limit=100',
      safeUrl: '/api/search?q=not-sensitive',
    });

    const entry = logBuffer.getAll().at(-1);

    expect(entry?.context?.absoluteUrl).toContain('token=');
    expect(entry?.context?.absoluteUrl).toContain('ok=visible');
    expect(entry?.context?.absoluteUrl).toContain('#details');
    expect(entry?.context?.absoluteUrl).not.toContain('absolute-secret');
    expect(entry?.context?.protocolRelativeUrl).toContain('//example.test/api?');
    expect(entry?.context?.protocolRelativeUrl).toContain('secret=');
    expect(entry?.context?.protocolRelativeUrl).toContain('name=visible');
    expect(entry?.context?.protocolRelativeUrl).not.toContain('protocol-secret');
    expect(entry?.context?.relativeUrl).toContain('password=');
    expect(entry?.context?.relativeUrl).toContain('limit=100');
    expect(entry?.context?.relativeUrl).not.toContain('relative-secret');
    expect(entry?.context?.safeUrl).toBe('/api/search?q=not-sensitive');
  });
});
