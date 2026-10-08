import { LogEntry } from '../types';

export interface LogSource {
  label: string;
  entries: LogEntry[];
}

/**
 * Builds the chronological timeline shown in the viewer, for one file or several.
 * Entries without a date inherit the previous entry's position in their own file
 * (leading ones stay with the file's first dated record), and ties keep the original
 * file/line order (Array.prototype.sort is stable).
 */
export function mergeLogSources(sources: LogSource[]): LogEntry[] {
  if (sources.length === 0) return [];
  const tagSource = sources.length > 1;

  const keyed: { entry: LogEntry; label: string; key: number }[] = [];
  for (const source of sources) {
    let lastKey = source.entries.find((entry) => entry.time !== undefined)?.time ?? 0;
    for (const entry of source.entries) {
      if (entry.time !== undefined) lastKey = entry.time;
      keyed.push({ entry, label: source.label, key: lastKey });
    }
  }

  let isSorted = true;
  for (let index = 1; index < keyed.length; index++) {
    if (keyed[index].key < keyed[index - 1].key) {
      isSorted = false;
      break;
    }
  }

  // Already chronological single file: keep the parsed array (and its ids) untouched.
  if (isSorted && !tagSource) return sources[0].entries;
  if (!isSorted) keyed.sort((a, b) => a.key - b.key);

  return keyed.map(({ entry, label }, index) => ({
    ...entry,
    id: index + 1,
    sourceFile: tagSource ? label : entry.sourceFile,
  }));
}

const SOURCE_COLORS = [
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
];

export function getSourceColor(index: number): string {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}
