export function setExternalLinks(root, item){
  const tmdbBtn = root.querySelector('#v2Tmdb');
  const imdbBtn = root.querySelector('#v2Imdb');
  const trailerBtn = root.querySelector('#v2Trailer');
  const tmdbId = item?.ids?.tmdb || item?.tmdbId;
  const imdbId = item?.ids?.imdb || item?.imdbId;
  const trailer = item?.trailer || item?.trailerUrl;
  const type = item?.type === 'tv' ? 'tv' : 'movie';
  if(tmdbBtn){
    if(tmdbId){
      tmdbBtn.hidden = false;
      tmdbBtn.href = `https://www.themoviedb.org/${type}/${tmdbId}`;
    }else{
      tmdbBtn.hidden = true;
      tmdbBtn.removeAttribute('href');
    }
  }
  if(imdbBtn){
    if(imdbId){
      imdbBtn.hidden = false;
      imdbBtn.href = `https://www.imdb.com/title/${imdbId}/`;
    }else{
      imdbBtn.hidden = true;
      imdbBtn.removeAttribute('href');
    }
  }
  if(trailerBtn){
    if(trailer){
      trailerBtn.hidden = false;
      trailerBtn.onclick = ()=> window.open(trailer, '_blank', 'noopener');
    }else{
      trailerBtn.hidden = true;
      trailerBtn.onclick = null;
    }
  }
}
