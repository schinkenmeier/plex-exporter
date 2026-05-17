export function setFooterStatus(message, busy = true){
  const footer = document.getElementById('footerMeta');
  if(footer){
    const status = footer.querySelector('#footerStatus');
    if(status) status.textContent = message;
    else footer.textContent = message;
    footer.dataset.state = busy ? 'loading' : 'ready';
  }
  const grid = document.getElementById('grid');
  if(grid){
    grid.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  const results = document.getElementById('footerResults');
  if(results){
    results.hidden = busy;
  }
}
