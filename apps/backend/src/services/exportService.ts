import { promises as fs } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import process from 'node:process';
import path from 'node:path';

export type LibraryKind = 'movie' | 'show';

export interface ExportServiceOptions {
  /**
   * Root directory that contains the `movies/` and `series/` exports.
   * Defaults to `data/exports` relative to the current working directory.
   */
  root?: string;
  /** Additional directories that should be considered when resolving legacy export paths. */
  legacyRoots?: string[];
}

export interface MovieExportEntry extends Record<string, unknown> {
  title: string;
  ratingKey: string;
  thumb: string;
  thumbFile: string;
  summary: string;
  href: string;
  tagline: string;
  genres: string[];
}

export interface ShowExportEntry extends MovieExportEntry {
  seasons: SeasonExportEntry[];
}

export interface SeasonExportEntry extends MovieExportEntry {
  episodes: EpisodeExportEntry[];
}

export interface EpisodeExportEntry extends MovieExportEntry {}

const DATA_ROOT = 'data/exports';
const DATA_FALLBACK_ROOTS = ['../../data/exports', '../data/exports', './data/exports', '/data/exports'];

const HERO_BAG_RELATIVE_PATHS = [
  '__PLEX_EXPORTER__/bag.json',
  'bag.json',
  'exporter/bag.json',
  '__PLEX_EXPORTER__/hero/bag.json',
];

export class ExportNotFoundError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ExportNotFoundError';
  }
}

export class ExportValidationError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ExportValidationError';
  }
}

const MOVIE_DEFAULTS: MovieExportEntry = {
  title: '',
  ratingKey: '',
  thumb: '',
  thumbFile: '',
  summary: '',
  href: '',
  tagline: '',
  genres: [],
};

const SHOW_DEFAULTS: ShowExportEntry = {
  ...MOVIE_DEFAULTS,
  seasons: [],
};

const MOVIE_ITEM_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['title', 'ratingKey'],
  properties: {
    title: { type: 'string' },
    ratingKey: { type: ['string', 'number'] },
    thumb: { type: 'string', nullable: true },
    thumbFile: { type: 'string', nullable: true },
    summary: { type: 'string', nullable: true },
    href: { type: 'string', nullable: true },
    tagline: { type: 'string', nullable: true },
    genres: { type: 'array', items: { type: ['string', 'object'] }, nullable: true },
  },
};

const SEASON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    episodes: { type: 'array', items: { type: 'object' }, nullable: true },
    thumb: { type: 'string', nullable: true },
    thumbFile: { type: 'string', nullable: true },
  },
};

const SHOW_ITEM_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['title', 'ratingKey'],
  properties: {
    title: { type: 'string' },
    ratingKey: { type: ['string', 'number'] },
    thumb: { type: 'string', nullable: true },
    thumbFile: { type: 'string', nullable: true },
    summary: { type: 'string', nullable: true },
    href: { type: 'string', nullable: true },
    tagline: { type: 'string', nullable: true },
    genres: { type: 'array', items: { type: ['string', 'object'] }, nullable: true },
    seasons: { type: 'array', items: SEASON_SCHEMA, nullable: true },
  },
};

const MOVIE_LIST_SCHEMA: JsonSchema = { type: 'array', items: MOVIE_ITEM_SCHEMA };
const SHOW_LIST_SCHEMA: JsonSchema = { type: 'array', items: SHOW_ITEM_SCHEMA };

type JsonSchema = {
  type?: string | string[];
  nullable?: boolean;
  required?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
};

type UnknownRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const matchesType = (value: unknown, type: string): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
};

