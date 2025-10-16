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

export type PlexMediaItem = MediaItem;

export interface GenericMediaItem {
  title?: unknown;
  originalTitle?: unknown;
  summary?: unknown;
  studio?: unknown;
  genres?: unknown;
  collections?: unknown;
  roles?: unknown;
  year?: unknown;
  originallyAvailableAt?: unknown;
  releaseDate?: unknown;
  premiereDate?: unknown;
  addedAt?: unknown;
}

export type SortKey = 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc' | 'added-desc';

export interface MediaFacets {
  genres: string[];
  years: number[];
  collections: string[];
}

export interface MediaFilterOptions {
  query?: string;
  onlyNew?: boolean;
  yearFrom?: number | null;
  yearTo?: number | null;
  genres?: string[];
  collection?: string;
  sort?: SortKey;
  newDays?: number;
}

export declare const SORT_KEY_VALUES: SortKey[];

export declare const normalizeText: (value: unknown) => string;
export declare const getGenreNames: (genres: unknown) => string[];
export declare const collectionTags: (item: { collections?: unknown }) => string[];
export declare const humanYear: (item: {
  originallyAvailableAt?: unknown;
  year?: unknown;
  releaseDate?: unknown;
  premiereDate?: unknown;
}) => string;
export declare const isMediaNew: (
  item: { addedAt?: unknown } | undefined,
  newDays?: number,
  now?: number,
) => boolean;

export declare const filterMediaItems: <T extends GenericMediaItem>(
  items: T[] | undefined,
  filters?: MediaFilterOptions,
  now?: number,
) => T[];

export declare const computeFacets: (
  movies?: GenericMediaItem[] | undefined,
  shows?: GenericMediaItem[] | undefined,
) => MediaFacets;
