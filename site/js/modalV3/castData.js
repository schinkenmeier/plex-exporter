function normalizeLocalCast(person){
  if(!person) return null;
  if(typeof person === 'string'){
    const name = String(person).trim();
    if(!name) return null;
    return { name, role:'', thumb:'', tmdbProfile:'', raw:null };
  }
  const name = String(person.tag || person.name || person.role || '').trim();
  if(!name) return null;
  const role = (()=>{
    const rawRole = String(person.role || '').trim();
    if(!rawRole) return '';
    return rawRole.toLowerCase() === name.toLowerCase() ? '' : rawRole;
  })();
  const tmdbProfile = [
    person?.tmdb?.profile,
    person?.tmdb?.profile_path,
    person?.tmdb?.profilePath,
    person?.tmdbProfile,
    person?.profile,
    person?.profile_path,
    person?.profilePath,
  ].find(val => typeof val === 'string' && val.trim());
  const thumb = [person?.thumb, person?.photo, person?.image].find(val => typeof val === 'string' && val.trim()) || '';
  return {
    name,
    role,
    thumb,
    tmdbProfile: tmdbProfile ? String(tmdbProfile).trim() : '',
    raw: person,
  };
}

function normalizeTmdbCast(person){
  if(!person) return null;
  const name = String(person.name || person.original_name || '').trim();
  if(!name) return null;
  const role = String(person.character || '').trim();
  return {
    name,
    role,
    thumb: '',
    tmdbProfile: person.profile || person.profile_path || person.profilePath || '',
    raw: { tmdb: person },
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

  const tmdbSource = Array.isArray(item?.tmdbDetail?.credits?.cast) ? item.tmdbDetail.credits.cast : [];
  tmdbSource.forEach(person => {
    const entry = normalizeTmdbCast(person);
    if(!entry) return;
    const lowerName = entry.name.toLowerCase();
    if(!seen.has(lowerName)){
      seen.set(lowerName, true);
      combined.push(entry);
    }
  });

  return combined;
}

export { normalizeLocalCast, normalizeTmdbCast };
