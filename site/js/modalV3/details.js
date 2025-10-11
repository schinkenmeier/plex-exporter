import { runtimeText, ratingText, studioText } from './formatting.js';

function ensureContainer(target){
  if(!target) return null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(elementCtor && target instanceof elementCtor) return target;
  if(elementCtor && target.content instanceof elementCtor) return target.content;
  if(elementCtor && target.root instanceof elementCtor) return target.root;
  return null;
}

function toArray(value){
  if(Array.isArray(value)) return value;
  if(value == null) return [];
  return [value];
}

function cleanString(value){
  if(value == null) return '';
  const str = String(value);
  return str.trim();
}

function resolveBaseItem(viewModel){
  if(!viewModel) return null;
  const item = viewModel.item || {};
  const tmdbDetail = viewModel.tmdb || item.tmdbDetail || null;
  const type = viewModel.kind === 'show' ? 'tv' : item.type;
  return { ...item, tmdbDetail, type };
}

function deriveMeta(viewModel){
  const baseItem = resolveBaseItem(viewModel);
  return {
    runtime: cleanString(viewModel?.meta?.runtime) || (baseItem ? runtimeText(baseItem) : ''),
    rating: cleanString(viewModel?.meta?.rating) || (baseItem ? ratingText(baseItem) : ''),
    tmdbRating: cleanString(viewModel?.meta?.tmdbRating),
    studio: cleanString(viewModel?.meta?.studio) || (baseItem ? studioText(baseItem) : ''),
    contentRating: cleanString(viewModel?.meta?.contentRating),
    seasonCount: viewModel?.meta?.seasonCount ?? null,
  };
}

function mergeUniqueStrings(...lists){
  const result = [];
  const seen = new Set();
  lists.forEach(list => {
    toArray(list).forEach(entry => {
      const str = cleanString(entry);
      if(!str) return;
      const key = str.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      result.push(str);
    });
  });
  return result;
}

function namesFromList(source){
  if(!source) return [];
  return mergeUniqueStrings(toArray(source).map(entry => {
    if(entry == null) return '';
    if(typeof entry === 'string') return entry;
    return entry?.name || entry?.title || entry?.tag || entry?.label || '';
  }));
}

function crewByJob(detail, jobs){
  const jobSet = new Set(toArray(jobs).map(job => cleanString(job).toLowerCase()).filter(Boolean));
  if(!jobSet.size) return [];
  const crew = toArray(detail?.credits?.crew);
  const matches = crew.filter(member => {
    if(!member) return false;
    const job = cleanString(member.job).toLowerCase();
    return job && jobSet.has(job);
  }).map(member => member?.name || member?.original_name || member?.originalName || '');
  return mergeUniqueStrings(matches);
}

function creatorsFromDetail(detail){
  const createdBy = detail?.createdBy || detail?.created_by;
  return namesFromList(createdBy);
}

function formatSeasonCount(value){
  const num = Number(value);
  if(!Number.isFinite(num) || num <= 0) return '';
  return num === 1 ? '1 Staffel' : `${num} Staffeln`;
}

function gatherLanguages(viewModel){
  const languages = [];
  const seen = new Set();
  const add = value => {
    const str = cleanString(value);
    if(!str) return;
    const key = str.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    languages.push(str);
  };

  const tmdb = viewModel?.tmdb || viewModel?.item?.tmdbDetail || null;
  const spoken = tmdb?.spokenLanguages || tmdb?.spoken_languages;
  toArray(spoken).forEach(entry => {
    if(!entry) return;
    add(entry?.name || entry?.englishName || entry?.iso_639_1 || entry);
  });

  toArray(viewModel?.item?.languages).forEach(add);
  toArray(viewModel?.item?.audioLanguages).forEach(add);
  toArray(viewModel?.item?.audio_language).forEach(add);
  add(viewModel?.item?.language);

  return languages;
}

function buildHighlightChips(viewModel){
  const chips = [];
  const meta = deriveMeta(viewModel);
  const studio = meta.studio;
  if(studio){
    chips.push({ label: viewModel?.kind === 'show' ? 'Netzwerk' : 'Studio', value: studio, key: 'studio' });
  }
  const release = cleanString(viewModel?.releaseDate) || cleanString(viewModel?.year);
  if(release) chips.push({ label: 'Veröffentlichung', value: release, key: 'release' });
  const rating = meta.rating || meta.tmdbRating;
  if(rating) chips.push({ label: 'Bewertung', value: rating, key: 'rating' });
  if(!chips.length) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'v3-chip-group';
  wrapper.dataset.v3DetailHighlights = '1';
  chips.forEach(entry => {
    const chip = document.createElement('span');
    chip.className = 'v3-chip';
    chip.dataset.detailKey = entry.key;
    chip.textContent = `${entry.label}: ${entry.value}`;
    chip.setAttribute('aria-label', `${entry.label}: ${entry.value}`);
    wrapper.appendChild(chip);
  });
  return wrapper;
}

