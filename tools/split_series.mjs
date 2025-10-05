#!/usr/bin/env node
// Hinweis: Das Frontend lädt zuerst `series_index.json` und bei Klick auf eine Serie
// deren Detail-JSON aus `details/<ratingKey>.json`. Dieses Skript bereitet die Daten vor.

import fs from 'fs';
import path from 'path';

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/split_series.mjs <input_json> <output_dir>');
  process.exit(1);
}

// Helpers
function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function arrTags(a) {
  if (!Array.isArray(a)) return [];
  return unique(
    a
      .map((x) =>
        typeof x === 'string'
          ? x
          : x?.tag || x?.name || x?.title || x?.Tag || x?.Name || x?.Title
      )
      .filter(Boolean)
  );
}

function normIds(guids) {
  // Supports arrays like [{id: 'imdb://tt123'}, {id: 'tmdb://456'}] or strings
  const ids = { imdb: undefined, tmdb: undefined, tvdb: undefined };
  if (!Array.isArray(guids)) return ids;

  for (const g of guids) {
    const raw = typeof g === 'string' ? g : g?.id || g?.Id || g?.guid || g?.Guid;
    if (!raw || typeof raw !== 'string') continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith('imdb://')) {
      const v = raw.split('://')[1];
      if (v) ids.imdb = v;
    } else if (lower.startsWith('tmdb://')) {
      const v = raw.split('://')[1];
      if (v) ids.tmdb = v;
    } else if (lower.startsWith('tvdb://')) {
      const v = raw.split('://')[1];
      if (v) ids.tvdb = v;
    }
  }
  return ids;
}

function round1(n) {
  if (n == null || isNaN(Number(n))) return undefined;
  return Math.round(Number(n) * 10) / 10;
}

function durationMin(ms) {
  if (ms == null || isNaN(Number(ms))) return undefined;
  return Math.round(Number(ms) / 60000);
}

