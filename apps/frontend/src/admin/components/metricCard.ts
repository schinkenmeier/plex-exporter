export interface MetricCardConfig {
  title: string;
  value: string;
  detail?: string;
}

export function createMetricCard(config: MetricCardConfig): HTMLElement {
  const card = document.createElement('article');
  card.className = 'admin-metric-card';

  const title = document.createElement('h3');
  title.textContent = config.title;

  const value = document.createElement('div');
  value.className = 'admin-metric-value';
  value.textContent = config.value;

  card.append(title, value);

  if (config.detail) {
    const detail = document.createElement('p');
    detail.className = 'admin-metric-detail';
    detail.textContent = config.detail;
    card.appendChild(detail);
  }

  return card;
}
