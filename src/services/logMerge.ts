import { LogEntry } from '../types';
import { sharedPrefixLength } from './logView';

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
  // Already chronological single file (the usual case): keep the parsed array and its ids, without
  // allocating anything per record, since this runs on every live update.
  if (!tagSource && isChronological(sources[0].entries)) return sources[0].entries;

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

function firstDateIndex(entries: LogEntry[]): number {
  const index = entries.findIndex((entry) => entry.time !== undefined);
  return index === -1 ? Infinity : index;
}

function grow<T extends Float64Array | Int32Array>(array: T, length: number, create: (size: number) => T): T {
  if (array.length >= length) return array;
  const next = create(Math.max(length, Math.ceil(array.length * 1.5), 1024));
  next.set(array);
  return next;
}

interface MergedSource {
  label: string;
  entries: LogEntry[];
  /** Sort key of each record: its time, or the time of the last dated record before it. */
  keys: Float64Array;
  /** Index of the first dated record (Infinity when there is none). */
  firstDate: number;
}

/**
 * Same result as `mergeLogSources`, kept up to date cheaply: when the files only change at their end
 * (live tail), the merged records before the earliest changed time are kept (same objects, same ids)
 * and only the rest of the timeline is rebuilt.
 */
export class IncrementalMerger {
  private sources: MergedSource[] = [];
  private merged: LogEntry[] = [];
  /** Per merged record: sort key, source index and position in that source. */
  private keys = new Float64Array(0);
  private origins = new Int32Array(0);
  private positions = new Int32Array(0);

  merge(sources: LogSource[]): LogEntry[] {
    if (sources.length < 2) {
      this.reset();
      return mergeLogSources(sources);
    }
    const sameLayout =
      this.sources.length === sources.length && sources.every((source, index) => source.label === this.sources[index].label);
    return (sameLayout && this.mergeChanges(sources)) || this.mergeAll(sources);
  }

  private reset(): void {
    this.sources = [];
    this.merged = [];
  }

  private keysOf(entries: LogEntry[], previous: MergedSource | null, kept: number): MergedSource['keys'] {
    const keys = previous && kept > 0 ? grow(previous.keys, entries.length, (size) => new Float64Array(size)) : new Float64Array(entries.length);
    let lastKey = kept > 0 ? keys[kept - 1] : entries.find((entry) => entry.time !== undefined)?.time ?? 0;
    for (let index = kept; index < entries.length; index++) {
      const time = entries[index].time;
      if (time !== undefined) lastKey = time;
      keys[index] = lastKey;
    }
    return keys;
  }

  private mergeAll(sources: LogSource[]): LogEntry[] {
    this.sources = sources.map((source) => ({
      label: source.label,
      entries: source.entries,
      keys: this.keysOf(source.entries, null, 0),
      firstDate: firstDateIndex(source.entries),
    }));
    this.merged = [];
    this.rebuildFrom(0, []);
    return this.merged;
  }

  /** Null when the change cannot be applied incrementally (a file was read again from the start). */
  private mergeChanges(sources: LogSource[]): LogEntry[] | null {
    let earliest = Infinity;
    const kept: number[] = [];
    for (let index = 0; index < sources.length; index++) {
      const previous = this.sources[index];
      const entries = sources[index].entries;
      const shared = sharedPrefixLength(previous.entries, entries);
      // Records before the first date take the first date's key, so they need it to be unchanged.
      const firstDateKept = previous.firstDate < shared;
      if ((shared < previous.entries.length || shared < entries.length) && !firstDateKept) return null;
      kept.push(shared);
      // The replaced records and the new ones must all land after the kept part of the timeline.
      for (let position = shared; position < previous.entries.length; position++) earliest = Math.min(earliest, previous.keys[position]);
      if (shared < entries.length) {
        const keys = this.keysOf(entries, previous, shared);
        for (let position = shared; position < entries.length; position++) earliest = Math.min(earliest, keys[position]);
        this.sources[index] = { label: previous.label, entries, keys, firstDate: previous.firstDate };
      } else {
        this.sources[index] = { ...previous, entries };
      }
    }
    if (earliest === Infinity) return this.merged;

    // First merged record whose key is not before the earliest change (keys are sorted).
    let low = 0;
    let high = this.merged.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.keys[middle] < earliest) low = middle + 1;
      else high = middle;
    }
    const cut = low;
    // Records after the cut that still exist are placed again together with the new ones.
    const carried: number[] = [];
    for (let index = cut; index < this.merged.length; index++) {
      if (this.positions[index] < kept[this.origins[index]]) carried.push(this.origins[index], this.positions[index]);
    }
    const added: number[] = [];
    for (let source = 0; source < sources.length; source++) {
      for (let position = kept[source]; position < sources[source].entries.length; position++) added.push(source, position);
    }
    this.rebuildFrom(cut, [...carried, ...added]);
    return this.merged;
  }

  /**
   * Rebuilds the timeline from `cut`: `pending` holds (source, position) pairs to place, or every
   * record of every source when the whole timeline is rebuilt (cut 0 and no pairs).
   */
  private rebuildFrom(cut: number, pending: number[]): void {
    const items: { source: number; position: number; key: number }[] = [];
    if (cut === 0 && pending.length === 0) {
      this.sources.forEach((source, sourceIndex) => {
        for (let position = 0; position < source.entries.length; position++) items.push({ source: sourceIndex, position, key: source.keys[position] });
      });
    } else {
      for (let index = 0; index < pending.length; index += 2) {
        const source = pending[index];
        const position = pending[index + 1];
        items.push({ source, position, key: this.sources[source].keys[position] });
      }
    }
    // Same order as the full merge: by time, then file order, then position in the file.
    items.sort((a, b) => a.key - b.key || a.source - b.source || a.position - b.position);

    const total = cut + items.length;
    this.keys = grow(this.keys, total, (size) => new Float64Array(size));
    this.origins = grow(this.origins, total, (size) => new Int32Array(size));
    this.positions = grow(this.positions, total, (size) => new Int32Array(size));
    const merged = this.merged.slice(0, cut);
    items.forEach((item, offset) => {
      const source = this.sources[item.source];
      const index = cut + offset;
      merged.push({ ...source.entries[item.position], id: index + 1, sourceFile: source.label });
      this.keys[index] = item.key;
      this.origins[index] = item.source;
      this.positions[index] = item.position;
    });
    this.merged = merged;
  }
}

/**
 * The last timeline found to be chronological; live updates only check what was added to it.
 * Weak, so a closed file's records are not kept alive by this cache.
 */
let lastChronological = new WeakRef<LogEntry[]>([]);

/** True when the dated records never go back in time (undated ones keep their place). */
function isChronological(entries: LogEntry[]): boolean {
  const kept = sharedPrefixLength(lastChronological.deref() ?? [], entries);
  let last = -Infinity;
  for (let index = kept - 1; index >= 0; index--) {
    const time = entries[index].time;
    if (time !== undefined) {
      last = time;
      break;
    }
  }
  for (let index = kept; index < entries.length; index++) {
    const time = entries[index].time;
    if (time === undefined) continue;
    if (time < last) return false;
    last = time;
  }
  lastChronological = new WeakRef(entries);
  return true;
}

const SOURCE_COLORS = [
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
];

export function getSourceColor(index: number): string {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}
