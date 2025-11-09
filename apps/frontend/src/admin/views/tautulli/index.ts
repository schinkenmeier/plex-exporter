import type { AdminViewModule } from '../index.ts';
import {
  adminApiClient,
  type LibrarySection,
  type SnapshotSettingsResponse,
  type SyncSchedule,
  type TautulliConfigStatus,
  type TautulliLibrary,
} from '../../core/api.ts';

interface TautulliState {
  libraries: TautulliLibrary[];
  selectedIds: Set<number>;
  schedules: SyncSchedule[];
  snapshotSettings: SnapshotSettingsResponse | null;
  configuredSections: LibrarySection[];
}

export const tautulliView: AdminViewModule = {
  id: 'tautulli-sync',
  label: 'Tautulli Sync',
  title: 'Tautulli Sync',
  description: 'Verbindung, Bibliotheken, Sync-Jobs und Snapshots verwalten.',
  mount: ({ container, toast }) => {
    const state: TautulliState = {
      libraries: [],
      selectedIds: new Set(),
      schedules: [],
      snapshotSettings: null,
      configuredSections: [],
    };

    const layout = document.createElement('div');
    layout.className = 'tautulli-grid';
    layout.innerHTML = createMarkup();
    container.appendChild(layout);

    const refs = resolveRefs(layout);

    const loadConfig = async () => {
      refs.configStatus.textContent = 'Lade Konfiguration...';
      try {
        const config = await adminApiClient.getTautulliConfig();
        applyConfig(config);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Konfiguration konnte nicht geladen werden.';
        refs.configStatus.textContent = message;
        toast.show(message, 'error');
      }
    };

    const applyConfig = (config: TautulliConfigStatus) => {
      if (config.configured && config.tautulliUrl) {
        refs.tautulliUrl.value = config.tautulliUrl;
        refs.configStatus.textContent = 'Konfiguration geladen. API-Key ist gesetzt.';
      } else {
        refs.configStatus.textContent = 'Keine Konfiguration vorhanden.';
      }
    };

    const loadLibrarySections = async () => {
      refs.libraryList.textContent = 'Lade konfigurierte Bibliotheken...';
      try {
        const data = await adminApiClient.getLibrarySections();
        state.configuredSections = data.sections ?? [];
        renderConfiguredLibraries(state.configuredSections);
        state.selectedIds = new Set(state.configuredSections.map(section => section.sectionId));
        updateSelectedLibraries();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bibliotheken konnten nicht geladen werden.';
        refs.libraryList.textContent = message;
        toast.show(message, 'error');
      }
    };

    const loadAvailableLibraries = async () => {
      refs.availableLibraries.textContent = 'Lade verfügbare Bibliotheken...';
      refs.loadLibrariesButton.disabled = true;
      try {
        const data = await adminApiClient.getTautulliLibraries();
        state.libraries = data.libraries;
        renderAvailableLibraries();
        toast.show('Bibliotheken geladen', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bibliotheken konnten nicht abgerufen werden.';
        refs.availableLibraries.textContent = message;
        toast.show(message, 'error');
      } finally {
        refs.loadLibrariesButton.disabled = false;
      }
    };

    const renderAvailableLibraries = () => {
      if (!state.libraries.length) {
        refs.availableLibraries.innerHTML = '<div class="admin-muted-text">Keine Bibliotheken gefunden.</div>';
        return;
      }
      refs.availableLibraries.innerHTML = state.libraries
        .map(
          lib => `
          <label class="admin-checkbox">
            <input type="checkbox" data-section-id="${lib.sectionId}" ${state.selectedIds.has(lib.sectionId) ? 'checked' : ''}>
            <span>${lib.friendlyName ?? lib.sectionName} (${lib.sectionType})</span>
          </label>
        `,
        )
        .join('');
      updateSelectedLibraries();
    };

    const updateSelectedLibraries = () => {
      const source = state.libraries.length ? state.libraries : state.configuredSections;
      const selected = source.filter(lib => state.selectedIds.has(lib.sectionId));
      if (!selected.length) {
        refs.selectedLibraries.innerHTML = '<div class="admin-muted-text">Keine Bibliotheken ausgewählt.</div>';
        return;
      }
      refs.selectedLibraries.innerHTML = selected
        .map(lib => `<div>${formatLibraryLabel(lib)}</div>`)
        .join('');
    };

    const renderConfiguredLibraries = (sections: LibrarySection[]) => {
      if (!sections.length) {
        refs.libraryList.innerHTML = '<div class="admin-muted-text">Keine Bibliotheken konfiguriert.</div>';
        return;
      }
      refs.libraryList.innerHTML = sections
        .map(section => `<div class="admin-chip">${section.sectionName} (${section.sectionType})</div>`)
        .join('');
      refs.selectedLibraries.innerHTML = sections
        .map(section => `<div>${section.sectionName} (${section.sectionType})</div>`)
        .join('');
    };

    const loadSchedules = async () => {
      refs.scheduleList.textContent = 'Lade Zeitpläne...';
      try {
        const data = await adminApiClient.getSyncSchedules();
        state.schedules = data.schedules;
        refs.scheduleList.innerHTML = data.schedules.length
          ? data.schedules
              .map(
                schedule => `
            <div class="admin-history-item">
              <header>
                <strong>${schedule.jobType}</strong>
                <span class="admin-chip ${schedule.enabled ? 'admin-chip-success' : 'admin-chip-danger'}">${schedule.enabled ? 'aktiv' : 'inaktiv'}</span>
              </header>
              <p class="admin-muted-text">Cron: ${schedule.cronExpression}</p>
              ${schedule.lastRunAt ? `<p class="admin-muted-text">Letzter Lauf: ${new Date(schedule.lastRunAt).toLocaleString('de-DE')}</p>` : ''}
            </div>
          `,
              )
              .join('')
          : '<div class="admin-muted-text">Keine Zeitpläne definiert.</div>';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Zeitpläne konnten nicht geladen werden.';
        refs.scheduleList.textContent = message;
        toast.show(message, 'error');
      }
    };

    const loadSnapshotSettings = async () => {
      refs.snapshotStatus.textContent = 'Lade Snapshot-Einstellungen...';
      try {
        const data = await adminApiClient.getSnapshotSettings();
        state.snapshotSettings = data;
        refs.snapshotInput.value = String(data.maxSnapshots);
        refs.snapshotHelp.textContent = `Erlaubter Bereich: ${data.defaults.min} – ${data.defaults.max}.`;
        refs.snapshotStatus.textContent = `Es werden aktuell ${data.maxSnapshots} Snapshot(s) behalten.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Snapshot-Einstellungen konnten nicht geladen werden.';
        refs.snapshotStatus.textContent = message;
        toast.show(message, 'error');
      }
    };

    refs.saveConfigButton.addEventListener('click', async () => {
      const url = refs.tautulliUrl.value.trim();
      const apiKey = refs.tautulliApiKey.value.trim();
      if (!url || !apiKey) {
        toast.show('URL und API-Key erforderlich', 'error');
        return;
      }
      refs.saveConfigButton.disabled = true;
      try {
        await adminApiClient.saveTautulliConfig({ tautulliUrl: url, apiKey });
        refs.tautulliApiKey.value = '';
        toast.show('Konfiguration gespeichert', 'success');
        await loadConfig();
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        refs.saveConfigButton.disabled = false;
      }
    });

    refs.testConfigButton.addEventListener('click', async () => {
      refs.testConfigButton.disabled = true;
      refs.configStatus.textContent = 'Teste Verbindung...';
      try {
        const url = refs.tautulliUrl.value.trim();
        const apiKey = refs.tautulliApiKey.value.trim();
        const response = await adminApiClient.testTautulliConfig(url && apiKey ? { tautulliUrl: url, apiKey } : undefined);
        refs.configStatus.textContent = response.message ?? 'Verbindung erfolgreich.';
        toast.show('Verbindung erfolgreich', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test fehlgeschlagen';
        refs.configStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        refs.testConfigButton.disabled = false;
      }
    });

    refs.showApiKeyToggle.addEventListener('change', event => {
      refs.tautulliApiKey.type = (event.target as HTMLInputElement).checked ? 'text' : 'password';
    });

    refs.availableLibraries.addEventListener('change', event => {
      const checkbox = event.target as HTMLInputElement;
      if (!checkbox || checkbox.type !== 'checkbox') return;
      const id = Number.parseInt(checkbox.dataset.sectionId ?? '', 10);
      if (!Number.isFinite(id)) return;
      if (checkbox.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
      updateSelectedLibraries();
    });

    refs.saveLibrariesButton.addEventListener('click', async () => {
      refs.saveLibrariesButton.disabled = true;
      try {
        const selected = state.libraries.filter(lib => state.selectedIds.has(lib.sectionId));
        await adminApiClient.saveLibrarySections(
          selected.map(lib => ({
            sectionId: lib.sectionId,
            sectionName: lib.sectionName,
            sectionType: lib.sectionType === 'show' ? 'show' : 'movie',
            enabled: true,
          })),
        );
        toast.show('Bibliotheken gespeichert', 'success');
        await loadLibrarySections();
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        refs.saveLibrariesButton.disabled = false;
      }
    });

    refs.manualSyncButton.addEventListener('click', async () => {
      refs.manualSyncButton.disabled = true;
      refs.manualSyncStatus.textContent = 'Starte Sync...';
      try {
        const options = {
          incremental: refs.incrementalToggle.checked,
          syncCovers: refs.coversToggle.checked,
          enrichWithTmdb: refs.tmdbToggle.checked,
        };
        await adminApiClient.startManualSync(options);
        refs.manualSyncStatus.textContent = 'Sync im Hintergrund gestartet. Fortschritt siehe Logs.';
        toast.show('Sync gestartet', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync konnte nicht gestartet werden.';
        refs.manualSyncStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        refs.manualSyncButton.disabled = false;
      }
    });

    refs.saveScheduleButton.addEventListener('click', async () => {
      const jobType = refs.jobTypeSelect.value;
      const cron = refs.cronInput.value.trim();
      const enabled = refs.scheduleEnabled.checked;
      if (!cron) {
        toast.show('Cron-Ausdruck erforderlich', 'error');
        return;
      }
      refs.saveScheduleButton.disabled = true;
      try {
        await adminApiClient.saveSyncSchedule({ jobType, cronExpression: cron, enabled });
        toast.show('Zeitplan gespeichert', 'success');
        await loadSchedules();
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Speichern fehlgeschlagen', 'error');
      } finally {
        refs.saveScheduleButton.disabled = false;
      }
    });

    refs.snapshotSaveButton.addEventListener('click', async () => {
      const value = Number.parseInt(refs.snapshotInput.value, 10);
      if (!Number.isFinite(value)) {
        refs.snapshotStatus.textContent = 'Bitte gültige Zahl eingeben.';
        return;
      }
      refs.snapshotSaveButton.disabled = true;
      refs.snapshotStatus.textContent = 'Speichere...';
      try {
        await adminApiClient.saveSnapshotSettings(value);
        toast.show('Snapshot-Einstellung gespeichert', 'success');
        await loadSnapshotSettings();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen';
        refs.snapshotStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        refs.snapshotSaveButton.disabled = false;
      }
    });

    refs.loadLibrariesButton.addEventListener('click', () => void loadAvailableLibraries());

    void loadConfig();
    void loadLibrarySections();
    void loadSchedules();
    void loadSnapshotSettings();

    return () => {};
  },
};

function formatLibraryLabel(entry: TautulliLibrary | LibrarySection): string {
  const friendly = 'friendlyName' in entry ? entry.friendlyName : undefined;
  const name = friendly && friendly.length ? friendly : entry.sectionName;
  return `${name} (${entry.sectionType})`;
}

function createMarkup(): string {
  return `
    <div class="admin-panel">
      <h3>Tautulli-Verbindung</h3>
      <p>URL und API-Key konfigurieren.</p>
      <div class="admin-input-stack">
        <label class="admin-label">Tautulli URL</label>
        <input class="admin-input" id="tautulli-url" placeholder="https://tautulli.example.com">
        <small class="admin-muted-text">Nur Basis-URL ohne /api/v2.</small>
        <label class="admin-label">API-Key</label>
        <input class="admin-input" type="password" id="tautulli-api-key" placeholder="API-Key">
        <label class="admin-checkbox">
          <input type="checkbox" id="tautulli-show-key">
          API-Key anzeigen
        </label>
        <div class="admin-button-row">
          <button class="admin-btn admin-btn-primary" id="btn-save-tautulli">Speichern</button>
          <button class="admin-btn" id="btn-test-tautulli">Verbindung testen</button>
        </div>
        <p class="admin-muted-text" id="tautulli-config-status">Status unbekannt.</p>
      </div>
    </div>
    <div class="admin-panel">
      <h3>Bibliotheken</h3>
      <p>Bestimme, welche Tautulli-Bibliotheken synchronisiert werden.</p>
      <button class="admin-btn" id="btn-load-libraries">Bibliotheken laden</button>
      <div class="admin-input-stack">
        <div id="tautulli-libraries" class="admin-input-stack admin-scroll-box">Noch keine Bibliotheken geladen.</div>
        <div>
          <h4>Ausgewählt</h4>
          <div id="tautulli-selected" class="admin-muted-text">Keine Auswahl.</div>
        </div>
        <button class="admin-btn admin-btn-primary" id="btn-save-libraries">Auswahl speichern</button>
        <div>
          <h4>Konfigurierte Bibliotheken</h4>
          <div id="tautulli-configured-libraries" class="admin-muted-text">Lade Daten...</div>
        </div>
      </div>
    </div>
    <div class="admin-panel">
      <h3>Manueller Sync</h3>
      <p>Starte einen einmaligen Synchronisationslauf.</p>
      <label class="admin-checkbox"><input type="checkbox" id="sync-incremental" checked> Inkrementell</label>
      <label class="admin-checkbox"><input type="checkbox" id="sync-covers" checked> Covers laden</label>
      <label class="admin-checkbox"><input type="checkbox" id="sync-tmdb" checked> TMDb anreichern</label>
      <button class="admin-btn admin-btn-primary" id="btn-start-sync">Sync starten</button>
      <p class="admin-muted-text" id="sync-status"></p>
    </div>
    <div class="admin-panel">
      <h3>Automatischer Sync</h3>
      <p>Cron-Zeitplan konfigurieren.</p>
      <label class="admin-label">Job-Typ</label>
      <select class="admin-input" id="schedule-job-type">
        <option value="tautulli_sync">Tautulli Sync</option>
        <option value="cover_update">Cover Update</option>
      </select>
      <label class="admin-label">Cron-Ausdruck</label>
      <input class="admin-input" id="schedule-cron" value="0 3 * * *">
      <label class="admin-checkbox"><input type="checkbox" id="schedule-enabled" checked> Aktiviert</label>
      <button class="admin-btn" id="btn-save-schedule">Zeitplan speichern</button>
      <div class="admin-input-stack">
        <h4>Aktuelle Zeitpläne</h4>
        <div id="schedule-list" class="admin-muted-text">Lade Zeitpläne...</div>
      </div>
    </div>
    <div class="admin-panel">
      <h3>Snapshot-Aufbewahrung</h3>
      <p>Begrenzt gespeicherte Bibliotheken-Snapshots.</p>
      <label class="admin-label">Max. Snapshots</label>
      <input class="admin-input" type="number" id="snapshot-limit" min="0" max="500" value="50">
      <small class="admin-muted-text" id="snapshot-help">Bereich 0–500.</small>
      <div class="admin-button-row">
        <button class="admin-btn" id="btn-save-snapshot-settings">Speichern</button>
      </div>
      <p class="admin-muted-text" id="snapshot-status"></p>
    </div>
  `;
}

function resolveRefs(root: HTMLElement) {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`Element #${id} nicht gefunden`);
    return el;
  };
  return {
    tautulliUrl: byId('tautulli-url') as HTMLInputElement,
    tautulliApiKey: byId('tautulli-api-key') as HTMLInputElement,
    showApiKeyToggle: byId('tautulli-show-key') as HTMLInputElement,
    configStatus: byId('tautulli-config-status'),
    saveConfigButton: byId('btn-save-tautulli') as HTMLButtonElement,
    testConfigButton: byId('btn-test-tautulli') as HTMLButtonElement,
    loadLibrariesButton: byId('btn-load-libraries') as HTMLButtonElement,
    availableLibraries: byId('tautulli-libraries'),
    selectedLibraries: byId('tautulli-selected'),
    saveLibrariesButton: byId('btn-save-libraries') as HTMLButtonElement,
    libraryList: byId('tautulli-configured-libraries'),
    manualSyncButton: byId('btn-start-sync') as HTMLButtonElement,
    manualSyncStatus: byId('sync-status'),
    incrementalToggle: byId('sync-incremental') as HTMLInputElement,
    coversToggle: byId('sync-covers') as HTMLInputElement,
    tmdbToggle: byId('sync-tmdb') as HTMLInputElement,
    jobTypeSelect: byId('schedule-job-type') as HTMLSelectElement,
    cronInput: byId('schedule-cron') as HTMLInputElement,
    scheduleEnabled: byId('schedule-enabled') as HTMLInputElement,
    saveScheduleButton: byId('btn-save-schedule') as HTMLButtonElement,
    scheduleList: byId('schedule-list'),
    snapshotInput: byId('snapshot-limit') as HTMLInputElement,
    snapshotHelp: byId('snapshot-help'),
    snapshotStatus: byId('snapshot-status'),
    snapshotSaveButton: byId('btn-save-snapshot-settings') as HTMLButtonElement,
  };
}
