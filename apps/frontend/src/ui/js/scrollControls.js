export function initScrollProgress(){
  const bar = document.getElementById('scrollProgress');
  if(!bar) return;
  const update = ()=>{
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
    const height = (document.documentElement.scrollHeight - document.documentElement.clientHeight) || 1;
    const pct = Math.max(0, Math.min(100, (scrollTop/height)*100));
    bar.style.width = pct + '%';
  };
  window.addEventListener('scroll', update, { passive:true });
  update();
}

export function initScrollTop(){
  const btn = document.getElementById('scrollTop');
  if(!btn) return;
  const toggle = ()=>{ const y = window.scrollY||0; btn.style.display = y>300 ? 'block' : 'none'; };
  window.addEventListener('scroll', toggle, { passive:true });
  toggle();
  btn.addEventListener('click', ()=> window.scrollTo({ top:0, behavior:'smooth' }));
}

export function initFilterBarAutoHideFallback(){
  const filters = document.querySelector('.filters');
  if(!filters) return;

  const supportsScrollTimeline = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('animation-timeline: scroll()');

  if(supportsScrollTimeline) return;

  let lastY = window.scrollY || window.pageYOffset || 0;
  let isHidden = false;
  let ticking = false;
  const MIN_SCROLL = 120;
  const DELTA_HIDE = 8;

  const setHidden = (nextHidden)=>{
    if(isHidden === nextHidden) return;
    isHidden = nextHidden;
    filters.classList.toggle('is-hidden', isHidden);
  };

  const update = ()=>{
    ticking = false;
    const currentY = window.scrollY || window.pageYOffset || 0;

    if(currentY <= MIN_SCROLL){
      setHidden(false);
      lastY = currentY;
      return;
    }

    const delta = currentY - lastY;
    lastY = currentY;

    if(delta > DELTA_HIDE){
      setHidden(true);
    }else if(delta < -DELTA_HIDE){
      setHidden(false);
    }
  };

  const onScroll = ()=>{
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', update);

  const reveal = ()=> setHidden(false);
  filters.addEventListener('focusin', reveal);
  filters.addEventListener('pointerenter', reveal, { passive:true });
  filters.addEventListener('pointerdown', reveal, { passive:true });

  update();
}

export function initInfiniteScroll(){
  let scrollTimeout = null;
  const handleScrollState = () => {
    document.body.classList.add('is-scrolling');
    if(scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      document.body.classList.remove('is-scrolling');
      scrollTimeout = null;
    }, 150);
  };

  window.addEventListener('scroll', handleScrollState, { passive: true });
}
