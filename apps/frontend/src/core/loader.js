import { createLoaderOverlay } from '../ui/loaderOverlay.js';
import { createGridSkeleton } from '../ui/gridSkeleton.js';

const overlay = createLoaderOverlay();
const skeleton = createGridSkeleton('#grid');

export function showLoader(message){
  overlay.show(message);
}

export function setLoader(message, progress){
  overlay.update({ message, progress });
}

export function hideLoader(){
  overlay.hide();
}

export function showSkeleton(count = 18){
  skeleton.show(count);
}

export function clearSkeleton(){
  skeleton.clear();
}
