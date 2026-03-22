// Debug Script für Scroll-Orchestrator
// In Browser Console einfügen und ausführen

console.clear();
console.log('🔍 Scroll Debug gestartet...\n');

// Aktuellen State anzeigen
const showState = () => {
  const body = document.body;
  const classes = body.className;
  const scrollY = window.scrollY;
  const hero = document.getElementById('hero');
  const filter = document.getElementById('filterBar');

  console.log(`📍 Scroll: ${scrollY}px`);
  console.log(`📦 Body Classes: ${classes || '(keine)'}`);
  console.log(`🦸 Hero Classes: ${hero?.className || '(keine)'}`);
  console.log(`🔍 Filter Classes: ${filter?.className || '(keine)'}`);
  console.log('---');
};

// Initial state
showState();

// Bei jedem Scroll state ausgeben (throttled)
let lastLog = 0;
window.addEventListener('scroll', () => {
  const now = Date.now();
  if (now - lastLog > 500) { // Max alle 500ms
    lastLog = now;
    showState();
  }
}, { passive: true });

console.log('✅ Debug aktiv - scrollen Sie und beobachten Sie die Console');
