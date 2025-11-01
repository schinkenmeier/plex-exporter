function normalizeLocalCast(person){
  if(!person) return null;
  if(typeof person === 'string'){
    const name = String(person).trim();
    if(!name) return null;
    return { name, role: '', thumb: '', raw: null, order: null, source: 'local' };
  }
  const name = String(person.tag || person.name || person.role || '').trim();
  if(!name) return null;
  const role = (()=>{
    const rawRole = String(person.role || '').trim();
    if(!rawRole) return '';
    return rawRole.toLowerCase() === name.toLowerCase() ? '' : rawRole;
  })();
  const thumb = [person?.thumb, person?.photo, person?.image].find(val => typeof val === 'string' && val.trim()) || '';
  const character = String(person?.character || person?.role || '').trim();
  const orderRaw = Number(person?.order);
  return {
    name,
    role,
    character,
    order: Number.isFinite(orderRaw) ? orderRaw : null,
    thumb,
    source: 'local',
    raw: person,
  };
}

export function buildCastList(item){
  const seen = new Map();
  const combined = [];
  const localSource = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];

  localSource.forEach(person => {
    const entry = normalizeLocalCast(person);
    if(!entry) return;
    const lowerName = entry.name.toLowerCase();
    if(!seen.has(lowerName)){
      seen.set(lowerName, true);
      combined.push(entry);
    }
  });

  combined.sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if(orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return combined;
}
 
export { normalizeLocalCast };
