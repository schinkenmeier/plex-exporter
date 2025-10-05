const LOG_PREFIX = '[data/validators]';

const MOVIE_DEFAULTS = Object.freeze({
  thumb: '',
  thumbFile: '',
  summary: '',
  href: '',
  tagline: '',
  genres: [],
});

const SHOW_DEFAULTS = Object.freeze({
  thumb: '',
  thumbFile: '',
  summary: '',
  href: '',
  tagline: '',
  genres: [],
  seasons: [],
});

const MOVIE_ITEM_SCHEMA = Object.freeze({
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
    genres: { type: 'array', items: { type: 'string' }, nullable: true },
  },
});

const SEASON_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    episodes: { type: 'array', items: { type: 'object' }, nullable: true },
    thumb: { type: 'string', nullable: true },
    thumbFile: { type: 'string', nullable: true },
  },
});

const SHOW_ITEM_SCHEMA = Object.freeze({
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
    genres: { type: 'array', items: { type: 'string' }, nullable: true },
    seasons: { type: 'array', items: SEASON_SCHEMA, nullable: true },
  },
});

const MOVIE_LIST_SCHEMA = Object.freeze({ type: 'array', items: MOVIE_ITEM_SCHEMA });
const SHOW_LIST_SCHEMA = Object.freeze({ type: 'array', items: SHOW_ITEM_SCHEMA });

function isPlainObject(value){
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesType(value, type){
  switch(type){
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    default: return false;
  }
}

function validateAgainstSchema(value, schema, path = 'value'){
  if(!schema) return;
  if(value == null){
    if(schema.nullable) return;
    throw new Error(`${path} darf nicht null oder undefined sein.`);
  }
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  if(expectedTypes && expectedTypes.length){
    const typeOk = expectedTypes.some(type => matchesType(value, type));
    if(!typeOk){
      const expected = expectedTypes.join(' oder ');
      throw new Error(`${path} erwartet Typ ${expected}, erhielt ${typeof value}.`);
    }
  }
  if(expectedTypes.includes('array')){
    if(!Array.isArray(value)){
      throw new Error(`${path} erwartet eine Liste.`);
    }
    if(schema.items){
      value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`));
    }
    return;
  }
  if(expectedTypes.includes('object')){
    if(!isPlainObject(value)){
      throw new Error(`${path} erwartet ein Objekt.`);
    }
    const required = schema.required || [];
    for(const key of required){
      const prop = value[key];
      if(prop == null || (typeof prop === 'string' && !prop.trim())){
        throw new Error(`${path}.${key} ist ein Pflichtfeld.`);
      }
    }
    const properties = schema.properties || {};
    for(const [key, definition] of Object.entries(properties)){
      if(value[key] == null){
        continue;
      }
      validateAgainstSchema(value[key], definition, `${path}.${key}`);
    }
  }
}

function ensureArrayOfStrings(list){
  if(!Array.isArray(list)) return [];
  return list.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim());
}

function cloneWithDefaults(entry, defaults){
  const result = { ...entry };
  for(const [key, defaultValue] of Object.entries(defaults)){
    if(result[key] == null){
      result[key] = Array.isArray(defaultValue) ? [...defaultValue] : defaultValue;
    }else if(Array.isArray(defaultValue)){
      result[key] = Array.isArray(result[key]) ? [...result[key]] : [...defaultValue];
    }
  }
  return result;
}

export function isMovieEntry(value){
  if(!isPlainObject(value)) return false;
  if(typeof value.title !== 'string' || !value.title.trim()) return false;
  const ratingKey = value.ratingKey;
  if(!(typeof ratingKey === 'string' || typeof ratingKey === 'number')) return false;
  return true;
}

export function isShowEntry(value){
  if(!isMovieEntry(value)) return false;
  if(value.seasons == null) return true;
  if(!Array.isArray(value.seasons)) return false;
  return value.seasons.every(season => isPlainObject(season));
}

function sanitizeMovieEntry(entry){
  const result = cloneWithDefaults(entry, MOVIE_DEFAULTS);
  result.title = result.title.trim();
  result.ratingKey = String(entry.ratingKey).trim();
  const thumbValue = typeof result.thumb === 'string' ? result.thumb : '';
  const thumbFileValue = typeof result.thumbFile === 'string' ? result.thumbFile : '';
  result.thumb = thumbValue;
  result.thumbFile = thumbFileValue || thumbValue;
  result.summary = typeof result.summary === 'string' ? result.summary : '';
  result.href = typeof result.href === 'string' ? result.href : '';
  result.tagline = typeof result.tagline === 'string' ? result.tagline : '';
  result.genres = ensureArrayOfStrings(result.genres);
  return result;
}

function sanitizeShowEntry(entry){
  const result = cloneWithDefaults(entry, SHOW_DEFAULTS);
  result.title = result.title.trim();
  result.ratingKey = String(entry.ratingKey).trim();
  const thumbValue = typeof result.thumb === 'string' ? result.thumb : '';
  const thumbFileValue = typeof result.thumbFile === 'string' ? result.thumbFile : '';
  result.thumb = thumbValue;
  result.thumbFile = thumbFileValue || thumbValue;
  result.summary = typeof result.summary === 'string' ? result.summary : '';
  result.href = typeof result.href === 'string' ? result.href : '';
  result.tagline = typeof result.tagline === 'string' ? result.tagline : '';
  result.genres = ensureArrayOfStrings(result.genres);
  if(Array.isArray(entry.seasons)){
    result.seasons = entry.seasons
      .filter(isPlainObject)
      .map(season => {
        const seasonCopy = { ...season };
        seasonCopy.episodes = Array.isArray(season.episodes)
          ? season.episodes.filter(isPlainObject).map(episode => ({ ...episode }))
          : [];
        if(typeof seasonCopy.thumb !== 'string') seasonCopy.thumb = '';
        if(typeof seasonCopy.thumbFile !== 'string') seasonCopy.thumbFile = '';
        return seasonCopy;
      });
  }else{
    result.seasons = [];
  }
  return result;
}

export function validateLibraryList(data, kind = 'movie'){
  const schema = kind === 'show' ? SHOW_LIST_SCHEMA : MOVIE_LIST_SCHEMA;
  validateAgainstSchema(data, schema, `${kind}List`);
  if(!Array.isArray(data)){
    throw new Error('Datensatz ist keine Liste.');
  }
  const guard = kind === 'show' ? isShowEntry : isMovieEntry;
  const sanitizer = kind === 'show' ? sanitizeShowEntry : sanitizeMovieEntry;
  return data.map((entry, index) => {
    if(!guard(entry)){
      console.warn(`${LOG_PREFIX} Ungültiger ${kind}-Eintrag an Index ${index}:`, entry);
      throw new Error(`Ungültiger ${kind}-Eintrag an Index ${index}.`);
    }
    return sanitizer(entry);
  });
}

export const __TEST_INTERNALS__ = {
  MOVIE_DEFAULTS,
  SHOW_DEFAULTS,
  MOVIE_ITEM_SCHEMA,
  SHOW_ITEM_SCHEMA,
  MOVIE_LIST_SCHEMA,
  SHOW_LIST_SCHEMA,
  validateAgainstSchema,
};
