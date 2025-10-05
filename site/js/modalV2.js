import { renderSeasonsAccordion } from './modal/seasonsAccordion.js';
import { formatRating, humanYear, isNew, useTmdbOn } from './utils.js';
import { getState } from './state.js';
import { loadShowDetail } from './data.js';
import { mapMovie, mapShow, mergeShowDetail, needsShowDetail } from './modal/shared.js';

const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_PROFILE_SIZE = 'w185';

let overlayContainer = null;
let dialogEl = null;
let scrollContainer = null;
let rootEl = null;
let lastActiveElement = null;
let focusTrapHandler = null;
let escapeHandler = null;
let renderToken = 0;
let currentKind = null;
let currentItem = null;

let demoDataModulePromise = null;
function loadDemoDataModule(){
  if(!demoDataModulePromise){
    demoDataModulePromise = import('./modal/demoData.js').catch(err=>{
      console.warn('[modalV2] Demo-Daten konnten nicht geladen werden.', err);
      return { DEMO_MOVIE: null, DEMO_SERIES: null };
    });
  }
  return demoDataModulePromise;
}

function resolveRoot(){
  if(rootEl) return rootEl;
  const container = document.getElementById('modal-root-v2');
  if(!container) return null;
  overlayContainer = container;
  container.classList.add('modalv2-overlay');
  if(!container.hasAttribute('hidden')) container.setAttribute('hidden', '');
  if(!container.dataset.modalv2Ready){
    container.innerHTML = `
      <div class="modalv2-backdrop" data-modalv2-backdrop="1"></div>
      <div class="modalv2-dialog" role="dialog" aria-modal="true">
        <div class="modalv2-scroll" data-modalv2-scroll></div>
      </div>
    `;
    container.dataset.modalv2Ready = '1';
    container.addEventListener('click', onOverlayClick);
  }
  dialogEl = container.querySelector('.modalv2-dialog');
  if(dialogEl && !dialogEl.hasAttribute('tabindex')) dialogEl.setAttribute('tabindex', '-1');
  scrollContainer = container.querySelector('[data-modalv2-scroll]');
  if(scrollContainer && !rootEl){
    const existing = scrollContainer.querySelector('.modalv2');
    if(existing) rootEl = existing;
    else {
      rootEl = document.createElement('div');
      rootEl.className = 'modalv2';
      rootEl.setAttribute('hidden', '');
      scrollContainer.appendChild(rootEl);
    }
  }
  return rootEl;
}

function onOverlayClick(ev){
  if(!overlayContainer) return;
  const target = ev.target;
  if(target === overlayContainer || (target && target.dataset && target.dataset.modalv2Backdrop)){ closeModalV2(); }
}

function getFocusableElements(){
  if(!dialogEl) return [];
  const selectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  return Array.from(dialogEl.querySelectorAll(selectors)).filter(el=>{
    if(el.hasAttribute('disabled')) return false;
    if(el.getAttribute('aria-hidden') === 'true') return false;
    if(el.hasAttribute('hidden')) return false;
    return el.offsetParent !== null;
  });
}

