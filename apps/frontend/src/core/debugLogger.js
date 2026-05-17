const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'debug']);

export function isDebugEnabled(){
  try{
    if(typeof globalThis !== 'undefined' && globalThis.__PLEX_DEBUG__ === true) return true;
    if(typeof window !== 'undefined'){
      if(window.__PLEX_DEBUG__ === true) return true;
      const search = window.location?.search || '';
      const params = new URLSearchParams(search);
      const value = params.get('debug') || params.get('plexDebug');
      if(value && TRUE_VALUES.has(String(value).toLowerCase())) return true;
      const stored = window.localStorage?.getItem('plex-debug');
      if(stored && TRUE_VALUES.has(String(stored).toLowerCase())) return true;
    }
  }catch{
    return false;
  }
  return false;
}

export function debugLog(...args){
  if(isDebugEnabled()){
    console.log(...args);
  }
}
