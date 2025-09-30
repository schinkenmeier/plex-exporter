export const qs  = (s, r=document) => r.querySelector(s);
export const qsa = (s, r=document) => [...r.querySelectorAll(s)];
export function el(tag, cls, content){
  const n=document.createElement(tag);
  if(cls) n.className=cls;
  if(content!=null) n.textContent = content;
  return n;
}

