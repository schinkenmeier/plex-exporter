import { prefixShowThumb } from '../data.js';

export function renderSeasonsAccordion(seasons){
  const root = document.getElementById('seasonsAccordion');
  if(!root) return;
  root.replaceChildren();
  (seasons||[]).forEach((s, idx)=> root.append(seasonCardEl(s, idx)));
}

function seasonCardEl(season, idx){
  prefixShowThumb(season);
  const card = document.createElement('article'); card.className='season-card';
  const head = document.createElement('div'); head.className='season-head';
  const th = document.createElement('div'); th.className='season-thumb';
  const img = new Image(); img.loading='lazy'; img.decoding='async';
  img.src = season.thumbFile || '';
  img.alt = season.title || `Staffel ${season.seasonNumber||idx+1}`;
  th.append(img);
  const txt = document.createElement('div');
  const title = document.createElement('div'); title.className='season-title'; title.textContent = season.title || `Staffel ${season.seasonNumber||idx+1}`;
  const sub = document.createElement('div'); sub.className='season-sub';
  const year = season.year || season.releaseYear || '';
  const epCount = Array.isArray(season.episodes) ? season.episodes.length : (season.episodeCount || 0);
  sub.textContent = [year, epCount ? `${epCount} Episoden` : ''].filter(Boolean).join(' • ');
  txt.append(title, sub);
  const chev = document.createElement('div'); chev.className='chev'; chev.textContent = '›';
  head.append(th, txt, chev);
  const body = document.createElement('div'); body.className='season-body';
  (season.episodes||[]).forEach(ep => { prefixShowThumb(ep); body.append(episodeRowEl(ep)); });
  head.addEventListener('click', ()=> card.classList.toggle('open'));
  card.append(head, body);
  return card;
}

function episodeRowEl(ep){
  const row = document.createElement('div'); row.className='episode';
  const title = document.createElement('div'); title.className='ep-title';
  const sNum = ep.seasonNumber != null ? Number(ep.seasonNumber) : null;
  const eNum = ep.episodeNumber != null ? Number(ep.episodeNumber) : null;
  const code = (ep.seasonEpisode && String(ep.seasonEpisode).toUpperCase()) || (Number.isFinite(sNum) && Number.isFinite(eNum) ? `S${String(sNum).padStart(2,'0')}E${String(eNum).padStart(2,'0')}` : '');
  title.textContent = `${code ? code + ' • ' : ''}${ep.title || ''}`;
  const right = document.createElement('div'); right.className='badges';
  const r = Number(ep.audienceRating ?? ep.rating);
  if(Number.isFinite(r)){ const b=document.createElement('span'); b.className='badge'; b.textContent = `${r.toFixed(1)}`; right.append(b); }
  const meta = document.createElement('div'); meta.className='ep-meta';
  const durMin = ep.durationMin || (ep.duration ? Math.round(Number(ep.duration)/60000) : null);
  const durText = ep.durationHuman || (durMin ? `${durMin} min` : null);
  const dateText = ep.originallyAvailableAt || ep.date || '';
  meta.textContent = [durText, dateText].filter(Boolean).join(' • ');
  row.append(title, right, meta);
  return row;
}

