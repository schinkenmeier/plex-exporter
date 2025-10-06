import { getState } from './state.js';
import { el } from './dom.js';
import { humanYear, formatRating, renderChipsLimited, useTmdbForCards, isNew, getGenreNames, collectionTags } from './utils.js';
import * as Watch from './watchlist.js';
import { openMovieModalV2, openSeriesModalV2 } from './modalV2.js';
import { navigateToHash } from './main.js';
import { VirtualList } from './grid/virtualList.js';

const CARD_SIGNATURE_PROP = '__gridVirtualSignature';

function cardEl(item){
  const card = el('article','card');
  card.dataset.kind = (item?.type === 'tv') ? 'show' : 'movie';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  if(item?.title) card.setAttribute('aria-label', item.title);

  // 1) Media Block
  const media = el('div','card__media');
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.className = 'card__img';
  img.alt = item?.title || '';
  img.style.aspectRatio = '2 / 3';
  const src = resolvePoster(item);
  if(src) img.src = src;

  const gradient = el('div','card__media-gradient');
  gradient.setAttribute('aria-hidden','true');

  const badges = buildItemBadges(item);
  const badgeContainer = el('div','card__badges');
  badges.forEach(badge=>{ if(badge instanceof HTMLElement) badgeContainer.append(badge); });

  media.append(img, gradient);
  if(badgeContainer.childElementCount) media.append(badgeContainer);

  const pct = progressPercent(item);
  if(pct > 0){
    const track = el('div','card__progress');
    const fill = document.createElement('span');
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    track.append(fill);
    media.append(track);
  }

  // 2) Info Block
  const body = el('div','card__body');
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item?.title || '';
  if(item?.title) title.setAttribute('title', item.title);

  const sub = el('div','card__meta');
  const metaPieces = buildMetaPieces(item);
  sub.textContent = metaPieces.join(' • ');

  body.append(title, sub);

  // 3) Actions Block
  const actions = el('div','card__actions');

  const chips = el('div','card__chips');
  const genres = getGenreNames(item?.genres);
  renderChipsLimited(chips, genres, 3);

  const watchBtn = document.createElement('button');
  watchBtn.type = 'button';
  watchBtn.className = 'card__primary';
  updateWatchButtonState(watchBtn, item);
  watchBtn.addEventListener('click', ev=>{
    ev.stopPropagation();
    Watch.toggle(item);
    updateWatchButtonState(watchBtn, item);
  });

  actions.append(chips, watchBtn);

  card.append(media, body, actions);

  card.addEventListener('click', ()=> openDetail(item));
  card.addEventListener('keydown', ev=>{
    if(ev.target !== card) return;
    if(ev.key === 'Enter' || ev.key === ' '){
      ev.preventDefault();
      openDetail(item);
    }
  });

  return card;
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
  const genres = Array.from(new Set(list.flatMap(entry=>getGenreNames(entry.genres)))).slice(0,4);
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
  const card = el('article','card card--collection');
  card.dataset.kind = 'collection';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  if(entry?.title) card.setAttribute('aria-label', entry.title);

  // 1) Media Block
  const media = el('div','card__media');
  const baseItem = entry.posterItem || {};
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.className = 'card__img';
  img.alt = entry?.title || '';
  img.style.aspectRatio = '2 / 3';
  const src = resolvePoster(baseItem);
  if(src) img.src = src;

  const gradient = el('div','card__media-gradient');
  gradient.setAttribute('aria-hidden','true');

  const badges = buildCollectionBadges(entry);
  const badgeContainer = el('div','card__badges');
  badges.forEach(badge=>{ if(badge instanceof HTMLElement) badgeContainer.append(badge); });

  media.append(img, gradient);
  if(badgeContainer.childElementCount) media.append(badgeContainer);

  // 2) Info Block
  const body = el('div','card__body');
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = entry.title || '';
  if(entry?.title) title.setAttribute('title', entry.title);

  const sub = el('div','card__meta');
  const pieces = collectionMetaPieces(entry);
  sub.textContent = pieces.filter(Boolean).join(' • ');

  body.append(title, sub);

  // 3) Actions Block
  const actions = el('div','card__actions');
  const chips = el('div','card__chips');
  renderChipsLimited(chips, entry.genres||[], 3);
  actions.append(chips);

  card.append(media, body, actions);

  card.addEventListener('click', ()=>{
    const sel = document.getElementById('collectionFilter');
    if(sel){
      sel.value = entry.collectionName || entry.title || '';
      sel.dispatchEvent(new Event('change', { bubbles:true }));
    }
  });

  card.addEventListener('keydown', ev=>{
    if(ev.target !== card) return;
    if(ev.key === 'Enter' || ev.key === ' '){
      ev.preventDefault();
      const sel = document.getElementById('collectionFilter');
      if(sel){
        sel.value = entry.collectionName || entry.title || '';
        sel.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }
  });

  return card;
}

let virtualListInstance = null;

function ensureVirtualList(grid){
  if(virtualListInstance) return virtualListInstance;
  virtualListInstance = new VirtualList({
    container: grid,
    overscan: 1,
    estimatedItemHeight: 460,
    minItemWidth: 190,
    getKey: itemKey,
    getSignature: gridItemSignature,
    renderItem(item){
      const node = renderGridItemNode(item);
      return node;
    },
    updateItem(node, item){
      return refreshGridItemNode(node, item);
    }
  });
  return virtualListInstance;
}

function itemKey(item, index){
  if(item?.isCollectionGroup){
    const key = item.collectionName || item.title || '';
    return key ? `collection:${key}` : `collection-index-${index}`;
  }
  const id = resolveItemId(item);
  return id ? `item:${id}` : `item-index-${index}`;
}

function renderGridItemNode(item){
  const node = item?.isCollectionGroup ? collectionCardEl(item) : cardEl(item);
  if(node instanceof HTMLElement){
    node[CARD_SIGNATURE_PROP] = gridItemSignature(item);
  }
  return node;
}

function refreshGridItemNode(current, item){
  if(current instanceof HTMLElement){
    const signature = gridItemSignature(item);
    if(current[CARD_SIGNATURE_PROP] === signature){
      current[CARD_SIGNATURE_PROP] = signature;
      return current;
    }
  }
  const replacement = renderGridItemNode(item);
  if(!(replacement instanceof HTMLElement)) return current;
  return replaceCardNode(current, replacement);
}

let lastRenderedView = null;

export function renderGrid(view){
  const { movies, shows, filtered } = getState();
  const base = (view==='shows' ? shows : movies) || [];
  const list = Array.isArray(filtered) ? filtered : base;
  const items = groupCollectionsIfEnabled(list);
  const grid = document.getElementById('grid');
  if(!grid) return;

  const shouldAnimate = lastRenderedView !== view;
  lastRenderedView = view;

  if(shouldAnimate) beginGridTransition(grid);
  const vlist = ensureVirtualList(grid);
  vlist.setItems(items);
  if(shouldAnimate) finishGridTransition(grid);
  const empty = document.getElementById('empty');
  if(empty) empty.hidden = items.length > 0;
  grid.setAttribute('aria-busy', 'false');
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


function resolvePoster(item){
  if(!item) return '';
  const tmdbPoster = useTmdbForCards() && (item?.tmdb?.poster || item?.tmdbPoster);
  const fallback = item?.thumbFile || item?.poster || item?.art || item?.thumb || '';
  return tmdbPoster || fallback || '';
}

function itemBadgeTexts(item){
  const badges = [];
  if(isNew(item)) badges.push('Neu');
  const contentRating = String(item?.contentRating || '').trim();
  if(contentRating) badges.push(contentRating);
  const ratingNum = Number(item?.rating ?? item?.audienceRating);
  if(Number.isFinite(ratingNum)) badges.push(`★ ${formatRating(ratingNum)}`);
  return badges.slice(0, 3);
}

function buildItemBadges(item){
  return itemBadgeTexts(item).map(createBadge);
}

function collectionBadgeTexts(entry){
  const badges = [];
  if(Number.isFinite(entry?.itemCount) && entry.itemCount > 0) badges.push(`${entry.itemCount} Titel`);
  if(entry?.year) badges.push(String(entry.year));
  return badges;
}

function buildCollectionBadges(entry){
  return collectionBadgeTexts(entry).map(createBadge);
}

function createBadge(text){
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = String(text || '');
  return badge;
}

function updateWatchButtonState(button, item){
  if(!button) return;
  const saved = Watch.isSaved(item);
  button.textContent = saved ? 'Gemerkt' : 'Merken';
  button.classList.toggle('active', saved);
  button.setAttribute('aria-pressed', saved ? 'true' : 'false');
}

function buildMetaPieces(item){
  const pieces = [];
  const year = humanYear(item);
  if(year) pieces.push(String(year));
  const runtime = formatRuntime(item);
  if(runtime) pieces.push(runtime);
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(Number.isFinite(rating)) pieces.push(`★ ${formatRating(rating)}`);
  const studio = item?.studio || item?.network || '';
  if(studio) pieces.push(studio);
  return pieces;
}

function collectionMetaPieces(entry){
  const pieces = [];
  if(entry?.year) pieces.push(String(entry.year));
  const count = Number(entry?.itemCount);
  if(Number.isFinite(count)) pieces.push(`${count} Titel`);
  const rating = Number(entry?.rating);
  if(Number.isFinite(rating)) pieces.push(`★ ${formatRating(rating)}`);
  return pieces;
}

function formatRuntime(item){
  const raw = item?.runtimeMin ?? item?.durationMin ?? (item?.duration ? Math.round(Number(item.duration) / 60000) : null);
  const minutes = Number(raw);
  if(!Number.isFinite(minutes) || minutes <= 0) return '';
  if(item?.type === 'tv') return `~${minutes} min/Ep`;
  return `${minutes} min`;
}

function progressPercent(item){
  const offset = Number(item?.viewOffset ?? item?.viewoffset);
  const duration = Number(item?.duration);
  if(!Number.isFinite(offset) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round((offset / duration) * 100)));
}

function resolveItemId(item){
  if(!item) return '';
  const preferred = item?.ids?.imdb || item?.ids?.tmdb;
  if(preferred) return String(preferred);
  if(item?.ratingKey) return String(item.ratingKey);
  return '';
}

function gridItemSignature(entry){
  if(entry?.isCollectionGroup) return collectionSignature(entry);
  return itemSignature(entry);
}

function itemSignature(item){
  const genres = getGenreNames(item?.genres).slice(0, 3);
  const badges = itemBadgeTexts(item);
  const meta = buildMetaPieces(item);
  return JSON.stringify({
    id: resolveItemId(item),
    title: item?.title || '',
    poster: resolvePoster(item),
    badges,
    meta,
    progress: progressPercent(item),
    watch: Watch.isSaved(item),
    genres
  });
}

function collectionSignature(entry){
  const baseItem = entry?.posterItem || null;
  const genres = Array.isArray(entry?.genres) ? entry.genres.slice(0, 3).map(String) : [];
  const badges = collectionBadgeTexts(entry);
  const meta = collectionMetaPieces(entry);
  const count = Number(entry?.itemCount);
  const ratingValue = Number(entry?.rating);
  return JSON.stringify({
    name: entry?.collectionName || entry?.title || '',
    title: entry?.title || '',
    itemCount: Number.isFinite(count) ? count : null,
    year: entry?.year || '',
    rating: Number.isFinite(ratingValue) ? ratingValue : null,
    poster: resolvePoster(baseItem),
    badges,
    meta,
    genres
  });
}

function replaceCardNode(current, replacement){
  if(!(replacement instanceof HTMLElement)) return current;
  if(!(current instanceof HTMLElement)) return replacement;
  const parent = current.parentNode;
  const hadFocus = document.activeElement === current;
  if(parent){
    parent.replaceChild(replacement, current);
  }
  if(hadFocus && typeof replacement.focus === 'function'){
    requestAnimationFrame(()=>{
      try {
        replacement.focus({ preventScroll: true });
      } catch (err) {
        replacement.focus();
      }
    });
  }
  return replacement;
}

function updateHash(kind, id){
  if(!kind || !id) return;
  const hash = `#/${kind}/${id}`;
  const replace = (window.location.hash || '') === hash;
  navigateToHash(hash, { silent: true, replace });
}

function openDetail(item){
  if(!item) return;
  const kind = item?.type === 'tv' ? 'show' : 'movie';
  const id = resolveItemId(item);
  if(id) updateHash(kind, id);
  if(kind === 'show') openSeriesModalV2(item);
  else openMovieModalV2(item);
}
