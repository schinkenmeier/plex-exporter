const DIACRITIC_RE = /[\u0300-\u036f]/g;

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

export const normalizeText = (value) => {
  if (value == null) return '';
  const base = String(value).toLowerCase();
  return base.normalize('NFD').replace(DIACRITIC_RE, '');
};

export const getGenreNames = (genres) => {
  const seen = new Set();
  const names = [];
  for (const entry of asArray(genres)) {
    let raw = '';
    if (typeof entry === 'string') {
      raw = entry;
    } else if (entry && typeof entry === 'object') {
      const obj = entry;
      raw = String(obj.tag ?? obj.title ?? obj.name ?? '');
    }
    const name = raw.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
};

export const collectionTags = (item) => {
  if (!item || typeof item !== 'object') return [];
  return asArray(item.collections)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        const str = String(entry.tag ?? entry.title ?? entry.name ?? '').trim();
        return str;
      }
      return '';
    })
    .filter((value) => Boolean(value));
};

export const humanYear = (item) => {
  if (!item) return '';
  const candidates = [
    item && item.originallyAvailableAt,
    item && item.year,
    item && item.releaseDate,
    item && item.premiereDate,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const str = String(value);
    if (!str) continue;
    const match = str.match(/\d{4}/);
    if (match) {
      return match[0];
    }
  }
  return '';
};

export const isMediaNew = (item, newDays = 30, now = Date.now()) => {
  if (!item || !item.addedAt) return false;
  const timestamp = new Date(item.addedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const days = Number.isFinite(newDays) && newDays > 0 ? newDays : 30;
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  return now - timestamp <= maxAgeMs;
};
