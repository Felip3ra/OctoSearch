export const DEFAULT_HIGHLIGHT_COLOR: string = '#FACC15';

const LEGACY_HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#FACC15',
  red: '#EF4444',
  green: '#10B981',
  blue: '#0EA5E9',
  purple: '#8B5CF6',
};

export function normalizeHighlightColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const legacyColor = LEGACY_HIGHLIGHT_COLORS[value.toLowerCase()];
  if (legacyColor) return legacyColor;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export function highlightColorWithAlpha(color: string, alpha: number): string {
  const normalized = normalizeHighlightColor(color) || DEFAULT_HIGHLIGHT_COLOR;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
