const TAB_SELECTOR = '[data-tab]';

function getButtons(container){
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(!container || (elementCtor && !(container instanceof elementCtor))) return [];
  return Array.from(container.querySelectorAll(TAB_SELECTOR)).filter(btn => {
    return btn instanceof elementCtor;
  });
}

function resolvePanel(root, button){
  if(!root || !button) return null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  const doc = root.ownerDocument || (elementCtor && root instanceof elementCtor ? root.ownerDocument : null) || (typeof document !== 'undefined' ? document : null);
  const controlId = button.getAttribute('aria-controls');
  if(controlId && doc){
    const byId = doc.getElementById(controlId);
    if(byId && (!root.contains || root.contains(byId))) return byId;
  }
  const dataTab = button.dataset ? (button.dataset.tab || button.dataset.pane) : '';
  if(dataTab){
    const selector = `[data-pane="${dataTab}"]`;
    const withinRoot = root.querySelector(selector);
    if(withinRoot) return withinRoot;
  }
  if(controlId && doc){
    try{
      const fallback = doc.querySelector(`[data-pane="${controlId}"]`);
      if(fallback) return fallback;
    }catch(err){
      console.warn('[modalV3/tabs] Failed to query panel for control:', controlId, err?.message || err);
    }
  }
  return null;
}

function selectButton(root, buttons, target){
  if(!buttons.length) return;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  const targetButton = typeof target === 'string'
    ? buttons.find(btn => (btn.dataset?.tab === target) || (btn.getAttribute('aria-controls') === target))
    : target;
  if(!targetButton || (elementCtor && !(targetButton instanceof elementCtor))) return;

  buttons.forEach(btn => {
    const isActive = btn === targetButton;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
    const panel = resolvePanel(root, btn);
    if(panel){
      panel.classList.toggle('is-hidden', !isActive);
      if(isActive){
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
      }else{
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
      }
    }
  });
}

function moveFocus(root, buttons, current, delta){
  if(!buttons.length || !current) return;
  const currentIndex = buttons.indexOf(current);
  const fallbackIndex = delta > 0 ? 0 : buttons.length - 1;
  const nextIndex = currentIndex === -1
    ? fallbackIndex
    : (currentIndex + delta + buttons.length) % buttons.length;
  const nextButton = buttons[nextIndex];
  if(nextButton){
    focusButton(nextButton);
    selectButton(root, buttons, nextButton);
  }
}

function focusButton(button){
  if(!button) return;
  const doc = button.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if(typeof button.focus === 'function'){
    button.focus();
  }
  if(doc && doc.activeElement !== button){
    try{
      doc.activeElement = button;
    }catch(_err){
      // ignore assignment errors (read-only in some environments)
    }
  }
}

export function applyTabs(root){
  if(!root) return;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  const scope = (elementCtor && root instanceof elementCtor) ? root : root.root || root;
  if(!scope || (elementCtor && !(scope instanceof elementCtor))) return;
  const containers = Array.from(scope.querySelectorAll('.v3-tabs'));
  containers.forEach(container => {
    if(!container || container.dataset?.tabsReady === '1') return;
    const buttons = getButtons(container);
    if(!buttons.length) return;
    container.dataset.tabsReady = '1';
    if(!container.hasAttribute('role')) container.setAttribute('role', 'tablist');
    buttons.forEach(btn => {
      if(!btn.hasAttribute('role')) btn.setAttribute('role', 'tab');
      if(!btn.hasAttribute('type')) btn.setAttribute('type', 'button');
    });

    container.addEventListener('click', ev => {
      const target = ev.target && typeof ev.target.closest === 'function'
        ? ev.target.closest(TAB_SELECTOR)
        : null;
      if(!target || !buttons.includes(target)) return;
      ev.preventDefault();
      selectButton(scope, buttons, target);
    });

    container.addEventListener('keydown', ev => {
      const target = ev.target && typeof ev.target.closest === 'function'
        ? ev.target.closest(TAB_SELECTOR)
        : null;
      if(!target || !buttons.includes(target)) return;
      switch(ev.key){
        case 'ArrowLeft':
        case 'ArrowUp':
          ev.preventDefault();
          moveFocus(scope, buttons, target, -1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          ev.preventDefault();
          moveFocus(scope, buttons, target, 1);
          break;
        case 'Home':
          ev.preventDefault();
          if(buttons[0]){
            focusButton(buttons[0]);
            selectButton(scope, buttons, buttons[0]);
          }
          break;
        case 'End':
          ev.preventDefault();
          if(buttons.length){
            const last = buttons[buttons.length - 1];
            focusButton(last);
            selectButton(scope, buttons, last);
          }
          break;
        default:
          break;
      }
    });

    const initiallySelected = buttons.find(btn => btn.getAttribute('aria-selected') === 'true') || buttons[0];
    selectButton(scope, buttons, initiallySelected);
  });
}

export default applyTabs;
