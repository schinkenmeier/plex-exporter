import type { AdminStatsResponse, AdminSystemStatus, AdminConfigSnapshot, SeriesSample } from '../../core/api.ts';
import { adminApiClient } from '../../core/api.ts';
import type { AdminViewModule } from '../index.ts';
import { createMetricCard } from '../../components/metricCard.ts';
import { createPanel } from '../../components/card.ts';
import { createInfoList } from '../../components/infoList.ts';

const DASHBOARD_REFRESH_INTERVAL = 30_000;
const AUTO_REFRESH_STORAGE_KEY = 'admin:autoRefresh';
const numberFormatter = new Intl.NumberFormat('de-DE');

interface DashboardRefs {
  metrics: {
    totalMedia: HTMLElement;
    mediaDetail: HTMLElement;
    structure: HTMLElement;
    structureDetail: HTMLElement;
    thumbnails: HTMLElement;
    thumbnailsDetail: HTMLElement;
    database: HTMLElement;
    databaseDetail: HTMLElement;
    uptime: HTMLElement;
    uptimeDetail: HTMLElement;
  };
  systemPanel: ReturnType<typeof createPanel>;
  systemChip: HTMLElement;
  servicePanel: ReturnType<typeof createPanel>;
  seriesPanel: ReturnType<typeof createPanel>;
  lastUpdated: HTMLElement;
}

export const dashboardView: AdminViewModule = {
  id: 'dashboard',
  label: 'Dashboard',
  title: 'Dashboard',
  description: 'Systemübersicht und Statuskarten.',
  mount: ({ container, toast, loader }) => {
    const root = document.createElement('div');
    root.className = 'admin-dashboard';

    const toolbar = createToolbar();
    root.appendChild(toolbar.wrapper);

    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'admin-metrics-grid';
    const refs = createMetricCards(metricsGrid);

    const panelGrid = document.createElement('div');
    panelGrid.className = 'admin-panel-grid';

    refs.systemPanel.classList.add('dashboard-panel');
    refs.servicePanel.classList.add('dashboard-panel');
    refs.seriesPanel.classList.add('dashboard-panel');

    panelGrid.append(refs.systemPanel, refs.servicePanel, refs.seriesPanel);

    root.appendChild(metricsGrid);
    root.appendChild(panelGrid);
    container.appendChild(root);

    refs.lastUpdated = toolbar.lastUpdated;

    let refreshTimer: number | null = null;
    let isLoading = false;

    const loadDashboard = async (source: 'manual' | 'auto' = 'manual') => {
      if (isLoading) return;
      isLoading = true;
      const spinner = loader.show(panelGrid, 'Aktualisiere Dashboard...');
      try {
        const [status, stats, config] = await Promise.all([
          adminApiClient.getSystemStatus(),
          adminApiClient.getStats(),
          adminApiClient.getConfigSnapshot(),
        ]);
        renderStats(refs, stats);
        renderSystemStatus(refs, status);
        renderServiceStatus(refs, config);
        renderSeriesSamples(refs, stats.seriesSamples);
        refs.lastUpdated.textContent = new Date().toLocaleTimeString('de-DE');
        if (source === 'manual') {
          toast.show('Dashboard aktualisiert', 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Dashboard konnte nicht geladen werden';
        toast.show(message, 'error');
      } finally {
        loader.hide(spinner);
        isLoading = false;
      }
    };

    const setAutoRefresh = (enabled: boolean) => {
      toolbar.autoRefreshCheckbox.checked = enabled;
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (enabled) {
        refreshTimer = window.setInterval(() => loadDashboard('auto'), DASHBOARD_REFRESH_INTERVAL);
      }
      window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, enabled ? '1' : '0');
    };

    toolbar.refreshButton.addEventListener('click', () => loadDashboard('manual'));
    toolbar.autoRefreshCheckbox.addEventListener('change', event => {
      const target = event.target as HTMLInputElement;
      setAutoRefresh(target.checked);
    });

    const storedAuto = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === '1';
    setAutoRefresh(storedAuto);
    void loadDashboard('manual');

    return () => {
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
      }
    };
  },
};

