import { formatRating, humanYear, isNew, useTmdbOn } from '../utils.js';

function resolvePoster(item){
  const tmdbPoster = item?.tmdbDetail?.poster || item?.tmdb?.poster || item?.tmdbPoster;
  const localPoster = item?.poster || item?.thumbFile || item?.art || '';
  return (useTmdbOn() && tmdbPoster) ? tmdbPoster : localPoster;
}

export function runtimeText(item){
  const sources = [
    item?.runtimeMin,
    item?.durationMin,
    item?.tmdbDetail?.runtime,
    item?.duration ? Math.round(Number(item.duration) / 60000) : null,
  ];

  let minutes = null;
  for(const value of sources){
    const parsed = Number(value);
    if(Number.isFinite(parsed) && parsed > 0){
      minutes = parsed;
      break;
    }
  }

  if(minutes === null) return '';
  if(item?.type === 'tv'){ return `~${minutes} min/Ep`; }
  return `${minutes} min`;
}

export function ratingText(item){
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(!Number.isFinite(rating)) return '';
  return `★ ${formatRating(rating)}`;
}

export function studioText(item){
  if(item?.studio) return item.studio;
  if(item?.network) return item.network;
  if(item?.studioName) return item.studioName;
  if(item?.tmdbDetail?.productionCompanies){
    const first = item.tmdbDetail.productionCompanies.find(company => company?.name);
    if(first && first.name) return first.name;
  }
  if(item?.tmdbDetail?.networks){
    const net = item.tmdbDetail.networks.find(entry => entry?.name);
    if(net && net.name) return net.name;
  }
  return '';
}

function buildChips(item){
  const chips = [];
  if(isNew(item)) chips.push('Neu');
  if(item?.type === 'tv' && Number.isFinite(Number(item?.seasonCount))){
    chips.push(`Staffeln: ${item.seasonCount}`);
  }
  const baseGenres = item?.genres || [];
  const tmdbGenres = Array.isArray(item?.tmdbDetail?.genres) ? item.tmdbDetail.genres : [];
  const genres = [...baseGenres, ...tmdbGenres].map(entry=>{
    if(!entry) return '';
    if(typeof entry === 'string') return entry;
    return entry.tag || entry.title || entry.name || '';
  }).filter(Boolean);
  const seen = new Set();
  genres.forEach(genre=>{
    if(seen.has(genre.toLowerCase())) return;
    seen.add(genre.toLowerCase());
    chips.push(genre);
  });
  return chips;
}

function pickTagline(item){
  const tmdb = (item?.tmdbDetail?.tagline || '').trim();
  if(tmdb) return tmdb;
  return (item?.tagline || '').trim();
}

function pickContentRating(item){
  const tmdb = (item?.tmdbDetail?.contentRating || '').trim();
  if(tmdb) return tmdb;
  return (item?.contentRating || '').trim();
}

function pickBackdrop(item){
  if(item?.tmdbDetail?.backdrop) return item.tmdbDetail.backdrop;
  if(item?.tmdb?.backdrop) return item.tmdb.backdrop;
  return item?.art || item?.background || '';
}

function pickLogo(item){
  const logos = [];
  const detail = item?.tmdbDetail;
  if(detail?.images?.logos){
    logos.push(...detail.images.logos.map(entry => entry?.url || entry?.path || '').filter(Boolean));
  }
  if(detail?.networks){
    logos.push(...detail.networks.map(net => net?.logo).filter(Boolean));
  }
  if(detail?.productionCompanies){
    logos.push(...detail.productionCompanies.map(company => company?.logo).filter(Boolean));
  }
  return logos.find(Boolean) || '';
}

function applyBackdrop(root, item){
  const container = root.querySelector('[data-head-backdrop]');
  if(!container) return;
  const url = pickBackdrop(item);
  if(url){
    container.style.backgroundImage = `url("${url.replace(/"/g, '\"')}")`;
    container.dataset.state = 'ready';
  }else{
    container.style.backgroundImage = '';
    container.dataset.state = '';
  }
}

function applyLogo(root, item){
  const slot = root.querySelector('[data-head-logo]');
  if(!slot) return;
  const logoUrl = pickLogo(item);
  if(logoUrl){
    let img = slot.querySelector('img');
    if(!img){
      img = document.createElement('img');
      img.alt = item?.title || item?.name || 'Logo';
      img.decoding = 'async';
      img.loading = 'lazy';
      slot.replaceChildren(img);
    }
    img.src = logoUrl;
    img.alt = item?.title ? `Logo: ${item.title}` : img.alt;
    slot.hidden = false;
  }else{
    slot.hidden = true;
    slot.replaceChildren();
  }
}

export function populateHead(root, item){
  const titleEl = root.querySelector('.v2-title');
  if(titleEl) titleEl.textContent = item?.title || item?.name || '';
  const tagline = pickTagline(item);
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
    const contentRating = pickContentRating(item);
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
  applyBackdrop(root, item);
  applyLogo(root, item);
}

function onPosterReady(ev){
  ev.currentTarget?.classList.add('is-ready');
}
