import { qs } from '../dom.js';
import { renderMovieView } from './movieView.js';
import { renderShowView } from './showView.js';
import { getState } from '../state.js';
import { renderChipsLimited, humanYear, formatRating, useTmdbOn, isNew } from '../utils.js';
import { loadShowDetail, prefixShowThumb } from '../data.js';

let currentIndex = -1;
let currentList = [];
let lastFocused = null;
let renderToken = 0;

function focusTrap(modal){
  const selectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(modal.querySelectorAll(selectors)).filter(el=>el.offsetParent!==null);
  if(!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length-1];
  const onKey = (ev)=>{
    if(ev.key !== 'Tab') return;
    if(ev.shiftKey){ if(document.activeElement===first){ ev.preventDefault(); last.focus(); } }
    else { if(document.activeElement===last){ ev.preventDefault(); first.focus(); } }
  };
  modal.addEventListener('keydown', onKey);
}

function setHeader(item){
  const title = String(item.title||'');
  const poster = (useTmdbOn() && item.tmdb?.poster) || item.poster || item.thumbFile || '';
  const year = humanYear(item);
  const runtime = item.durationMin || (item.duration ? Math.round(Number(item.duration)/60000) : null);
  const ratingNum = Number(item.rating ?? item.audienceRating);
  const rating = Number.isFinite(ratingNum) ? `★ ${formatRating(ratingNum)}` : '';
  const studio = item.studio || '';
  const sub = [year, runtime?`${runtime} min`:null, rating, studio].filter(Boolean).join(' • ');
  qs('#mTitle').textContent = title;
  qs('#mPoster').src = poster;
  qs('#mSubline').textContent = sub;
  const chipsRoot = qs('#mChips');
  const chips = [];
  if(isNew(item)) chips.push('Neu');
  if(item.contentRating) chips.push(item.contentRating);
  const genres = (item.genres||[]).map(g=>g&&g.tag).filter(Boolean);
  chips.push(...genres);
  if(chipsRoot) renderChipsLimited(chipsRoot, chips, 6);
  // Actions
  const tmdb = qs('#mTmdb'); const imdb = qs('#mImdb'); const trailer = qs('#mTrailer');
  if(tmdb){
    const id = item.ids?.tmdb || item.tmdbId || '';
    const type = (item.type==='tv') ? 'tv' : 'movie';
    if(id){ tmdb.style.display=''; tmdb.href = `https://www.themoviedb.org/${type}/${id}`; }
    else { tmdb.style.display='none'; tmdb.removeAttribute('href'); }
  }
  if(imdb){
    const id = item.ids?.imdb || '';
    if(id){ imdb.style.display=''; imdb.href = `https://www.imdb.com/title/${id}/`; }
    else { imdb.style.display='none'; imdb.removeAttribute('href'); }
  }
  if(trailer){
    const url = item.trailer || item.trailerUrl || '';
    trailer.hidden = !url;
    if(url){
      trailer.onclick = ()=>{ window.open(url, '_blank','noopener'); };
    } else { trailer.onclick = null; }
  }
}

function show(){ const m = qs('#modal'); if(m) m.hidden = false; }
function hide(){ const m = qs('#modal'); if(m) m.hidden = true; }

export function openModal(item){
  if(!item) return;
  // determine navigation list from current view and filtered items
  const s = getState();
  const view = s.view;
  const pool = (view==='shows'? s.shows : s.movies) || [];
  const filtered = s.filtered && s.filtered.length ? s.filtered : pool;
  currentList = filtered;
  currentIndex = Math.max(0, filtered.findIndex(x=>
    (x===item) || (x?.ratingKey && item?.ratingKey && String(x.ratingKey)===String(item.ratingKey)) ||
    (x?.ids?.imdb && item?.ids?.imdb && x.ids.imdb===item.ids.imdb) ||
    (x?.ids?.tmdb && item?.ids?.tmdb && x.ids.tmdb===item.ids.tmdb)
  ));

  renderItem(item);
  show();
  const modal = qs('#modal');
  if(modal){ lastFocused = document.activeElement; focusTrap(modal); modal.querySelector('#mClose')?.focus(); }
  const closeBtn = qs('#mClose');
  if(closeBtn && !closeBtn._bound){ closeBtn._bound = true; closeBtn.addEventListener('click', closeModal); }
  addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeModal(); }, { once:true });
  addEventListener('keydown', onArrowNav);
  bindArrows();
  bindSubnav();
}
export function closeModal(){ hide(); }

function bindArrows(){
  const prev = qs('#mPrev'); const next = qs('#mNext');
  if(prev && !prev._bound){ prev._bound = true; prev.addEventListener('click', ()=> step(-1)); }
  if(next && !next._bound){ next._bound = true; next.addEventListener('click', ()=> step(1)); }
}

