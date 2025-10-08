import { formatRating, humanYear } from '../utils.js';
import { runtimeText, studioText } from './headerSection.js';

let headingIdCounter = 0;

function nextHeadingId(prefix){
  headingIdCounter += 1;
  const base = prefix ? `details-${prefix}` : 'details-card';
  return `${base}-${headingIdCounter}`;
}

function releaseDateText(item){
  const tmdb = item?.tmdbDetail;
  const candidates = [
    tmdb?.releaseDate,
    tmdb?.firstAirDate,
    tmdb?.lastAirDate,
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

function tmdbCrew(detail, jobs){
  if(!detail?.credits || !Array.isArray(detail.credits.crew)) return [];
  const jobSet = Array.isArray(jobs) ? new Set(jobs) : new Set([jobs]);
  const names = detail.credits.crew
    .filter(member => member && jobSet.has(member.job))
    .map(member => member.name || member.originalName || member.tag)
    .filter(Boolean);
  return Array.from(new Set(names));
}

function mergeNameLists(...lists){
  const seen = new Set();
  const result = [];
  lists.filter(Array.isArray).forEach(list => {
    list.forEach(name => {
      const trimmed = String(name || '').trim();
      if(!trimmed) return;
      const key = trimmed.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      result.push(trimmed);
    });
  });
  return result;
}

function contentRatingFromItem(item){
  const tmdb = (item?.tmdbDetail?.contentRating || '').trim();
  if(tmdb) return tmdb;
  return (item?.contentRating || '').trim();
}

function aggregateRatings(item){
  const ratings = [];
  const tmdb = item?.tmdbDetail;
  if(tmdb?.voteAverage){
    ratings.push(['TMDB', `★ ${formatOptionalRating(tmdb.voteAverage)}`]);
  }
  if(item?.rating){
    ratings.push(['Bewertung', `★ ${formatOptionalRating(item.rating)}`]);
  }
  if(item?.audienceRating){
    ratings.push(['Publikum', `★ ${formatOptionalRating(item.audienceRating)}`]);
  }
  if(item?.userRating){
    ratings.push(['Eigene Wertung', `★ ${formatOptionalRating(item.userRating)}`]);
  }
  return ratings;
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

function createCard(title, key){
  const section = document.createElement('section');
  section.className = 'v2-pane-card';
  section.dataset.section = key;
  section.setAttribute('role', 'group');

  const headingId = nextHeadingId(key);
  const heading = document.createElement('h3');
  heading.className = 'card-title';
  heading.id = headingId;
  heading.textContent = title;

  section.setAttribute('aria-labelledby', headingId);

  const content = document.createElement('div');
  content.className = 'card-content';

  section.append(heading, content);
  return { section, content };
}

function createFallback(text){
  const p = document.createElement('p');
  p.className = 'card-empty';
  p.textContent = text;
  return p;
}

function createGeneralCard(item){
  const { section, content } = createCard('Allgemein', 'general');
  const general = [];

  const release = releaseDateText(item);
  if(release) general.push(['Veröffentlichung', release]);
  const runtime = runtimeText(item);
  if(runtime) general.push(['Laufzeit', runtime]);
  const studio = studioText(item);
  if(studio) general.push(['Studio', studio]);
  const certification = contentRatingFromItem(item);
  if(certification) general.push(['Freigabe', certification]);

  aggregateRatings(item).forEach(entry => {
    const [label, value] = entry;
    if(label && value) general.push([label, value]);
  });

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

  const collections = mergeNameLists(
    namesFromList(item?.collections),
    item?.tmdbDetail?.collection?.name ? [item.tmdbDetail.collection.name] : []
  );
  if(collections.length) general.push(['Sammlungen', collections.join(', ')]);
  const labels = namesFromList(item?.labels);
  if(labels.length) general.push(['Labels', labels.join(', ')]);
  if(item?.editionTitle) general.push(['Edition', item.editionTitle]);
  if(item?.originalTitle && item.originalTitle !== item.title) general.push(['Originaltitel', item.originalTitle]);

  if(general.length){
    const list = document.createElement('dl');
    list.className = 'card-definition-list';
    general.forEach(([label, value])=>{
      if(!label || !value) return;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.append(dt, dd);
    });
    if(list.childElementCount){
      content.appendChild(list);
    }else{
      content.append(createFallback('Keine allgemeinen Details verfügbar.'));
    }
  }else{
    content.append(createFallback('Keine allgemeinen Details verfügbar.'));
  }

  return { section };
}

function createCreditsCard(item){
  const { section, content } = createCard('Credits', 'credits');
  const crew = [];
  const directors = mergeNameLists(
    namesFromList(item?.directors),
    tmdbCrew(item?.tmdbDetail, ['Director'])
  );
  if(directors.length) crew.push(['Regie', directors.join(', ')]);
  const writers = mergeNameLists(
    namesFromList(item?.writers),
    tmdbCrew(item?.tmdbDetail, ['Writer', 'Screenplay', 'Story'])
  );
  if(writers.length) crew.push(['Drehbuch', writers.join(', ')]);
  const producers = mergeNameLists(
    namesFromList(item?.producers),
    tmdbCrew(item?.tmdbDetail, ['Producer', 'Executive Producer'])
  );
  if(producers.length) crew.push(['Produktion', producers.join(', ')]);
  const creators = mergeNameLists(
    namesFromList(item?.creators || item?.showrunners),
    Array.isArray(item?.tmdbDetail?.createdBy) ? item.tmdbDetail.createdBy.map(entry => entry?.name || '') : []
  );
  if(item?.type === 'tv' && creators.length) crew.push(['Creator', creators.join(', ')]);

  if(crew.length){
    const grid = document.createElement('div');
    grid.className = 'credits-grid';
    crew.forEach(([label, value])=>{
      if(!label || !value) return;
      const card = document.createElement('div');
      card.className = 'credit-item';
      const term = document.createElement('p');
      term.className = 'credit-label';
      term.textContent = label;
      const val = document.createElement('p');
      val.className = 'credit-value';
      val.textContent = value;
      card.append(term, val);
      grid.appendChild(card);
    });
    if(grid.childElementCount){
      content.appendChild(grid);
    }else{
      content.append(createFallback('Keine Credits verfügbar.'));
    }
  }else{
    content.append(createFallback('Keine Credits verfügbar.'));
  }

  return { section };
}

function createCompaniesCard(item){
  const { section, content } = createCard('Produktionsfirmen', 'companies');
  const localStudios = mergeNameLists(
    namesFromList(item?.studios),
    item?.studio ? [item.studio] : []
  );
  const tmdbCompanies = namesFromList(item?.tmdbDetail?.productionCompanies);
  const companies = mergeNameLists(localStudios, tmdbCompanies);

  if(companies.length){
    const list = document.createElement('ul');
    list.className = 'card-list';
    companies.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      list.appendChild(li);
    });
    content.appendChild(list);
  }else{
    content.append(createFallback('Keine Produktionsfirmen hinterlegt.'));
  }

  return { section };
}

function createCountriesCard(item){
  const { section, content } = createCard('Länder', 'countries');
  const production = mergeNameLists(
    namesFromList(item?.countries),
    namesFromList(item?.tmdbDetail?.productionCountries)
  );
  const origin = mergeNameLists(
    Array.isArray(item?.tmdbDetail?.originCountry) ? item.tmdbDetail.originCountry : [],
    item?.country ? [item.country] : []
  );

  const blocks = [];
  if(production.length) blocks.push(['Produktion', production]);
  if(origin.length) blocks.push(['Original', origin]);

  if(blocks.length){
    const stack = document.createElement('div');
    stack.className = 'card-stack';
    blocks.forEach(([label, values]) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'card-subsection';
      const title = document.createElement('p');
      title.className = 'card-subtitle';
      title.textContent = label;
      const value = document.createElement('p');
      value.className = 'card-meta';
      value.textContent = values.join(', ');
      wrapper.append(title, value);
      stack.appendChild(wrapper);
    });
    content.appendChild(stack);
  }else{
    content.append(createFallback('Keine Länderinformationen verfügbar.'));
  }

  return { section };
}

