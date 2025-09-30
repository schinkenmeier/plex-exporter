import { getState } from './state.js';
import * as Filter from './filter.js';
import { el } from './dom.js';
import { humanYear, formatRating, renderChipsLimited, useTmdbOn } from './utils.js';
import * as Watch from './watchlist.js';

function cardEl(item){
  const card = el('article','card');
  card.style.contentVisibility = 'auto';
  const poster = el('div','poster');
  const img = new Image(); img.loading='lazy'; img.decoding='async'; img.alt=item?.title||'';
  const tmdbSrc = useTmdbOn() && item?.tmdb?.poster;
  const src = tmdbSrc || item?.thumbFile || '';
  img.src = src; poster.append(img);
  const meta = el('div','meta');
  const title = el('div','title', item.title||'');
  const sub = el('div','sub');
  const year = humanYear(item);
  const rating = Number(item.rating ?? item.audienceRating);
  const pieces = [];
  if(year) pieces.push(String(year));
  if(Number.isFinite(rating)) pieces.push(`★ ${formatRating(rating)}`);
  sub.textContent = pieces.join(' • ');
  const chips = el('div','chips');
  const genres = (item.genres||[]).map(g=>g&&g.tag).filter(Boolean);
  renderChipsLimited(chips, genres, 3);
  const actions = el('div','card-actions');
  const save = el('button','watch-btn', Watch.isSaved(item) ? 'Gemerkt' : 'Merken');
  if(Watch.isSaved(item)) save.classList.add('active');
  save.addEventListener('click', ev=>{ ev.stopPropagation(); Watch.toggle(item); save.textContent = Watch.isSaved(item) ? 'Gemerkt' : 'Merken'; save.classList.toggle('active', Watch.isSaved(item)); });
  actions.append(save);
  meta.append(title, sub, chips, actions);
  card.append(poster, meta);
  card.addEventListener('click', ()=>{
    const kind = (item && item.type)==='tv' ? 'show' : 'movie';
    const id = (item && (item.ids?.imdb||item.ids?.tmdb||item.ratingKey)) || '';
    if(id!=='') location.hash = `#/${kind}/${id}`;
  });
  return card;
}

function collectionTags(item){
  return ((item && item.collections) || [])
    .map(entry=>entry && (entry.tag || entry.title || entry.name || ''))
    .filter(Boolean);
}

function createCollectionGroup(name, members){
  const list = (members||[]).slice().sort((a,b)=>{
    const ay = Number(humanYear(a)) || 0;
    const by = Number(humanYear(b)) || 0;
    if(ay !== by) return ay - by;
    return (a.title||'').localeCompare(b.title||'', 'de');
  });
  const years = list.map(item=>Number(humanYear(item))||0).filter(Boolean);
  const year = years.length ? Math.min(...years) : '';
  const addedTimestamps = list.map(item=> new Date(item.addedAt||0).getTime()).filter(Number.isFinite);
  const latestAdded = addedTimestamps.length ? new Date(Math.max(...addedTimestamps)).toISOString() : null;
  const ratings = list.map(item=>Number(item.rating ?? item.audienceRating)).filter(Number.isFinite);
  const rating = ratings.length ? ratings.reduce((sum,val)=>sum+val,0) / ratings.length : null;
  const posterItem = list.find(entry=>entry.thumbFile) || list[0] || null;
  const genres = Array.from(new Set(list.flatMap(entry=>((entry.genres||[]).map(g=>g && g.tag).filter(Boolean))))).slice(0,4);
  return { isCollectionGroup:true, type:'collection', title:name, collectionName:name, items:list, itemCount:list.length, year: year || '', addedAt: latestAdded, rating, posterItem, genres };
}

function groupCollectionsIfEnabled(items){
  const togg = document.getElementById('groupCollections');
  const colSel = document.getElementById('collectionFilter');
  const selected = colSel && colSel.value;
  if(!togg || !togg.checked) return items;
  if(selected) return items; // drilling into a single collection -> show items, not groups
  const membership = new Map();
  items.forEach(item=>{
    collectionTags(item).forEach(name=>{
      if(!membership.has(name)) membership.set(name, []);
      membership.get(name).push(item);
    });
  });
  const groups = [];
  membership.forEach((members, name)=>{ groups.push(createCollectionGroup(name, members)); });
  // preserve stable order by title
  groups.sort((a,b)=> a.title.localeCompare(b.title,'de'));
  return groups;
}

function collectionCardEl(entry){
  const card = el('article','card collection');
  card.style.contentVisibility='auto';
  const poster = el('div','poster');
  const img = new Image(); img.loading='lazy'; img.decoding='async'; img.alt = entry.title||'';
  const baseItem = entry.posterItem || {};
  const tmdbSrc = useTmdbOn() && baseItem?.tmdb?.poster;
  img.src = tmdbSrc || baseItem?.thumbFile || '';
  poster.append(img);
  const meta = el('div','meta');
  const title = el('div','title', entry.title||'');
  const sub = el('div','sub', [entry.year, `${entry.itemCount} Titel`, Number.isFinite(entry.rating)?`★ ${formatRating(entry.rating)}`:''].filter(Boolean).join(' • '));
  const chips = el('div','chips');
  renderChipsLimited(chips, entry.genres||[], 3);
  meta.append(title, sub, chips);
  card.append(poster, meta);
  card.addEventListener('click', ()=>{
    const sel = document.getElementById('collectionFilter');
    if(sel){ sel.value = entry.collectionName || entry.title || ''; sel.dispatchEvent(new Event('change', { bubbles:true })); }
  });
  return card;
}

export function renderGrid(view){
  const { movies, shows, filtered } = getState();
  const base = (view==='shows' ? shows : movies) || [];
  const list = (filtered && filtered.length) ? filtered : base;
  const items = groupCollectionsIfEnabled(list);
  const grid = document.getElementById('grid');
  if(!grid) return;
  beginGridTransition(grid);
  const frag = document.createDocumentFragment();
  items.forEach(x=>frag.append(x.isCollectionGroup ? collectionCardEl(x) : cardEl(x)));
  grid.replaceChildren(frag);
  finishGridTransition(grid);
  const empty = document.getElementById('empty');
  if(empty) empty.hidden = items.length !== 0;
}

function beginGridTransition(grid){
  if(!grid) return;
  grid.classList.remove('is-entering','is-ready');
  grid.classList.add('is-leaving');
}

function finishGridTransition(grid){
  if(!grid) return;
  grid.classList.remove('is-leaving');
  grid.classList.add('is-entering');
  requestAnimationFrame(()=>{
    grid.classList.add('is-ready');
    setTimeout(()=>grid.classList.remove('is-entering','is-ready'), 240);
  });
}