function bindFocusTrap(){
  if(!dialogEl) return;
  if(focusTrapHandler){ dialogEl.removeEventListener('keydown', focusTrapHandler); }
  focusTrapHandler = (ev)=>{
    if(ev.key !== 'Tab') return;
    const focusables = getFocusableElements();
    if(!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if(ev.shiftKey){
      if(document.activeElement === first){ ev.preventDefault(); last.focus(); }
    }else if(document.activeElement === last){
      ev.preventDefault(); first.focus();
    }
  };
  dialogEl.addEventListener('keydown', focusTrapHandler);
}

function unbindFocusTrap(){
  if(!dialogEl || !focusTrapHandler) return;
  dialogEl.removeEventListener('keydown', focusTrapHandler);
  focusTrapHandler = null;
}

function bindEscape(){
  if(escapeHandler) return;
  escapeHandler = (ev)=>{
    if(ev.key === 'Escape'){ ev.preventDefault(); closeModalV2(); }
  };
  window.addEventListener('keydown', escapeHandler);
}

function unbindEscape(){
  if(!escapeHandler) return;
  window.removeEventListener('keydown', escapeHandler);
  escapeHandler = null;
}

function showOverlay(){
  const root = resolveRoot();
  if(!root || !overlayContainer) return null;
  overlayContainer.hidden = false;
  overlayContainer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modalv2-open');
  if(scrollContainer) scrollContainer.scrollTop = 0;
  bindFocusTrap();
  bindEscape();

  return root;
}

function focusInitial(){
  if(!dialogEl) return;
  const closeBtn = dialogEl.querySelector('#v2Close');
  const focusables = getFocusableElements();
  let target = (closeBtn && !closeBtn.hasAttribute('hidden')) ? closeBtn : focusables[0];
  if(!target) target = dialogEl;
  if(target){
    const focus = ()=>{ try{ target.focus(); }catch{} };
    (window.requestAnimationFrame || setTimeout)(focus, 0);
  }
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
    if(!person) return null;
    if(typeof person === 'string'){
      const name = String(person).trim();
      if(!name) return null;
      return { name, role:'', thumb:'', tmdbProfile:'', raw:null };
    }
    const name = String(person.tag || person.name || person.role || '').trim();
    if(!name) return null;
    const role = (()=>{
      const rawRole = String(person.role || '').trim();
      if(!rawRole) return '';
      return rawRole.toLowerCase() === name.toLowerCase() ? '' : rawRole;
    })();
    const tmdbProfile = [
      person?.tmdb?.profile,
      person?.tmdb?.profile_path,
      person?.tmdb?.profilePath,
      person?.tmdbProfile,
      person?.profile,
      person?.profile_path,
      person?.profilePath,
    ].find(val => typeof val === 'string' && val.trim());
    const thumb = [person?.thumb, person?.photo, person?.image].find(val => typeof val === 'string' && val.trim()) || '';
    return {
      name,
      role,
      thumb,
      tmdbProfile: tmdbProfile ? String(tmdbProfile).trim() : '',
      raw: person,
    };
  }).filter(Boolean);
}

