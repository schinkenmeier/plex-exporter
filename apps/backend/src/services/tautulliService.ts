import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

export interface TautulliConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface HttpClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

export interface TautulliLibrarySummary {
  section_id: number;
  section_name: string;
  friendly_name: string;
  [key: string]: unknown;
}

export interface TautulliClient {
  getLibraries(): Promise<TautulliLibrarySummary[]>;
}

interface TautulliLibrariesPayload {
  response: {
    result: 'success' | 'error';
    message?: string;
    data?: {
      libraries: TautulliLibrarySummary[];
    };
  };
}

const defaultTimeout = 5000;

const createHttpClient = (config: TautulliConfig): AxiosInstance =>
  axios.create({
    baseURL: config.baseUrl.replace(/\/$/, ''),
    timeout: config.timeoutMs ?? defaultTimeout,
  });

export class TautulliService implements TautulliClient {
  private readonly httpClient: HttpClient;

  constructor(private readonly config: TautulliConfig, httpClient?: HttpClient) {
    this.httpClient = httpClient ?? createHttpClient(config);
  }

  async getLibraries(): Promise<TautulliLibrarySummary[]> {
    const response = await this.httpClient.get<TautulliLibrariesPayload>('/api/v2', {
      params: {
        apikey: this.config.apiKey,
        cmd: 'get_libraries',
      },
    });

    if (response.data.response.result !== 'success') {
      const errorMessage =
        response.data.response.message ?? 'Failed to fetch libraries from Tautulli.';
      throw new Error(errorMessage);
    }

    return response.data.response.data?.libraries ?? [];
  }
}

export const createTautulliService = (
  config: TautulliConfig,
  httpClient?: HttpClient,
): TautulliService => new TautulliService(config, httpClient);

export default TautulliService;
