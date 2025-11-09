const DIGIT_ONLY_RE = /^\d+$/;

const toDate = (value: string | number | Date): Date | null => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DIGIT_ONLY_RE.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    const ms = trimmed.length > 10 ? num : num * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const normalizeTimestamp = (
  value?: string | number | Date | null,
): string | null => {
  if (value == null) return null;
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

export default normalizeTimestamp;
