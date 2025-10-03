import { renderSeasonsAccordion } from './modal/seasonsAccordion.js';
import { formatRating, humanYear, isNew, useTmdbOn } from './utils.js';

function resolveRoot(){
  return document.getElementById('modalV2Root');
}

function resolvePoster(item){
  const tmdbPoster = item?.tmdb?.poster || item?.tmdbPoster;
  const localPoster = item?.poster || item?.thumbFile || item?.art || '';
  return (useTmdbOn() && tmdbPoster) ? tmdbPoster : localPoster;
}

function runtimeText(item){
  const minutes = item?.runtimeMin || item?.durationMin || (item?.duration ? Math.round(Number(item.duration) / 60000) : null);
  if(!Number.isFinite(minutes)) return '';
  if(item?.type === 'tv'){ return `~${minutes} min/Ep`; }
  return `${minutes} min`;
}

function ratingText(item){
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(!Number.isFinite(rating)) return '';
  return `★ ${formatRating(rating)}`;
}

function studioText(item){
  return item?.studio || item?.network || item?.studioName || '';
}

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
      }catch{}
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

function buildChips(item){
  const chips = [];
  if(isNew(item)) chips.push('Neu');
  if(item?.type === 'tv' && Number.isFinite(Number(item?.seasonCount))){
    chips.push(`Staffeln: ${item.seasonCount}`);
  }
  const genres = (item?.genres || []).map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
  genres.forEach(genre=> chips.push(genre));
  return chips;
}

function buildCastList(item){
  const source = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];
  return source.map(person=>{
    if(!person) return '';
    if(typeof person === 'string') return person;
    const name = person.tag || person.name || person.role || '';
    const role = person.role && person.role !== name ? person.role : '';
    return role ? `${name} • ${role}` : name;
  }).filter(Boolean);
}

function applyTabs(root){
  const tabs = root.querySelector('.v2-tabs');
  if(!tabs) return;
  const buttons = Array.from(tabs.querySelectorAll('button[data-t]'));
  const select = (target)=>{
    buttons.forEach(btn=>{
      const isActive = btn.dataset.t === target;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
      const pane = root.querySelector(`.v2-pane[data-pane="${btn.dataset.t}"]`);
      if(pane){
        pane.hidden = !isActive;
        pane.setAttribute('aria-hidden', pane.hidden ? 'true' : 'false');
      }
    });
  };
  tabs.addEventListener('click', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    ev.preventDefault();
    select(btn.dataset.t);
  });
  const initial = buttons.find(btn=> btn.classList.contains('active')) || buttons[0];
  if(initial) select(initial.dataset.t);
}

function updateCast(root, cast){
  const pane = root.querySelector('.v2-cast');
  if(!pane) return;
  pane.innerHTML = '<div class="v2-cast-scroll"></div>';
  const scroll = pane.querySelector('.v2-cast-scroll');
  if(!scroll) return;
  const limited = cast.slice(0, 12);
  if(!limited.length){
    scroll.innerHTML = '<span class="modalv2-loading">Keine Besetzungsdaten verfügbar.</span>';
    return;
  }
  limited.forEach(name=>{
    const chip = document.createElement('div');
    chip.className = 'v2-cast-chip';
    chip.textContent = name;
    scroll.appendChild(chip);
  });
}

function updateOverview(root, text){
  const pane = root.querySelector('.v2-overview');
  if(pane) pane.textContent = text || '';
}

