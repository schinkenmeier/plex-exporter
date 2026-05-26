let taglineTicker = null;

export function setReduceMotionClass(pref){
  try{
    const body = document.body;
    if(body){
      document.documentElement?.classList.remove('reduce-motion', 'reduced-motion');
      body.classList.remove('reduced-motion');
      body.classList.toggle('reduce-motion', pref);
    } else {
      document.documentElement?.classList.toggle('reduce-motion', pref);
      window.addEventListener('DOMContentLoaded', ()=> setReduceMotionClass(pref), { once: true });
    }
  }catch(err){
    console.warn('[main] Failed to update reduce motion class:', err.message);
  }
}

export function applyReduceMotionPref(){
  try{
    const pref = localStorage.getItem('prefReduceMotion')==='1';
    setReduceMotionClass(pref);
  }catch(err){
    console.warn('[main] Failed to apply reduce motion preference:', err.message);
  }
}

export function initHeaderInteractions(){
  const siteLogo = document.getElementById('siteLogo');
  if(siteLogo){
    siteLogo.addEventListener('error', ()=>{
      siteLogo.classList.add('logo-missing');
      const titleEl = document.querySelector('.site-header__brand-text .site-header__label');
      if(titleEl) titleEl.classList.remove('sr-only');
    });
  }
  const subtitle = document.getElementById('heroTagline');
  const TAGLINES = [
    'Curated spotlights and smart filters for every mood.',
    'Bring Plex highlights anywhere with server-powered browsing.',
    'Plan your next movie night with shareable watchlists.'
  ];
  let idx = 0;
  if(subtitle && !subtitle.textContent){
    subtitle.textContent = TAGLINES[idx];
  }
  function rotate(){
    if(!subtitle || subtitle.dataset.taglinePaused === '1') return;
    subtitle.classList.add('is-fading');
    setTimeout(()=>{
      if(!subtitle || subtitle.dataset.taglinePaused === '1'){ subtitle && subtitle.classList.remove('is-fading'); return; }
      idx = (idx + 1) % TAGLINES.length;
      subtitle.textContent = TAGLINES[idx];
      subtitle.classList.remove('is-fading');
    }, 280);
  }
  if(subtitle){
    subtitle.dataset.taglinePaused = subtitle.dataset.taglinePaused === '1' ? '1' : '0';
    if(taglineTicker){
      clearInterval(taglineTicker);
    }
    taglineTicker = setInterval(rotate, 6000);
    setTimeout(rotate, 3000);
  }else if(taglineTicker){
    clearInterval(taglineTicker);
    taglineTicker = null;
  }
}
