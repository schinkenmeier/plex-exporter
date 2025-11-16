import { getState } from '../../core/state.js';
import { openMovieDetailV3, openSeriesDetailV3 } from '../modal/modalV3/index.js';
import { humanYear, formatRating } from '../../js/utils.js';
import { prefixThumbValue } from '../../js/data.js';
import * as HeroPipeline from './pipeline.js';

const NUMBER_FORMAT = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-US') : { format: (value)=>String(value) };

let currentHeroEntry = null;
let heroDefaults = null;
let navigateToHashHandler = null;
let lastFallbackReason = null;

const HERO_FALLBACK_COPY = {
  default: {
    title: 'Highlights vorübergehend nicht verfügbar',
    tagline: 'Das Highlight-Banner wird gerade aktualisiert.',
    overview: 'Wir laden die Auswahl im Hintergrund neu. Du kannst in der Zwischenzeit wie gewohnt weiterstöbern.'
  },
  error: {
    title: 'Highlights pausiert',
    tagline: 'Beim Aktualisieren der Highlights ist ein Fehler aufgetreten.',
    overview: 'Wir versuchen es automatisch erneut oder du startest die Aktualisierung über die Einstellungen manuell.'
  }
};

const HERO_MEDIA_PLACEHOLDER_MESSAGES = {
  empty: 'Kein Hintergrundbild verfügbar',
  poster: 'Poster wird als Hintergrund verwendet'
};

export function setCurrentHeroItem(item){
  currentHeroEntry = item || null;
  return currentHeroEntry;
}

export function getCurrentHeroItem(){
  return currentHeroEntry;
}

export function getHeroFallbackReason(){
  return lastFallbackReason;
}

export function setHeroDefaults(defaults){
  heroDefaults = defaults ? { ...defaults } : null;
  return heroDefaults;
}

export function getHeroDefaults(){
  return heroDefaults;
}

export function ensureHeroDefaults(){
  if(heroDefaults) return heroDefaults;
  const defaults = {
    title: document.getElementById('heroTitle')?.textContent?.trim() || '',
    tagline: document.getElementById('heroTagline')?.textContent?.trim() || '',
    overview: document.getElementById('heroOverview')?.textContent?.trim() || '',
    cta: document.getElementById('heroCta')?.textContent?.trim() || ''
  };
  heroDefaults = defaults;
  return defaults;
}

export function setHeroNavigation(handler){
  navigateToHashHandler = typeof handler === 'function' ? handler : null;
}

export function showHeroFallback(reason = 'default', overrides = {}){
  const hero = document.getElementById('hero');
  const heroTitle = document.getElementById('heroTitle');
  const heroTagline = document.getElementById('heroTagline');
  const heroOverview = document.getElementById('heroOverview');
  const heroCta = document.getElementById('heroCta');
  const heroMeta = document.getElementById('heroMeta');
  const metaPrimary = document.getElementById('heroMetaPrimary');
  const metaSecondary = document.getElementById('heroMetaSecondary');
  const metaTertiary = document.getElementById('heroMetaTertiary');
  const heroPicture = document.getElementById('heroPicture');
  const heroImage = document.getElementById('heroBackdropImage');
  const heroSourceLarge = document.getElementById('heroBackdropLarge');
  const heroSourceMedium = document.getElementById('heroBackdropMedium');
  const heroMediaPlaceholder = document.getElementById('heroMediaPlaceholder');

  if(!hero || !heroTitle || !heroTagline || !heroOverview || !heroCta || !heroMeta) return false;

  const defaults = ensureHeroDefaults();
  const copy = { ...HERO_FALLBACK_COPY.default, ...(HERO_FALLBACK_COPY[reason] || {}), ...(overrides || {}) };

  setCurrentHeroItem(null);
  lastFallbackReason = reason;

  hero.dataset.heroKind = 'fallback';
  hero.dataset.heroId = '';
  hero.dataset.state = 'fallback';
  hero.dataset.heroFocus = 'center';
  hero.classList.remove('hero--has-media');
  clearPicture(heroPicture, heroImage, heroSourceLarge, heroSourceMedium);
  updateHeroMediaPlaceholder(heroMediaPlaceholder, 'hidden');

  heroTitle.textContent = copy.title || defaults.title;

  const taglineText = copy.tagline || '';
  heroTagline.textContent = taglineText || defaults.tagline;
  heroTagline.hidden = !taglineText;
  heroTagline.dataset.taglinePaused = '0';
  delete heroTagline.dataset.heroBound;
  heroTagline.classList.remove('is-fading');

  const overviewText = copy.overview || '';
  heroOverview.textContent = overviewText;
  heroOverview.hidden = !overviewText;

  const ctaLabel = copy.cta || defaults.cta || heroCta.textContent || 'Browse featured titles';
  heroCta.textContent = ctaLabel;
  const ctaEnabled = typeof copy.ctaAction === 'function' && copy.ctaEnabled === true;
  heroCta.disabled = !ctaEnabled;
  heroCta.setAttribute('aria-disabled', ctaEnabled ? 'false' : 'true');
  if(ctaEnabled){
    heroCta.onclick = () => { try { copy.ctaAction(); } catch (err) { console.warn('[hero] Fallback CTA failed:', err?.message || err); } };
    heroCta.setAttribute('aria-label', copy.ctaLabel || ctaLabel);
  } else {
    heroCta.onclick = null;
    heroCta.removeAttribute('aria-label');
  }

  heroMeta.hidden = true;
  if(metaPrimary) metaPrimary.innerHTML = '';
  if(metaSecondary) metaSecondary.innerHTML = '';
  if(metaTertiary) metaTertiary.innerHTML = '';

  return true;
}

