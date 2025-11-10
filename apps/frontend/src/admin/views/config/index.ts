import { adminApiClient, welcomeEmailApiClient, type AdminConfigSnapshot, type WelcomeEmailHistoryEntry } from '../../core/api.ts';
import type { AdminViewModule } from '../index.ts';
import { createCard, type SectionElement } from '../../components/card.ts';

const WELCOME_HISTORY_LIMIT = 25;

interface TmdbRefs {
  card: SectionElement;
  input: HTMLInputElement;
  status: HTMLElement;
  testOutput: HTMLElement;
  saveButton: HTMLButtonElement;
  testButton: HTMLButtonElement;
  removeButton: HTMLButtonElement;
}

interface ResendRefs {
  card: SectionElement;
  apiKeyInput: HTMLInputElement;
  fromEmailInput: HTMLInputElement;
  testRecipientInput: HTMLInputElement;
  status: HTMLElement;
  testOutput: HTMLElement;
  saveButton: HTMLButtonElement;
  testButton: HTMLButtonElement;
  removeButton: HTMLButtonElement;
}

interface WatchlistRefs {
  card: SectionElement;
  input: HTMLInputElement;
  status: HTMLElement;
  saveButton: HTMLButtonElement;
  removeButton: HTMLButtonElement;
}

interface WelcomeRefs {
  card: SectionElement;
  emailInput: HTMLInputElement;
  nameInput: HTMLInputElement;
  urlInput: HTMLInputElement;
  status: HTMLElement;
  stats: HTMLElement;
  history: HTMLElement;
  sendButton: HTMLButtonElement;
  checkButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
}

interface SnapshotRefs {
  card: SectionElement;
  content: HTMLElement;
}

