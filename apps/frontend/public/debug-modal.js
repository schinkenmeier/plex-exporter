// Debug-Script für Modal V3 - Backdrop und Cast-Bilder
// Kopiere diesen Code in die Browser-Console NACHDEM du ein Modal geöffnet hast

console.log('=== Modal V3 Debug Script ===');

// 1. Prüfe ob ein Modal offen ist
const shell = document.querySelector('[data-modalv3-shell]');
console.log('Modal gefunden:', !!shell);

if (!shell) {
  console.error('❌ Kein Modal V3 gefunden! Bitte öffne zuerst ein Film/Serien-Modal.');
} else {
  console.log('✅ Modal V3 ist geöffnet');

  // 2. Prüfe Backdrop
  const backdrop = shell.querySelector('[data-v3-head-backdrop]');
  console.log('\n--- Backdrop ---');
  console.log('Backdrop Element:', backdrop);
  console.log('Backdrop background-image:', backdrop?.style.backgroundImage);
  console.log('Backdrop data-state:', backdrop?.dataset.state);
  console.log('Backdrop data-src:', backdrop?.dataset.src);
  console.log('Backdrop data-source:', backdrop?.dataset.source);

  // 3. Prüfe Cast-Bilder
  const castCards = shell.querySelectorAll('.v3-cast-card');
  console.log('\n--- Cast ---');
  console.log('Anzahl Cast-Karten gefunden:', castCards.length);

  if (castCards.length > 0) {
    const firstCard = castCards[0];
    const img = firstCard.querySelector('img');
    console.log('Erste Cast-Karte:', firstCard);
    console.log('Erstes Cast-Bild:', img);
    console.log('Cast-Bild src:', img?.src);
    console.log('Cast-Bild alt:', img?.alt);
    console.log('Cast-Bild loading-Status:', img?.complete ? 'geladen' : 'lädt noch');

    // Zeige alle Cast-Bild-URLs
    const allCastImages = Array.from(castCards).map((card, i) => {
      const img = card.querySelector('img');
      return {
        index: i,
        name: card.getAttribute('aria-label'),
        src: img?.src || 'KEIN BILD',
        hasImage: card.querySelector('.has-image') !== null
      };
    });
    console.table(allCastImages);
  } else {
    console.warn('⚠️ Keine Cast-Karten gefunden');
  }

  // 4. Prüfe Poster
  const posterImg = shell.querySelector('[data-v3-poster-image]');
  console.log('\n--- Poster ---');
  console.log('Poster Bild:', posterImg);
  console.log('Poster src:', posterImg?.src);
  console.log('Poster data-poster-url:', posterImg?.dataset.posterUrl);
}

// 5. Prüfe localStorage für Hero-Pool-Daten
console.log('\n--- LocalStorage Hero Pool ---');
const heroMovies = localStorage.getItem('heroPool:movies');
const heroSeries = localStorage.getItem('heroPool:series');
console.log('Hero Movies Pool existiert:', !!heroMovies);
console.log('Hero Series Pool existiert:', !!heroSeries);

if (heroMovies) {
  try {
    const parsed = JSON.parse(heroMovies);
    console.log('Hero Movies Pool:', parsed);
    if (parsed.items?.[0]) {
      console.log('Erstes Movie Item:', parsed.items[0]);
      console.log('Hat backdrop_path?', !!parsed.items[0].backdrop_path);
      console.log('backdrop_path Wert:', parsed.items[0].backdrop_path);
    }
  } catch (e) {
    console.error('Fehler beim Parsen von heroPool:movies', e);
  }
}

console.log('\n=== Debug Script Ende ===');
console.log('Wenn keine Bilder geladen werden, prüfe:');
console.log('1. Sind backdrop_path/profile_path in den Daten vorhanden?');
console.log('2. Funktioniert die TMDB API (Network-Tab prüfen)?');
console.log('3. Gibt es CORS-Fehler in der Console?');
