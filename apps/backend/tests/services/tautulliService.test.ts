import type { AxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  TautulliService,
  type HttpClient,
  type TautulliConfig,
  type TautulliLibrarySummary,
} from '../../src/services/tautulliService.js';

class HttpClientStub implements HttpClient {
  public lastUrl: string | null = null;
  public lastParams: Record<string, unknown> | undefined;

  constructor(private readonly payload: unknown) {}

  async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<{ data: T }> {
    this.lastUrl = url;
    this.lastParams = config.params as Record<string, unknown> | undefined;

    return { data: this.payload as T };
  }
}

class BinaryHttpClientStub implements HttpClient {
  public lastUrl: string | null = null;
  public lastConfig: AxiosRequestConfig | undefined;

  constructor(
    private readonly payload: ArrayBuffer | Buffer,
    private readonly headers: Record<string, string> = {},
  ) {}

  async get<T>(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<{ data: T }> {
    this.lastUrl = url;
    this.lastConfig = config;

    return {
      data: this.payload as unknown as T,
      headers: this.headers,
    } as { data: T };
  }
}

describe('TautulliService', () => {
  const config: TautulliConfig = {
    baseUrl: 'https://tautulli.local',
    apiKey: 'secret',
  };

  it('requests libraries via the API client and returns normalized data', async () => {
    const libraries: TautulliLibrarySummary[] = [
      {
        section_id: 1,
        section_name: 'Movies',
        friendly_name: 'Movies',
      },
    ];

    const payload = {
      response: {
        result: 'success' as const,
        data: { libraries },
      },
    };

    const httpClient = new HttpClientStub(payload);
    const service = new TautulliService(config, httpClient);

    const result = await service.getLibraries();

    expect(result).toEqual(libraries);
    expect(httpClient.lastUrl).toBe('/api/v2');
    expect(httpClient.lastParams).toEqual({ apikey: 'secret', cmd: 'get_libraries' });
  });

  it('throws an error when the API reports a failure', async () => {
    const httpClient = new HttpClientStub({
      response: {
        result: 'error' as const,
        message: 'Invalid API key',
      },
    });

    const service = new TautulliService(config, httpClient);

    await expect(service.getLibraries()).rejects.toThrow('Invalid API key');
  });

  it('requests images via the Tautulli image proxy when base URL contains /api/v2', async () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    const httpClient = new BinaryHttpClientStub(jpegHeader, {
      'content-type': 'image/jpeg',
    });

    const service = new TautulliService(
      {
        ...config,
        baseUrl: 'https://tautulli.local/api/v2',
      },
      httpClient,
    );

    const result = await service.fetchLibraryImage('123', 'thumb', '456');

    expect(result.data).toBeInstanceOf(Buffer);
    expect(httpClient.lastUrl).toBe(
      'https://tautulli.local/pms_image_proxy?img=%2Flibrary%2Fmetadata%2F123%2Fthumb%2F456&apikey=secret',
    );
    expect(httpClient.lastConfig).toMatchObject({
      responseType: 'arraybuffer',
      headers: { Accept: 'image/*' },
    });
  });

  it('throws when Tautulli returns a non-image payload', async () => {
    const payload = Buffer.from('{"error":"not authenticated"}', 'utf8');
    const httpClient = new BinaryHttpClientStub(payload, {
      'content-type': 'application/json',
    });

    const service = new TautulliService(config, httpClient);

    await expect(service.fetchLibraryImage('1', 'art', '2')).rejects.toThrow(
      /non-image content/i,
    );
  });

  it('accepts image payloads even without a content-type header when signature matches', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const httpClient = new BinaryHttpClientStub(pngHeader, {});

    const service = new TautulliService(config, httpClient);

    const result = await service.fetchLibraryImage('999', 'art', '777');

    expect(result.data).toBeInstanceOf(Buffer);
  });
});
