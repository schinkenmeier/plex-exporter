import { useTmdbOn } from '../utils.js';

const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_PROFILE_SIZE = 'w185';

function normalizeLocalCast(person){
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
}

function normalizeTmdbCast(person){
  if(!person) return null;
  const name = String(person.name || person.original_name || '').trim();
  if(!name) return null;
  const role = String(person.character || '').trim();
  return {
    name,
    role,
    thumb: '',
    tmdbProfile: person.profile || person.profile_path || person.profilePath || '',
    raw: { tmdb: person },
  };
}

export function buildCastList(item){
  const seen = new Map(); // Use Map for case-insensitive deduplication
  const combined = [];
  const localSource = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];

  // Pre-normalize and deduplicate local cast
  localSource.forEach(person => {
    const entry = normalizeLocalCast(person);
    if(!entry) return;
    const lowerName = entry.name.toLowerCase();
    if(!seen.has(lowerName)){
      seen.set(lowerName, true);
      combined.push(entry);
    }
  });

  // Pre-normalize and deduplicate TMDB cast
  const tmdbSource = Array.isArray(item?.tmdbDetail?.credits?.cast) ? item.tmdbDetail.credits.cast : [];
  tmdbSource.forEach(person => {
    const entry = normalizeTmdbCast(person);
    if(!entry) return;
    const lowerName = entry.name.toLowerCase();
    if(!seen.has(lowerName)){
      seen.set(lowerName, true);
      combined.push(entry);
    }
  });

  return combined;
}

function renderCastPane(pane, cast, row){
  if(!pane || !row) return;
  row.innerHTML = '';
  const limited = Array.isArray(cast) ? cast.slice(0, 12) : [];
  if(!limited.length){
    row.innerHTML = '<span class="modalv2-loading">Keine Besetzungsdaten verfügbar.</span>';
    row.removeAttribute('role');
    ensureCastStatusPosition(pane);
    return;
  }
  row.setAttribute('role', 'list');
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
    card.className = 'cast-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'listitem');

    const roleText = String(data.role || '').trim();
    card.setAttribute('aria-label', roleText ? `${data.name} – ${roleText}` : data.name);

    const avatar = document.createElement('div');
    avatar.className = 'cast-avatar';
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
      initials.className = 'cast-initials';
      initials.textContent = castInitials(data.name);
      initials.setAttribute('aria-hidden', 'true');
      avatar.appendChild(initials);
    }

    const nameLine = document.createElement('p');
    nameLine.className = 'cast-name';
    nameLine.textContent = data.name;

    card.append(avatar, nameLine);

    if(roleText){
      const roleLine = document.createElement('p');
      roleLine.className = 'cast-role';
      roleLine.textContent = roleText;
      card.append(roleLine);
    }else{
      card.classList.add('cast-card--no-role');
    }
    row.appendChild(card);
  });

  if(!row.children.length){
    row.innerHTML = '<span class="modalv2-loading">Keine Besetzungsdaten verfügbar.</span>';
    row.removeAttribute('role');
  }else{
    applyUniformCastCardMinHeight(row);
  }
  ensureCastStatusPosition(pane);
}

export function renderCast(target, cast){
  updateCast(target, cast);
}

export function updateCast(root, cast){
  const pane = resolveCastPane(root);
  if(!pane) return;
  const row = ensureCastRow(pane);
  renderCastPane(pane, cast, row);
}

export function setCastLoading(root, loading){
  const pane = resolveCastPane(root);
  if(!pane) return;
  pane.dataset.loading = loading ? 'true' : 'false';
  if(loading){
    pane.setAttribute('aria-busy', 'true');
  }else{
    pane.removeAttribute('aria-busy');
  }
}

export function setCastStatus(root, status){
  const pane = resolveCastPane(root);
  if(!pane) return;
  ensureCastRow(pane);
  let statusEl = pane.querySelector('.v2-cast-status');
  if(!status || !status.message){
    if(statusEl) statusEl.remove();
    pane.dataset.status = '';
    return;
  }
  if(!statusEl){
    statusEl = document.createElement('p');
    statusEl.className = 'v2-cast-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.setAttribute('aria-atomic', 'true');
    const row = pane.querySelector('.cast-row');
    if(row && row.nextSibling){
      pane.insertBefore(statusEl, row.nextSibling);
    }else{
      pane.appendChild(statusEl);
    }
  }
  statusEl.dataset.state = status.state || '';
  statusEl.textContent = status.message;
  pane.dataset.status = status.state || '';
  ensureCastStatusPosition(pane);
}

function ensureCastStatusPosition(pane){
  if(!pane) return;
  const statusEl = pane.querySelector('.v2-cast-status');
  if(!statusEl) return;
  const row = pane.querySelector('.cast-row');
  if(row && statusEl.previousElementSibling !== row){
    if(row.nextSibling){
      pane.insertBefore(statusEl, row.nextSibling);
    }else{
      pane.appendChild(statusEl);
    }
  }else if(!row && statusEl.parentElement !== pane){
    pane.appendChild(statusEl);
  }
}

function ensureCastRow(pane){
  if(!pane) return null;
  let row = pane.querySelector('.cast-row');
  if(row) return row;
  row = document.createElement('div');
  row.className = 'cast-row';
  const statusEl = pane.querySelector('.v2-cast-status');
  if(statusEl){
    pane.insertBefore(row, statusEl);
  }else{
    pane.appendChild(row);
  }
  return row;
}

function applyUniformCastCardMinHeight(row){
  if(!row) return;
  const applyHeights = ()=>{
    const cards = Array.from(row.querySelectorAll('.cast-card'));
    if(!cards.length) return;
    let maxHeight = 0;
    cards.forEach(card => {
      card.style.minHeight = '';
      const height = card.offsetHeight;
      if(height > maxHeight) maxHeight = height;
    });
    if(maxHeight){
      const minHeightValue = `${maxHeight}px`;
      cards.forEach(card => {
        card.style.minHeight = minHeightValue;
      });
    }
  };
  if(typeof requestAnimationFrame === 'function'){
    requestAnimationFrame(applyHeights);
  }else{
    applyHeights();
  }
}

function resolveCastPane(root){
  if(root instanceof HTMLElement){
    if(root.classList.contains('v2-cast')) return root;
    return root.querySelector('.v2-cast');
  }
  if(root?.cast instanceof HTMLElement) return root.cast;
  return document.querySelector('.v2-pane.v2-cast');
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