export function refreshHero(listOverride){
  const hero = document.getElementById('hero');
  const heroTitle = document.getElementById('heroTitle');
  const heroTagline = document.getElementById('heroTagline');
  const heroOverview = document.getElementById('heroOverview');
  const heroCta = document.getElementById('heroCta');
  const heroMeta = document.getElementById('heroMeta');
  const metaPrimary = document.getElementById('heroMetaPrimary');
  const metaSecondary = document.getElementById('heroMetaSecondary');
  const metaTertiary = document.getElementById('heroMetaTertiary');
  const heroPicture = document.getElementById('heroPicture');
  const heroImage = document.getElementById('heroBackdropImage');
  const heroSourceLarge = document.getElementById('heroBackdropLarge');
  const heroSourceMedium = document.getElementById('heroBackdropMedium');
  const heroMediaPlaceholder = document.getElementById('heroMediaPlaceholder');

  if(!hero || !heroTitle || !heroTagline || !heroOverview || !heroCta || !heroMeta) return;

  const defaults = ensureHeroDefaults();
  const candidate = selectHeroEntry(listOverride);

  if(!candidate){
    setCurrentHeroItem(null);
    lastFallbackReason = null;
  hero.dataset.heroKind = '';
  hero.dataset.heroId = '';
  hero.dataset.state = 'empty';
  hero.dataset.heroFocus = 'center';
    hero.classList.remove('hero--has-media');
    clearPicture(heroPicture, heroImage, heroSourceLarge, heroSourceMedium);
    updateHeroMediaPlaceholder(heroMediaPlaceholder, 'hidden');
    heroTitle.textContent = defaults.title;
    heroTagline.textContent = defaults.tagline;
    heroTagline.hidden = !defaults.tagline;
    heroTagline.dataset.taglinePaused = '0';
    delete heroTagline.dataset.heroBound;
    heroTagline.classList.remove('is-fading');
    heroOverview.textContent = defaults.overview;
    heroOverview.hidden = !defaults.overview;
    heroCta.textContent = defaults.cta || 'View details';
    heroCta.disabled = true;
    heroCta.setAttribute('aria-disabled', 'true');
    heroCta.removeAttribute('aria-label');
    heroCta.onclick = null;
    heroMeta.hidden = true;
    if(metaPrimary) metaPrimary.innerHTML = '';
    if(metaSecondary) metaSecondary.innerHTML = '';
    if(metaTertiary) metaTertiary.innerHTML = '';
    return;
  }

  const normalized = ensureNormalizedEntry(candidate);
  if(!normalized){
    return refreshHero([]);
  }

  setCurrentHeroItem(normalized);
  lastFallbackReason = null;

  const kind = normalized.type === 'tv' ? 'show' : 'movie';
  const targetId = normalized.cta?.id || normalized.id || '';

  hero.dataset.heroKind = kind;
  hero.dataset.heroId = targetId;
  hero.dataset.state = 'ready';
  hero.dataset.heroFocus = 'center';

  heroTitle.textContent = normalized.title || defaults.title;

  if(heroTagline){
    const tagline = normalized.tagline || '';
    heroTagline.textContent = tagline;
    heroTagline.hidden = !tagline;
    heroTagline.dataset.taglinePaused = tagline ? '1' : '0';
    if(tagline) heroTagline.dataset.heroBound = '1';
    else delete heroTagline.dataset.heroBound;
    heroTagline.classList.remove('is-fading');
  }

  if(heroOverview){
    const overview = normalized.overview || '';
    heroOverview.textContent = overview;
    heroOverview.hidden = !overview;
  }

  const ctaLabel = normalized.cta?.label || (kind === 'show' ? 'View show details' : 'View movie details');
  heroCta.textContent = ctaLabel;
  heroCta.disabled = false;
  heroCta.setAttribute('aria-disabled', 'false');
  heroCta.setAttribute('aria-label', normalized.title ? `${ctaLabel}: ${normalized.title}` : ctaLabel);
  heroCta.onclick = () => openHeroModal(normalized);

  renderMeta(metaPrimary, metaSecondary, metaTertiary, heroMeta, normalized);
  renderMedia(hero, heroPicture, heroImage, heroSourceLarge, heroSourceMedium, normalized, heroMediaPlaceholder);
}

