export function formatSyncRunStatus(status, degraded = false) {
  if (status === 'completed_with_errors') {
    return 'Mit Fehlern abgeschlossen';
  }
  if (status === 'completed') {
    return degraded ? 'Mit Warnungen abgeschlossen' : 'Abgeschlossen';
  }
  if (status === 'failed') {
    return 'Fehlgeschlagen';
  }
  if (status === 'running') {
    return 'Läuft';
  }
  return String(status || 'Unbekannt');
}

export function getSyncRunStatusClass(status, degraded = false) {
  const classes = ['admin-chip'];
  if (status === 'failed') {
    classes.push('admin-chip-danger');
  } else if (status === 'completed_with_errors' || degraded) {
    classes.push('admin-chip-warning');
  } else if (status === 'completed') {
    classes.push('admin-chip-success');
  }
  return classes.join(' ');
}

export function formatSyncRunSummary(stats) {
  if (!stats) {
    return 'Keine Statistik vorhanden';
  }

  return [
    `Erstellt ${stats.totalCreated}`,
    `Aktualisiert ${stats.totalUpdated}`,
    `Gelöscht ${stats.totalDeleted}`,
    `Übersprungen ${stats.totalSkipped}`,
    `Fehler ${stats.totalErrors}`,
  ].join(', ');
}

export function formatSyncRunDegradedMessage(run) {
  if (!run || run.status === 'failed') {
    return '';
  }

  const errorCount = run.stats?.totalErrors ?? 0;
  if (run.status !== 'completed_with_errors' && !run.degraded && errorCount <= 0) {
    return '';
  }

  if (errorCount > 0) {
    return `Der Sync wurde mit ${errorCount} Fehler${errorCount === 1 ? '' : 'n'} abgeschlossen. Prüfe den Live-Log für Details.`;
  }

  return 'Der Sync wurde abgeschlossen, ist aber als degraded markiert. Prüfe den Live-Log für Details.';
}
