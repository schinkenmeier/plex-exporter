// Optional TMDB enrichment. Only runs if enabled and token present.

const API_V4 = 'https://api.themoviedb.org/3';
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
  try{ const t = localStorage.getItem('tmdbToken'); if(t) return t; }catch{}
  return cfg?.tmdbApiKey || '';
}

function keyFor(item){
  const t = (item.type==='tv') ? 'tv' : 'movie';
  const imdb = item?.ids?.imdb || '';
  const tmdb = item?.ids?.tmdb || '';
  const title = (item.title||'').toLowerCase();
  const year = String(item.year || '').slice(0,4);
  return [t, imdb, tmdb, title, year].filter(Boolean).join('|');
}

async function getJson(url, token){
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept':'application/json' } });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

function pickBestPoster(p){ return p?.file_path ? IMG+POSTER_W+p.file_path : ''; }
function pickBestBackdrop(p){ return p?.file_path ? IMG+BACKDROP_W+p.file_path : ''; }

async function byId(type, id, lang, token){
  const inf = await getJson(`${API_V4}/${type}/${id}?language=${encodeURIComponent(lang||'de-DE')}`, token);
  const images = await getJson(`${API_V4}/${type}/${id}/images`, token).catch(()=>({ posters:[], backdrops:[] }));
  const poster = pickBestPoster((images.posters||[])[0]) || (inf.poster_path ? IMG+POSTER_W+inf.poster_path : '');
  const backdrop = pickBestBackdrop((images.backdrops||[])[0]) || (inf.backdrop_path ? IMG+BACKDROP_W+inf.backdrop_path : '');
  return { id: inf.id, poster, backdrop, url: `https://www.themoviedb.org/${type}/${inf.id}` };
}

async function bySearch(type, title, year, lang, token){
  const q = encodeURIComponent(title||'');
  const yParam = year ? `&year=${encodeURIComponent(String(year))}` : '';
  const res = await getJson(`${API_V4}/search/${type}?query=${q}${yParam}&language=${encodeURIComponent(lang||'de-DE')}`, token);
  const first = (res.results||[])[0];
  if(!first) throw new Error('not found');
  return byId(type, first.id, lang, token);
}

async function hydrateItem(item, cfg, token){
  const type = (item.type==='tv') ? 'tv' : 'movie';
  const k = keyFor(item);
  if(cache.has(k)) return cache.get(k);
  let out;
  try{
    if(item?.ids?.tmdb){ out = await byId(type, item.ids.tmdb, cfg.lang, token); }
    else if(item?.ids?.imdb){
      // find by external id
      const json = await getJson(`${API_V4}/find/${item.ids.imdb}?external_source=imdb_id&language=${encodeURIComponent(cfg.lang||'de-DE')}`, token);
      const hit = (type==='movie' ? (json.movie_results||[])[0] : (json.tv_results||[])[0]);
      if(hit) out = await byId(type, hit.id, cfg.lang, token); else throw new Error('not found');
    }else{
      out = await bySearch(type, item.title, item.year, cfg.lang, token);
    }
  }catch(e){ out = null; }
  cache.set(k, out);
  persist();
  return out;
}

export async function hydrateOptional(movies, shows, cfg={}){
  try{
    cache = cache || loadCache();
    const token = tokenFromEnv(cfg);
    if(!token) return;
    const work = (movies||[]).concat(shows||[]);
    let i = 0; const limit = 40; // keep it light
    const next = async()=>{
      const chunk = work.slice(i, i+4); i += 4;
      await Promise.all(chunk.map(async (it)=>{
        const data = await hydrateItem(it, cfg, token);
        if(data){
          it.tmdb = { id:data.id, poster:data.poster, backdrop:data.backdrop, url:data.url };
          it.ids = it.ids||{}; if(!it.ids.tmdb && data.id) it.ids.tmdb = String(data.id);
        }
      }));
      if(i < Math.min(work.length, limit)) (window.requestIdleCallback||setTimeout)(next, 250);
    };
    next();
  }catch{}
}