function buildDefinitionSection(title, entries){
  if(!entries || !entries.length) return null;
  const section = document.createElement('section');
  section.dataset.v3DetailsSection = title.toLowerCase();
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);
  const list = document.createElement('dl');
  const nodeCtor = typeof Node !== 'undefined' ? Node : null;
  entries.forEach(entry => {
    const { term, value } = entry;
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    if(nodeCtor && value instanceof nodeCtor){
      dd.appendChild(value);
    }else{
      dd.textContent = String(value ?? '');
    }
    list.append(dt, dd);
  });
  section.appendChild(list);
  return section;
}

function gatherGeneralEntries(viewModel){
  const entries = [];
  const meta = deriveMeta(viewModel);
  const release = cleanString(viewModel?.releaseDate) || cleanString(viewModel?.year);
  if(release) entries.push({ term: 'Veröffentlichung', value: release });
  if(meta.runtime) entries.push({ term: 'Laufzeit', value: meta.runtime });
  if(meta.contentRating) entries.push({ term: 'Freigabe', value: meta.contentRating });
  const seasonCount = formatSeasonCount(meta.seasonCount);
  if(seasonCount) entries.push({ term: 'Staffeln', value: seasonCount });
  const genres = Array.isArray(viewModel?.genres) ? viewModel.genres.filter(Boolean) : [];
  if(genres.length) entries.push({ term: 'Genres', value: genres.join(', ') });
  const original = cleanString(viewModel?.originalTitle);
  if(original && original !== cleanString(viewModel?.title)){
    entries.push({ term: 'Originaltitel', value: original });
  }
  return entries;
}

function gatherCreditEntries(viewModel){
  const entries = [];
  const item = viewModel?.item || {};
  const detail = viewModel?.tmdb || item?.tmdbDetail || null;
  const directors = mergeUniqueStrings(namesFromList(item?.directors), crewByJob(detail, ['Director']));
  if(directors.length) entries.push({ term: 'Regie', value: directors.join(', ') });
  const writers = mergeUniqueStrings(namesFromList(item?.writers), crewByJob(detail, ['Writer', 'Screenplay', 'Story']));
  if(writers.length) entries.push({ term: 'Drehbuch', value: writers.join(', ') });
  const producers = mergeUniqueStrings(namesFromList(item?.producers), crewByJob(detail, ['Producer', 'Executive Producer']));
  if(producers.length) entries.push({ term: 'Produktion', value: producers.join(', ') });
  if(viewModel?.kind === 'show'){
    const creators = mergeUniqueStrings(namesFromList(item?.creators || item?.showrunners), creatorsFromDetail(detail));
    if(creators.length) entries.push({ term: 'Creator', value: creators.join(', ') });
  }
  return entries;
}

function buildLink(href){
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = href;
  return link;
}

function gatherMetadataEntries(viewModel){
  const entries = [];
  const tmdbUrl = cleanString(viewModel?.tmdbUrl);
  if(tmdbUrl) entries.push({ term: 'TMDB', value: buildLink(tmdbUrl) });
  const tmdbId = cleanString(viewModel?.tmdb?.id || viewModel?.item?.tmdbId || viewModel?.item?.ids?.tmdb);
  if(tmdbId) entries.push({ term: 'TMDB-ID', value: tmdbId });
  const imdbId = cleanString(viewModel?.item?.imdbId || viewModel?.item?.ids?.imdb || viewModel?.tmdb?.imdbId || viewModel?.tmdb?.externalIds?.imdbId);
  if(imdbId) entries.push({ term: 'IMDb-ID', value: imdbId });
  const ratingKey = cleanString(viewModel?.item?.ratingKey || viewModel?.item?.rating_key || viewModel?.item?.id);
  if(ratingKey) entries.push({ term: 'Plex-ID', value: ratingKey });
  const languages = gatherLanguages(viewModel);
  if(languages.length) entries.push({ term: 'Sprachen', value: languages.join(', ') });
  return entries;
}

export function renderDetails(target, viewModel){
  if(typeof document === 'undefined') return;
  const container = ensureContainer(target);
  if(!container) return;
  container.replaceChildren();

  const highlights = buildHighlightChips(viewModel || {});
  if(highlights) container.appendChild(highlights);

  const general = buildDefinitionSection('Allgemein', gatherGeneralEntries(viewModel || {}));
  if(general) container.appendChild(general);

  const credits = buildDefinitionSection('Credits', gatherCreditEntries(viewModel || {}));
  if(credits) container.appendChild(credits);

  const metadata = buildDefinitionSection('Metadaten', gatherMetadataEntries(viewModel || {}));
  if(metadata) container.appendChild(metadata);

  if(!container.childElementCount){
    const fallback = document.createElement('p');
    fallback.textContent = 'Keine Details verfügbar.';
    container.appendChild(fallback);
  }
}

export default renderDetails;
