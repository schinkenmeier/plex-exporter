import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { createTautulliRateLimiter, type TautulliRateLimiter } from './tautulliRateLimiter.js';

export interface TautulliConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  enableRateLimiting?: boolean;
}

export interface HttpClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

export interface TautulliLibrarySummary {
  section_id: number;
  section_name: string;
  friendly_name: string;
  section_type: string;
  [key: string]: unknown;
}

export interface TautulliMediaItem {
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  title: string;
  sort_title?: string;
  year?: number;
  media_type: string;
  section_id: number;
  library_name?: string;
  rating?: number;
  content_rating?: string;
  summary?: string;
  tagline?: string;
  duration?: number;
  thumb?: string;
  art?: string;
  guid?: string;
  originally_available_at?: string;
  added_at?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface TautulliMetadata {
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  title: string;
  sort_title?: string;
  media_type: string;
  year?: number;
  content_rating?: string;
  summary?: string;
  tagline?: string;
  rating?: number;
  audience_rating?: number;
  duration?: number;
  thumb?: string;
  art?: string;
  banner?: string;
  originally_available_at?: string;
  added_at?: number;
  updated_at?: number;
  guid?: string;
  studio?: string;
  section_id?: number;
  genres?: string[];
  directors?: string[];
  writers?: string[];
  actors?: string[];
  countries?: string[];
  collections?: string[];
  parent_title?: string;
  grandparent_title?: string;
  media_index?: number;
  parent_media_index?: number;
  [key: string]: unknown;
}

export interface TautulliClient {
  getLibraries(): Promise<TautulliLibrarySummary[]>;
  getLibraryMediaList(sectionId: number, start?: number, length?: number): Promise<TautulliMediaItem[]>;
  getMetadata(ratingKey: string): Promise<TautulliMetadata>;
  getSeasons(ratingKey: string): Promise<TautulliMetadata[]>;
  getEpisodes(ratingKey: string): Promise<TautulliMetadata[]>;
}

interface TautulliLibrariesPayload {
  response: {
    result: 'success' | 'error';
    message?: string;
    data?: TautulliLibrarySummary[];
  };
}

interface TautulliLibraryMediaPayload {
  response: {
    result: 'success' | 'error';
    message?: string;
    data?: {
      data: TautulliMediaItem[];
      recordsFiltered: number;
      recordsTotal: number;
    };
  };
}

interface TautulliMetadataPayload {
  response: {
    result: 'success' | 'error';
    message?: string;
    data?: TautulliMetadata;
  };
}

interface TautulliChildrenPayload {
  response: {
    result: 'success' | 'error';
    message?: string;
    data?: {
      children_list: TautulliMetadata[];
      children_count: number;
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
  private readonly rateLimiter: TautulliRateLimiter | null;

  constructor(private readonly config: TautulliConfig, httpClient?: HttpClient) {
    this.httpClient = httpClient ?? createHttpClient(config);
    this.rateLimiter = config.enableRateLimiting !== false ? createTautulliRateLimiter() : null;
  }

  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (this.rateLimiter) {
      return this.rateLimiter.execute(fn);
    }
    return fn();
  }


  async getLibraries(): Promise<TautulliLibrarySummary[]> {
    return this.executeWithRateLimit(async () => {
      const response = await this.httpClient.get<TautulliLibrariesPayload>('/api/v2', {
        params: {
          apikey: this.config.apiKey,
          cmd: 'get_libraries',
        },
      });

      console.log('Tautulli getLibraries response:', JSON.stringify(response.data, null, 2));

      if (response.data.response.result !== 'success') {
        const errorMessage =
          response.data.response.message ?? 'Failed to fetch libraries from Tautulli.';
        throw new Error(errorMessage);
      }

      const data = response.data.response.data;
      let libraries: TautulliLibrarySummary[] = [];

      if (Array.isArray(data)) {
        libraries = data;
      } else if (data && typeof data === 'object') {
        const maybeLibraries = (data as Record<string, unknown>).libraries;
        if (Array.isArray(maybeLibraries)) {
          libraries = maybeLibraries as TautulliLibrarySummary[];
        }
      }

      console.log('Parsed libraries count:', libraries.length);

      return libraries;
    });
  }

  async getLibraryMediaList(
    sectionId: number,
    start = 0,
    length = 1000,
  ): Promise<TautulliMediaItem[]> {
    return this.executeWithRateLimit(async () => {
      const response = await this.httpClient.get<TautulliLibraryMediaPayload>('/api/v2', {
        params: {
          apikey: this.config.apiKey,
          cmd: 'get_library_media_info',
          section_id: sectionId,
          start,
          length,
        },
      });

      if (response.data.response.result !== 'success') {
        const errorMessage =
          response.data.response.message ?? 'Failed to fetch library media from Tautulli.';
        throw new Error(errorMessage);
      }

      const data = response.data.response.data;
      const items = data?.data ?? [];

      // Log Tautulli's response metadata to help debug pagination issues
      console.log(`[Tautulli API] get_library_media_info response:`, {
        sectionId,
        start,
        length,
        recordsTotal: data?.recordsTotal,
        recordsFiltered: data?.recordsFiltered,
        itemsReturned: items.length,
      });

      return items;
    });
  }

  async getMetadata(ratingKey: string): Promise<TautulliMetadata> {
    return this.executeWithRateLimit(async () => {
      const response = await this.httpClient.get<TautulliMetadataPayload>('/api/v2', {
        params: {
          apikey: this.config.apiKey,
          cmd: 'get_metadata',
          rating_key: ratingKey,
        },
      });

      if (response.data.response.result !== 'success') {
        const errorMessage =
          response.data.response.message ?? 'Failed to fetch metadata from Tautulli.';
        throw new Error(errorMessage);
      }

      const data = response.data.response.data;
      if (!data) {
        throw new Error(`No metadata found for rating key: ${ratingKey}`);
      }

      return data;
    });
  }

  async getSeasons(ratingKey: string): Promise<TautulliMetadata[]> {
    return this.executeWithRateLimit(async () => {
      const response = await this.httpClient.get<TautulliChildrenPayload>('/api/v2', {
        params: {
          apikey: this.config.apiKey,
          cmd: 'get_children_metadata',
          rating_key: ratingKey,
        },
      });

      if (response.data.response.result !== 'success') {
        const errorMessage =
          response.data.response.message ?? 'Failed to fetch seasons from Tautulli.';
        throw new Error(errorMessage);
      }

      return response.data.response.data?.children_list ?? [];
    });
  }

  async getEpisodes(ratingKey: string): Promise<TautulliMetadata[]> {
    return this.executeWithRateLimit(async () => {
      const response = await this.httpClient.get<TautulliChildrenPayload>('/api/v2', {
        params: {
          apikey: this.config.apiKey,
          cmd: 'get_children_metadata',
          rating_key: ratingKey,
        },
      });

      if (response.data.response.result !== 'success') {
        const errorMessage =
          response.data.response.message ?? 'Failed to fetch episodes from Tautulli.';
        throw new Error(errorMessage);
      }

      return response.data.response.data?.children_list ?? [];
    });
  }

  /**
   * Fetch a library image (poster/backdrop) from Tautulli
   * @param ratingKey The rating key of the media item
   * @param type Either 'thumb' (poster) or 'art' (backdrop)
   * @param timestamp The timestamp from the Tautulli metadata
   * @returns The image data as Buffer
   */
  async fetchLibraryImage(
    ratingKey: string,
    type: 'thumb' | 'art',
    timestamp: string,
  ): Promise<{ data: Buffer; headers?: Record<string, string> }> {
    const proxiedUrl = this.buildImageProxyUrl(ratingKey, type, timestamp);
    const executeRequest = async () => {
      const axiosInstance = this.httpClient as AxiosInstance;

      if (axiosInstance && typeof axiosInstance.get === 'function') {
        const response = await axiosInstance.get<ArrayBuffer>(proxiedUrl, {
          responseType: 'arraybuffer',
          timeout: this.config.timeoutMs ?? 30000,
          headers: {
            Accept: 'image/*',
          },
        });

        const buffer = this.ensureImageResponse(
          response.data,
          this.normalizeHeaderValue(response.headers?.['content-type']),
          ratingKey,
          type,
          timestamp,
        );

        return {
          data: buffer,
          headers: response.headers as Record<string, string> | undefined,
        };
      }

      const fetchResponse = await fetch(proxiedUrl, {
        headers: {
          Accept: 'image/*',
        },
      });

      if (!fetchResponse.ok) {
        throw new Error(
          `Failed to download ${type} for rating key ${ratingKey}: HTTP ${fetchResponse.status}`,
        );
      }

      const arrayBuffer = await fetchResponse.arrayBuffer();
      const buffer = this.ensureImageResponse(
        arrayBuffer,
        this.normalizeHeaderValue(fetchResponse.headers.get('content-type') ?? undefined),
        ratingKey,
        type,
        timestamp,
      );

      return {
        data: buffer,
        headers: Object.fromEntries(fetchResponse.headers.entries()),
      };
    };

    return this.rateLimiter?.execute(executeRequest) ?? executeRequest();
  }

  private buildImageProxyUrl(
    ratingKey: string,
    type: 'thumb' | 'art',
    timestamp: string,
  ): string {
    const baseUrlWithoutApi = this.config.baseUrl
      .replace(/\/api\/v2\/?$/i, '')
      .replace(/\/$/, '');

    const baseForUrl = `${baseUrlWithoutApi}/`;
    const imagePath = `/library/metadata/${ratingKey}/${type}/${timestamp}`;
    const url = new URL(baseForUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/pms_image_proxy`;
    url.searchParams.set('img', imagePath);
    url.searchParams.set('apikey', this.config.apiKey);
    return url.toString();
  }

  private ensureImageResponse(
    rawData: ArrayBuffer | Buffer,
    contentType: string | undefined,
    ratingKey: string,
    type: 'thumb' | 'art',
    timestamp: string,
  ): Buffer {
    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    const looksLikeImage = this.hasImageSignature(buffer);

    if (!contentType?.startsWith('image/') && !looksLikeImage) {
      const snippet = buffer.toString('utf8', 0, Math.min(buffer.length, 200)).trim();
      throw new Error(
        `Tautulli returned non-image content for ${type} ${ratingKey} (${timestamp}). Content-Type: ${
          contentType ?? 'unknown'
        }. Payload starts with: ${snippet}`,
      );
    }

    return buffer;
  }

  private normalizeHeaderValue(headerValue: unknown): string | undefined {
    if (!headerValue) {
      return undefined;
    }

    if (Array.isArray(headerValue)) {
      return headerValue[0]?.toLowerCase();
    }

    return String(headerValue).toLowerCase();
  }

  private hasImageSignature(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }

    const signatureChecks: Array<(buf: Buffer) => boolean> = [
      // JPEG
      (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
      // PNG
      (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      // GIF
      (buf) =>
        buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && (buf[3] === 0x38 || buf[3] === 0x39),
      // WebP (RIFF....WEBP)
      (buf) =>
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50,
      // BMP
      (buf) => buf[0] === 0x42 && buf[1] === 0x4d,
      // TIFF (little endian)
      (buf) => buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00,
      // TIFF (big endian)
      (buf) => buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a,
    ];

    return signatureChecks.some((check) => {
      try {
        return check(buffer);
      } catch {
        return false;
      }
    });
  }

  /**
   * Get the base URL of the Tautulli instance
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }
}

export const createTautulliService = (
  config: TautulliConfig,
  httpClient?: HttpClient,
): TautulliService => new TautulliService(config, httpClient);

export default TautulliService;
