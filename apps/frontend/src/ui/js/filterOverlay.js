const FILTER_OVERLAY_CLASS = 'filters-overlay-open';
const FILTER_OVERLAY_BREAKPOINT = '(max-width: 640px)';
const FILTER_OVERLAY_BACKDROP_ID = 'filtersOverlayBackdrop';
const FILTER_CLOSE_ID = 'advancedCloseBtn';

export function initAdvancedToggle(){
  const btn = document.getElementById('toggleAdvanced');
  const panel = document.getElementById('advancedFilters');
  if(!btn || !panel) return;
  const closeBtn = document.getElementById(FILTER_CLOSE_ID);
  const backdrop = document.getElementById(FILTER_OVERLAY_BACKDROP_ID);
  const body = document.body;
  const mediaQuery = window.matchMedia?.(FILTER_OVERLAY_BREAKPOINT) ?? null;
  let animating = false;
  let fallbackTimer = 0;
  let overlayActive = false;

  const prefersOverlay = () => !!mediaQuery?.matches;

  const finishAnimation = ()=>{
    animating = false;
    if(fallbackTimer){
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    if(panel.dataset.state === 'closing'){
      panel.dataset.state = 'closed';
      panel.hidden = true;
      panel.style.removeProperty('--advanced-max');
    }else if(panel.dataset.state === 'open'){
      panel.style.removeProperty('--advanced-max');
    }else if(panel.dataset.state === 'expanding'){
      panel.dataset.state = 'open';
      panel.style.removeProperty('--advanced-max');
    }
  };

  const queueFinish = ()=>{
    if(fallbackTimer){
      clearTimeout(fallbackTimer);
    }
    fallbackTimer = window.setTimeout(finishAnimation, 320);
  };

  panel.addEventListener('transitionend', event=>{
    if(event.target !== panel || event.propertyName !== 'max-height') return;
    finishAnimation();
  });

  const openPanel = ()=>{
    if(prefersOverlay()){
      overlayActive = true;
      panel.hidden = false;
      panel.dataset.state = 'overlay';
      panel.setAttribute('aria-hidden', 'false');
      body.classList.add(FILTER_OVERLAY_CLASS);
      btn.setAttribute('aria-expanded', 'true');
      return;
    }
    if(animating) return;
    animating = true;
    panel.hidden = false;
    panel.dataset.state = 'expanding';
    panel.setAttribute('aria-hidden', 'false');
    panel.style.setProperty('--advanced-max', '0px');
    requestAnimationFrame(()=>{
      const height = panel.scrollHeight;
      panel.style.setProperty('--advanced-max', height + 'px');
      panel.dataset.state = 'open';
      btn.setAttribute('aria-expanded', 'true');
      queueFinish();
    });
  };

  const closePanel = ()=>{
    if(overlayActive || (prefersOverlay() && btn.getAttribute('aria-expanded') === 'true')){
      overlayActive = false;
      body.classList.remove(FILTER_OVERLAY_CLASS);
      panel.dataset.state = 'closed';
      panel.setAttribute('aria-hidden', 'true');
      panel.hidden = true;
      panel.style.removeProperty('--advanced-max');
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    if(animating) return;
    animating = true;
    const height = panel.scrollHeight;
    panel.style.setProperty('--advanced-max', height + 'px');
    panel.dataset.state = 'closing';
    panel.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(()=>{
      panel.style.setProperty('--advanced-max', '0px');
      queueFinish();
    });
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', ()=>{
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if(expanded){
      closePanel();
    }else{
      openPanel();
    }
  });

  closeBtn?.addEventListener('click', closePanel);
  backdrop?.addEventListener('click', closePanel);

  document.addEventListener('keyup', event=>{
    if(event.key === 'Escape' && (btn.getAttribute('aria-expanded') === 'true' || overlayActive)){
      closePanel();
    }
  });

  const handleMediaChange = ()=>{
    if(!mediaQuery) return;
    if(mediaQuery.matches){
      if(btn.getAttribute('aria-expanded') === 'true'){
        overlayActive = true;
        body.classList.add(FILTER_OVERLAY_CLASS);
        panel.hidden = false;
        panel.dataset.state = 'overlay';
        panel.setAttribute('aria-hidden','false');
      }else{
        overlayActive = false;
        body.classList.remove(FILTER_OVERLAY_CLASS);
        panel.hidden = true;
        panel.dataset.state = 'closed';
      }
      panel.style.removeProperty('--advanced-max');
      animating = false;
    }else if(overlayActive){
      overlayActive = false;
      body.classList.remove(FILTER_OVERLAY_CLASS);
      if(btn.getAttribute('aria-expanded') === 'true'){
        panel.hidden = false;
        panel.dataset.state = 'open';
        panel.setAttribute('aria-hidden','false');
      }else{
        panel.hidden = true;
        panel.dataset.state = 'closed';
      }
    }
  };

  if(mediaQuery?.addEventListener){
    mediaQuery.addEventListener('change', handleMediaChange);
  }else if(mediaQuery?.addListener){
    mediaQuery.addListener(handleMediaChange);
  }
}
