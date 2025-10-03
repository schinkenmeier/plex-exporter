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
  const run = runtimeText(item);
  if(run) chips.push(run);
  const content = item?.contentRating;
  if(content) chips.push(content);
  const rating = ratingText(item);
  if(rating) chips.push(rating);
  const studio = studioText(item);
  if(studio) chips.push(studio);
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
  const metaParts = [year, runtimeText(item), ratingText(item), studioText(item)].filter(Boolean);
  if(subEl){ subEl.textContent = tagline || metaParts.join(' • '); }
  if(metaEl){ metaEl.textContent = tagline && metaParts.length ? metaParts.join(' • ') : ''; metaEl.hidden = !(tagline && metaParts.length); }
  const chipsRoot = root.querySelector('.v2-chips');
  if(chipsRoot){
    chipsRoot.replaceChildren();
    buildChips(item).forEach(text=>{
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = text;
      chipsRoot.appendChild(span);
    });
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
    <section class="v2-hero">
      <div class="v2-poster"><img alt=""></div>
      <div class="v2-head">
        <div class="v2-toprow">
          <h2 class="v2-title"></h2>
          <div class="v2-actions">
            <a class="v2-btn" id="v2Tmdb" target="_blank" rel="noopener" hidden>TMDB</a>
            <a class="v2-btn" id="v2Imdb" target="_blank" rel="noopener" hidden>IMDb</a>
            <button class="v2-btn" id="v2Trailer" type="button" hidden>Trailer</button>
          </div>
        </div>
        <div class="v2-subline"></div>
        <div class="v2-meta"></div>
        <div class="v2-chips"></div>
      </div>
    </section>
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
  `;

  populateHead(root, item);
  setExternalLinks(root, item);
  updateOverview(root, item?.overview || item?.summary || '');
  if(item?.type === 'tv'){ updateSeasons(root, item); }
  updateCast(root, buildCastList(item));
  applyTabs(root);
}