function selectHeroEntry(listOverride){
  if(Array.isArray(listOverride) && listOverride.length){
    const normalizedOverride = ensureNormalizedList(listOverride);
    if(normalizedOverride.length){
      return chooseHeroCandidate(normalizedOverride);
    }
  }

  const source = heroCandidatesFromState();
  if(!source.length) return null;
  return chooseHeroCandidate(source);
}

function ensureNormalizedList(list){
  if(!Array.isArray(list)) return [];
  const normalized = [];
  list.forEach(item => {
    if(!isPlayableHeroItem(item)) return;
    const entry = ensureNormalizedEntry(item);
    if(entry) normalized.push(entry);
  });
  return normalized;
}

function isPlayableHeroItem(item){
  if(!item || typeof item !== 'object') return false;
  if(item.isCollectionGroup) return false;
  if(item.disableHero) return false;
  const type = typeof item.type === 'string' ? item.type.toLowerCase() : '';
  if(type === 'collection') return false;
  return true;
}

function chooseHeroCandidate(list){
  if(list.length === 1) return list[0];
  const index = Math.floor(Math.random() * list.length);
  const candidate = list[index];
  if(currentHeroEntry && list.length > 1 && candidate && currentHeroEntry && candidate.id === currentHeroEntry.id){
    const alt = list.find(item => item && item.id !== currentHeroEntry.id);
    return alt || candidate;
  }
  return candidate;
}

function heroCandidatesFromState(){
  const state = getState();
  const view = state.view === 'shows' ? 'series' : 'movies';
  const fromPipeline = HeroPipeline.getPool(view);
  const normalizedPipeline = ensureNormalizedList(fromPipeline);
  if(normalizedPipeline.length) return normalizedPipeline;

  const filtered = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : null;
  const pool = filtered || (view === 'series' ? state.shows : state.movies) || [];
  return ensureNormalizedList(pool);
}

function ensureNormalizedEntry(item){
  if(!item || typeof item !== 'object') return null;
  if(isNormalized(item)){
    return { ...item, cta: item.cta ? { ...item.cta } : null };
  }
  return normalizeLegacyItem(item);
}

function isNormalized(item){
  if(!item || typeof item !== 'object') return false;
  const ctaId = item?.cta?.id || item?.heroId;
  return Boolean(item.title && ctaId);
}