function createToolbar() {
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-toolbar';

  const left = document.createElement('div');
  left.className = 'admin-toolbar-left';
  const infoLabel = document.createElement('span');
  infoLabel.textContent = 'Letzte Aktualisierung:';
  const lastUpdated = document.createElement('span');
  lastUpdated.id = 'admin-dashboard-last-updated';
  lastUpdated.textContent = 'noch nicht geladen';
  left.append(infoLabel, lastUpdated);

  const right = document.createElement('div');
  right.className = 'admin-toolbar-right';

  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'admin-btn';
  refreshButton.textContent = 'Aktualisieren';

  const autoLabel = document.createElement('label');
  autoLabel.className = 'admin-toggle';
  const autoRefreshCheckbox = document.createElement('input');
  autoRefreshCheckbox.type = 'checkbox';
  autoRefreshCheckbox.className = 'admin-toggle-input';
  const autoToggleLabel = document.createElement('span');
  autoToggleLabel.textContent = 'Auto-Refresh';
  autoLabel.append(autoRefreshCheckbox, autoToggleLabel);

  right.append(refreshButton, autoLabel);
  wrapper.append(left, right);

  return { wrapper, refreshButton, autoRefreshCheckbox, lastUpdated };
}

function createMetricCards(container: HTMLElement): DashboardRefs {
  const totalMediaCard = createMetricCard({ title: 'Gesamtmedien', value: '-', detail: 'Filme – | Serien –' });
  const structureCard = createMetricCard({ title: 'Serienstruktur', value: '-', detail: 'Staffeln – | Episoden –' });
  const thumbnailsCard = createMetricCard({ title: 'Thumbnails', value: '-', detail: 'Gesamtanzahl' });
  const databaseCard = createMetricCard({ title: 'Datenbank', value: '-', detail: 'Pfad unbekannt' });
  const uptimeCard = createMetricCard({ title: 'Uptime', value: '-', detail: 'PID – | Node –' });

  container.append(totalMediaCard, structureCard, thumbnailsCard, databaseCard, uptimeCard);

  const systemPanel = createPanel({
    title: 'Systemstatus',
    subtitle: 'Runtime, Speicher, Host-Details',
  });
  const systemChip = document.createElement('span');
  systemChip.className = 'admin-chip';
  systemChip.textContent = 'lädt…';
  systemPanel.querySelector('.admin-section-header')?.appendChild(systemChip);

  const servicePanel = createPanel({
    title: 'Services',
    subtitle: 'TMDb, Tautulli, API-Auth',
  });

  const seriesPanel = createPanel({
    title: 'Serien-Samples',
    subtitle: 'Jüngst indexierte Serien mit Staffelübersicht',
  });

  seriesPanel.body.textContent = 'Noch keine Daten geladen.';

  return {
    metrics: {
      totalMedia: ensureElement(totalMediaCard.querySelector('.admin-metric-value'), '.admin-metric-value'),
      mediaDetail: ensureElement(totalMediaCard.querySelector('.admin-metric-detail'), '.admin-metric-detail'),
      structure: ensureElement(structureCard.querySelector('.admin-metric-value'), '.admin-metric-value'),
      structureDetail: ensureElement(structureCard.querySelector('.admin-metric-detail'), '.admin-metric-detail'),
      thumbnails: ensureElement(thumbnailsCard.querySelector('.admin-metric-value'), '.admin-metric-value'),
      thumbnailsDetail: ensureElement(thumbnailsCard.querySelector('.admin-metric-detail'), '.admin-metric-detail'),
      database: ensureElement(databaseCard.querySelector('.admin-metric-value'), '.admin-metric-value'),
      databaseDetail: ensureElement(databaseCard.querySelector('.admin-metric-detail'), '.admin-metric-detail'),
      uptime: ensureElement(uptimeCard.querySelector('.admin-metric-value'), '.admin-metric-value'),
      uptimeDetail: ensureElement(uptimeCard.querySelector('.admin-metric-detail'), '.admin-metric-detail'),
    },
    systemPanel,
    systemChip,
    servicePanel,
    seriesPanel,
    lastUpdated: document.createElement('span'),
  };
}

function renderStats(refs: DashboardRefs, stats: AdminStatsResponse) {
  const media = stats.media;
  refs.metrics.totalMedia.textContent = numberFormatter.format(media.total ?? 0);
  refs.metrics.mediaDetail.textContent = `Filme ${numberFormatter.format(media.movies ?? 0)} | Serien ${numberFormatter.format(media.series ?? 0)}`;

  const seasons = stats.media.seasons ?? 0;
  const episodes = stats.media.episodes ?? 0;
  refs.metrics.structure.textContent = numberFormatter.format(seasons);
  refs.metrics.structureDetail.textContent = `Episoden ${numberFormatter.format(episodes)} | Cast ${numberFormatter.format(stats.cast.members ?? 0)}`;

  refs.metrics.thumbnails.textContent = numberFormatter.format(stats.thumbnails.total ?? 0);
  refs.metrics.thumbnailsDetail.textContent = `Filme ${numberFormatter.format(stats.thumbnails.movies ?? 0)} | Serien ${numberFormatter.format(stats.thumbnails.series ?? 0)}`;

  refs.metrics.database.textContent = stats.database.size ?? '-';
  refs.metrics.databaseDetail.textContent = stats.database.path ?? 'Pfad unbekannt';
}