const validateAgainstSchema = (value: unknown, schema: JsonSchema | undefined, pathLabel = 'value'): void => {
  if (!schema) return;
  if (value == null) {
    if (schema.nullable) return;
    throw new ExportValidationError(`${pathLabel} darf nicht null oder undefined sein.`);
  }

  const expectedTypes = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];

  if (expectedTypes.length > 0) {
    const typeOk = expectedTypes.some((type) => matchesType(value, type));
    if (!typeOk) {
      const expected = expectedTypes.join(' oder ');
      throw new ExportValidationError(`${pathLabel} erwartet Typ ${expected}, erhielt ${typeof value}.`);
    }
  }

  if (expectedTypes.includes('array')) {
    if (!Array.isArray(value)) {
      throw new ExportValidationError(`${pathLabel} erwartet eine Liste.`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        if (
          pathLabel.includes('.genres') &&
          schema.items?.type &&
          Array.isArray(schema.items.type) &&
          schema.items.type.includes('string') &&
          schema.items.type.includes('object')
        ) {
          return;
        }
        validateAgainstSchema(item, schema.items, `${pathLabel}[${index}]`);
      });
    }
    return;
  }

  if (expectedTypes.includes('object')) {
    if (!isPlainObject(value)) {
      throw new ExportValidationError(`${pathLabel} erwartet ein Objekt.`);
    }
    const required = schema.required || [];
    for (const key of required) {
      const prop = value[key];
      if (prop == null || (typeof prop === 'string' && !prop.trim())) {
        throw new ExportValidationError(`${pathLabel}.${key} ist ein Pflichtfeld.`);
      }
    }
    const properties = schema.properties || {};
    for (const [key, definition] of Object.entries(properties)) {
      if (value[key] == null) {
        continue;
      }
      validateAgainstSchema(value[key], definition, `${pathLabel}.${key}`);
    }
  }
};

const ensureArrayOfStrings = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && typeof (item as { tag?: unknown }).tag === 'string') {
        return (item as { tag: string }).tag.trim();
      }
      return null;
    })
    .filter((item): item is string => !!item && item.length > 0);
};

const cloneWithDefaults = <T extends UnknownRecord>(entry: T, defaults: UnknownRecord): T => {
  const result: UnknownRecord = { ...entry };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (result[key] == null) {
      result[key] = Array.isArray(defaultValue) ? [...(defaultValue as unknown[])] : defaultValue;
    } else if (Array.isArray(defaultValue)) {
      result[key] = Array.isArray(result[key]) ? [...(result[key] as unknown[])] : [...(defaultValue as unknown[])];
    }
  }
  return result as T;
};

const isMovieEntry = (value: unknown): value is UnknownRecord => {
  if (!isPlainObject(value)) return false;
  if (typeof value.title !== 'string' || !value.title.trim()) return false;
  const ratingKey = value.ratingKey;
  if (!(typeof ratingKey === 'string' || typeof ratingKey === 'number')) return false;
  return true;
};

const isShowEntry = (value: unknown): value is UnknownRecord => {
  if (!isMovieEntry(value)) return false;
  if (value.seasons == null) return true;
  if (!Array.isArray(value.seasons)) return false;
  return value.seasons.every((season: unknown) => isPlainObject(season));
};

const sanitizeMovieEntry = (entry: UnknownRecord): MovieExportEntry => {
  const result = cloneWithDefaults(entry, MOVIE_DEFAULTS);
  result.title = String(result.title).trim();
  result.ratingKey = String(entry.ratingKey).trim();
  const thumbValue = typeof result.thumb === 'string' ? result.thumb : '';
  const thumbFileValue = typeof result.thumbFile === 'string' ? result.thumbFile : '';
  result.thumb = thumbValue;
  result.thumbFile = thumbFileValue || thumbValue;
  result.summary = typeof result.summary === 'string' ? result.summary : '';
  result.href = typeof result.href === 'string' ? result.href : '';
  result.tagline = typeof result.tagline === 'string' ? result.tagline : '';
  result.genres = ensureArrayOfStrings(result.genres);
  return result as MovieExportEntry;
};

const sanitizeShowEntry = (entry: UnknownRecord): ShowExportEntry => {
  const result = cloneWithDefaults(entry, SHOW_DEFAULTS);
  result.title = String(result.title).trim();
  result.ratingKey = String(entry.ratingKey).trim();
  const thumbValue = typeof result.thumb === 'string' ? result.thumb : '';
  const thumbFileValue = typeof result.thumbFile === 'string' ? result.thumbFile : '';
  result.thumb = thumbValue;
  result.thumbFile = thumbFileValue || thumbValue;
  result.summary = typeof result.summary === 'string' ? result.summary : '';
  result.href = typeof result.href === 'string' ? result.href : '';
  result.tagline = typeof result.tagline === 'string' ? result.tagline : '';
  result.genres = ensureArrayOfStrings(result.genres);

  if (Array.isArray(entry.seasons)) {
    result.seasons = entry.seasons
      .filter(isPlainObject)
      .map((season) => {
        const seasonCopy: UnknownRecord = { ...season };
        seasonCopy.episodes = Array.isArray(seasonCopy.episodes)
          ? seasonCopy.episodes.filter(isPlainObject).map((episode) => ({ ...episode }))
          : [];
        if (typeof seasonCopy.thumb !== 'string') seasonCopy.thumb = '';
        if (typeof seasonCopy.thumbFile !== 'string') seasonCopy.thumbFile = '';
        return seasonCopy;
      }) as SeasonExportEntry[];
  } else {
    result.seasons = [];
  }

  return result as ShowExportEntry;
};