export const configView: AdminViewModule = {
  id: 'config',
  label: 'Konfiguration',
  title: 'Einstellungen',
  description: 'TMDb, Resend, Watchlist & Welcome-E-Mails verwalten.',
  mount: ({ container, toast }) => {
    const root = document.createElement('div');
    root.className = 'admin-config-grid';

    const sectionGrid = document.createElement('div');
    sectionGrid.className = 'admin-config-sections';

    const tmdb = createTmdbCard();
    const resend = createResendCard();
    const watchlist = createWatchlistCard();

    sectionGrid.append(tmdb.card, resend.card, watchlist.card);

    const welcome = createWelcomeCard();
    const snapshot = createSnapshotCard();

    root.append(sectionGrid, welcome.card, snapshot.card);
    container.appendChild(root);

    void loadTmdbStatus(tmdb, toast);
    void loadResendSettings(resend, toast);
    void loadWatchlistAdminEmail(watchlist, toast);
    void loadWelcomeStats(welcome, toast);
    void loadWelcomeHistory(welcome, toast);
    void loadConfigSnapshot(snapshot, toast);

    tmdb.saveButton.addEventListener('click', async () => {
      const token = tmdb.input.value.trim();
      if (!token) {
        toast.show('Bitte TMDb-Token eingeben', 'error');
        return;
      }
      tmdb.saveButton.disabled = true;
      try {
        await adminApiClient.saveTmdbToken(token);
        tmdb.input.value = '';
        toast.show('TMDb-Token gespeichert', 'success');
        await loadTmdbStatus(tmdb, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        tmdb.saveButton.disabled = false;
      }
    });

    tmdb.testButton.addEventListener('click', async () => {
      tmdb.testButton.disabled = true;
      tmdb.testOutput.textContent = 'Teste Token...';
      try {
        const candidate = tmdb.input.value.trim();
        const result = await adminApiClient.testTmdbToken(candidate || undefined);
        tmdb.testOutput.textContent = `Status ${result.status}, Restlimit ${result.rateLimitRemaining ?? 'n/a'}`;
        toast.show('TMDb-Test erfolgreich', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'TMDb-Test fehlgeschlagen';
        tmdb.testOutput.textContent = message;
        toast.show(message, 'error');
      } finally {
        tmdb.testButton.disabled = false;
      }
    });

    tmdb.removeButton.addEventListener('click', async () => {
      tmdb.removeButton.disabled = true;
      try {
        await adminApiClient.deleteTmdbToken();
        toast.show('TMDb-Token entfernt', 'success');
        await loadTmdbStatus(tmdb, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Entfernen fehlgeschlagen', 'error');
      } finally {
        tmdb.removeButton.disabled = false;
      }
    });

    resend.saveButton.addEventListener('click', async () => {
      const apiKey = resend.apiKeyInput.value.trim();
      const fromEmail = resend.fromEmailInput.value.trim();
      if (!apiKey || !fromEmail) {
        toast.show('API-Key und Absenderadresse erforderlich', 'error');
        return;
      }
      resend.saveButton.disabled = true;
      try {
        await adminApiClient.saveResendSettings({ apiKey, fromEmail });
        toast.show('Resend-Konfiguration gespeichert', 'success');
        await loadResendSettings(resend, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        resend.saveButton.disabled = false;
      }
    });

    resend.testButton.addEventListener('click', async () => {
      const recipient = resend.testRecipientInput.value.trim();
      if (!recipient) {
        toast.show('Testempfänger erforderlich', 'error');
        return;
      }
      resend.testButton.disabled = true;
      resend.testOutput.textContent = 'Sende Testmail...';
      try {
        await adminApiClient.testResend(recipient);
        resend.testOutput.textContent = 'Testmail wurde versendet.';
        toast.show('Testmail versendet', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test fehlgeschlagen';
        resend.testOutput.textContent = message;
        toast.show(message, 'error');
      } finally {
        resend.testButton.disabled = false;
      }
    });

    resend.removeButton.addEventListener('click', async () => {
      resend.removeButton.disabled = true;
      try {
        await adminApiClient.clearResendSettings();
        toast.show('Resend-Konfiguration entfernt', 'success');
        resend.apiKeyInput.value = '';
        resend.fromEmailInput.value = '';
        await loadResendSettings(resend, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Entfernen fehlgeschlagen', 'error');
      } finally {
        resend.removeButton.disabled = false;
      }
    });

    watchlist.saveButton.addEventListener('click', async () => {
      const email = watchlist.input.value.trim();
      if (!email) {
        toast.show('Bitte Admin-E-Mail eintragen', 'error');
        return;
      }
      watchlist.saveButton.disabled = true;
      try {
        await adminApiClient.saveWatchlistAdminEmail(email);
        toast.show('Watchlist-E-Mail gespeichert', 'success');
        await loadWatchlistAdminEmail(watchlist, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        watchlist.saveButton.disabled = false;
      }
    });

    watchlist.removeButton.addEventListener('click', async () => {
      watchlist.removeButton.disabled = true;
      try {
        await adminApiClient.clearWatchlistAdminEmail();
        toast.show('Watchlist-E-Mail entfernt', 'success');
        watchlist.input.value = '';
        await loadWatchlistAdminEmail(watchlist, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Entfernen fehlgeschlagen', 'error');
      } finally {
        watchlist.removeButton.disabled = false;
      }
    });

    welcome.sendButton.addEventListener('click', async () => {
      const email = welcome.emailInput.value.trim();
      if (!email) {
        toast.show('Empfänger erforderlich', 'error');
        return;
      }
      welcome.sendButton.disabled = true;
      welcome.status.textContent = 'Sende Welcome-Mail...';
      try {
        await welcomeEmailApiClient.send({
          email,
          recipientName: welcome.nameInput.value.trim() || undefined,
          toolUrl: welcome.urlInput.value.trim() || undefined,
        });
        welcome.status.textContent = 'Welcome-Mail versendet.';
        toast.show('Welcome-Mail gesendet', 'success');
        await loadWelcomeStats(welcome, toast);
        await loadWelcomeHistory(welcome, toast);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Versand fehlgeschlagen';
        welcome.status.textContent = message;
        toast.show(message, 'error');
      } finally {
        welcome.sendButton.disabled = false;
      }
    });

    welcome.checkButton.addEventListener('click', async () => {
      const email = welcome.emailInput.value.trim();
      if (!email) {
        toast.show('Empfänger erforderlich', 'error');
        return;
      }
      welcome.checkButton.disabled = true;
      welcome.status.textContent = 'Prüfe Status...';
      try {
        const result = await welcomeEmailApiClient.checkRecipient(email);
        welcome.status.textContent = result.hasReceived
          ? 'Für diese Adresse wurde bereits eine Welcome-Mail versendet.'
          : 'Noch keine Welcome-Mail für diese Adresse.';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Prüfung fehlgeschlagen';
        welcome.status.textContent = message;
        toast.show(message, 'error');
      } finally {
        welcome.checkButton.disabled = false;
      }
    });

    welcome.reloadButton.addEventListener('click', async () => {
      await loadWelcomeStats(welcome, toast);
      await loadWelcomeHistory(welcome, toast);
    });

    welcome.clearButton.addEventListener('click', async () => {
      welcome.clearButton.disabled = true;
      try {
        await welcomeEmailApiClient.clearHistory();
        toast.show('Welcome-Historie geleert', 'success');
        await loadWelcomeHistory(welcome, toast);
        await loadWelcomeStats(welcome, toast);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Löschen fehlgeschlagen', 'error');
      } finally {
        welcome.clearButton.disabled = false;
      }
    });

    welcome.history.addEventListener('click', async event => {
      const target = event.target as HTMLElement;
      const action = target?.dataset?.action;
      if (!action) return;
      const entryId = target.dataset.entryId;
      const email = target.dataset.email;
      if (action === 'fill' && email) {
        welcome.emailInput.value = email;
        toast.show('Empfänger übernommen', 'info');
        return;
      }
      if (action === 'delete' && entryId) {
        target.setAttribute('disabled', 'true');
        try {
          await welcomeEmailApiClient.deleteEntry(entryId);
          toast.show('Eintrag gelöscht', 'success');
          await loadWelcomeHistory(welcome, toast);
        } catch (error) {
          toast.show(error instanceof Error ? error.message : 'Löschen fehlgeschlagen', 'error');
        } finally {
          target.removeAttribute('disabled');
        }
        return;
      }
      if (action === 'delete-recipient' && email) {
        target.setAttribute('disabled', 'true');
        try {
          await welcomeEmailApiClient.deleteByRecipient(email);
          toast.show('Empfänger-Historie gelöscht', 'success');
          await loadWelcomeHistory(welcome, toast);
        } catch (error) {
          toast.show(error instanceof Error ? error.message : 'Löschen fehlgeschlagen', 'error');
        } finally {
          target.removeAttribute('disabled');
        }
      }
    });

    return () => {};
  },
};

function createLabel(text: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'admin-label';
  label.textContent = text;
  return label;
}

function createInput(type: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.className = 'admin-input';
  input.autocomplete = 'off';
  return input;
}

function createButton(text: string, variant: 'default' | 'primary' | 'danger' = 'default'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['admin-btn', variant === 'primary' ? 'admin-btn-primary' : '', variant === 'danger' ? 'admin-btn-danger' : '']
    .filter(Boolean)
    .join(' ');
  button.textContent = text;
  return button;
}

function createTmdbCard(): TmdbRefs {
  const card = createCard({
    title: 'TMDb-Integration',
    description: 'Token für Metadaten- und Artwork-Anreicherung verwalten.',
  });
  const stack = document.createElement('div');
  stack.className = 'admin-input-stack';
  const input = createInput('password', 'TMDb v4 Read Access Token');
  const status = document.createElement('p');
  status.className = 'admin-muted-text';
  status.textContent = 'Tokenstatus wird geladen...';
  const testOutput = document.createElement('p');
  testOutput.className = 'admin-muted-text';
  testOutput.textContent = 'Noch kein Test.';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'admin-button-row';
  const saveButton = createButton('Token speichern', 'primary');
  const testButton = createButton('Token testen');
  const removeButton = createButton('Token entfernen', 'danger');
  buttonRow.append(saveButton, testButton, removeButton);

  stack.append(createLabel('TMDb-Token'), input, status, buttonRow, testOutput);
  card.body.appendChild(stack);

  return { card, input, status, testOutput, saveButton, testButton, removeButton };
}

function createResendCard(): ResendRefs {
  const card = createCard({
    title: 'Resend-E-Mail',
    description: 'E-Mail-Versand für Watchlist, Welcome und Newsletter.',
  });
  const stack = document.createElement('div');
  stack.className = 'admin-input-stack';
  const apiKeyInput = createInput('password', 're_xxxxxxxxxxxxx');
  const fromEmailInput = createInput('email', 'no-reply@example.com');
  const testRecipientInput = createInput('email', 'test@example.com');
  const status = document.createElement('p');
  status.className = 'admin-muted-text';
  status.textContent = 'Lade Status...';
  const testOutput = document.createElement('p');
  testOutput.className = 'admin-muted-text';
  testOutput.textContent = 'Noch kein Test.';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'admin-button-row';
  const saveButton = createButton('Konfiguration speichern', 'primary');
  const testButton = createButton('Testmail senden');
  const removeButton = createButton('Konfiguration entfernen', 'danger');
  buttonRow.append(saveButton, testButton, removeButton);

  stack.append(
    createLabel('Resend API-Key'),
    apiKeyInput,
    createLabel('Absenderadresse'),
    fromEmailInput,
    status,
    createLabel('Testempfänger'),
    testRecipientInput,
    buttonRow,
    testOutput,
  );

  card.body.appendChild(stack);

  return {
    card,
    apiKeyInput,
    fromEmailInput,
    testRecipientInput,
    status,
    testOutput,
    saveButton,
    testButton,
    removeButton,
  };
}

function createWatchlistCard(): WatchlistRefs {
  const card = createCard({
    title: 'Watchlist-Benachrichtigung',
    description: 'Admin-E-Mail für Kopien von Watchlist-E-Mails.',
  });
  const stack = document.createElement('div');
  stack.className = 'admin-input-stack';
  const input = createInput('email', 'admin@example.com');
  const status = document.createElement('p');
  status.className = 'admin-muted-text';
  status.textContent = 'Lade Einstellungen...';
  const buttonRow = document.createElement('div');
  buttonRow.className = 'admin-button-row';
  const saveButton = createButton('E-Mail speichern', 'primary');
  const removeButton = createButton('E-Mail entfernen', 'danger');
  buttonRow.append(saveButton, removeButton);

  stack.append(createLabel('Admin-E-Mail'), input, status, buttonRow);
  card.body.appendChild(stack);

  return { card, input, status, saveButton, removeButton };
}

function createWelcomeCard(): WelcomeRefs {
  const card = createCard({
    title: 'Welcome-E-Mails',
    description: 'Empfänger verwalten, Statistiken einsehen und Historie pflegen.',
  });
  const stack = document.createElement('div');
  stack.className = 'admin-input-stack';
  const emailInput = createInput('email', 'user@example.com');
  const nameInput = createInput('text', 'Jane Doe');
  const urlInput = createInput('url', 'https://app.example.com');
  const status = document.createElement('p');
  status.className = 'admin-muted-text';
  status.textContent = 'Status unbekannt.';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'admin-button-row';
  const checkButton = createButton('Status prüfen');
  const sendButton = createButton('Welcome-Mail senden', 'primary');
  const reloadButton = createButton('Daten aktualisieren');
  const clearButton = createButton('Historie löschen', 'danger');
  buttonRow.append(checkButton, sendButton, reloadButton, clearButton);

  const stats = document.createElement('div');
  stats.className = 'admin-muted-text';
  stats.textContent = 'Statistiken werden geladen...';

  const history = document.createElement('div');
  history.className = 'admin-history-list';
  history.textContent = 'Historie wird geladen...';

  stack.append(
    createLabel('Empfänger-E-Mail'),
    emailInput,
    createLabel('Empfängername (optional)'),
    nameInput,
    createLabel('Anwendungs-URL (optional)'),
    urlInput,
    buttonRow,
    status,
    createLabel('Statistiken'),
    stats,
    createLabel('Historie'),
    history,
  );

  card.body.appendChild(stack);

  return {
    card,
    emailInput,
    nameInput,
    urlInput,
    status,
    stats,
    history,
    sendButton,
    checkButton,
    reloadButton,
    clearButton,
  };
}

function createSnapshotCard(): SnapshotRefs {
  const card = createCard({
    title: 'Konfigurationssnapshot',
    description: 'Aktuelle Backend-Konfiguration (sensible Daten maskiert).',
  });
  const content = document.createElement('div');
  content.className = 'admin-muted-text';
  content.textContent = 'Lade Konfiguration...';
  card.body.appendChild(content);
  return { card, content };
}

async function loadTmdbStatus(refs: TmdbRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.status.textContent = 'Lade TMDb-Status...';
  try {
    const status = await adminApiClient.getTmdbStatus();
    refs.status.textContent = status.enabled
      ? `Token aktiv (${status.tokenPreview ?? '***'}), Quelle: ${status.source}`
      : status.fromEnv
        ? 'Token wird über Umgebungsvariable bereitgestellt.'
        : 'Kein Token gespeichert.';
    refs.removeButton.disabled = !status.fromDatabase;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TMDb-Status konnte nicht geladen werden';
    refs.status.textContent = message;
    toast.show(message, 'error');
  }
}

async function loadResendSettings(refs: ResendRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.status.textContent = 'Lade Resend-Status...';
  try {
    const data = await adminApiClient.getResendSettings();
    refs.status.textContent = data.enabled
      ? `Konfiguration aktiv (${data.source === 'database' ? 'aus DB' : 'aus Environment'})`
      : 'Keine Resend-Konfiguration gefunden.';
    refs.fromEmailInput.value = data.fromEmail ?? '';
    refs.removeButton.disabled = !data.fromDatabase;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resend-Status konnte nicht geladen werden';
    refs.status.textContent = message;
    toast.show(message, 'error');
  }
}

async function loadWatchlistAdminEmail(refs: WatchlistRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.status.textContent = 'Lade Watchlist-E-Mail...';
  try {
    const data = await adminApiClient.getWatchlistAdminEmail();
    refs.input.value = data.adminEmail ?? '';
    refs.status.textContent = data.adminEmail
      ? `Letzte Aktualisierung: ${data.updatedAt ? new Date(data.updatedAt).toLocaleString('de-DE') : 'unbekannt'}`
      : 'Keine Admin-E-Mail gesetzt.';
    refs.removeButton.disabled = !data.adminEmail;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Watchlist-E-Mail konnte nicht geladen werden';
    refs.status.textContent = message;
    toast.show(message, 'error');
  }
}

async function loadWelcomeStats(refs: WelcomeRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.stats.textContent = 'Lade Statistiken...';
  try {
    const stats = await welcomeEmailApiClient.getStats();
    refs.stats.innerHTML = `
      Gesamt: ${stats.total}<br>
      Erfolgreich: ${stats.sent}<br>
      Fehlgeschlagen: ${stats.failed}<br>
      Erfolgsquote: ${stats.successRate}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Statistiken konnten nicht geladen werden';
    refs.stats.textContent = message;
    toast.show(message, 'error');
  }
}

async function loadWelcomeHistory(refs: WelcomeRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.history.textContent = 'Lade Historie...';
  try {
    const entries = await welcomeEmailApiClient.getHistory(WELCOME_HISTORY_LIMIT);
    renderWelcomeHistory(refs.history, entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historie konnte nicht geladen werden';
    refs.history.textContent = message;
    toast.show(message, 'error');
  }
}

function renderWelcomeHistory(container: HTMLElement, entries: WelcomeEmailHistoryEntry[]) {
  if (!entries.length) {
    container.textContent = 'Keine Einträge vorhanden.';
    return;
  }
  container.innerHTML = '';
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'admin-history-item';

    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = entry.email;
    const status = document.createElement('span');
    status.className = `admin-chip ${entry.status === 'sent' ? 'admin-chip-success' : 'admin-chip-danger'}`;
    status.textContent = entry.status === 'sent' ? 'gesendet' : 'fehlgeschlagen';
    header.append(title, status);

    const meta = document.createElement('p');
    meta.className = 'admin-muted-text';
    const date = entry.sentAt ? new Date(entry.sentAt).toLocaleString('de-DE') : 'unbekannt';
    meta.textContent = `${entry.recipientName ?? 'Ohne Name'} • ${date}`;

    const actions = document.createElement('div');
    actions.className = 'admin-history-actions';

    const fillButton = createButton('Empfänger übernehmen');
    fillButton.dataset.action = 'fill';
    fillButton.dataset.email = entry.email;

    const deleteEntry = createButton('Eintrag löschen', 'danger');
    deleteEntry.dataset.action = 'delete';
    deleteEntry.dataset.entryId = entry.id;

    const deleteRecipient = createButton('Alle für Empfänger löschen', 'danger');
    deleteRecipient.dataset.action = 'delete-recipient';
    deleteRecipient.dataset.email = entry.email;

    actions.append(fillButton, deleteEntry, deleteRecipient);

    item.append(header, meta);
    if (entry.toolUrl) {
      const url = document.createElement('p');
      url.className = 'admin-muted-text';
      url.textContent = entry.toolUrl;
      item.appendChild(url);
    }
    if (entry.errorMessage) {
      const error = document.createElement('p');
      error.className = 'admin-muted-text';
      error.textContent = entry.errorMessage;
      item.appendChild(error);
    }
    item.appendChild(actions);

    container.appendChild(item);
  });
}

async function loadConfigSnapshot(refs: SnapshotRefs, toast: { show: (message: string, variant?: 'info' | 'success' | 'error') => void }) {
  refs.content.textContent = 'Lade Konfiguration...';
  try {
    const snapshot = await adminApiClient.getConfigSnapshot();
    refs.content.innerHTML = createSnapshotHtml(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Konfiguration konnte nicht geladen werden';
    refs.content.textContent = message;
    toast.show(message, 'error');
  }
}

function createSnapshotHtml(snapshot: AdminConfigSnapshot): string {
  const entries = Object.entries(snapshot)
    .map(([section, value]) => {
      const pretty = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return `
        <details open>
          <summary>${section}</summary>
          <pre>${escapeHtml(pretty)}</pre>
        </details>
      `;
    })
    .join('');
  return entries;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
