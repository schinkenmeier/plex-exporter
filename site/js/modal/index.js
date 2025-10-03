import {
  openMovieModalV2 as openMovieModalV2Impl,
  openSeriesModalV2 as openSeriesModalV2Impl,
  closeModalV2,
  isModalV2Open,
  getModalV2Context,
} from '../modalV2.js';

function ensureModalLayoutPreference(){
  try{
    const stored = localStorage.getItem('modalLayout');
    if(stored !== 'v2') localStorage.setItem('modalLayout', 'v2');
  }catch{}
}

function isShowLike(source){
  const type = String(source?.type || source?.librarySectionType || '').toLowerCase();
  return type === 'show' || type === 'tv';
}

export function getModalLayout(){
  ensureModalLayoutPreference();
  return 'v2';
}

export function setModalLayout(){
  ensureModalLayoutPreference();
  return 'v2';
}

export function openModal(item){
  if(!item) return;
  return isShowLike(item) ? openSeriesModalV2(item) : openMovieModalV2(item);
}

export function openMovieModalV2(idOrData){
  ensureModalLayoutPreference();
  return openMovieModalV2Impl(idOrData);
}

export function openSeriesModalV2(idOrData){
  ensureModalLayoutPreference();
  return openSeriesModalV2Impl(idOrData);
}

export { closeModalV2, isModalV2Open, getModalV2Context };
