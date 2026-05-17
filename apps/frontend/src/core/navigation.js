let hashNavigator = null;

export function setHashNavigator(handler){
  hashNavigator = typeof handler === 'function' ? handler : null;
}

export function navigateToHash(hash, options = {}){
  if(hashNavigator){
    hashNavigator(hash, options);
    return;
  }

  if(typeof window === 'undefined' || !window.location) return;
  const target = String(hash || '').trim();
  if(!target) return;
  window.location.hash = target.startsWith('#') ? target : `#${target}`;
}

export function createHashNavigation({ onWarning } = {}){
  let lastHash = window.location.hash || '';
  let suppressedHash = null;
  const warn = typeof onWarning === 'function' ? onWarning : () => {};

  function normalizeHash(raw){
    if(typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if(!trimmed) return '';
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  function updateHash(targetHash, options = {}){
    const { replace = false, silent = false } = options;
    const hash = normalizeHash(targetHash);
    if(!hash) return;

    const current = window.location.hash || '';
    if(hash === current){
      if(replace && history && typeof history.replaceState === 'function'){
        try{
          history.replaceState(null, '', hash);
        }catch(err){
          warn('[main] Failed to replace hash via history:', err.message);
        }
      }
      if(silent){
        suppressedHash = hash;
        lastHash = hash;
      }
      return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    let usedHistory = false;
    try{
      if(history && typeof history[method] === 'function'){
        history[method](null, '', hash);
        usedHistory = true;
      }
    }catch(err){
      warn(`[main] Failed to ${replace ? 'replace' : 'push'} hash via history:`, err.message);
    }

    if(!usedHistory){
      window.location.hash = hash;
      if(silent){
        suppressedHash = hash;
        lastHash = hash;
      }
      return;
    }

    if(silent){
      suppressedHash = hash;
      lastHash = hash;
      return;
    }

    try{
      const event = typeof HashChangeEvent === 'function' ? new HashChangeEvent('hashchange') : new Event('hashchange');
      window.dispatchEvent(event);
    }catch(err){
      warn('[main] Failed to dispatch hashchange event:', err.message);
    }
  }

  function shouldHandle(hash){
    const current = typeof hash === 'string' ? hash : '';
    if(suppressedHash && current === suppressedHash){
      suppressedHash = null;
      return false;
    }
    suppressedHash = null;
    if(current === lastHash) return false;
    lastHash = current;
    return true;
  }

  function markProcessed(hash){
    lastHash = typeof hash === 'string' ? hash : '';
    suppressedHash = null;
  }

  return { navigate: updateHash, shouldHandle, markProcessed };
}
