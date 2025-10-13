import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';

class FakeNode {
  constructor(){
    this.children = [];
    this.parentNode = null;
    this._text = '';
  }

  append(...nodes){
    nodes.forEach(node=>{
      if(node == null) return;
      if(node.isFragment){
        node.children.forEach(child=> this._appendNode(child));
        node.children = [];
      } else {
        this._appendNode(node);
      }
    });
  }

  get firstChild(){
    return this.children.length ? this.children[0] : null;
  }

  get lastChild(){
    return this.children.length ? this.children[this.children.length - 1] : null;
  }

  _appendNode(node){
    if(!node) return;
    if(node.parentNode){
      const parent = node.parentNode;
      if(typeof parent.removeChild === 'function') parent.removeChild(node);
      else {
        const idx = parent.children.indexOf(node);
        if(idx >= 0) parent.children.splice(idx, 1);
        node.parentNode = null;
      }
    }
    this.children.push(node);
    node.parentNode = this;
  }

  insertBefore(node, before){
    if(node == null) return null;
    if(node.isFragment){
      const copy = [...node.children];
      node.children = [];
      copy.forEach(child=> this.insertBefore(child, before));
      return node;
    }
    if(!before){
      this.append(node);
      return node;
    }
    const index = this.children.indexOf(before);
    if(index < 0){
      this.append(node);
      return node;
    }
    if(node.parentNode){
      const parent = node.parentNode;
      if(typeof parent.removeChild === 'function') parent.removeChild(node);
      else {
        const idx = parent.children.indexOf(node);
        if(idx >= 0) parent.children.splice(idx, 1);
        node.parentNode = null;
      }
    }
    this.children.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  replaceChildren(...nodes){
    this.children.forEach(child=> child.parentNode = null);
    this.children = [];
    if(nodes.length === 1 && nodes[0] && nodes[0].isFragment){
      const frag = nodes[0];
      while(frag.children.length){
        this._appendNode(frag.children[0]);
      }
      return;
    }
    this.append(...nodes);
  }

  remove(){
    if(!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if(idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }

  set textContent(value){
    this._text = String(value || '');
    this.children.forEach(child=> child.parentNode = null);
    this.children = [];
  }

  get textContent(){
    if(this.children.length) return this.children.map(child=> child.textContent || '').join('');
    return this._text;
  }
}

class FakeElement extends FakeNode {
  constructor(tag){
    super();
    this.tagName = String(tag || '').toUpperCase();
    this.dataset = {};
    this.style = {};
    this._rect = { width: 0, height: 0, top: 0, left: 0 };
    this._listeners = new Map();
    this._classSet = new Set();
    this._attributes = {};
    this._computedStyle = createStyle();
    this.tabIndex = -1;
    this.classList = {
      add: (...tokens)=> tokens.forEach(token=>{
        if(token) this._classSet.add(token);
      }),
      remove: (...tokens)=> tokens.forEach(token=>{
        if(token) this._classSet.delete(token);
      }),
      toggle: (token, force)=>{
        if(force === true){
          this._classSet.add(token);
          return true;
        }
        if(force === false){
          this._classSet.delete(token);
          return false;
        }
        if(this._classSet.has(token)){
          this._classSet.delete(token);
          return false;
        }
        this._classSet.add(token);
        return true;
      },
      contains: (token)=> this._classSet.has(token)
    };
  }

  get className(){
    return Array.from(this._classSet).join(' ');
  }

  set className(value){
    this._classSet = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  getBoundingClientRect(){
    const { width, height, top, left } = this._rect;
    return {
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top
    };
  }

  setBoundingRect(rect){
    this._rect = { ...this._rect, ...rect };
  }

  get offsetParent(){
    return this.parentNode || null;
  }

  get offsetTop(){
    const parentTop = this.parentNode instanceof FakeElement ? this.parentNode.offsetTop : 0;
    return parentTop + (this._rect.top || 0);
  }

  addEventListener(type, handler){
    if(!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
  }

  removeEventListener(type, handler){
    const set = this._listeners.get(type);
    if(set) set.delete(handler);
  }

  dispatchEvent(event){
    const set = this._listeners.get(event?.type);
    if(set) set.forEach(fn=> fn.call(this, event));
  }

  setAttribute(name, value){
    this._attributes[name] = String(value);
    if(name === 'id') this.id = String(value);
    if(name === 'class') this.className = value;
  }

  appendChild(node){
    this.append(node);
    return node;
  }

  removeChild(node){
    const idx = this.children.indexOf(node);
    if(idx >= 0){
      this.children.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  setComputedStyle(values){
    Object.entries(values || {}).forEach(([key, value])=>{
      this._computedStyle[key] = value;
      const dashed = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      this._computedStyle[dashed] = value;
    });
  }
}

class FakeFragment extends FakeNode {
  constructor(){
    super();
    this.isFragment = true;
  }
}

class FakeDocument {
  constructor(){
    this.body = new FakeElement('body');
  }

  createElement(tag){
    return new FakeElement(tag);
  }

  createDocumentFragment(){
    return new FakeFragment();
  }

  getElementById(id){
    return findById(this.body, id);
  }
}

function createStyle(initial = {}){
  const style = { paddingTop: '0px', paddingBottom: '0px', rowGap: '0px', columnGap: '0px', gap: '0px', ...initial };
  style.getPropertyValue = function(prop){
    const normalized = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
    if(normalized in this) return this[normalized];
    if(prop in this) return this[prop];
    return '0px';
  };
  return style;
}

function findById(root, id){
  if(!root) return null;
  if(root.id === id) return root;
  for(const child of root.children){
    const match = findById(child, id);
    if(match) return match;
  }
  return null;
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;
const originalGetComputedStyle = globalThis.getComputedStyle;

const fakeWindow = {
  innerHeight: 600,
  scrollY: 0,
  _events: new Map(),
  addEventListener(type, handler){
    if(!this._events.has(type)) this._events.set(type, new Set());
    this._events.get(type).add(handler);
  },
  removeEventListener(type, handler){
    const set = this._events.get(type);
    if(set) set.delete(handler);
  },
  dispatchEvent(event){
    const set = this._events.get(event?.type);
    if(set) set.forEach(fn=> fn(event));
  }
};

const fakeDocument = new FakeDocument();

globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
globalThis.HTMLElement = FakeElement;
globalThis.getComputedStyle = (el)=> el? el._computedStyle : createStyle();

globalThis.requestAnimationFrame ??= (cb)=> setTimeout(cb, 0);
globalThis.cancelAnimationFrame ??= (id)=> clearTimeout(id);

const { VirtualList } = await import('../grid/virtualList.js');

describe('VirtualList', () => {
  beforeEach(() => {
    fakeDocument.body.children.forEach(child=> child.parentNode = null);
    fakeDocument.body.children = [];
    fakeWindow.scrollY = 0;
    fakeWindow.innerHeight = 600;
  });

  it('calculates visible window and renders limited items', () => {
    const container = document.createElement('div');
    container.setAttribute('id', 'grid');
    container.setComputedStyle({ paddingTop: '40px', paddingBottom: '40px' });
    container.setBoundingRect({ top: 120, width: 720 });
    Object.defineProperty(container, 'clientWidth', { value: 720, writable: true });
    document.body.append(container);

    const vlist = new VirtualList({
      container,
      overscan: 1,
      estimatedItemHeight: 320,
      minItemWidth: 190,
      getKey: (item) => item.id,
      renderItem: (item) => {
        const node = document.createElement('article');
        node.setBoundingRect({ width: 200, height: 320 });
        node.dataset.id = item.id;
        return node;
      }
    });

    try {
      vlist.itemsHost.setComputedStyle({ rowGap: '24px', columnGap: '24px', gap: '24px' });

      const items = Array.from({ length: 48 }, (_, i) => ({ id: `item-${i}` }));
      vlist.setItems(items);
      vlist.update();

      const rendered = vlist.itemsHost.children;
      assert.ok(rendered.length > 0, 'renders some items');

      const columns = vlist.columns;
      assert.ok(columns >= 1, 'computes at least one column');

      const expectedCount = vlist.range.end - vlist.range.start;
      assert.strictEqual(rendered.length, expectedCount, 'renders nodes matching calculated range');
      assert.ok(expectedCount < items.length, 'virtualizes by limiting rendered nodes');
      assert.ok(expectedCount >= columns, 'covers at least a full row of cards');

      assert.strictEqual(vlist.windowEl.style.transform, 'translate3d(0, 0px, 0)');

      fakeWindow.scrollY = 1500;
      vlist.handleScroll();
      vlist.update();

      assert.notStrictEqual(vlist.windowEl.style.transform, 'translate3d(0, 0px, 0)');
      const scrolledCount = vlist.itemsHost.children.length;
      assert.ok(scrolledCount === (vlist.range.end - vlist.range.start));
      assert.ok(vlist.range.start > 0, 'range starts after scrolling');
    } finally {
      vlist.destroy();
    }
  });

  it('reuses DOM nodes for items with stable keys', () => {
    const container = document.createElement('div');
    container.setAttribute('id', 'grid');
    container.setComputedStyle({ paddingTop: '20px', paddingBottom: '20px' });
    container.setBoundingRect({ top: 50, width: 600 });
    Object.defineProperty(container, 'clientWidth', { value: 600, writable: true });
    document.body.append(container);

    const created = new Map();

    const vlist = new VirtualList({
      container,
      overscan: 0,
      estimatedItemHeight: 280,
      minItemWidth: 180,
      getKey: (item) => item.id,
      renderItem: (item) => {
        const node = document.createElement('article');
        node.setBoundingRect({ width: 200, height: 280 });
        created.set(item.id, (created.get(item.id) || 0) + 1);
        return node;
      }
    });

    try {
      vlist.itemsHost.setComputedStyle({ rowGap: '20px', columnGap: '20px', gap: '20px' });

      // Avoid extra measurement DOM churn for this test
      vlist.measureItems = function(){ this.itemHeight = 280; };

      const initial = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}` }));
      vlist.setItems(initial);
      vlist.update();

      const cachedNode = vlist.nodeCache.get('id-5');
      assert.ok(cachedNode, 'stores node in cache');

      const reordered = initial.slice(4).concat(initial.slice(0, 4));
      vlist.setItems(reordered);
      vlist.update();

      const reusedNode = vlist.nodeCache.get('id-5');
      assert.strictEqual(reusedNode, cachedNode, 'reuses DOM node for stable key');
      assert.strictEqual(created.get('id-5'), 1, 'does not recreate reused node');
    } finally {
      vlist.destroy();
    }
  });

  it('invalidates cached nodes when signature changes', () => {
    const container = document.createElement('div');
    container.setAttribute('id', 'grid');
    container.setComputedStyle({ paddingTop: '16px', paddingBottom: '16px' });
    container.setBoundingRect({ top: 0, width: 400 });
    Object.defineProperty(container, 'clientWidth', { value: 400, writable: true });
    document.body.append(container);

    let renderCount = 0;

    const vlist = new VirtualList({
      container,
      overscan: 0,
      estimatedItemHeight: 250,
      minItemWidth: 180,
      getKey: (item) => item.id,
      getSignature: (item) => `${item.id}:${item.version}`,
      renderItem: (item) => {
        renderCount += 1;
        const node = document.createElement('article');
        node.setBoundingRect({ width: 200, height: 250 });
        node.dataset.version = item.version;
        return node;
      }
    });

    try {
      vlist.itemsHost.setComputedStyle({ rowGap: '16px', columnGap: '16px', gap: '16px' });
      vlist.measureItems = function(){ this.itemHeight = 250; };

      const initial = [{ id: 'id-1', version: 'v1' }];
      vlist.setItems(initial);
      vlist.update();

      const cached = vlist.nodeCache.get('id-1');
      assert.ok(cached, 'stores initial node');
      assert.strictEqual(renderCount, 1, 'renders initial node once');

      const updated = [{ id: 'id-1', version: 'v2' }];
      vlist.setItems(updated);
      vlist.update();

      const next = vlist.nodeCache.get('id-1');
      assert.ok(next, 'keeps cached node for key');
      assert.notStrictEqual(next, cached, 'replaces cached node when signature changes');
      assert.strictEqual(renderCount, 2, 'renders a fresh node after signature change');
      assert.strictEqual(next.dataset.version, 'v2');
    } finally {
      vlist.destroy();
    }
  });
  after(() => {
    if(originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if(originalHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = originalHTMLElement;
    if(originalGetComputedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = originalGetComputedStyle;
  });
});
