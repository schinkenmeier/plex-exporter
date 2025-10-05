export function applyTabs(root){
  const tabs = root.querySelector('.v2-tabs');
  if(!tabs) return;
  const buttons = Array.from(tabs.querySelectorAll('button[data-t]'));
  const select = (target)=>{
    buttons.forEach(btn=>{
      const isActive = btn.dataset.t === target;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
      const pane = root.querySelector(`.v2-pane[data-pane="${btn.dataset.t}"]`);
      if(pane){
        pane.hidden = !isActive;
        pane.setAttribute('aria-hidden', pane.hidden ? 'true' : 'false');
      }
    });
  };
  const moveFocus = (current, delta)=>{
    if(!buttons.length) return;
    const currentIndex = buttons.indexOf(current);
    const fallbackIndex = delta > 0 ? 0 : buttons.length - 1;
    const index = currentIndex === -1 ? fallbackIndex : (currentIndex + delta + buttons.length) % buttons.length;
    const next = buttons[index];
    if(next){
      next.focus();
      select(next.dataset.t);
    }
  };
  tabs.addEventListener('click', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    ev.preventDefault();
    select(btn.dataset.t);
  });
  tabs.addEventListener('keydown', ev=>{
    const btn = ev.target.closest('button[data-t]');
    if(!btn) return;
    switch(ev.key){
      case 'ArrowLeft':
      case 'ArrowUp':
        ev.preventDefault();
        moveFocus(btn, -1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        ev.preventDefault();
        moveFocus(btn, 1);
        break;
      case 'Home':
        ev.preventDefault();
        if(buttons[0]){
          buttons[0].focus();
          select(buttons[0].dataset.t);
        }
        break;
      case 'End':
        ev.preventDefault();
        if(buttons.length){
          const last = buttons[buttons.length - 1];
          last.focus();
          select(last.dataset.t);
        }
        break;
      default:
        break;
    }
  });
  const initial = buttons.find(btn=> btn.classList.contains('active')) || buttons[0];
  if(initial) select(initial.dataset.t);
}