const validateLibraryList = (data: unknown, kind: LibraryKind): MovieExportEntry[] | ShowExportEntry[] => {
  const schema = kind === 'show' ? SHOW_LIST_SCHEMA : MOVIE_LIST_SCHEMA;
  validateAgainstSchema(data, schema, `${kind}List`);
  if (!Array.isArray(data)) {
    throw new ExportValidationError('Datensatz ist keine Liste.');
  }
  const guard = kind === 'show' ? isShowEntry : isMovieEntry;
  const sanitizer = kind === 'show' ? sanitizeShowEntry : sanitizeMovieEntry;
  return data.map((entry, index) => {
    if (!guard(entry)) {
      throw new ExportValidationError(`Ungültiger ${kind}-Eintrag an Index ${index}.`);
    }
    return sanitizer(entry as UnknownRecord);
  });
};

const normalizeRelative = (relative: string): string =>
  String(relative || '')
    .replace(/^\/+/, '')
    .replace(/^data\//, '')
    .replace(/^exports\//, '');

const prefixThumbValue = (value: unknown, base: string): string => {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return '';
  if (raw.startsWith('//') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  const normalizedRaw = raw.replace(/\\/g, '/');
  const normalizedBase = base ? (base.endsWith('/') ? base : `${base}/`) : '';

  const encodePath = (p: string) =>
    p
      .split('/')
      .map((segment) => {
        if (!segment) return '';
        try {
          return encodeURIComponent(decodeURIComponent(segment));
        } catch (error) {
          return encodeURIComponent(segment);
        }
      })
      .join('/');

  const trimmed = normalizedRaw.replace(/^\/+/, '');
  const segments = trimmed.split('/');
  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalizedSegments.length) normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }
  const normalizedPath = normalizedSegments.join('/');
  if (/^(?:\.\.\/)?data\//.test(normalizedPath)) {
    const withoutRoot = normalizedPath.replace(/^(?:\.\.\/)?data(?:\/exports)?\//, '');
    const encoded = encodePath(withoutRoot);
    return `${DATA_ROOT}/${encoded}`;
  }
  let relativeSegments = normalizedSegments;
  if (normalizedBase && relativeSegments.length) {
    const baseDir = normalizedBase.replace(/\/+$/, '').split('/').pop();
    if (baseDir && relativeSegments[0] === baseDir) {
      relativeSegments = relativeSegments.slice(1);
    }
  }
  const cleaned = relativeSegments.join('/');
  const encoded = encodePath(cleaned);
  return `${normalizedBase}${encoded}`;
};

const prefixThumb = <T extends UnknownRecord>(obj: T, base: string): T => {
  if (!obj || typeof obj !== 'object') return obj;
  const target = obj as UnknownRecord & { thumb?: unknown; thumbFile?: unknown };
  const current = target.thumbFile ?? target.thumb ?? '';
  const prefixed = prefixThumbValue(current, base);
  if (prefixed) {
    target.thumbFile = prefixed;
    target.thumb = prefixed;
  } else if (current) {
    const str = String(current);
    target.thumbFile = str;
    if (target.thumb == null) {
      target.thumb = str;
    }
  }
  return obj;
};

const MOVIE_THUMB_BASE = `${DATA_ROOT}/movies/`;
const SHOW_THUMB_BASE = `${DATA_ROOT}/series/`;

const prefixMovieThumb = <T extends UnknownRecord>(obj: T): T => prefixThumb(obj, MOVIE_THUMB_BASE);
const prefixShowThumb = <T extends UnknownRecord>(obj: T): T => prefixThumb(obj, SHOW_THUMB_BASE);

const prefixSeasonTree = (season: UnknownRecord): UnknownRecord => {
  if (!season || typeof season !== 'object') return season;
  prefixShowThumb(season);
  if (Array.isArray(season.episodes)) {
    season.episodes.forEach((episode: UnknownRecord) => prefixShowThumb(episode));
  }
  return season;
};

const prefixShowTree = (show: UnknownRecord): UnknownRecord => {
  if (!show || typeof show !== 'object') return show;
  prefixShowThumb(show);
  if (Array.isArray(show.seasons)) show.seasons.forEach((season: UnknownRecord) => prefixSeasonTree(season));
  return show;
};

const normalizeMovieThumbs = (list: MovieExportEntry[]): MovieExportEntry[] => {
  if (!Array.isArray(list)) return [];
  list.forEach((item) => {
    if (item && typeof item === 'object') prefixMovieThumb(item);
  });
  return list;
};

const normalizeShowThumbs = (list: ShowExportEntry[]): ShowExportEntry[] => {
  if (!Array.isArray(list)) return [];
  list.forEach((item) => {
    if (item && typeof item === 'object') prefixShowTree(item);
  });
  return list;
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const fallbackDataPaths = (relative: string): string[] => {
  const trimmed = normalizeRelative(relative);
  const uniq = new Set<string>();
  for (const root of DATA_FALLBACK_ROOTS) {
    const normalizedRoot = String(root || '').replace(/\/+$/, '');
    uniq.add(`${normalizedRoot}/${trimmed}`);
  }
  uniq.add(`data/${trimmed}`);
  uniq.add(trimmed);
  return Array.from(uniq);
};

const moviePathCandidates = (): string[] => unique([
  'movies/movies.json',
  ...fallbackDataPaths('movies/movies.json'),
  'data/movies/movies.json',
  'data/exports/movies.json',
  'movies/movies.json',
  'data/movies.json',
  'Filme/movies.json',
  'movies.json',
]);

const seriesIndexPathCandidates = (): string[] => unique([
  'series/series_index.json',
  ...fallbackDataPaths('series/series_index.json'),
  'data/series/series_index.json',
  'data/exports/shows.json',
  'data/exports/series.json',
  'series/series.json',
  'data/series.json',
  'data/shows.json',
  'Serien/series.json',
  'series.json',
  'shows.json',
]);

const detailPathCandidates = (id: string): string[] => unique([
  `series/details/${id}.json`,
  ...fallbackDataPaths(`series/details/${id}.json`),
  `series/${id}.json`,
  `series/details/${id}`,
  `data/series/details/${id}.json`,
  `data/exports/series/details/${id}.json`,
  `details/${id}.json`,
  `${id}.json`,
]);

const resolveRoots = (root: string, extraRoots: string[] = []): string[] => {
  const resolved = [root];
  resolved.push(path.resolve(root, '..'));
  resolved.push(path.resolve(root, '../..'));
  resolved.push(path.resolve(process.cwd(), 'data', 'exports'));
  resolved.push(path.resolve(process.cwd(), 'data'));
  resolved.push(process.cwd());
  resolved.push(path.resolve(process.cwd(), '..'));
  extraRoots.forEach((candidate) => {
    if (candidate) resolved.push(path.resolve(candidate));
  });
  return unique(resolved.map((candidate) => path.resolve(candidate)));
};

const expandCandidates = (roots: string[], relativePath: string): string[] => {
  if (!relativePath) return [];
  const normalized = normalizeRelative(relativePath);
  if (path.isAbsolute(relativePath)) {
    return [relativePath];
  }
  return roots.map((root) => path.resolve(root, normalized));
};

const findExistingPath = (roots: string[], candidates: string[]): string | null => {
  for (const relative of candidates) {
    const paths = expandCandidates(roots, relative);
    for (const candidatePath of paths) {
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }
  return null;
};

const readJsonFile = async (absolutePath: string): Promise<unknown> => {
  const content = await fs.readFile(absolutePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new ExportValidationError('Ungültige JSON-Datei', { path: absolutePath, cause: error });
  }
};

const createHeroBagLoader = (roots: string[]) => {
  let cache: { path: string; mtimeMs: number; data: UnknownRecord } | null = null;

  return async (): Promise<UnknownRecord | null> => {
    for (const relative of HERO_BAG_RELATIVE_PATHS) {
      const absolute = findExistingPath(roots, [relative, `data/${normalizeRelative(relative)}`]);
      if (!absolute) continue;
      try {
        const stats = statSync(absolute);
        if (cache && cache.path === absolute && cache.mtimeMs === stats.mtimeMs) {
          return cache.data;
        }
        const data = (await readJsonFile(absolute)) as UnknownRecord;
        if (isPlainObject(data)) {
          cache = { path: absolute, mtimeMs: stats.mtimeMs, data };
          return data;
        }
      } catch (error) {
        cache = null;
        throw error;
      }
    }
    return null;
  };
};

export interface ExportService {
  loadMovies(): Promise<MovieExportEntry[]>;
  loadSeries(): Promise<ShowExportEntry[]>;
  loadSeriesDetails(id: string): Promise<ShowExportEntry | null>;
}

export const createExportService = (options: ExportServiceOptions = {}): ExportService => {
  const root = options.root ? path.resolve(options.root) : path.resolve(process.cwd(), DATA_ROOT);
  const roots = resolveRoots(root, options.legacyRoots);
  const loadHeroBag = createHeroBagLoader(roots);

  const loadLibrary = async (kind: LibraryKind): Promise<MovieExportEntry[] | ShowExportEntry[]> => {
    const candidates = kind === 'movie' ? moviePathCandidates() : seriesIndexPathCandidates();
    const absolute = findExistingPath(roots, candidates);

    let data: unknown = null;
    let sourceDetails: Record<string, unknown> | undefined;

    if (absolute) {
      try {
        data = await readJsonFile(absolute);
        sourceDetails = { path: absolute };
      } catch (error) {
        if (error instanceof ExportValidationError) {
          throw error;
        }
        throw new ExportValidationError('Exportdatei konnte nicht gelesen werden.', {
          path: absolute,
          cause: error,
        });
      }
    } else {
      const bag = await loadHeroBag();
      if (bag) {
        const key = kind === 'movie' ? 'movies' : 'shows';
        if (Array.isArray(bag[key])) {
          data = bag[key];
          sourceDetails = { path: '__PLEX_EXPORTER__/bag.json', key };
        }
      }
    }

    if (!data) {
      throw new ExportNotFoundError(
        kind === 'movie' ? 'Movies export not found' : 'Series index not found',
        sourceDetails,
      );
    }

    const normalized = validateLibraryList(data, kind);
    return kind === 'movie' ? normalizeMovieThumbs(normalized as MovieExportEntry[]) : normalizeShowThumbs(normalized as ShowExportEntry[]);
  };

  const loadSeriesDetailsInternal = async (id: string): Promise<ShowExportEntry | null> => {
    const candidates = detailPathCandidates(id);
    const absolute = findExistingPath(roots, candidates);
    if (absolute) {
      const data = await readJsonFile(absolute);
      if (!data || typeof data !== 'object') {
        throw new ExportValidationError('Ungültige Seriendaten', { path: absolute });
      }
      const show = sanitizeShowEntry(data as UnknownRecord);
      return prefixShowTree(show) as ShowExportEntry;
    }

    const bag = await loadHeroBag();
    if (bag) {
      const details = bag.seriesDetails;
      if (isPlainObject(details)) {
        const direct = details[id];
        if (direct && typeof direct === 'object') {
          const show = sanitizeShowEntry(direct as UnknownRecord);
          return prefixShowTree(show) as ShowExportEntry;
        }
      }
      const shows = Array.isArray(bag.shows) ? bag.shows : [];
      const match = shows.find((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const ratingKey = String((item as { ratingKey?: unknown }).ratingKey ?? '');
        return ratingKey === id;
      });
      if (match && typeof match === 'object') {
        const show = sanitizeShowEntry(match as UnknownRecord);
        return prefixShowTree(show) as ShowExportEntry;
      }
    }

    return null;
  };

  return {
    async loadMovies() {
      return (await loadLibrary('movie')) as MovieExportEntry[];
    },
    async loadSeries() {
      return (await loadLibrary('show')) as ShowExportEntry[];
    },
    async loadSeriesDetails(id: string) {
      if (!id) return null;
      const normalizedId = String(id).trim();
      if (!normalizedId) return null;
      return loadSeriesDetailsInternal(normalizedId);
    },
  };
};

export default createExportService;
