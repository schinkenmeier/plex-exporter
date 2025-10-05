const DEFAULT_ESTIMATED_HEIGHT = 420;
const DEFAULT_MIN_WIDTH = 190;

const raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb)=> setTimeout(cb, 16);
const caf = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id)=> clearTimeout(id);

function noop(){}

function parsePx(value){
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

export class VirtualList {
  constructor({
    container,
    renderItem,
    getKey = noop,
    updateItem = null,
    getSignature = null,
    overscan = 2,
    estimatedItemHeight = DEFAULT_ESTIMATED_HEIGHT,
    minItemWidth = DEFAULT_MIN_WIDTH
  }){
    if(!container) throw new Error('VirtualList requires a container element');
    if(typeof renderItem !== 'function') throw new Error('VirtualList requires a renderItem function');

    this.container = container;
    this.renderItem = renderItem;
    this.getKey = getKey;
    this.updateItem = typeof updateItem === 'function' ? updateItem : null;
    this.getSignature = typeof getSignature === 'function' ? getSignature : null;
    this.overscan = Math.max(0, overscan|0);
    this.estimatedItemHeight = estimatedItemHeight;
    this.minItemWidth = minItemWidth;

    this.items = [];
    this.range = { start: 0, end: 0 };
    this.columns = 1;
    this.rowCount = 0;
    this.rowHeight = this.estimatedItemHeight;
    this.totalHeight = 0;
    this.itemHeight = this.estimatedItemHeight;
    this.containerTop = 0;
    this.paddingTop = 0;
    this.paddingBottom = 0;
    this.gapY = 0;
    this.gapX = 0;
    this.metricsDirty = true;
    this.pendingFrame = 0;
    this.lastWidth = 0;

    this.nodeCache = new Map();
    this.renderedKeys = new Set();
    this.itemSignatures = new Map();

    this.spacer = document.createElement('div');
    this.spacer.className = 'grid-virtual__spacer';
    this.windowEl = document.createElement('div');
    this.windowEl.className = 'grid-virtual__window';
    this.itemsHost = document.createElement('div');
    this.itemsHost.className = 'grid-virtual__items';

    this.container.textContent = '';
    this.windowEl.append(this.itemsHost);
    this.container.append(this.spacer, this.windowEl);

    this.measureRoot = document.createElement('div');
    this.measureRoot.className = 'grid-virtual__measure';
    this.measureRoot.setAttribute('aria-hidden', 'true');
    Object.assign(this.measureRoot.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      inset: '0 auto auto 0',
      zIndex: '-1'
    });
    this.container.append(this.measureRoot);

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.update = this.update.bind(this);

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize);

    if(typeof ResizeObserver === 'function'){
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.container);
    } else {
      this.resizeObserver = null;
    }
  }

  destroy(){
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    if(this.resizeObserver){
      this.resizeObserver.disconnect();
    }
    if(this.pendingFrame){
      caf(this.pendingFrame);
      this.pendingFrame = 0;
    }
    this.nodeCache.clear();
    this.renderedKeys.clear();
    this.itemSignatures.clear();
    this.items = [];
    this.spacer.remove();
    this.windowEl.remove();
    this.measureRoot.remove();
  }

  schedule(force = false){
    if(force) this.metricsDirty = true;
    if(this.pendingFrame) return;
    this.pendingFrame = raf(()=>{
      this.pendingFrame = 0;
      this.update();
    });
  }

  handleScroll(){
    this.schedule(false);
  }

  handleResize(){
    const width = this.container.clientWidth;
    if(width !== this.lastWidth){
      this.metricsDirty = true;
      this.lastWidth = width;
    }
    this.schedule(true);
  }

  setItems(list){
    this.items = Array.isArray(list) ? list.slice() : [];
    this.metricsDirty = true;
    this.pruneCache();
    this.measureItems();
    this.update();
  }

  measureItems(){
    if(!this.items.length){
      this.itemHeight = this.estimatedItemHeight;
      return;
    }
    const sampleItem = this.items[0];
    this.measureRoot.textContent = '';
    const sample = this.renderItem(sampleItem, 0);
    if(sample instanceof HTMLElement){
      this.measureRoot.append(sample);
      if(typeof sample.getBoundingClientRect === 'function'){
        const rect = sample.getBoundingClientRect();
        if(rect && rect.height > 0){
          this.itemHeight = rect.height;
        }
      } else if(sample.offsetHeight){
        this.itemHeight = sample.offsetHeight;
      }
    }
    this.measureRoot.textContent = '';
  }

  pruneCache(){
    if(!this.items.length){
      this.nodeCache.forEach(node=> node.remove());
      this.nodeCache.clear();
      this.itemSignatures.clear();
      this.renderedKeys.clear();
      return;
    }
    const allowed = new Set();
    const nextSignatures = this.getSignature ? new Map() : null;

    this.items.forEach((item, idx)=>{
      const key = this.keyFor(item, idx);
      allowed.add(key);
      if(nextSignatures){
        const signature = this.signatureFor(item, idx);
        nextSignatures.set(key, signature);
        const prev = this.itemSignatures.get(key);
        if(prev !== undefined && prev !== signature){
          const node = this.nodeCache.get(key);
          if(node){
            if(node.parentNode) node.parentNode.removeChild(node);
            this.nodeCache.delete(key);
            this.renderedKeys.delete(key);
          }
        }
      }
    });

    this.nodeCache.forEach((node, key)=>{
      if(!allowed.has(key)){
        if(node.parentNode) node.parentNode.removeChild(node);
        this.nodeCache.delete(key);
        this.renderedKeys.delete(key);
      }
    });

    if(nextSignatures){
      this.itemSignatures = nextSignatures;
    } else {
      this.itemSignatures.clear();
    }
  }

  keyFor(item, index){
    const raw = this.getKey ? this.getKey(item, index) : null;
    if(raw === undefined || raw === null || raw === ''){
      return `index-${index}`;
    }
    return String(raw);
  }

  signatureFor(item, index){
    if(!this.getSignature) return undefined;
    try {
      return this.getSignature(item, index);
    } catch (err) {
      return undefined;
    }
  }

  refreshMetrics(){
    const containerStyle = getComputedStyle(this.container);
    this.paddingTop = parsePx(containerStyle.paddingTop);
    this.paddingBottom = parsePx(containerStyle.paddingBottom);

    const hostStyle = getComputedStyle(this.itemsHost);
    const rowGap = hostStyle.getPropertyValue ? hostStyle.getPropertyValue('row-gap') : hostStyle.rowGap;
    const colGap = hostStyle.getPropertyValue ? hostStyle.getPropertyValue('column-gap') : hostStyle.columnGap;
    const gapFallback = hostStyle.getPropertyValue ? hostStyle.getPropertyValue('gap') : hostStyle.gap;

    this.gapY = parsePx(rowGap || gapFallback);
    this.gapX = parsePx(colGap || gapFallback);

    const rawColumns = Math.floor((this.container.clientWidth + this.gapX) / (this.minItemWidth + this.gapX));
    this.columns = Math.max(1, rawColumns || 1);
    this.rowHeight = this.itemHeight + this.gapY;
    if(this.rowHeight <= 0) this.rowHeight = this.itemHeight || this.estimatedItemHeight;
    this.rowCount = this.columns > 0 ? Math.ceil(this.items.length / this.columns) : this.items.length;
    this.totalHeight = Math.max(0, this.rowCount * this.rowHeight);

    const rect = this.container.getBoundingClientRect();
    this.containerTop = window.scrollY + rect.top;

    this.spacer.style.height = `${this.totalHeight}px`;
    this.windowEl.style.top = `${this.paddingTop}px`;
    this.windowEl.style.paddingBottom = `${this.paddingBottom}px`;
    this.metricsDirty = false;
  }

  update(){
    if(this.metricsDirty){
      this.refreshMetrics();
    }
    this.syncVisibleRange();
  }

  syncVisibleRange(){
    if(!this.items.length){
      this.windowEl.style.transform = 'translateY(0px)';
      this.itemsHost.replaceChildren();
      this.range = { start: 0, end: 0 };
      return;
    }

    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const listStart = this.containerTop + this.paddingTop;
    const listEnd = listStart + this.totalHeight;

    let startRow;
    if(viewportTop <= listStart){
      startRow = 0;
    } else if(viewportTop >= listEnd){
      startRow = Math.max(0, this.rowCount - 1);
    } else {
      startRow = Math.floor((viewportTop - listStart) / this.rowHeight);
    }

    let endRow;
    if(viewportBottom >= listEnd){
      endRow = Math.max(0, this.rowCount - 1);
    } else if(viewportBottom <= listStart){
      endRow = 0;
    } else {
      endRow = Math.ceil((viewportBottom - listStart) / this.rowHeight);
    }

    startRow = Math.max(0, Math.min(startRow, Math.max(0, this.rowCount - 1)) - this.overscan);
    endRow = Math.min(Math.max(0, this.rowCount - 1), endRow + this.overscan);

    const start = Math.max(0, Math.min(this.items.length, startRow * this.columns));
    const end = Math.max(start, Math.min(this.items.length, (endRow + 1) * this.columns));

    if(start === this.range.start && end === this.range.end){
      let needsRefresh = false;
      for(let i=start; i<end; i++){
        const key = this.keyFor(this.items[i], i);
        if(!this.renderedKeys.has(key)){
          needsRefresh = true;
          break;
        }
      }
      if(!needsRefresh){
        return;
      }
    }

    this.range = { start, end };
    const offsetRow = Math.floor(start / this.columns);
    const offsetY = offsetRow * this.rowHeight;
    this.windowEl.style.transform = `translateY(${offsetY}px)`;

    const fragment = document.createDocumentFragment();
    const nextRendered = new Set();

    for(let i=start; i<end; i++){
      const item = this.items[i];
      const key = this.keyFor(item, i);
      let node = this.nodeCache.get(key);
      if(node){
        if(this.updateItem){
          const updated = this.updateItem(node, item, i);
          if(updated instanceof HTMLElement && updated !== node){
            node = updated;
            this.nodeCache.set(key, node);
          } else if(!(updated instanceof HTMLElement)){
            continue;
          }
        }
      } else {
        node = this.renderItem(item, i);
        if(!(node instanceof HTMLElement)) continue;
        this.nodeCache.set(key, node);
      }
      nextRendered.add(key);
      fragment.append(node);
    }

    this.itemsHost.replaceChildren(fragment);
    this.renderedKeys = nextRendered;
  }
}
