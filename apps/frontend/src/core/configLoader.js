const LOG_PREFIX = '[configLoader]';

export const DEFAULT_FRONTEND_CONFIG = {
  startView: 'movies',
  tmdbEnabled: false
};

const CONFIG_CANDIDATES = [
  '/config/frontend.json',
  'config/frontend.json',
  './config/frontend.json',
  '../config/frontend.json'
];

async function tryLoad(url, fetchImpl){
  const response = await fetchImpl(url, { cache: 'no-store' });
  if(!response || !response.ok){
    const status = response ? `${response.status} ${response.statusText}` : 'no response';
    throw new Error(`HTTP ${status}`);
  }
  const data = await response.json();
  return data || {};
}

export async function loadFrontendConfig(options = {}){
  const fetchImpl = options.fetch || options.fetchImpl || globalThis.fetch;
  if(typeof fetchImpl !== 'function'){
    throw new Error('fetch implementation is not available');
  }

  const attempted = [];
  let lastError = null;

  for(const url of options.urls || CONFIG_CANDIDATES){
    try{
      const config = await tryLoad(url, fetchImpl);
      if(config && typeof config === 'object'){
        return config;
      }
    }catch(err){
      lastError = err instanceof Error ? err : new Error(String(err));
      attempted.push({ url, error: lastError.message });
      if(options?.logger?.warn){
        options.logger.warn?.(`${LOG_PREFIX} Failed to load ${url}:`, lastError.message);
      }else{
        console.warn(`${LOG_PREFIX} Failed to load ${url}:`, lastError.message);
      }
    }
  }

  const attemptedList = attempted.map(entry => `${entry.url} (${entry.error})`).join(', ');
  const errorMessage = attemptedList ? `Keine Konfiguration gefunden (${attemptedList}).` : 'Keine Konfiguration gefunden.';
  const error = new Error(errorMessage);
  if(lastError){
    error.cause = lastError;
  }
  throw error;
}

export function getConfigCandidates(){
  return [...CONFIG_CANDIDATES];
}
