export function setExternalLinks(root, item){
  const tmdbBtn = root.querySelector('#action-tmdb, #v2Tmdb');
  const imdbBtn = root.querySelector('#action-imdb, #v2Imdb');
  const trailerBtn = root.querySelector('#action-trailer, #v2Trailer');
  const tmdbId = item?.ids?.tmdb || item?.tmdbId || item?.tmdbDetail?.id || item?.tmdb?.id;
  const imdbId = item?.ids?.imdb || item?.imdbId || item?.tmdbDetail?.imdbId || item?.tmdbDetail?.raw?.external_ids?.imdb_id;
  const trailer = item?.trailer || item?.trailerUrl || item?.tmdbDetail?.trailer;
  const type = item?.type === 'tv' ? 'tv' : 'movie';
  toggleActionLink(tmdbBtn, tmdbId ? `https://www.themoviedb.org/${type}/${tmdbId}` : '');
  toggleActionLink(imdbBtn, imdbId ? `https://www.imdb.com/title/${imdbId}/` : '');
  if(trailerBtn){
    if(trailer){
      trailerBtn.hidden = false;
      trailerBtn.setAttribute('aria-hidden', 'false');
      trailerBtn.removeAttribute('aria-disabled');
      trailerBtn.removeAttribute('tabindex');
      trailerBtn.onclick = ()=> window.open(trailer, '_blank', 'noopener');
    }else{
      trailerBtn.hidden = true;
      trailerBtn.setAttribute('aria-hidden', 'true');
      trailerBtn.setAttribute('aria-disabled', 'true');
      trailerBtn.setAttribute('tabindex', '-1');
      trailerBtn.onclick = null;
    }
  }
}

function toggleActionLink(element, href){
  if(!element) return;
  const isAnchor = element.tagName === 'A';
  const hasHref = Boolean(href);
  element.hidden = !hasHref;
  element.setAttribute('aria-hidden', hasHref ? 'false' : 'true');
  if(isAnchor){
    if(hasHref){
      element.href = href;
      element.removeAttribute('aria-disabled');
      element.removeAttribute('tabindex');
    }else{
      element.removeAttribute('href');
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('tabindex', '-1');
    }
  }else{
    if(hasHref){
      element.removeAttribute('aria-disabled');
      element.removeAttribute('tabindex');
    }else{
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('tabindex', '-1');
    }
  }
}