function renderSystemStatus(refs: DashboardRefs, status: AdminSystemStatus) {
  const healthy = status.status === 'ok';
  refs.systemChip.textContent = healthy ? 'online' : 'offline';
  refs.systemChip.className = `admin-chip ${healthy ? 'admin-chip-success' : 'admin-chip-danger'}`;

  const rows = [
    { label: 'Uptime (sek)', value: numberFormatter.format(status.uptime.seconds) },
    { label: 'RSS', value: status.memory.rss },
    { label: 'Heap total', value: status.memory.heapTotal },
    { label: 'Heap genutzt', value: status.memory.heapUsed },
    { label: 'Platform', value: status.system.platform },
    { label: 'Architektur', value: status.system.arch },
    { label: 'CPUs', value: String(status.system.cpus) },
    { label: 'Freier Speicher', value: status.system.freeMemory },
    { label: 'Gesamt Speicher', value: status.system.totalMemory },
  ];

  refs.systemPanel.body.replaceChildren(createInfoList(rows));
  refs.metrics.uptime.textContent = status.uptime.formatted ?? '-';
  refs.metrics.uptimeDetail.textContent = `PID ${status.process.pid} | Node ${status.system.nodeVersion}`;
}

function renderServiceStatus(refs: DashboardRefs, config: AdminConfigSnapshot) {
  const items = [
    {
      label: 'Tautulli',
      value: config.tautulli.enabled ? 'aktiviert' : 'deaktiviert',
      status: config.tautulli.enabled ? 'success' : 'danger',
      hint: config.tautulli.url || '',
    },
    {
      label: 'TMDb',
      value: config.tmdb.enabled ? 'token gesetzt' : 'kein Token',
      status: config.tmdb.enabled ? 'success' : 'danger',
      hint: config.tmdb.accessToken ?? '',
    },
    {
      label: 'API Auth',
      value: config.auth.enabled ? 'aktiv' : 'aus',
      status: config.auth.enabled ? 'success' : 'danger',
      hint: config.auth.token,
    },
  ];

  const list = createInfoList(
    items.map(item => ({
      label: item.label,
      value: item.value,
      hint: item.hint || undefined,
      status: item.status === 'success' ? 'success' : item.status === 'danger' ? 'danger' : 'default',
    })),
  );
  refs.servicePanel.body.replaceChildren(list);
}

function renderSeriesSamples(refs: DashboardRefs, samples: SeriesSample[]) {
  if (!Array.isArray(samples) || samples.length === 0) {
    refs.seriesPanel.body.textContent = 'Noch keine Serien-Beispiele verfügbar.';
    return;
  }

  const list = document.createElement('div');
  list.className = 'admin-series-list';

  samples.forEach(sample => {
    const entry = document.createElement('article');
    entry.className = 'admin-series-item';

    const title = document.createElement('h4');
    title.textContent = sample.title ?? 'Unbenannt';

    const summary = document.createElement('p');
    summary.className = 'admin-series-summary';
    const seasonCount = sample.seasons?.length ?? 0;
    const episodeCount = sample.episodeCount ?? 0;
    summary.textContent = `${seasonCount} Staffeln • ${episodeCount} Episoden`;

    const seasons = document.createElement('p');
    seasons.className = 'admin-series-detail';
    const seasonText = sample.seasons && sample.seasons.length
      ? sample.seasons.map(season => `S${season.number} (${season.episodeCount ?? 0})`).join(', ')
      : 'keine Angaben';
    seasons.textContent = `Staffeln: ${seasonText}`;

    const cast = document.createElement('p');
    cast.className = 'admin-series-detail';
    const castText = sample.cast && sample.cast.length
      ? sample.cast
          .map(member => {
            const name = member.name ?? '';
            const role = member.character ? ` als ${member.character}` : '';
            return name ? `${name}${role}` : null;
          })
          .filter(Boolean)
          .join(', ')
      : 'keine Angaben';
    cast.textContent = `Besetzung: ${castText}`;

    entry.append(title, summary, seasons, cast);
    list.appendChild(entry);
  });

  refs.seriesPanel.body.replaceChildren(list);
}

function ensureElement<T extends Element>(element: T | null, selector: string): T {
  if (!element) {
    throw new Error(`Element ${selector} nicht gefunden`);
  }
  return element;
}
