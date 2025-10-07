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

function logoEntryToUrl(entry){
  if(!entry) return '';
  if(typeof entry === 'string') return entry;
  return entry.url || entry.file_path || entry.filePath || entry.path || entry.logo || '';
}

function logoEntryLanguage(entry){
  if(!entry || typeof entry !== 'object') return '';
  const lang = entry.iso6391 || entry.iso_639_1 || entry.language || '';
  return typeof lang === 'string' ? lang.toLowerCase() : '';
}

function pickHeroLogo(item){
  const detail = item?.tmdbDetail;
  const logos = Array.isArray(detail?.images?.logos) ? detail.images.logos : [];
  if(!logos.length) return '';
  const preferences = ['de', 'en', ''];
  for(const pref of preferences){
    const match = logos.find(entry => {
      const lang = logoEntryLanguage(entry);
      if(pref){ return lang === pref; }
      return !lang;
    });
    const url = logoEntryToUrl(match);
    const sanitized = sanitizeUrl(url);
    if(sanitized) return sanitized;
  }
  for(const entry of logos){
    const sanitized = sanitizeUrl(logoEntryToUrl(entry));
    if(sanitized) return sanitized;
  }
  return '';
}

function pickLogo(item, excludeUrl=''){
  const seen = new Set();
  const exclude = sanitizeUrl(excludeUrl);
  if(exclude) seen.add(exclude);
  const candidates = [];
  const detail = item?.tmdbDetail;
  const push = (value)=>{
    const sanitized = sanitizeUrl(logoEntryToUrl(value));
    if(!sanitized || seen.has(sanitized)) return;
    seen.add(sanitized);
    candidates.push(sanitized);
  };
  if(detail?.images?.logos){
    detail.images.logos.forEach(push);
  }
  if(detail?.networks){
    detail.networks.forEach(push);
  }
  if(detail?.productionCompanies){
    detail.productionCompanies.forEach(push);
  }
  return candidates[0] || '';
}

function sanitizeUrl(url){
  if(!url) return '';
  const str = String(url).trim();
  if(!str) return '';
  // Only allow http(s) and data URLs
  if(/^https?:\/\//i.test(str) || /^data:image\//i.test(str)) return str;
  // For relative paths, ensure they don't contain quotes or special chars
  return str.replace(/["'()]/g, '');
}

function applyBackdrop(root, item){
  const container = root.querySelector('[data-head-backdrop]');
  if(!container) return;
  const url = pickBackdrop(item);
  const sanitized = sanitizeUrl(url);
  const reset = ()=>{
    container.style.backgroundImage = '';
    container.dataset.state = '';
    container.dataset.src = '';
  };
  if(!sanitized){
    reset();
    return;
  }
  if(typeof Image === 'undefined'){
    container.dataset.src = sanitized;
    container.dataset.state = 'ready';
    container.style.backgroundImage = `url("${sanitized}")`;
    return;
  }
  container.dataset.state = 'loading';
  container.style.backgroundImage = '';
  container.dataset.src = sanitized;
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  const onLoad = ()=>{
    if(container.dataset.src !== sanitized) return;
    container.style.backgroundImage = `url("${sanitized}")`;
    container.dataset.state = 'ready';
  };
  const onError = ()=>{
    if(container.dataset.src !== sanitized) return;
    reset();
  };
  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', onError, { once: true });
  img.src = sanitized;
}

function applyLogo(root, item, excludeUrl=''){
  const slot = root.querySelector('[data-head-logo]');
  if(!slot) return;
  const logoUrl = pickLogo(item, excludeUrl);
  if(logoUrl){
    let img = slot.querySelector('img');
    if(!img){
      img = document.createElement('img');
      img.alt = item?.title || item?.name || 'Logo';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
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

function applyHeroLogo(root, item){
  const slot = root.querySelector('[data-head-overlay-logo]');
  if(!slot) return '';
  const logoUrl = pickHeroLogo(item);
  slot.dataset.src = '';
  if(!logoUrl){
    slot.hidden = true;
    slot.dataset.state = '';
    slot.replaceChildren();
    return '';
  }
  const img = document.createElement('img');
  img.alt = item?.title ? `Hero Logo: ${item.title}` : 'Hero Logo';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  slot.replaceChildren(img);
  slot.dataset.src = logoUrl;
  if(typeof Image === 'undefined'){
    img.src = logoUrl;
    slot.hidden = false;
    slot.dataset.state = 'ready';
    return logoUrl;
  }
  slot.hidden = true;
  slot.dataset.state = 'loading';
  const onReady = ()=>{
    if(slot.dataset.src !== logoUrl) return;
    slot.hidden = false;
    slot.dataset.state = 'ready';
  };
  const onError = ()=>{
    if(slot.dataset.src !== logoUrl) return;
    slot.hidden = true;
    slot.dataset.state = '';
    slot.dataset.src = '';
    slot.replaceChildren();
  };
  img.addEventListener('load', onReady, { once: true });
  img.addEventListener('error', onError, { once: true });
  img.src = logoUrl;
  return logoUrl;
}

function ratingBucket(value){
  if(!Number.isFinite(value)) return '';
  if(value >= 7.5) return 'high';
  if(value >= 5.5) return 'medium';
  if(value > 0) return 'low';
  return '';
}

function pickRatingInfo(item){
  const detail = item?.tmdbDetail || {};
  const tmdbVote = Number(detail.voteAverage ?? detail.vote_average);
  if(Number.isFinite(tmdbVote) && tmdbVote > 0){
    return {
      label: 'TMDB',
      value: tmdbVote,
      text: formatRating(tmdbVote),
      bucket: ratingBucket(tmdbVote),
    };
  }
  const fallback = Number(item?.rating ?? item?.audienceRating ?? item?.userRating);
  if(Number.isFinite(fallback) && fallback > 0){
    return {
      label: 'Bewertung',
      value: fallback,
      text: formatRating(fallback),
      bucket: ratingBucket(fallback),
    };
  }
  return null;
}

function applyHeroMeta(root, item){
  const slot = root.querySelector('[data-head-overlay-meta]');
  if(!slot) return;
  slot.replaceChildren();
  const info = pickRatingInfo(item);
  if(!info){
    slot.hidden = true;
    return;
  }
  const chip = document.createElement('span');
  chip.className = 'v2-chip--rating';
  if(info.bucket) chip.dataset.score = info.bucket;
  const label = document.createElement('span');
  label.textContent = info.label;
  const value = document.createElement('strong');
  value.textContent = info.text;
  chip.append(label, value);
  chip.setAttribute('aria-label', `${info.label} Bewertung ${info.text} von 10`);
  slot.appendChild(chip);
  slot.hidden = false;
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
  const heroLogo = applyHeroLogo(root, item);
  applyHeroMeta(root, item);
  applyLogo(root, item, heroLogo);
}

function onPosterReady(ev){
  ev.currentTarget?.classList.add('is-ready');
}
