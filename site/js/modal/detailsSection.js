import { formatRating, humanYear } from '../utils.js';
import { runtimeText, studioText } from './headerSection.js';
import { getState } from '../state.js';

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

function genresFromItem(item){
  const arr = Array.isArray(item?.genres) ? item.genres : [];
  const tmdb = Array.isArray(item?.tmdbDetail?.genres) ? item.tmdbDetail.genres : [];
  const mapped = [...arr, ...tmdb].map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
  return Array.from(new Set(mapped));
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

function mergeNameLists(primary, secondary){
  const seen = new Set();
  const result = [];
  [...primary, ...secondary].forEach(name => {
    const trimmed = String(name || '').trim();
    if(!trimmed || seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
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

function watchProviderGroups(item){
  const detail = item?.tmdbDetail;
  if(!detail?.watchProviders) return [];
  const region = (getState().cfg?.iso || getState().cfg?.region || 'DE').toUpperCase();
  const source = detail.watchProviders?.[region] || detail.watchProviders?.DE || detail.watchProviders?.default || null;
  if(!source) return [];
  const map = [
    ['flatrate', 'Streaming'],
    ['rent', 'Leihen'],
    ['buy', 'Kaufen'],
    ['free', 'Kostenlos'],
    ['ads', 'Mit Werbung'],
  ];
  const groups = [];
  for(const [key, label] of map){
    const list = Array.isArray(source[key]) ? source[key] : [];
    const providers = list.map(entry => ({
      id: entry?.id || entry?.provider_id || entry?.providerId || '',
      name: entry?.provider_name || entry?.name || '',
      logo: entry?.logo || entry?.logo_path || entry?.logoPath || '',
    })).filter(entry => entry.name);
    if(providers.length){
      groups.push({ label, providers });
    }
  }
  return groups;
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

  const grid = document.createElement('div');
  grid.className = 'v2-details-grid';

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

  const countries = mergeNameLists(
    namesFromList(item?.countries),
    Array.isArray(item?.tmdbDetail?.productionCountries) ? item.tmdbDetail.productionCountries : []
  );
  if(countries.length) general.push(['Länder', countries.join(', ')]);
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

  const providers = watchProviderGroups(item);
  if(providers.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'providers';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Verfügbarkeit';
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'v2-provider-groups';
    providers.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'v2-provider-group';
      const labelEl = document.createElement('p');
      labelEl.className = 'v2-provider-label';
      labelEl.textContent = group.label;
      const listEl = document.createElement('div');
      listEl.className = 'v2-provider-list';
      group.providers.forEach(provider => {
        const itemEl = document.createElement('span');
        itemEl.className = 'v2-provider';
        itemEl.setAttribute('data-provider', provider.id || provider.name);
        if(provider.logo){
          const logo = document.createElement('img');
          logo.src = provider.logo;
          logo.alt = provider.name;
          logo.loading = 'lazy';
          logo.decoding = 'async';
          itemEl.appendChild(logo);
        }
        const name = document.createElement('span');
        name.className = 'v2-provider-name';
        name.textContent = provider.name;
        itemEl.appendChild(name);
        listEl.appendChild(itemEl);
      });
      groupEl.append(labelEl, listEl);
      groupsWrap.appendChild(groupEl);
    });
    section.append(heading, groupsWrap);
    grid.append(section);
  }

  const networks = Array.isArray(item?.tmdbDetail?.networks)
    ? item.tmdbDetail.networks.map(entry => ({
      name: String(entry?.name || '').trim(),
      logo: String(entry?.logo || entry?.logoPath || entry?.logo_path || '').trim(),
    })).filter(entry => entry.name || entry.logo)
    : [];
  if(networks.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'networks';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Netzwerke';
    const list = document.createElement('div');
    list.className = 'v2-chip-group network-chip-group';
    networks.forEach(network => {
      const chip = document.createElement('span');
      chip.className = 'network-chip';
      const label = network.name || 'Unbekanntes Netzwerk';
      if(network.logo){
        const img = document.createElement('img');
        img.src = network.logo;
        img.alt = label;
        img.loading = 'lazy';
        img.decoding = 'async';
        chip.appendChild(img);
      }
      const name = document.createElement('span');
      name.textContent = label;
      chip.appendChild(name);
      chip.title = label;
      list.appendChild(chip);
    });
    if(list.childElementCount){
      section.append(heading, list);
      grid.append(section);
    }
  }

  const spokenLanguages = Array.isArray(item?.tmdbDetail?.spokenLanguages)
    ? item.tmdbDetail.spokenLanguages.map(entry => ({
      code: String(entry?.code || entry?.iso6391 || '').trim(),
      name: String(entry?.name || '').trim(),
    })).filter(entry => entry.name || entry.code)
    : [];
  if(spokenLanguages.length){
    const section = document.createElement('section');
    section.className = 'v2-details-section';
    section.dataset.section = 'languages';
    const heading = document.createElement('h3');
    heading.className = 'v2-details-heading';
    heading.textContent = 'Sprachen';
    const list = document.createElement('div');
    list.className = 'v2-chip-group network-chip-group';
    spokenLanguages.forEach(lang => {
      const chip = document.createElement('span');
      chip.className = 'network-chip';
      const labelParts = [];
      if(lang.name) labelParts.push(lang.name);
      const upperCode = lang.code ? lang.code.toUpperCase() : '';
      if(upperCode && (!lang.name || upperCode !== lang.name.toUpperCase())){
        labelParts.push(upperCode);
      }
      const label = labelParts.join(' • ') || 'Unbekannte Sprache';
      chip.textContent = label;
      chip.title = label;
      list.appendChild(chip);
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

export function renderDetails(target, item){
  const pane = resolveDetailsPane(target);
  if(!pane) return;
  renderDetailsPane(pane, item);
}

export function updateDetails(root, item){
  renderDetails(root, item);
}
