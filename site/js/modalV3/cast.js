import { buildCastList } from '../modal/castSection.js';
import { useTmdbOn } from '../utils.js';

const MAX_INITIAL_CAST = 12;
const castState = new WeakMap();
let listIdCounter = 0;

function resolveContainer(target){
  if(!target) return null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(elementCtor && target instanceof elementCtor) return target;
  if(elementCtor && target.content instanceof elementCtor) return target.content;
  if(elementCtor && target.root instanceof elementCtor) return target.root;
  return null;
}

function ensureCastRoot(target){
  const container = resolveContainer(target);
  if(!container) return null;
  let root = container.querySelector('[data-v3-cast]');
  if(!root){
    root = document.createElement('div');
    root.className = 'v3-cast';
    root.dataset.v3Cast = '1';
    root.dataset.loading = 'false';
    container.appendChild(root);
  }
  return root;
}

function ensureList(root){
  if(!root) return null;
  let list = root.querySelector('[data-v3-cast-list]');
  if(!list){
    list = document.createElement('div');
    list.className = 'v3-cast__scroller';
    list.dataset.v3CastList = '1';
    list.id = `v3-cast-list-${++listIdCounter}`;
    root.appendChild(list);
  }
  return list;
}

function getState(root){
  let state = castState.get(root);
  if(!state){
    state = { entries: [], expanded: false };
    castState.set(root, state);
  }
  return state;
}

function normalizeTmdbProfile(path){
  const str = String(path || '').trim();
  if(!str) return '';
  if(/^https?:\/\//i.test(str)) return str;
  if(str.startsWith('//')) return `https:${str}`;
  const suffix = str.startsWith('/') ? str : `/${str}`;
  return `https://image.tmdb.org/t/p/w185${suffix}`;
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

function createCastCard(entry, tmdbEnabled){
  const name = String(entry?.name || '').trim();
  if(!name) return null;
  const role = String(entry?.role || '').trim();

  const card = document.createElement('article');
  card.className = 'v3-cast-card';
  card.setAttribute('role', 'listitem');
  card.tabIndex = 0;
  if(role){
    card.setAttribute('aria-label', `${name} – ${role}`);
  }else{
    card.setAttribute('aria-label', name);
    card.classList.add('v3-cast-card--no-role');
  }

  const avatar = document.createElement('div');
  avatar.className = 'v3-cast-card__avatar';
  const imageUrl = resolveCastImage(entry, tmdbEnabled);
  if(imageUrl){
    avatar.classList.add('has-image');
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = name;
    img.loading = 'lazy';
    img.decoding = 'async';
    avatar.appendChild(img);
  }else{
    const initials = document.createElement('span');
    initials.className = 'v3-cast-card__initials';
    initials.textContent = castInitials(name);
    initials.setAttribute('aria-hidden', 'true');
    avatar.appendChild(initials);
  }

  const meta = document.createElement('div');
  meta.className = 'v3-cast-card__meta';
  const nameLine = document.createElement('p');
  nameLine.className = 'v3-cast-card__name';
  nameLine.textContent = name;
  meta.appendChild(nameLine);
  if(role){
    const roleLine = document.createElement('p');
    roleLine.className = 'v3-cast-card__role';
    roleLine.textContent = role;
    meta.appendChild(roleLine);
  }

  card.append(avatar, meta);
  return card;
}

function renderEntries(root, entries, expanded){
  const list = ensureList(root);
  if(!list) return;
  const tmdbEnabled = useTmdbOn();
  const visible = expanded ? entries : entries.slice(0, MAX_INITIAL_CAST);
  list.replaceChildren(...visible.map(entry => createCastCard(entry, tmdbEnabled)).filter(Boolean));
  if(visible.length){
    list.setAttribute('role', 'list');
  }else{
    list.removeAttribute('role');
  }
  list.dataset.count = String(visible.length);
  root.dataset.expanded = expanded ? 'true' : 'false';
}

function ensureMoreButton(root){
  let button = root.querySelector('[data-v3-cast-more]');
  if(button) return button;
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'v3-cast__more';
  button.dataset.v3CastMore = '1';
  button.textContent = 'Mehr Cast anzeigen';
  const list = ensureList(root);
  if(list?.id) button.setAttribute('aria-controls', list.id);
  button.addEventListener('click', () => {
    const state = getState(root);
    state.expanded = true;
    renderEntries(root, state.entries, true);
    updateMoreButton(root);
    button.setAttribute('aria-expanded', 'true');
  });
  root.appendChild(button);
  return button;
}

function removeMoreButton(root){
  const button = root.querySelector('[data-v3-cast-more]');
  if(button){
    button.remove();
  }
}

function updateMoreButton(root){
  const state = getState(root);
  const hasMore = state.entries.length > MAX_INITIAL_CAST;
  if(hasMore && !state.expanded){
    const button = ensureMoreButton(root);
    button.hidden = false;
    button.disabled = false;
    button.setAttribute('aria-expanded', 'false');
  }else{
    removeMoreButton(root);
  }
  ensureStatusPlacement(root);
}

function ensureStatusPlacement(root){
  const status = root.querySelector('.v3-cast-status');
  if(!status) return;
  const list = ensureList(root);
  if(!list) return;
  const moreButton = root.querySelector('[data-v3-cast-more]');
  const desiredPrevious = moreButton || list;
  if(status.previousElementSibling !== desiredPrevious){
    if(moreButton){
      root.insertBefore(status, moreButton.nextSibling);
    }else{
      root.insertBefore(status, list.nextSibling);
    }
  }
}

export function setCastLoading(target, loading){
  const root = ensureCastRoot(target);
  if(!root) return;
  const isLoading = Boolean(loading);
  root.dataset.loading = isLoading ? 'true' : 'false';
  if(isLoading){
    root.setAttribute('aria-busy', 'true');
  }else{
    root.removeAttribute('aria-busy');
  }
}

export function setCastStatus(target, status){
  const root = ensureCastRoot(target);
  if(!root) return;
  let statusEl = root.querySelector('.v3-cast-status');
  if(!status || !status.message){
    if(statusEl) statusEl.remove();
    root.dataset.status = '';
    return;
  }
  if(!statusEl){
    statusEl = document.createElement('p');
    statusEl.className = 'v3-cast-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.setAttribute('aria-atomic', 'true');
    root.appendChild(statusEl);
  }
  statusEl.dataset.state = status.state || '';
  statusEl.textContent = status.message;
  root.dataset.status = status.state || '';
  ensureStatusPlacement(root);
}

export function renderCast(target, payload){
  const root = ensureCastRoot(target);
  if(!root) return;
  const source = payload?.item || payload;
  const entries = buildCastList(source) || [];
  const state = getState(root);
  state.entries = entries;
  state.expanded = false;
  setCastLoading(root, false);
  if(!entries.length){
    ensureList(root).replaceChildren();
    setCastStatus(root, { state: 'empty', message: 'Keine Besetzungsdaten verfügbar.' });
    removeMoreButton(root);
    root.dataset.count = '0';
    return;
  }
  setCastStatus(root, null);
  renderEntries(root, entries, false);
  updateMoreButton(root);
  root.dataset.count = String(entries.length);
}

