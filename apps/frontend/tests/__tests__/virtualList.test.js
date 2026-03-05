import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';

class FakeNode {
  constructor(){
    this.parentNode = null;
    this.children = [];
  }

  appendChild(node){
    if(node?.isFragment){
      node.children.slice().forEach(child => this.appendChild(child));
      node.children = [];
      return node;
    }
    if(!node) return node;
    if(node.parentNode) node.parentNode.removeChild(node);
    this.children.push(node);
    node.parentNode = this;
    return node;
  }

  append(...nodes){
    nodes.forEach(node => this.appendChild(node));
  }

  removeChild(node){
    const index = this.children.indexOf(node);
    if(index >= 0){
      this.children.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }
}

class FakeElement extends FakeNode {
  constructor(tag){
    super();
    this.tagName = String(tag || '').toUpperCase();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._classSet = new Set();
    this.classList = {
      add: (...tokens) => tokens.filter(Boolean).forEach(token => this._classSet.add(token)),
      remove: (...tokens) => tokens.filter(Boolean).forEach(token => this._classSet.delete(token)),
      contains: token => this._classSet.has(token)
    };
  }

  set className(value){
    this._classSet = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get className(){
    return Array.from(this._classSet).join(' ');
  }

  setAttribute(name, value){
    this.attributes[name] = String(value);
  }

  set innerHTML(value){
    if(value === ''){
      this.children.forEach(child => {
        child.parentNode = null;
      });
      this.children = [];
    }
  }

  remove(){
    if(this.parentNode) this.parentNode.removeChild(this);
  }
}

class FakeFragment extends FakeNode {
  constructor(){
    super();
    this.isFragment = true;
  }
}

class FakeDocument {
  createElement(tag){
    return new FakeElement(tag);
  }

  createDocumentFragment(){
    return new FakeFragment();
  }
}

class FakeIntersectionObserver {
  constructor(callback){
    this.callback = callback;
    this.observed = new Set();
  }

  observe(el){
    this.observed.add(el);
  }

  unobserve(el){
    this.observed.delete(el);
  }

  disconnect(){
    this.observed.clear();
  }

  trigger(isIntersecting = true){
    this.callback([{ isIntersecting }]);
  }
}

const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;
const originalIntersectionObserver = globalThis.IntersectionObserver;

globalThis.document = new FakeDocument();
globalThis.HTMLElement = FakeElement;
globalThis.IntersectionObserver = FakeIntersectionObserver;

const { SimpleGrid } = await import('../../src/features/grid/simpleGrid.js');

describe('SimpleGrid', () => {
  let renderCount = 0;

  beforeEach(() => {
    renderCount = 0;
  });

  it('renders only new items and keeps a sentinel while hasMore is true', () => {
    const container = document.createElement('section');
    const grid = new SimpleGrid(container, {
      getKey: item => item.id,
      renderItem(item){
        renderCount += 1;
        const card = document.createElement('article');
        card.dataset.id = item.id;
        return card;
      }
    });

    grid.setItems([{ id: '1' }, { id: '2' }], true);
    assert.strictEqual(renderCount, 2);
    assert.strictEqual(container.children.length, 3);

    grid.setItems([{ id: '1' }, { id: '2' }, { id: '3' }], true);
    assert.strictEqual(renderCount, 3);
    assert.strictEqual(container.children.length, 4);

    grid.destroy();
  });

  it('clears previously rendered nodes on filter reset', () => {
    const container = document.createElement('section');
    const grid = new SimpleGrid(container, {
      getKey: item => item.id,
      renderItem(item){
        const card = document.createElement('article');
        card.dataset.id = item.id;
        return card;
      }
    });

    grid.setItems([{ id: '1' }, { id: '2' }, { id: '3' }], true);
    assert.strictEqual(container.children.length, 4);

    grid.setItems([{ id: 'narrowed' }], false);
    assert.strictEqual(container.children.length, 1);
    assert.strictEqual(container.children[0].dataset.id, 'narrowed');

    grid.destroy();
  });

  it('triggers load more only when sentinel intersects and hasMore is true', () => {
    const container = document.createElement('section');
    let loadMoreCalls = 0;
    const grid = new SimpleGrid(container, {
      renderItem(){
        return document.createElement('article');
      },
      onLoadMore(){
        loadMoreCalls += 1;
      }
    });

    grid.setItems([{ id: '1' }], true);
    grid.observer.trigger(true);
    assert.strictEqual(loadMoreCalls, 1);

    grid.setItems([{ id: '1' }], false);
    grid.observer.trigger(true);
    assert.strictEqual(loadMoreCalls, 1);

    grid.destroy();
  });
});

after(() => {
  if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if(originalHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = originalHTMLElement;
  if(originalIntersectionObserver === undefined) delete globalThis.IntersectionObserver; else globalThis.IntersectionObserver = originalIntersectionObserver;
});
