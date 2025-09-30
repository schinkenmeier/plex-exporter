import { qs } from '../dom.js';
import { renderMovieView } from './movieView.js';
import { renderShowView } from './showView.js';
import { getState } from '../state.js';
import { renderChipsLimited, humanYear, formatRating, useTmdbOn, isNew } from '../utils.js';

let currentIndex = -1;
let currentList = [];
let lastFocused = null;

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

  setHeader(item);
  if(item.type === 'tv') renderShowView(item); else renderMovieView(item);
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
  setHeader(item);
  if(item.type === 'tv') renderShowView(item); else renderMovieView(item);
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