function collectLogoEntries(item){
  const entries = [];
  const addEntry = (logo, name, type)=>{
    const src = String(logo || '').trim();
    const label = String(name || '').trim();
    if(!src) return;
    entries.push({ logo: src, name: label || 'Unbenannt', type });
  };

  if(Array.isArray(item?.tmdbDetail?.networks)){
    item.tmdbDetail.networks.forEach(network => {
      addEntry(network?.logo || network?.logoPath || network?.logo_path || '', network?.name || '', 'network');
    });
  }

  if(Array.isArray(item?.tmdbDetail?.productionCompanies)){
    item.tmdbDetail.productionCompanies.forEach(company => {
      addEntry(company?.logo || company?.logoPath || company?.logo_path || '', company?.name || '', 'company');
    });
  }

  const seen = new Set();
  return entries.filter(entry => {
    const key = `${entry.logo}|${entry.name}`.toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createLogoGalleryCard(item){
  const { section, content } = createCard('Logos', 'logos');
  const logos = collectLogoEntries(item);

  if(logos.length){
    const list = document.createElement('ul');
    list.className = 'logo-grid';
    logos.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'logo-grid-item';
      if(entry.logo){
        const img = document.createElement('img');
        img.src = entry.logo;
        img.alt = entry.name || 'Logo';
        img.loading = 'lazy';
        img.decoding = 'async';
        li.appendChild(img);
      }
      const caption = document.createElement('span');
      caption.textContent = entry.name || 'Unbekannt';
      li.appendChild(caption);
      list.appendChild(li);
    });
    content.appendChild(list);
  }else{
    content.append(createFallback('Keine Logos verfügbar.'));
  }

  return { section };
}

function resolveDetailsPane(target){
  if(!target) return null;
  if(target instanceof HTMLElement){
    return target.classList.contains('v2-details') ? target : target.querySelector('.v2-details');
  }
  if(target?.details instanceof HTMLElement) return target.details;
  return null;
}

function renderDetailsPane(pane, item){
  pane.replaceChildren();

  const sections = [
    createGeneralCard(item),
    createCreditsCard(item),
    createCompaniesCard(item),
    createCountriesCard(item),
    createLogoGalleryCard(item),
  ];

  const grid = document.createElement('div');
  grid.className = 'grid-2';
  sections.forEach(section => {
    if(section?.section) grid.appendChild(section.section);
  });

  if(grid.childElementCount){
    pane.appendChild(grid);
  }else{
    pane.appendChild(createFallback('Keine zusätzlichen Details verfügbar.'));
  }
}

export function renderDetails(target, item){
  const pane = resolveDetailsPane(target);
  if(!pane) return;
  renderDetailsPane(pane, item);
}

export function updateDetails(root, item){
  renderDetails(root, item);
}
