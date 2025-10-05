import { refreshHero } from './hero.js';

export function initHeroAutoplay({ onRefresh = refreshHero } = {}){
  const hero = document.getElementById('hero');
  const timer = document.getElementById('heroTimer');
  const bar = timer ? timer.querySelector('.hero-timer__bar') : null;
  if(!hero || !timer || !bar) return null;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce) { timer.hidden = true; return null; }
  timer.removeAttribute('aria-hidden');
  timer.dataset.state = 'running';

  const DURATION = 15000; // 15s
  const pauseReasons = new Set();
  let wasPaused = false;
  let elapsed = 0; // ms accumulated when not paused
  let raf = null;
  let lastTs = 0;

  function isPaused(){
    return pauseReasons.size > 0;
  }

  function updatePausedState(){
    const pausedNow = isPaused();
    timer.dataset.state = pausedNow ? 'paused' : 'running';
    if(wasPaused && !pausedNow){
      lastTs = 0;
    }
    wasPaused = pausedNow;
  }

  function setPaused(reason, value){
    if(value){
      pauseReasons.add(reason);
    }else{
      pauseReasons.delete(reason);
    }
    updatePausedState();
  }

  function step(ts){
    if(isPaused()){ lastTs = ts; raf = requestAnimationFrame(step); return; }
    if(!lastTs) lastTs = ts;
    const dt = Math.max(0, ts - lastTs);
    lastTs = ts;
    elapsed += dt;
    const prog = Math.max(0, Math.min(1, elapsed / DURATION));
    bar.style.setProperty('--p', String(prog));
    if(prog >= 1){
      // reset and ask app to refresh hero gently
      elapsed = 0; lastTs = ts; bar.style.setProperty('--p','0');
      try {
        onRefresh?.();
      } catch(_e) {
        // no-op
      }
    }
    raf = requestAnimationFrame(step);
  }

  function start(){ if(!raf) raf = requestAnimationFrame(step); }
  // Pause on hover (without affecting layout)
  hero.addEventListener('mouseenter', () => { setPaused('hover', true); });
  hero.addEventListener('mouseleave', () => { setPaused('hover', false); });
  document.addEventListener('visibilitychange', () => {
    setPaused('hidden', document.hidden);
  });

  if(document.hidden){
    setPaused('hidden', true);
  } else {
    updatePausedState();
  }

  start();

  return {
    pause(){ setPaused('manual', true); },
    resume(){ setPaused('manual', false); },
    reset(){ elapsed = 0; bar.style.setProperty('--p','0'); }
  };
}
