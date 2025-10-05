import { formatRating, humanYear } from '../utils.js';
import { runtimeText, studioText } from './headerSection.js';

function releaseDateText(item){
  const candidates = [
    item?.originallyAvailableAt,
    item?.releaseDate,
    item?.premiereDate,
    item?.firstAired,
    item?.airDate,
  ];
  for(const raw of candidates){
    const str = raw == null ? '' : String(raw).trim();
    if(!str) continue;
    const parsed = new Date(str);
    if(Number.isFinite(parsed.getTime())){
      try{
        return parsed.toLocaleDateString('de-DE', { year:'numeric', month:'2-digit', day:'2-digit' });
      }catch(err){
        console.warn('[modal/detailsSection] Failed to format release date:', err?.message || err);
      }
    }
    const iso = str.match(/^\d{4}-\d{2}-\d{2}/);
    if(iso && iso[0]) return iso[0];
    if(str.length >= 4) return str.slice(0, 10);
  }
  const year = humanYear(item);
  return year ? String(year) : '';
}

function namesFromList(source){
  if(!Array.isArray(source)) return [];
  return source.map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
}

function genresFromItem(item){
  const arr = Array.isArray(item?.genres) ? item.genres : [];
  const mapped = arr.map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
  return Array.from(new Set(mapped));
}

function formatOptionalRating(value){
  if(value instanceof Number){
    return formatOptionalRating(value.valueOf());
  }
  if(typeof value === 'number'){
    return Number.isFinite(value) ? formatRating(value) : '';
  }
  if(typeof value === 'string'){
    const trimmed = value.trim();
    if(!trimmed) return '';
    const num = Number(trimmed);
    return Number.isFinite(num) ? formatRating(num) : '';
  }
  return '';
}

export function updateDetails(root, item){
  const pane = root.querySelector('.v2-details');
  if(!pane) return;
  pane.replaceChildren();

  const grid = document.createElement('div');
  grid.className = 'v2-details-grid';

  const general = [];
  const release = releaseDateText(item);
  if(release) general.push(['Veröffentlichung', release]);
  const runtime = runtimeText(item);
  if(runtime) general.push(['Laufzeit', runtime]);
  const studio = studioText(item);
  if(studio) general.push(['Studio', studio]);
  const certification = (item?.contentRating || '').trim();
  if(certification) general.push(['Freigabe', certification]);

  const critic = formatOptionalRating(item?.rating);
  const audience = formatOptionalRating(item?.audienceRating);
  const user = formatOptionalRating(item?.userRating);
  if(critic){
    general.push(['Bewertung', `★ ${critic}`]);
    if(audience && audience !== critic) general.push(['Publikum', `★ ${audience}`]);
  }else if(audience){
    general.push(['Bewertung', `★ ${audience}`]);
  }
  if(user) general.push(['Eigene Wertung', `★ ${user}`]);

  if(item?.type === 'tv'){
    const numericSeasons = Number(item?.seasonCount);
    const seasonCount = Number.isFinite(numericSeasons) ? numericSeasons : (Array.isArray(item?.seasons) ? item.seasons.length : null);
    if(Number.isFinite(seasonCount) && seasonCount > 0){
      general.push(['Staffeln', String(seasonCount)]);
    }
    const episodeCount = Array.isArray(item?.seasons) ? item.seasons.reduce((sum, season)=>{
      if(!season) return sum;
      const eps = Array.isArray(season.episodes) ? season.episodes.length : 0;
      return sum + (Number.isFinite(eps) ? eps : 0);
    }, 0) : null;
    if(Number.isFinite(episodeCount) && episodeCount > 0){
      general.push(['Episoden', String(episodeCount)]);
    }
  }

  const countries = namesFromList(item?.countries);
  if(countries.length) general.push(['Länder', countries.join(', ')]);
  const collections = namesFromList(item?.collections);
  if(collections.length) general.push(['Sammlungen', collections.join(', ')]);
  const labels = namesFromList(item?.labels);
  if(labels.length) general.push(['Labels', labels.join(', ')]);
  if(item?.editionTitle) general.push(['Edition', item.editionTitle]);
  if(item?.originalTitle && item.originalTitle !== item.title) general.push(['Originaltitel', item.originalTitle]);

  if(general.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'general';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Allgemein';
    const list = document.createElement('dl');
    list.className = 'v2-details-list';
    general.forEach(([label, value])=>{
      if(!label || !value) return;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    });
    if(list.childElementCount){
      section.append(heading, list);
      grid.append(section);
    }
  }

  const genres = genresFromItem(item);
  if(genres.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'genres';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Genres';
    const chips = document.createElement('div');
    chips.className = 'v2-chip-group';
    genres.forEach(name=>{
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = name;
      chips.appendChild(span);
    });
    section.append(heading, chips);
    grid.append(section);
  }

  const crew = [];
  const directors = namesFromList(item?.directors);
  if(directors.length) crew.push(['Regie', directors.join(', ')]);
  const writers = namesFromList(item?.writers);
  if(writers.length) crew.push(['Drehbuch', writers.join(', ')]);
  const producers = namesFromList(item?.producers);
  if(producers.length) crew.push(['Produktion', producers.join(', ')]);
  const creators = namesFromList(item?.creators || item?.showrunners);
  if(item?.type === 'tv' && creators.length) crew.push(['Creator', creators.join(', ')]);

  if(crew.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'crew';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Credits';
    const list = document.createElement('dl');
    list.className = 'v2-details-list';
    crew.forEach(([label, value])=>{
      if(!label || !value) return;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    });
    if(list.childElementCount){
      section.append(heading, list);
      grid.append(section);
    }
  }

  if(grid.childElementCount){
    pane.appendChild(grid);
  }else{
    const fallback = document.createElement('p');
    fallback.className = 'v2-details-empty';
    fallback.textContent = 'Keine zusätzlichen Details verfügbar.';
    pane.appendChild(fallback);
  }
}
