export function updateOverview(root, text){
  const pane = root.querySelector('.v2-overview');
  if(!pane) return;

  const overview = typeof text === 'string' ? text : '';

  if(!overview){
    pane.textContent = '';
    return;
  }

  const paragraph = document.createElement('p');
  paragraph.className = 'v2-overview-text line-clamp line-clamp-5';
  paragraph.textContent = overview;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'v2-overview-toggle';

  const setExpanded = (expanded)=>{
    paragraph.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
  };

  toggle.addEventListener('click', ()=>{
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });

  pane.replaceChildren(paragraph, toggle);
  setExpanded(false);

  const measure = ()=>{
    const overflowing = paragraph.scrollHeight > paragraph.clientHeight + 1;
    if(!overflowing){
      paragraph.classList.add('is-expanded');
      toggle.hidden = true;
    }
  };
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb)=>setTimeout(cb, 0);
  schedule(measure);
}