function durationHuman(ms) {
  const m = durationMin(ms);
  if (m == null) return undefined;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${m}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

function val(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

function toInt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function normalizeSeriesObject(raw) {
  // Try to normalize differences in possible source structures (Plex-like exports)
  const ratingKey = val(raw, 'ratingKey', 'RatingKey', 'id', 'Id');
  const title = val(raw, 'title', 'Title', 'name', 'Name');
  const titleSort = val(raw, 'titleSort', 'TitleSort');
  const year = toInt(val(raw, 'year', 'Year'));
  const thumb = val(raw, 'thumb', 'Thumb');
  const thumbFile = val(raw, 'thumbFile', 'ThumbFile');
  const art = val(raw, 'art', 'Art');
  const contentRating = val(raw, 'contentRating', 'ContentRating');
  const rating = round1(val(raw, 'rating', 'Rating'));
  const guids = val(raw, 'guids', 'Guid', 'Guids', 'guid', 'GUID', 'GUIDs');
  const ids = normIds(Array.isArray(guids) ? guids : []);

  // genres can be `genres` or `Genre` as array of { tag }
  const genres = arrTags(val(raw, 'genres', 'Genres', 'Genre'));

  // roles/cast up to 12 names
  const roles = val(raw, 'roles', 'Roles', 'Role');
  const cast = unique(arrTags(roles)).slice(0, 12);

  // seasons detection: prefer `seasons`; fallback to `children` with type season
  const seasonsSource = (
    val(raw, 'seasons', 'Seasons') ||
    (Array.isArray(raw?.children)
      ? raw.children.filter((c) =>
          (c?.type || c?.Type || '').toString().toLowerCase() === 'season'
        )
      : undefined)
  ) || [];

  const seasons = seasonsSource.map((s) => normalizeSeasonObject(s));

  return {
    ratingKey,
    type: 'tv',
    title,
    titleSort,
    year,
    summary: val(raw, 'summary', 'Summary'),
    tagline: val(raw, 'tagline', 'Tagline'),
    contentRating,
    studio: val(raw, 'studio', 'Studio'),
    genres,
    cast,
    thumb,
    thumbFile,
    art,
    ids,
    seasons,
  };
}

function normalizeSeasonObject(s) {
  const ratingKey = val(s, 'ratingKey', 'RatingKey', 'id', 'Id');
  const seasonNumber = toInt(
    val(s, 'seasonNumber', 'index', 'Index', 'season', 'Season', 'parentIndex')
  );
  const title = val(s, 'title', 'Title', 'name', 'Name');
  const year = toInt(val(s, 'year', 'Year'));
  const thumb = val(s, 'thumb', 'Thumb');
  const thumbFile = val(s, 'thumbFile', 'ThumbFile');

  const episodesSource = (
    val(s, 'episodes', 'Episodes') ||
    (Array.isArray(s?.children)
      ? s.children.filter((c) =>
          (c?.type || c?.Type || '').toString().toLowerCase() === 'episode'
        )
      : undefined)
  ) || [];

  const episodes = episodesSource.map((e) => normalizeEpisodeObject(e, seasonNumber));

  return {
    ratingKey,
    seasonNumber,
    title,
    year,
    thumb,
    thumbFile,
    episodes,
  };
}

function normalizeEpisodeObject(e, fallbackSeasonNumber) {
  const ratingKey = val(e, 'ratingKey', 'RatingKey', 'id', 'Id');
  const seasonNumber = toInt(
    val(
      e,
      'seasonNumber',
      'parentIndex',
      'ParentIndex',
      'season',
      'Season'
    )
  ) ?? fallbackSeasonNumber;
  const episodeNumber = toInt(val(e, 'episodeNumber', 'index', 'Index', 'leafIndex'));
  const title = val(e, 'title', 'Title', 'name', 'Name');
  const durMs = toInt(val(e, 'duration', 'Duration'));
  const originallyAvailableAt = val(
    e,
    'originallyAvailableAt',
    'OriginallyAvailableAt',
    'airDate',
    'AirDate'
  );
  const audienceRating = round1(val(e, 'audienceRating', 'AudienceRating'));

  const seasonEpisode =
    seasonNumber != null && episodeNumber != null
      ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
      : undefined;

  return {
    ratingKey,
    seasonNumber,
    episodeNumber,
    seasonEpisode,
    title,
    durationMin: durationMin(durMs),
    durationHuman: durationHuman(durMs),
    originallyAvailableAt,
    audienceRating,
  };
}

function buildIndexEntry(detail) {
  return {
    ratingKey: detail.ratingKey,
    type: 'tv',
    title: detail.title,
    titleSort: detail.titleSort,
    year: detail.year,
    seasonCount: Array.isArray(detail.seasons) ? detail.seasons.length : undefined,
    thumb: detail.thumb,
    thumbFile: detail.thumbFile,
    art: detail.art,
    contentRating: detail.contentRating,
    rating: undefined, // will try to pick from source below
    genres: detail.genres && detail.genres.length ? detail.genres : undefined,
    ids: detail.ids,
    href: detail.ratingKey != null ? `details/${detail.ratingKey}.json` : undefined,
  };
}

function safeParseJSON(filePath) {
  const buf = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(buf);
  } catch (e) {
    console.error(`JSON parse error in ${filePath}:`, e.message);
    process.exit(2);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// --- Main ---
const [, , inputPath, outDir] = process.argv;
if (!inputPath || !outDir) usageAndExit();

if (!fs.existsSync(inputPath)) usageAndExit(`Input file not found: ${inputPath}`);

ensureDir(outDir);
const detailsDir = path.join(outDir, 'details');
ensureDir(detailsDir);

const raw = safeParseJSON(inputPath);

// Accept either an array of shows, or an object with a property that holds the array
let shows = [];
if (Array.isArray(raw)) {
  shows = raw;
} else if (Array.isArray(raw?.MediaContainer?.Metadata)) {
  shows = raw.MediaContainer.Metadata;
} else if (Array.isArray(raw?.shows)) {
  shows = raw.shows;
} else if (Array.isArray(raw?.items)) {
  shows = raw.items;
} else {
  console.error('Could not locate series array in input JSON.');
  process.exit(3);
}

let warnCount = 0;
const indexEntries = [];

for (const s of shows) {
  const normalized = normalizeSeriesObject(s);

  // Rating (index) preference: show.rating if available on source
  const showRating = round1(val(s, 'rating', 'Rating'));
  const indexEntry = buildIndexEntry({ ...normalized, rating: showRating });
  if (showRating != null) indexEntry.rating = showRating;

  indexEntries.push(indexEntry);

  const detailOut = {
    ratingKey: normalized.ratingKey,
    type: 'tv',
    title: normalized.title,
    year: normalized.year,
    summary: normalized.summary,
    tagline: normalized.tagline,
    contentRating: normalized.contentRating,
    studio: normalized.studio,
    genres: normalized.genres && normalized.genres.length ? normalized.genres : undefined,
    cast: normalized.cast || [],
    thumb: normalized.thumb,
    thumbFile: normalized.thumbFile,
    art: normalized.art,
    ids: normalized.ids,
    seasons: normalized.seasons || [],
  };

  const fname = path.join(detailsDir, `${normalized.ratingKey}.json`);
  fs.writeFileSync(fname, JSON.stringify(detailOut));

  try {
    const { size } = fs.statSync(fname);
    if (size > 10 * 1024 * 1024) {
      warnCount++;
      console.warn(`WARN: Detail file >10MB: ${fname} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
    }
  } catch (err) {
    console.warn(`WARN: Unable to inspect detail file size for ${fname}:`, err?.message || err);
  }
}

// Sort index by titleSort || title
indexEntries.sort((a, b) => {
  const aa = (a.titleSort || a.title || '').toString();
  const bb = (b.titleSort || b.title || '').toString();
  return aa.localeCompare(bb, undefined, { sensitivity: 'base' });
});

const indexPath = path.join(outDir, 'series_index.json');
fs.writeFileSync(indexPath, JSON.stringify(indexEntries));

console.log(`Wrote ${indexEntries.length} series to ${indexPath}`);
console.log(`Details in ${detailsDir}`);
if (warnCount > 0) console.log(`Warnings: ${warnCount} large detail files.`);
