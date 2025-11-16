import { refreshHero } from './index.js';
import { getState, subscribe as subscribeState } from '../../core/state.js';
import * as HeroPipeline from './pipeline.js';

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
  const pipelineEnabled = HeroPipeline.isEnabled();
  let rotationKind = resolveKind();
  let rotationItems = [];
  let rotationIndex = 0;
  let pipelinePaused = false;
  let rotationSignature = '';
  let unsubscribePipeline = null;
  let unsubscribeState = null;

  if(pipelineEnabled){
    applyRotationPlan(HeroPipeline.getRotationPlan(rotationKind));
    unsubscribePipeline = HeroPipeline.subscribe(() => {
      applyRotationPlan(HeroPipeline.getRotationPlan(rotationKind));
    });
  }

  unsubscribeState = subscribeState(() => {
    const kind = resolveKind();
    if(kind === rotationKind) return;
    rotationKind = kind;
    if(pipelineEnabled){
      applyRotationPlan(HeroPipeline.getRotationPlan(rotationKind));
    }
  });

  function resolveKind(){
    const view = getState().view;
    return view === 'shows' ? 'series' : 'movies';
  }

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

  function advanceRotation(){
    if(!rotationItems.length) return null;
    rotationIndex = (rotationIndex + 1) % rotationItems.length;
    return rotationItems[rotationIndex];
  }

  function applyRotationPlan(plan){
    if(!plan) return;
    const items = Array.isArray(plan.items) ? plan.items : [];
    const snapshot = plan.snapshot || HeroPipeline.getSnapshot();
    const status = snapshot.status?.[rotationKind];
    const kindReady = status && (status.state === 'ready' || status.state === 'stale' || status.state === 'error');
    const busy = !kindReady || status?.regenerating;
    const signature = `${rotationKind}:${status?.updatedAt || 0}:${items.length}`;
    const hadItems = rotationItems.length > 0;
    const previouslyPaused = pipelinePaused;

    rotationItems = items;
    rotationIndex = items.length ? (plan.startIndex % items.length) : 0;
    pipelinePaused = busy || !items.length;
    setPaused('pipeline', pipelinePaused);

    if(!pipelinePaused && items.length){
      if(!hadItems || previouslyPaused || rotationSignature !== signature){
        try { onRefresh?.([items[rotationIndex]]); } catch (_err) {}
        elapsed = 0;
        bar.style.setProperty('--p', '0');
      }
    }

    rotationSignature = signature;
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
        if(pipelineEnabled){
          const next = advanceRotation();
          if(next){ onRefresh?.([next]); }
          else { onRefresh?.(); }
        }else{
          onRefresh?.();
        }
      } catch(_e) {
        // no-op
      }
    }
    raf = requestAnimationFrame(step);
  }

  function start(){ if(!raf) raf = requestAnimationFrame(step); }
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
    reset(){ elapsed = 0; bar.style.setProperty('--p','0'); },
    destroy(){
      if(unsubscribePipeline) unsubscribePipeline();
      if(unsubscribeState) unsubscribeState();
    }
  };
}
