/**
 * Types for Plex export data structures
 */

export interface PlexMovie {
  ratingKey: number;
  type: 'movie';
  title: string;
  year: number;
  addedAt: string;
  summary?: string;
  guid?: string;
  guids?: Array<{ id: string }>;
  thumbFile?: string;
  duration?: number;
  contentRating?: string;
  studio?: string;
  [key: string]: unknown;
}

export interface PlexSeriesIndex {
  ratingKey: number;
  type: 'tv';
  title: string;
  year: number;
  seasonCount: number;
  thumbFile?: string;
  contentRating?: string;
  genres?: string[];
  ids?: {
    imdb?: string;
    tmdb?: string;
    tvdb?: string;
  };
  href: string; // Link to details file
}

export interface PlexSeriesDetails extends Omit<PlexSeriesIndex, 'href'> {
  summary?: string;
  tagline?: string;
  studio?: string;
  cast?: string[];
  seasons?: PlexSeason[];
}

export interface PlexSeason {
  ratingKey: number;
  seasonNumber: number;
  title: string;
  year: number;
  thumbFile?: string;
  episodes?: PlexEpisode[];
}

export interface PlexEpisode {
  ratingKey: number;
  seasonNumber: number;
  episodeNumber: number;
  seasonEpisode: string; // e.g., "S01E01"
  title: string;
  durationMin?: number;
  durationHuman?: string;
  originallyAvailableAt?: string;
  audienceRating?: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  duration: number;
}

export interface ImportOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}