function normalizeTmdbProfile(path){
  const str = String(path || '').trim();
  if(!str) return '';
  if(/^https?:\/\//i.test(str)) return str;
  if(str.startsWith('//')) return `https:${str}`;
  const suffix = str.startsWith('/') ? str : `/${str}`;
  return `${TMDB_PROFILE_BASE}${TMDB_PROFILE_SIZE}${suffix}`;
}

function normalizeLocalImage(path){
  const str = String(path || '').trim();
  if(!str) return '';
  if(/^https?:\/\//i.test(str) || str.startsWith('data:')) return str;
  if(str.startsWith('//')) return `https:${str}`;
  return str;
}

function resolveCastImage(entry, tmdbEnabled){
  if(!entry) return '';
  const raw = entry.raw || {};
  if(tmdbEnabled){
    const tmdbCandidates = [
      entry.tmdbProfile,
      raw?.tmdb?.profile,
      raw?.tmdb?.profile_path,
      raw?.tmdb?.profilePath,
      raw?.tmdbProfile,
      raw?.profile,
      raw?.profile_path,
      raw?.profilePath,
    ];
    for(const candidate of tmdbCandidates){
      const url = normalizeTmdbProfile(candidate);
      if(url) return url;
    }
  }
  const localCandidates = [entry.thumb, raw?.thumb, raw?.photo, raw?.image];
  for(const candidate of localCandidates){
    const url = normalizeLocalImage(candidate);
    if(url) return url;
  }
  return '';
}

function castInitials(name){
  const str = String(name || '').trim();
  if(!str) return '?';
  const parts = str.split(/\s+/).slice(0, 2);
  const chars = parts.map(part => part.charAt(0)).filter(Boolean);
  return chars.length ? chars.join('').toUpperCase() : str.charAt(0).toUpperCase();
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
  const moveFocus = (current, delta)=>{
    if(!buttons.length) return;
    const currentIndex = buttons.indexOf(current);
    const fallbackIndex = delta > 0 ? 0 : buttons.length - 1;
    const index = currentIndex === -1 ? fallbackIndex : (currentIndex + delta + buttons.length) % buttons.length;
    const next = buttons[index];
    if(next){
      next.focus();
      select(next.dataset.t);
    }
  };
  tabs.addEventListener('click', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    ev.preventDefault();
    select(btn.dataset.t);
  });
  tabs.addEventListener('keydown', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    switch(ev.key){
      case 'ArrowLeft':
      case 'ArrowUp':
        ev.preventDefault();
        moveFocus(btn, -1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        ev.preventDefault();
        moveFocus(btn, 1);
        break;
      case 'Home':
        ev.preventDefault();
        if(buttons[0]){
          buttons[0].focus();
          select(buttons[0].dataset.t);
        }
        break;
      case 'End':
        ev.preventDefault();
        if(buttons.length){
          const last = buttons[buttons.length - 1];
          last.focus();
          select(last.dataset.t);
        }
        break;
      default:
        break;
    }
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
  const limited = Array.isArray(cast) ? cast.slice(0, 12) : [];
  if(!limited.length){
    scroll.innerHTML = '<span class="modalv2-loading">Keine Besetzungsdaten verfügbar.</span>';
    scroll.removeAttribute('role');
    return;
  }
  scroll.setAttribute('role', 'list');
  const tmdbEnabled = useTmdbOn();
  limited.forEach(entry=>{
    const data = (entry && typeof entry === 'object' && 'name' in entry)
      ? entry
      : (()=>{
          const name = String(entry || '').trim();
          if(!name) return null;
          return { name, role:'', thumb:'', tmdbProfile:'', raw:null };
        })();
    if(!data || !data.name) return;

    const card = document.createElement('article');
    card.className = 'v2-cast-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'listitem');

    const roleText = String(data.role || '').trim();
    card.setAttribute('aria-label', roleText ? `${data.name} – ${roleText}` : data.name);

    const avatar = document.createElement('div');
    avatar.className = 'v2-cast-avatar';
    const imageSrc = resolveCastImage(data, tmdbEnabled);
    if(imageSrc){
      avatar.classList.add('has-image');
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = data.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      avatar.appendChild(img);
    }else{
      const initials = document.createElement('span');
      initials.className = 'v2-cast-initials';
      initials.textContent = castInitials(data.name);
      initials.setAttribute('aria-hidden', 'true');
      avatar.appendChild(initials);
    }

    const nameLine = document.createElement('p');
    nameLine.className = 'v2-cast-name';
    nameLine.textContent = data.name;

    card.append(avatar, nameLine);

    if(roleText){
      const roleLine = document.createElement('p');
      roleLine.className = 'v2-cast-role';
      roleLine.textContent = roleText;
      card.append(roleLine);
    }else{
      card.classList.add('v2-cast-card--no-role');
    }
    scroll.appendChild(card);
  });

  if(!scroll.children.length){
    scroll.innerHTML = '<span class="modalv2-loading">Keine Besetzungsdaten verfügbar.</span>';
    scroll.removeAttribute('role');
  }
}

function updateOverview(root, text){
  const pane = root.querySelector('.v2-overview');
  if(!pane) return;

  const overview = typeof text === 'string' ? text : '';

  if(!overview){
    pane.textContent = '';
    return;
  }

  const paragraph = document.createElement('p');
  paragraph.className = 'v2-overview-text line-clamp line-clamp-5';
  paragraph.textContent = overview;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v2-overview-toggle';

  const setExpanded = (expanded)=>{
    paragraph.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
  };

  toggle.addEventListener('click', ()=>{
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });

  pane.replaceChildren(paragraph, toggle);
  setExpanded(false);

  const measure = ()=>{
    const overflowing = paragraph.scrollHeight > paragraph.clientHeight + 1;
    if(!overflowing){
      paragraph.classList.add('is-expanded');
      toggle.hidden = true;
    }
  };
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb)=>setTimeout(cb, 0);
  schedule(measure);
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
  const formatOptionalRating = (value)=>{
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
  };

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
  const root = showOverlay();
  if(!root) return;
  root.hidden = false;
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'modalv2-loading';
  loadingDiv.textContent = String(message || 'Details werden geladen …');
  root.replaceChildren(loadingDiv);
}

export function renderModalV2(item){
  const root = showOverlay();
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
              <h2 class="v2-title" id="modalV2Title"></h2>
              <div class="v2-subline"></div>
              <div class="v2-meta"></div>
            </div>
            <div class="v2-actions" aria-label="Externe Aktionen">
              <button class="v2-icon-btn" id="v2Close" type="button" aria-label="Schließen">
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 6l12 12M6 18L18 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                </svg>
              </button>
              <a class="v2-icon-btn" id="v2Tmdb" target="_blank" rel="noopener noreferrer" aria-label="Auf TMDB öffnen" hidden>
                <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                  <path d="M4 9V7a2 2 0 0 1 2-2h1l2 4 2-4 2 4 2-4h1a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </a>
              <a class="v2-icon-btn" id="v2Imdb" target="_blank" rel="noopener noreferrer" aria-label="Auf IMDb öffnen" hidden>
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
    closeBtn.addEventListener('click', closeModalV2);
  }
  if(dialogEl) dialogEl.setAttribute('aria-labelledby', 'modalV2Title');
  focusInitial();
}

export async function openMovieModalV2(idOrData){
  const token = ++renderToken;
  lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = showOverlay();
  if(!root) return;
  const data = await resolveMovieData(idOrData);
  if(token !== renderToken) return;
  if(!data){
    root.hidden = false;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'modalv2-loading';
    errorDiv.textContent = 'Film konnte nicht geladen werden.';
    root.replaceChildren(errorDiv);
    currentItem = null;
    currentKind = null;
    focusInitial();
    return;
  }
  currentItem = data;
  currentKind = 'movie';
  renderModalV2(data);
}

export async function openSeriesModalV2(idOrData){
  const token = ++renderToken;
  lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const base = await resolveSeriesData(idOrData);
  const root = showOverlay();
  if(!root) return;
  if(token !== renderToken) return;
  if(!base){
    root.hidden = false;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'modalv2-loading';
    errorDiv.textContent = 'Seriendetails konnten nicht geladen werden.';
    root.replaceChildren(errorDiv);
    currentItem = null;
    currentKind = null;
    focusInitial();
    return;
  }
  currentItem = base;
  currentKind = 'show';
  let working = base;
  if(needsShowDetail(working)){
    showModalV2Loading();
    if(token !== renderToken) return;
    let detail = null;
    try{ detail = await loadShowDetail(working); }
    catch{ detail = null; }
    if(token !== renderToken) return;
    if(detail){ mergeShowDetail(working, detail); currentItem = working; }
  }
  if(token !== renderToken) return;
  renderModalV2(working);
}

export function closeModalV2(){
  renderToken++;
  if(!overlayContainer) return;
  overlayContainer.hidden = true;
  overlayContainer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modalv2-open');
  unbindFocusTrap();
  unbindEscape();
  if(rootEl){
    rootEl.innerHTML = '';
    rootEl.setAttribute('hidden', '');
  }
  if(scrollContainer) scrollContainer.scrollTop = 0;
  if(lastActiveElement && typeof lastActiveElement.focus === 'function'){
    try{ lastActiveElement.focus(); }
    catch{}
  }
  lastActiveElement = null;
  currentItem = null;
  currentKind = null;
}

export function isModalV2Open(){
  return Boolean(overlayContainer && !overlayContainer.hidden);
}

export function getModalV2Context(){
  return currentItem ? { item: currentItem, kind: currentKind } : { item: null, kind: null };
}

async function resolveMovieData(idOrData){
  if(idOrData === 'demo'){
    const { DEMO_MOVIE } = await loadDemoDataModule();
    return mapMovie(DEMO_MOVIE);
  }
  if(idOrData && typeof idOrData === 'object') return mapMovie(idOrData);
  const str = idOrData == null ? '' : String(idOrData).trim();
  if(!str) return null;
  const state = getState();
  const movies = Array.isArray(state?.movies) ? state.movies : [];
  const match = movies.find(movie => matchesIdentifier(movie, str));
  return match ? mapMovie(match) : null;
}

async function resolveSeriesData(idOrData){
  if(idOrData === 'demo'){
    const { DEMO_SERIES } = await loadDemoDataModule();
    return mapShow(DEMO_SERIES);
  }
  if(idOrData && typeof idOrData === 'object') return mapShow(idOrData);
  const str = idOrData == null ? '' : String(idOrData).trim();
  if(!str) return null;
  const state = getState();
  const shows = Array.isArray(state?.shows) ? state.shows : [];
  const match = shows.find(show => matchesIdentifier(show, str));
  return match ? mapShow(match) : null;
}

function matchesIdentifier(item, id){
  if(!item) return false;
  const str = String(id || '').trim();
  if(!str) return false;
  if(item?.ids?.imdb && String(item.ids.imdb) === str) return true;
  if(item?.ids?.tmdb && String(item.ids.tmdb) === str) return true;
  if(item?.ratingKey != null && String(item.ratingKey) === str) return true;
  return false;
}
