export function applyTabs(root){
  const tabs = root.querySelector('.v2-tabs');
  if(!tabs) return;
  const buttons = Array.from(tabs.querySelectorAll('[role="tab"][data-t]'));
  if(!buttons.length) return;

  const panes = Array.from(root.querySelectorAll('[role="tabpanel"], .v2-pane'));
  const paneLookup = new Map();
  panes.forEach(pane=>{
    const keys = [];
    const dataT = pane.getAttribute('data-t');
    const dataPane = pane.getAttribute('data-pane');
    if(dataT) keys.push(dataT);
    if(dataPane) keys.push(dataPane);
    if(pane.id) keys.push(pane.id);
    keys.forEach(key=>{
      if(!paneLookup.has(key)){
        paneLookup.set(key, pane);
      }
    });
  });

  const getPaneForButton = btn=>{
    if(!btn) return null;
    const control = btn.getAttribute('aria-controls');
    if(control && paneLookup.has(control)) return paneLookup.get(control);

    const dataKey = btn.dataset.t || btn.dataset.pane;
    if(dataKey && paneLookup.has(dataKey)) return paneLookup.get(dataKey);

    if(control){
      const doc = root.ownerDocument || (root.nodeType === 9 ? root : (typeof document !== 'undefined' ? document : null));
      if(doc && typeof doc.getElementById === 'function'){
        const paneById = doc.getElementById(control);
        if(paneById && (!root.contains || root.contains(paneById))) return paneById;
      }
    }

    if(dataKey){
      return root.querySelector(`[data-pane="${dataKey}"]`) || root.querySelector(`[data-t="${dataKey}"]`);
    }

    return null;
  };

  const select = target=>{
    const targetBtn = typeof target === 'string'
      ? buttons.find(btn=> btn.dataset.t === target || btn.getAttribute('aria-controls') === target)
      : target;
    if(!targetBtn) return;

    buttons.forEach(btn=>{
      const isActive = btn === targetBtn;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
      const pane = getPaneForButton(btn);
      if(pane){
        pane.classList.toggle('is-hidden', !isActive);
        pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        if(isActive){
          pane.removeAttribute('hidden');
        }else{
          pane.setAttribute('hidden', '');
        }
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
      select(next);
    }
  };
  tabs.addEventListener('click', ev=>{
    const btn = ev.target.closest('[role="tab"][data-t]');
    if(!btn) return;
    ev.preventDefault();
    select(btn);
  });
  tabs.addEventListener('keydown', ev=>{
    const btn = ev.target.closest('[role="tab"][data-t]');
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
          select(buttons[0]);
        }
        break;
      case 'End':
        ev.preventDefault();
        if(buttons.length){
          const last = buttons[buttons.length - 1];
          last.focus();
          select(last);
        }
        break;
      default:
        break;
    }
  });
  const initial = buttons.find(btn=> btn.getAttribute('aria-selected') === 'true') || buttons[0];
  if(initial) select(initial);
}
