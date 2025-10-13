# Unit Tests

Dieses Verzeichnis enthält Unit Tests für kritische Funktionen der Plex-Katalog-Anwendung.

## Tests ausführen

### Alle Tests ausführen

```bash
npm test
```

### Integrationstest ausführen

```bash
npm run test:integration
```

Dieser Durchlauf benötigt Node.js >= 20 und installiert die Dev-Abhängigkeit [`linkedom`](https://github.com/WebReflection/linkedom), um ein leichtgewichtiges DOM im Test nachzubilden.

### Einzelne Test-Datei ausführen

```bash
node --test apps/frontend/tests/__tests__/cache.test.js
node --test apps/frontend/tests/__tests__/utils.test.js
```

### Mit Coverage

```bash
node --test --experimental-test-coverage apps/frontend/tests/__tests__/*.test.js
```

## Test-Struktur

- `cache.test.js` - Tests für das Caching-System
- `utils.test.js` - Tests für Utility-Funktionen

## Neue Tests hinzufügen

1. Erstelle eine neue Datei mit dem Muster `*.test.js`
2. Importiere die benötigten Module
3. Verwende `describe` und `it` für Test-Organisation
4. Nutze `assert` für Assertions

Beispiel:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('MyModule', () => {
  it('should do something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

## Mocking

Für Browser-APIs wie `localStorage` werden Mocks bereitgestellt:

```javascript
global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};
```
