// Optional TMDB enrichment. Supports v4 Bearer token or v3 API key.

const API_V3 = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const POSTER_W = 'w342';
const BACKDROP_W = 'w780';

let cache;

function loadCache(){
  try{ return new Map(JSON.parse(localStorage.getItem('tmdbCache')||'[]')); }catch{ return new Map(); }
}
function persist(){ try{ localStorage.setItem('tmdbCache', JSON.stringify(Array.from(cache.entries()))); }catch{} }
export function clearCache(){ try{ localStorage.removeItem('tmdbCache'); cache = new Map(); }catch{} }

function tokenFromEnv(cfg){
  try{
    const t = localStorage.getItem('tmdbToken');
    if(t) return { kind:'bearer', value: t };
  }catch{}
  if(cfg?.tmdbApiKey) return { kind:'apikey', value: String(cfg.tmdbApiKey) };
  return { kind:'none', value: '' };
}

function keyFor(item){
  const t = (item.type==='tv') ? 'tv' : 'movie';
  const imdb = item?.ids?.imdb || '';
  const tmdb = item?.ids?.tmdb || '';
  const title = (item.title||'').toLowerCase();
  const year = String(item.year || '').slice(0,4);
  return [t, imdb, tmdb, title, year].filter(Boolean).join('|');
}

function withAuth(url, auth){
  if(!auth || auth.kind==='none') return { url, init:{} };
  if(auth.kind==='bearer') return { url, init: { headers: { 'Authorization': `Bearer ${auth.value}`, 'Accept':'application/json' } } };
  // v3 api key via query param
  const sep = url.includes('?') ? '&' : '?';
  return { url: `${url}${sep}api_key=${encodeURIComponent(auth.value)}`, init: { headers: { 'Accept':'application/json' } } };
}

async function getJson(url, auth){
  const { url: u, init } = withAuth(url, auth);
  const res = await fetch(u, init);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

function pickBestPoster(p){ return p?.file_path ? IMG+POSTER_W+p.file_path : ''; }
function pickBestBackdrop(p){ return p?.file_path ? IMG+BACKDROP_W+p.file_path : ''; }

async function byId(type, id, lang, auth){
  const inf = await getJson(`${API_V3}/${type}/${id}?language=${encodeURIComponent(lang||'de-DE')}`, auth);
  const images = await getJson(`${API_V3}/${type}/${id}/images`, auth).catch(()=>({ posters:[], backdrops:[] }));
  const poster = pickBestPoster((images.posters||[])[0]) || (inf.poster_path ? IMG+POSTER_W+inf.poster_path : '');
  const backdrop = pickBestBackdrop((images.backdrops||[])[0]) || (inf.backdrop_path ? IMG+BACKDROP_W+inf.backdrop_path : '');
  return { id: inf.id, poster, backdrop, url: `https://www.themoviedb.org/${type}/${inf.id}` };
}

async function bySearch(type, title, year, lang, auth){
  const q = encodeURIComponent(title||'');
  const yParam = year ? `&year=${encodeURIComponent(String(year))}` : '';
  const res = await getJson(`${API_V3}/search/${type}?query=${q}${yParam}&language=${encodeURIComponent(lang||'de-DE')}`, auth);
  const first = (res.results||[])[0];
  if(!first) throw new Error('not found');
  return byId(type, first.id, lang, auth);
}

async function hydrateItem(item, cfg, auth){
  const type = (item.type==='tv') ? 'tv' : 'movie';
  const k = keyFor(item);
  if(cache.has(k)) return cache.get(k);
  let out;
  try{
    if(item?.ids?.tmdb){ out = await byId(type, item.ids.tmdb, cfg.lang, auth); }
    else if(item?.ids?.imdb){
      // find by external id
      const json = await getJson(`${API_V3}/find/${item.ids.imdb}?external_source=imdb_id&language=${encodeURIComponent(cfg.lang||'de-DE')}`, auth);
      const hit = (type==='movie' ? (json.movie_results||[])[0] : (json.tv_results||[])[0]);
      if(hit) out = await byId(type, hit.id, cfg.lang, auth); else throw new Error('not found');
    }else{
      out = await bySearch(type, item.title, item.year, cfg.lang, auth);
    }
  }catch(e){ out = null; }
  cache.set(k, out);
  persist();
  return out;
}

export async function hydrateOptional(movies, shows, cfg={}){
  try{
    cache = cache || loadCache();
    const auth = tokenFromEnv(cfg);
    if(!auth.value) return;
    const work = (movies||[]).concat(shows||[]);
    let i = 0; const limit = 40; // keep it light
    const next = async()=>{
      const chunk = work.slice(i, i+4); i += 4;
      await Promise.all(chunk.map(async (it)=>{
        const data = await hydrateItem(it, cfg, auth);
        if(data){
          it.tmdb = { id:data.id, poster:data.poster, backdrop:data.backdrop, url:data.url };
          it.ids = it.ids||{}; if(!it.ids.tmdb && data.id) it.ids.tmdb = String(data.id);
        }
      }));
      try{ window.dispatchEvent(new CustomEvent('tmdb:chunk', { detail: { updated: chunk.length, index: i } })); }catch{}
      if(i < Math.min(work.length, limit)) (window.requestIdleCallback||setTimeout)(next, 250);
      else{ try{ window.dispatchEvent(new CustomEvent('tmdb:done', { detail: { total: Math.min(work.length, limit) } })); }catch{} }
    };
    next();
  }catch{}
}

// Lightweight token validation used by settings UI
export async function validateToken(raw){
  const token = String(raw||'').trim();
  if(!token) throw new Error('empty');
  const looksLikeV3 = /^[a-f0-9]{32}$/i.test(token);
  const looksLikeJwt = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
  const decodeJwtPayload = (t)=>{
    try{
      const part = t.split('.')[1];
      const pad = (s)=> s + '='.repeat((4 - (s.length % 4)) % 4);
      const json = atob(pad(part.replace(/-/g,'+').replace(/_/g,'/')));
      return JSON.parse(json);
    }catch{ return null; }
  };

  // If it looks like a v3 API key, validate it against a protected v3 config endpoint
  if(looksLikeV3){
    const { url, init } = withAuth(`${API_V3}/configuration`, { kind:'apikey', value: token });
    const res = await fetch(url, init);
    if(res.ok) return { ok:true, as:'apikey', hint:'v3Key' };
    return { ok:false, as:'apikey', hint:'looksV3' };
  }

  // Heuristic validation for v4 Bearer tokens (API Read Access Token):
  // - Check JWT shape and issuer claim if present
  // - Perform a benign v3 request with Bearer header to confirm CORS/connectivity
  if(looksLikeJwt){
    const payload = decodeJwtPayload(token);
    if(payload && typeof payload === 'object'){
      const iss = String(payload.iss||'');
      if(iss && !/themoviedb\.org/i.test(iss)){
        return { ok:false, as:'bearer', hint:'issMismatch' };
      }
    }
    const { url, init } = withAuth(`${API_V3}/trending/movie/day`, { kind:'bearer', value: token });
    try{
      const res = await fetch(url, init);
      if(res.ok) return { ok:true, as:'bearer', hint:null };
    }catch{}
    // Some public endpoints ignore invalid Authorization headers; fall back to structural pass
    return { ok:true, as:'bearer', hint:'structOnly' };
  }

  return { ok:false, as:'bearer', hint:null };
}
