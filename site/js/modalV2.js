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
  tabs.addEventListener('click', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    const target = btn.dataset.t;
    tabs.querySelectorAll('button').forEach(b=> b.classList.toggle('active', b===btn));
    root.querySelectorAll('.v2-pane').forEach(pane=>{
      if(!pane) return;
      const key = pane.dataset.pane;
      pane.hidden = key !== target;
    });
  });
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
        <nav class="v2-tabs" aria-label="Details Navigation">
          <button type="button" data-t="overview" class="active">Überblick</button>
          ${item?.type === 'tv' ? '<button type="button" data-t="seasons">Staffeln</button>' : ''}
          <button type="button" data-t="cast">Cast</button>
        </nav>
        <section class="v2-body">
          <div class="v2-pane v2-overview" data-pane="overview"></div>
          ${item?.type === 'tv' ? '<div class="v2-pane v2-seasons" data-pane="seasons" hidden></div>' : ''}
          <div class="v2-pane v2-cast" data-pane="cast" hidden></div>
        </section>
      </div>
    </section>
  `;

  populateHead(root, item);
  setExternalLinks(root, item);
  updateOverview(root, item?.overview || item?.summary || '');
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
