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

  async get<T>(url: string, config: { params?: Record<string, unknown> } = {}): Promise<{ data: T }> {
    this.lastUrl = url;
    this.lastParams = config.params;

    return { data: this.payload as T };
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
});