function normalizeLegacyItem(raw){
  if(!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'tv' ? 'tv' : 'movie';
  const title = String(raw.title || raw.name || '').trim();
  if(!title) return null;

  const ids = collectIds(raw);
  const targetId = ids.imdb || ids.ratingKey || ids.slug || ids.guid || '';
  if(!targetId) return null;

  const year = parseYear(raw);
  const runtime = parseRuntime(raw, type);
  const rating = parseRating(raw);
  const genres = collectGenres(raw);
  const certification = parseCertification(raw);
  const overview = parseOverview(raw);
  const tagline = parseTagline(raw);
  const backdrops = collectLegacyBackdrops(raw, type);

  const cta = {
    id: targetId,
    kind: type === 'tv' ? 'show' : 'movie',
    label: type === 'tv' ? 'View show details' : 'View movie details',
    target: `#/${type === 'tv' ? 'show' : 'movie'}/${targetId}`
  };

  return {
    id: ids.ratingKey || `${type}-${targetId}`,
    type,
    title,
    tagline,
    overview,
    year,
    runtime,
    rating,
    genres,
    certification,
    cta,
    ids,
    backdrops
  };
}

function collectIds(raw){
  const ids = {};
  if(raw?.ids && typeof raw.ids === 'object'){
    Object.entries(raw.ids).forEach(([key, value]) => {
      if(value == null) return;
      const normalizedKey = String(key).trim();
      if(!normalizedKey) return;
      const lower = normalizedKey.toLowerCase();
      if(lower === 'tmdb' || lower === 'themoviedb') return;
      ids[normalizedKey] = String(value);
    });
  }
  if(raw?.ratingKey != null) ids.ratingKey = String(raw.ratingKey);
  if(raw?.guid) ids.guid = String(raw.guid);
  return ids;
}

function parseYear(raw){
  const year = humanYear(raw);
  return year ? Number(year) : null;
}

function parseRuntime(raw, type){
  const minutes = raw?.runtimeMin ?? raw?.durationMin ?? (raw?.duration ? Math.round(Number(raw.duration) / 60000) : null);
  if(!Number.isFinite(minutes) || minutes <= 0) return null;
  if(type === 'tv') return Math.max(1, Math.round(minutes));
  return Math.max(1, Math.round(minutes));
}

function parseRating(raw){
  const rating = Number(raw?.rating ?? raw?.audienceRating);
  return Number.isFinite(rating) ? rating : null;
}

function collectGenres(raw){
  const source = Array.isArray(raw?.genres) ? raw.genres : [];
  const names = [];
  source.forEach(entry => {
    if(!entry) return;
    if(typeof entry === 'string'){
      const trimmed = entry.trim();
      if(trimmed) names.push(trimmed);
      return;
    }
    const name = entry.tag || entry.title || entry.name || entry.label || '';
    if(name) names.push(name);
  });
  return Array.from(new Set(names));
}

function parseCertification(raw){
  const rating = typeof raw?.contentRating === 'string' ? raw.contentRating.trim() : '';
  if(!rating) return '';
  const segments = rating.split('/');
  const last = segments[segments.length - 1];
  return last ? last.trim() : rating;
}

function parseOverview(raw){
  const sources = [raw?.summary, raw?.plot, raw?.description, raw?.tagline];
  for(const value of sources){
    if(typeof value !== 'string') continue;
    const trimmed = value.trim();
    if(trimmed) return trimmed;
  }
  return '';
}

function parseTagline(raw){
  const sources = [raw?.tagline];
  for(const value of sources){
    if(typeof value !== 'string') continue;
    const trimmed = value.trim();
    if(trimmed) return trimmed;
  }
  return '';
}

function normalizeBackdropPath(candidate, typeKey){
  if(typeof candidate !== 'string') return '';
  const trimmed = candidate.trim();
  if(!trimmed) return '';
  if(trimmed.startsWith('data:')) return trimmed;
  if(trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if(trimmed.startsWith('//')) return `https:${trimmed}`;
  try{
    const resolved = prefixThumbValue(trimmed, typeKey);
    if(resolved) return resolved;
  }catch(err){
    console.warn('[Hero] Failed to normalize backdrop path', { value: trimmed, error: err?.message || err });
  }
  return trimmed;
}

function normalizeBackdropList(values, type){
  const typeKey = type === 'tv' ? 'series' : 'movies';
  const seen = new Set();
  const result = [];
  values.forEach(value => {
    if(value == null) return;
    const normalized = normalizeBackdropPath(value, typeKey);
    if(!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function collectLegacyBackdrops(raw, type){
  const localCandidates = [
    raw?.art,
    raw?.background,
    raw?.thumbBackground,
    raw?.coverArt,
    raw?.thumb,
    raw?.thumbFile,
    ...(Array.isArray(raw?.backdrops) ? raw.backdrops : [])
  ];
  return normalizeBackdropList(localCandidates, type);
}

function resolveEntryBackdrops(entry){
  if(!entry || typeof entry !== 'object') return [];
  const type = entry.type === 'tv' ? 'tv' : 'movie';
  const candidates = [
    ...(Array.isArray(entry.backdrops) ? entry.backdrops : []),
    typeof entry.backdrop === 'string' ? entry.backdrop : null,
    typeof entry?.images?.backdrop === 'string' ? entry.images.backdrop : null
  ];
  return normalizeBackdropList(candidates, type);
}

function resolvePosterFallback(entry){
  if(!entry || typeof entry !== 'object') return '';
  const type = entry.type === 'tv' ? 'tv' : 'movie';
  const [poster] = normalizeBackdropList([entry.poster], type);
  return poster || '';
}

function renderMeta(primaryRoot, secondaryRoot, tertiaryRoot, container, entry){
  const rows = buildMetaRows(entry);
  const [primary = [], secondary = [], tertiary = []] = rows;

  renderMetaRow(primaryRoot, primary);
  renderMetaRow(secondaryRoot, secondary);
  renderMetaRow(tertiaryRoot, tertiary);

  const hasContent = primary.length || secondary.length || tertiary.length;
  container.hidden = !hasContent;
}

function buildMetaRows(entry){
  const rows = [];
  const primary = [];
  if(Number.isFinite(entry.year)) primary.push({ text: String(entry.year), label: 'Release year' });
  if(Number.isFinite(entry.runtime)){
    const runtimeText = entry.type === 'tv' ? `${entry.runtime} min/ep` : formatRuntime(entry.runtime);
    primary.push({ text: runtimeText, label: entry.type === 'tv' ? 'Episode runtime' : 'Runtime' });
  }
  if(entry.certification){
    primary.push({ text: entry.certification, label: 'Certification', kind: 'certification' });
  }
  if(primary.length) rows.push(primary);

  const secondary = [];
  if(entry.rating != null){
    const ratingValue = formatRating(entry.rating);
    secondary.push({ text: `★ ${ratingValue}`, label: `Average rating ${ratingValue} out of 10`, kind: 'rating' });
  }
  if(entry.voteCount != null){
    const votes = NUMBER_FORMAT.format(entry.voteCount);
    secondary.push({ text: `${votes} votes`, label: `${votes} votes recorded` });
  }
  if(entry.type === 'tv'){
    const parts = [];
    if(Number.isFinite(entry.seasons) && entry.seasons > 0){
      parts.push(`${entry.seasons} ${entry.seasons === 1 ? 'Season' : 'Seasons'}`);
    }
    if(Number.isFinite(entry.episodes) && entry.episodes > 0){
      parts.push(`${entry.episodes} ${entry.episodes === 1 ? 'Episode' : 'Episodes'}`);
    }
    if(parts.length){
      secondary.push({ text: parts.join(' • '), label: 'Episode availability' });
    }
  }
  if(secondary.length) rows.push(secondary);

  const tertiary = [];
  if(Array.isArray(entry.genres)){
    entry.genres.slice(0, 3).forEach(genre => {
      const text = typeof genre === 'string' ? genre : '';
      if(text) tertiary.push({ text, label: `Genre: ${text}` });
    });
  }
  if(tertiary.length) rows.push(tertiary);

  return rows;
}

function renderMetaRow(root, items){
  if(!root){
    return;
  }
  if(!items || !items.length){
    root.innerHTML = '';
    root.hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const badge = document.createElement('span');
    badge.className = 'hero__badge';
    if(item.kind === 'certification') badge.classList.add('hero__badge--certification');
    if(item.kind === 'rating') badge.classList.add('hero__badge--rating');
    badge.textContent = item.text;
    if(item.label) badge.setAttribute('aria-label', item.label);
    fragment.appendChild(badge);
  });
  root.replaceChildren(fragment);
  root.hidden = false;
}

function renderMedia(hero, picture, image, sourceLarge, sourceMedium, entry, placeholder){
  const backdrops = resolveEntryBackdrops(entry);
  const primary = backdrops[0] || '';
  const posterFallback = resolvePosterFallback(entry);

  console.log('[Hero] renderMedia called with entry:', {
    title: entry?.title,
    normalizedBackdrops: backdrops,
    primary,
    posterFallback,
    originalBackdrops: entry?.backdrops,
    singleBackdrop: entry?.backdrop
  });

  if(!picture || !image){
    const hasMedia = Boolean(primary);
    hero.classList.toggle('hero--has-media', hasMedia);
    if(hasMedia){
      updateHeroMediaPlaceholder(placeholder, 'hidden');
    } else if(posterFallback){
      updateHeroMediaPlaceholder(placeholder, 'poster');
    } else {
      updateHeroMediaPlaceholder(placeholder, 'empty');
    }
    return;
  }

  if(!primary){
    console.warn('[Hero] No primary backdrop found, attempting fallback sources');
    if(posterFallback){
      try{
        hero.classList.add('hero--has-media');
        applyHeroFocus(hero, 'center');
        updateHeroMediaPlaceholder(placeholder, 'poster');
        setSource(sourceLarge, posterFallback);
        setSource(sourceMedium, posterFallback);
        image.src = posterFallback;
        image.alt = entry?.title ? `${entry.title} Poster` : 'Poster fallback';
        image.removeAttribute('hidden');
        picture.hidden = false;
        return;
      }catch(err){
        console.error('[Hero] Failed to apply poster fallback for hero media:', err?.message || err);
      }
    }
    updateHeroMediaPlaceholder(placeholder, 'empty');
    applyHeroFocus(hero, 'center');
    console.warn('[Hero] No backdrop available for:', entry?.title);
    clearPicture(picture, image, sourceLarge, sourceMedium);
    hero.classList.remove('hero--has-media');
    return;
  }

  try{
    hero.classList.add('hero--has-media');
    applyHeroFocus(hero, resolveFocusFromSource(primary));
    updateHeroMediaPlaceholder(placeholder, 'hidden');
    setSource(sourceLarge, primary);
    setSource(sourceMedium, primary);
    image.src = primary;
    image.alt = entry?.title ? `${entry.title} backdrop` : 'Hero backdrop';
    image.removeAttribute('hidden');
    picture.hidden = false;
  }catch(err){
    console.error('[Hero] Failed to render hero backdrop, clearing media', err?.message || err);
    updateHeroMediaPlaceholder(placeholder, 'empty');
    clearPicture(picture, image, sourceLarge, sourceMedium);
    hero.classList.remove('hero--has-media');
  }
}

function setSource(node, value){
  if(!node) return;
  if(value){
    node.srcset = `${value} 1920w`;
  } else {
    node.removeAttribute('srcset');
  }
}

function clearPicture(picture, image, sourceLarge, sourceMedium){
  if(sourceLarge) sourceLarge.removeAttribute('srcset');
  if(sourceMedium) sourceMedium.removeAttribute('srcset');
  if(image){
    image.removeAttribute('src');
    image.setAttribute('hidden', '');
  }
  if(picture) picture.hidden = true;
}

function updateHeroMediaPlaceholder(placeholder, state){
  if(!placeholder) return;
  const nextState = state || 'hidden';
  const label = placeholder.querySelector('[data-placeholder-text]') || placeholder;
  if(nextState === 'hidden'){
    placeholder.hidden = true;
    placeholder.dataset.state = 'hidden';
    placeholder.setAttribute('aria-hidden', 'true');
    if(label && label !== placeholder) label.textContent = '';
    return;
  }
  const message = HERO_MEDIA_PLACEHOLDER_MESSAGES[nextState] || HERO_MEDIA_PLACEHOLDER_MESSAGES.empty;
  if(label) label.textContent = message;
  placeholder.hidden = false;
  placeholder.dataset.state = nextState;
  placeholder.setAttribute('aria-hidden', 'false');
}

function applyHeroFocus(hero, focus){
  if(!hero) return;
  hero.dataset.heroFocus = focus || 'center';
}

function resolveFocusFromSource(url){
  if(!url) return 'center';
  if(/image\.tmdb\.org/i.test(url)){
    return 'right';
  }
  return 'center';
}

function formatRuntime(minutes){
  if(!Number.isFinite(minutes) || minutes <= 0) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if(hrs && mins){
    return `${hrs}h ${mins}m`;
  }
  if(hrs){
    return `${hrs}h`;
  }
  return `${mins}m`;
}

function openHeroModal(entry){
  const cta = entry?.cta;
  const kind = cta?.kind || (entry.type === 'tv' ? 'show' : 'movie');
  const id = cta?.id || entry.id;
  if(!kind || !id) return;
  navigateToItemHash(kind, id, cta?.target);
  if(kind === 'show') openSeriesDetailV3(id);
  else openMovieDetailV3(id);
}

function navigateToItemHash(kind, id, explicitTarget){
  if(!kind || !id) return;
  const hash = explicitTarget || `#/${kind}/${id}`;
  const replace = (window.location.hash || '') === hash;
  if(typeof navigateToHashHandler === 'function'){
    try{
      navigateToHashHandler(hash, { silent: true, replace });
      return;
    }catch(err){
      console.warn('[hero] Failed to navigate via handler:', err?.message);
    }
  }
  try{
    window.location.hash = hash;
  }catch(err){
    console.warn('[hero] Failed to update hash directly:', err?.message);
  }
}
