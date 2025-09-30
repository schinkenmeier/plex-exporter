export async function loadMovies(){
  return fetch('data/movies.json', { cache: 'no-store' }).then(r=>r.ok?r.json():[]).catch(()=>[]);
}
export async function loadShows(){
  return fetch('data/shows.json', { cache: 'no-store' }).then(r=>r.ok?r.json():[]).catch(()=>[]);
}
export function buildFacets(movies, shows){
  // kept for compatibility; filter.js provides a richer computeFacets
  const genres = new Set();
  const years = new Set();
  (movies||[]).concat(shows||[]).forEach(x=>{
    (x.genres||[]).forEach(g=>{ if(g&&g.tag) genres.add(g.tag); });
    const y = x.year || (x.originallyAvailableAt?String(x.originallyAvailableAt).slice(0,4):'');
    if(y) years.add(Number(y));
  });
  return { genres:[...genres].sort(), years:[...years].sort((a,b)=>a-b), collections: [] };
}
