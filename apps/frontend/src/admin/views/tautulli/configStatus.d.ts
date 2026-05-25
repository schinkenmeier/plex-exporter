import type { TautulliConfigStatus } from '../../core/api.ts';

export function formatSourceLabel(source: TautulliConfigStatus['activeSource']): string;
export function formatConfigStatus(config: TautulliConfigStatus): string;
export function renderConfigSummary(container: HTMLElement, config: TautulliConfigStatus): void;
