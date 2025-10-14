export type MediaKind = 'movie' | 'show';

export interface MediaItem {
  id: string;
  ratingKey: number;
  kind: MediaKind;
  title: string;
  originalTitle?: string;
  summary?: string;
  year?: number;
  genres: string[];
  collections?: string[];
  durationMs?: number;
  posterPath?: string;
  backdropPath?: string;
  updatedAt?: string;
}

export interface MediaLibrary {
  kind: MediaKind;
  lastExportedAt?: string;
  items: MediaItem[];
}

export interface TmdbCredentials {
  apiKey?: string;
  accessToken?: string;
  enabled: boolean;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  details?: Record<string, unknown>;
}

export type { MediaItem as PlexMediaItem };
