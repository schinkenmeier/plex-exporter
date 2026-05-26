const SITE_NAV_OPEN_CLASS = 'nav-open';
const SITE_NAV_TOGGLE_ID = 'siteNavToggle';
const SITE_NAV_ID = 'siteNav';
const SITE_NAV_BACKDROP_ID = 'siteNavBackdrop';
const NAV_DRAWER_CLASS = 'is-drawer';
const SITE_NAV_BREAKPOINT = '(max-width: 960px)';

export function initSiteNavigation(){
  const toggle = document.getElementById(SITE_NAV_TOGGLE_ID);
  const nav = document.getElementById(SITE_NAV_ID);
  const backdrop = document.getElementById(SITE_NAV_BACKDROP_ID);
  if(!toggle || !nav) return;
  const shell = document.body;
  const mediaQuery = window.matchMedia?.(SITE_NAV_BREAKPOINT) ?? null;
  const isDrawerMode = () => !!mediaQuery?.matches;

  const closeNav = ()=>{
    shell.classList.remove(SITE_NAV_OPEN_CLASS);
    nav.dataset.state = isDrawerMode() ? 'closed' : 'desktop';
    if(isDrawerMode()){
      nav.setAttribute('aria-hidden', 'true');
    }else{
      nav.removeAttribute('aria-hidden');
    }
    toggle.setAttribute('aria-expanded','false');
    backdrop?.setAttribute('hidden','');
  };

  const setOpen = open=>{
    if(!isDrawerMode()){
      closeNav();
      return;
    }
    if(open){
      shell.classList.add(SITE_NAV_OPEN_CLASS);
      nav.dataset.state = 'open';
      nav.setAttribute('aria-hidden','false');
      toggle.setAttribute('aria-expanded','true');
      backdrop?.removeAttribute('hidden');
    }else{
      closeNav();
    }
  };

  const syncMode = ()=>{
    if(isDrawerMode()){
      toggle.hidden = false;
      nav.classList.add(NAV_DRAWER_CLASS);
      nav.setAttribute('aria-hidden', nav.dataset.state === 'open' ? 'false' : 'true');
    }else{
      toggle.hidden = true;
      nav.classList.remove(NAV_DRAWER_CLASS);
      closeNav();
    }
  };

  toggle.addEventListener('click', ()=>{
    if(!isDrawerMode()) return;
    const isOpen = shell.classList.contains(SITE_NAV_OPEN_CLASS);
    setOpen(!isOpen);
  });

  backdrop?.addEventListener('click', ()=> setOpen(false));

  nav.addEventListener('click', event=>{
    if(!isDrawerMode()) return;
    const target = event.target;
    if(!(target instanceof HTMLElement)) return;
    if(target.closest('[data-lib],[role="menuitem"],button,a')){
      setOpen(false);
    }
  });

  document.addEventListener('keyup', evt=>{
    if(evt.key === 'Escape'){
      setOpen(false);
    }
  });

  const handleChange = ()=>{
    syncMode();
  };

  if(mediaQuery?.addEventListener){
    mediaQuery.addEventListener('change', handleChange);
  }else if(mediaQuery?.addListener){
    mediaQuery.addListener(handleChange);
  }

  syncMode();
}