function updateDetails(root, item){
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
  const critic = formatRating(item?.rating);
  const audience = formatRating(item?.audienceRating);
  const user = formatRating(item?.userRating);
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

function updateSeasons(root, item){
  const pane = root.querySelector('.v2-seasons');
  if(!pane) return;
  const seasons = Array.isArray(item?.seasons) ? item.seasons : [];
  if(!seasons.length){
    pane.innerHTML = '<p class="modalv2-loading">Keine Staffel-Informationen verfügbar.</p>';
    return;
  }
  pane.innerHTML = '';
  renderSeasonsAccordion(pane, seasons);
}

function setExternalLinks(root, item){
  const tmdbBtn = root.querySelector('#v2Tmdb');
  const imdbBtn = root.querySelector('#v2Imdb');
  const trailerBtn = root.querySelector('#v2Trailer');
  const tmdbId = item?.ids?.tmdb || item?.tmdbId;
  const imdbId = item?.ids?.imdb || item?.imdbId;
  const trailer = item?.trailer || item?.trailerUrl;
  const type = item?.type === 'tv' ? 'tv' : 'movie';
  if(tmdbBtn){
    if(tmdbId){
      tmdbBtn.hidden = false;
      tmdbBtn.href = `https://www.themoviedb.org/${type}/${tmdbId}`;
    }else{
      tmdbBtn.hidden = true;
      tmdbBtn.removeAttribute('href');
    }
  }
  if(imdbBtn){
    if(imdbId){
      imdbBtn.hidden = false;
      imdbBtn.href = `https://www.imdb.com/title/${imdbId}/`;
    }else{
      imdbBtn.hidden = true;
      imdbBtn.removeAttribute('href');
    }
  }
  if(trailerBtn){
    if(trailer){
      trailerBtn.hidden = false;
      trailerBtn.onclick = ()=> window.open(trailer, '_blank', 'noopener');
    }else{
      trailerBtn.hidden = true;
      trailerBtn.onclick = null;
    }
  }
}

function populateHead(root, item){
  const titleEl = root.querySelector('.v2-title');
  if(titleEl) titleEl.textContent = item?.title || item?.name || '';
  const tagline = (item?.tagline || '').trim();
  const metaEl = root.querySelector('.v2-meta');
  const subEl = root.querySelector('.v2-subline');
  const year = humanYear(item);
  const runtime = runtimeText(item);
  const rating = ratingText(item);
  const studio = studioText(item);
  const metaParts = [year, runtime, rating, studio].filter(Boolean);
  if(subEl){
    const fallback = metaParts.join(' • ');
    subEl.textContent = tagline || fallback;
    subEl.hidden = !(tagline || fallback);
  }
  if(metaEl){
    metaEl.textContent = tagline && metaParts.length ? metaParts.join(' • ') : '';
    metaEl.hidden = !(tagline && metaParts.length);
  }
  const chipsRoot = root.querySelector('.v2-chips');
  if(chipsRoot){
    chipsRoot.replaceChildren();
    buildChips(item).forEach(text=>{
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = text;
      chipsRoot.appendChild(span);
    });
    chipsRoot.hidden = !chipsRoot.childElementCount;
  }
  const quickFacts = root.querySelector('.v2-facts');
  const quickList = root.querySelector('.v2-facts-list');
  if(quickFacts && quickList){
    const facts = [];
    if(year) facts.push(['Jahr', year]);
    const contentRating = (item?.contentRating || '').trim();
    if(contentRating) facts.push(['Freigabe', contentRating]);
    if(runtime) facts.push(['Laufzeit', runtime]);
    if(rating) facts.push(['Bewertung', rating]);
    if(studio) facts.push(['Studio', studio]);
    quickList.replaceChildren();
    facts.forEach(([label, value])=>{
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      quickList.append(dt, dd);
    });
    quickFacts.hidden = !facts.length;
  }
  const img = root.querySelector('.v2-poster img');
  if(img){
    const src = resolvePoster(item);
    img.src = src || '';
    img.alt = item?.title ? `Poster: ${item.title}` : '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.classList.remove('is-ready');
    if(src){
      img.addEventListener('load', onPosterReady, { once:true });
      img.addEventListener('error', onPosterReady, { once:true });
    }else{
      img.classList.add('is-ready');
    }
  }
}

function onPosterReady(ev){
  ev.currentTarget?.classList.add('is-ready');
}

export function showModalV2Loading(message='Details werden geladen …'){
  const root = resolveRoot();
  if(!root) return;
  root.hidden = false;
  root.innerHTML = `<div class="modalv2-loading">${message}</div>`;
}

export function renderModalV2(item){
  const root = resolveRoot();
  if(!root) return;
  root.hidden = false;
  const hasSeasons = item?.type === 'tv';
  root.innerHTML = `
    <section class="v2-layout">
      <aside class="v2-side">
        <div class="v2-poster"><img alt=""></div>
        <div class="v2-facts" aria-label="Schnellinfos" hidden>
          <h3 class="v2-facts-title">Schnellinfos</h3>
          <dl class="v2-facts-list"></dl>
        </div>
      </aside>
      <div class="v2-info">
        <header class="v2-head">
          <div class="v2-titlebar">
            <div class="v2-title-wrap">
              <h2 class="v2-title"></h2>
              <div class="v2-subline"></div>
              <div class="v2-meta"></div>
            </div>
            <div class="v2-actions" aria-label="Externe Aktionen">
              <button class="v2-icon-btn" id="v2Close" type="button" aria-label="Schließen">
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M6 18L18 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                </svg>
              </button>
              <a class="v2-icon-btn" id="v2Tmdb" target="_blank" rel="noopener" aria-label="Auf TMDB öffnen" hidden>
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                  <path d="M4 9V7a2 2 0 0 1 2-2h1l2 4 2-4 2 4 2-4h1a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </a>
              <a class="v2-icon-btn" id="v2Imdb" target="_blank" rel="noopener" aria-label="Auf IMDb öffnen" hidden>
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                </svg>
              </a>
              <button class="v2-icon-btn" id="v2Trailer" type="button" aria-label="Trailer abspielen" hidden>
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9 6l8 6-8 6V6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="v2-chips" aria-label="Attribute"></div>
        </header>
        <nav class="v2-tabs" aria-label="Details Navigation" role="tablist">
          <button type="button" data-t="overview" class="active" id="v2TabOverview" role="tab" aria-controls="v2PaneOverview" aria-selected="true">Überblick</button>
          <button type="button" data-t="details" id="v2TabDetails" role="tab" aria-controls="v2PaneDetails" aria-selected="false">Details</button>
          ${hasSeasons ? '<button type="button" data-t="seasons" id="v2TabSeasons" role="tab" aria-controls="v2PaneSeasons" aria-selected="false">Staffeln</button>' : ''}
          <button type="button" data-t="cast" id="v2TabCast" role="tab" aria-controls="v2PaneCast" aria-selected="false">Cast</button>
        </nav>
        <section class="v2-body">
          <div class="v2-pane v2-overview" data-pane="overview" id="v2PaneOverview" role="tabpanel" aria-labelledby="v2TabOverview"></div>
          <div class="v2-pane v2-details" data-pane="details" id="v2PaneDetails" role="tabpanel" aria-labelledby="v2TabDetails" hidden></div>
          ${hasSeasons ? '<div class="v2-pane v2-seasons" data-pane="seasons" id="v2PaneSeasons" role="tabpanel" aria-labelledby="v2TabSeasons" hidden></div>' : ''}
          <div class="v2-pane v2-cast" data-pane="cast" id="v2PaneCast" role="tabpanel" aria-labelledby="v2TabCast" hidden></div>
        </section>
      </div>
    </section>
  `;

  populateHead(root, item);
  setExternalLinks(root, item);
  updateOverview(root, item?.overview || item?.summary || '');
  updateDetails(root, item);
  if(item?.type === 'tv'){ updateSeasons(root, item); }
  updateCast(root, buildCastList(item));
  applyTabs(root);
  const closeBtn = root.querySelector('#v2Close');
  if(closeBtn){
    closeBtn.addEventListener('click', ()=>{
      const legacyClose = document.getElementById('mClose');
      if(legacyClose){ legacyClose.click(); }
    });
  }
}