function step(delta){
  if(!currentList.length) return;
  currentIndex = (currentIndex + delta + currentList.length) % currentList.length;
  const item = currentList[currentIndex];
  if(!item) return;
  renderItem(item);
}

function onArrowNav(ev){
  if(ev.key==='ArrowLeft') step(-1);
  else if(ev.key==='ArrowRight') step(1);
}

function bindSubnav(){
  const buttons = [
    { btn:'#navOverview', sec:'#sec-overview' },
    { btn:'#navSeasons',  sec:'#sec-seasons'  },
    { btn:'#navCast',     sec:'#sec-cast'     },
  ];
  buttons.forEach(({btn,sec})=>{
    const b = qs(btn);
    if(b && !b._bound){
      b._bound = true;
      b.addEventListener('click', ()=>{
        buttons.forEach(({btn:bb,sec:ss})=>{ const n=qs(bb); const s=qs(ss); if(n) n.classList.toggle('active', bb===btn); if(s) s.hidden = (ss!==sec); });
      });
    }
  });
}

async function renderItem(item){
  if(!item) return;
  const token = ++renderToken;
  setHeader(item);
  if(item.type === 'tv'){
    const needsDetails = needsShowDetail(item);
    let detail = null;
    if(needsDetails){
      showTvLoadingState();
      try{ detail = await loadShowDetail(item); }
      catch{ detail = null; }
      if(token !== renderToken) return;
    }
    mergeShowDetail(item, detail);
    if(token !== renderToken) return;
    renderShowView(item);
  }else{
    renderMovieView(item);
  }
}

function needsShowDetail(item){
  const seasons = Array.isArray(item?.seasons) ? item.seasons : [];
  const hasEpisodes = seasons.some(season=>Array.isArray(season?.episodes) && season.episodes.length);
  const cast = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];
  return !seasons.length || !hasEpisodes || !cast.length;
}

function showTvLoadingState(){
  const overviewMovie = qs('#mOverview'); if(overviewMovie) overviewMovie.textContent = '';
  const ov = qs('#mOverviewShow');
  if(ov){ ov.hidden = false; ov.textContent = 'Details werden geladen …'; }
  const kpi = qs('#mKpiShow');
  if(kpi){ kpi.hidden = true; kpi.replaceChildren(); }
  const castEl = qs('#mCastShow');
  if(castEl){ castEl.hidden = true; castEl.replaceChildren(); }
  const seasonsRoot = document.getElementById('seasonsAccordion');
  if(seasonsRoot){
    const info = document.createElement('div');
    info.className = 'loading-indicator';
    info.textContent = 'Details werden geladen …';
    seasonsRoot.replaceChildren(info);
  }
}

function mergeShowDetail(target, detail){
  if(!target) return target;
  if(detail && typeof detail === 'object') Object.assign(target, detail);
  normalizeShow(target);
  return target;
}

function normalizeShow(show){
  if(!show || typeof show !== 'object') return;
  normalizeThumbField(show);
  show.genres = normalizeGenresList(show.genres);
  const cast = normalizePeopleList(show.cast || show.roles || []);
  show.cast = cast;
  show.roles = cast;
  show.seasons = Array.isArray(show.seasons) ? show.seasons.map(normalizeSeasonEntry).filter(Boolean) : [];
  const sc = Number(show.seasonCount);
  show.seasonCount = Number.isFinite(sc) && sc > 0 ? sc : show.seasons.length;
}

function normalizeSeasonEntry(season){
  if(!season || typeof season !== 'object') return null;
  const out = { ...season };
  normalizeThumbField(out);
  out.genres = normalizeGenresList(out.genres);
  out.episodes = Array.isArray(out.episodes) ? out.episodes.map(normalizeEpisodeEntry).filter(Boolean) : [];
  return out;
}

function normalizeEpisodeEntry(ep){
  if(!ep || typeof ep !== 'object') return null;
  const out = { ...ep };
  normalizeThumbField(out);
  out.genres = normalizeGenresList(out.genres);
  return out;
}

function normalizeThumbField(obj){
  prefixShowThumb(obj);
}

function normalizeGenresList(list){
  if(!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(entry=>{
    let item = null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      if(tag) item = { tag };
    }else if(entry && typeof entry === 'object'){
      const tag = String(entry.tag || entry.title || entry.name || entry.label || '').trim();
      if(tag){ item = { ...entry, tag }; }
    }
    if(item && !seen.has(item.tag)){
      seen.add(item.tag);
      result.push(item);
    }
  });
  return result;
}

function normalizePeopleList(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry=>{
    if(!entry) return null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      return tag ? { tag } : null;
    }
    if(typeof entry === 'object'){
      const tag = String(entry.tag || entry.name || entry.role || '').trim();
      return tag ? { ...entry, tag } : { ...entry };
    }
    return null;
  }).filter(Boolean);
}
