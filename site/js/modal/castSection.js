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
  const seen = new Set();
  const combined = [];
  const localSource = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];
  localSource.map(normalizeLocalCast).filter(Boolean).forEach(entry => {
    const key = entry.name.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    combined.push(entry);
  });
  const tmdbSource = Array.isArray(item?.tmdbDetail?.credits?.cast) ? item.tmdbDetail.credits.cast : [];
  tmdbSource.map(normalizeTmdbCast).filter(Boolean).forEach(entry => {
    const key = entry.name.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    combined.push(entry);
  });
  return combined;
}

export function updateCast(root, cast){
  const pane = root.querySelector('.v2-cast');
  if(!pane) return;
  let scroll = pane.querySelector('.v2-cast-scroll');
  if(!scroll){
    scroll = document.createElement('div');
    scroll.className = 'v2-cast-scroll';
    pane.prepend(scroll);
  }else{
    scroll.innerHTML = '';
  }
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
  ensureCastStatusPosition(pane);
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
  let statusEl = pane.querySelector('.v2-cast-status');
  if(!status || !status.message){
    if(statusEl) statusEl.remove();
    pane.dataset.status = '';
    return;
  }
  if(!statusEl){
    statusEl = document.createElement('p');
    statusEl.className = 'v2-cast-status';
    pane.appendChild(statusEl);
  }
  statusEl.dataset.state = status.state || '';
  statusEl.textContent = status.message;
  pane.dataset.status = status.state || '';
  ensureCastStatusPosition(pane);
}

function ensureCastStatusPosition(pane){
  const statusEl = pane.querySelector('.v2-cast-status');
  const scroll = pane.querySelector('.v2-cast-scroll');
  if(statusEl && scroll && statusEl.previousElementSibling !== scroll){
    pane.appendChild(statusEl);
  }
}

function resolveCastPane(root){
  if(root instanceof HTMLElement) return root.querySelector('.v2-cast');
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
