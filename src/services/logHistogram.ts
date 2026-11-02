import { LogEntry } from '../types';
import { sharedPrefixLength } from './logView';

export interface HistogramBucket {
  /** Epoch ms of the bucket start (inclusive) and end (exclusive). */
  start: number;
  end: number;
  errors: number;
  warnings: number;
  others: number;
}

export interface Histogram {
  step: number;
  buckets: HistogramBucket[];
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Bucket sizes people read easily; the smallest one that keeps the chart under the bucket limit wins. */
const STEPS = [
  SECOND, 2 * SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY,
];
export const MAX_BUCKETS = 120;

type Counts = [errors: number, warnings: number, others: number];

function levelSlot(entry: LogEntry): 0 | 1 | 2 {
  if (entry.level === 'ERR') return 0;
  if (entry.level === 'WRN') return 1;
  return 2;
}

/**
 * Records per time bucket and level, for the timeline above the list. Like the filters, it only
 * counts the records that changed since the previous timeline, unless the bucket size has to change.
 */
export class IncrementalHistogram {
  private source: LogEntry[] = [];
  private step = 0;
  /** Local-time offset, so day and hour buckets start at local midnight / on the hour. */
  private readonly offset = -new Date().getTimezoneOffset() * MINUTE;
  private counts = new Map<number, Counts>();
  private min = Infinity;
  private max = -Infinity;

  compute(entries: LogEntry[]): Histogram {
    const kept = this.step > 0 ? sharedPrefixLength(this.source, entries) : 0;
    if (kept > 0) {
      for (let index = kept; index < this.source.length; index++) this.add(this.source[index], -1);
      for (let index = kept; index < entries.length; index++) this.add(entries[index], 1);
      if ((this.max - this.min) / this.step > MAX_BUCKETS) this.rebuild(entries);
    } else {
      this.rebuild(entries);
    }
    this.source = entries;
    return this.snapshot();
  }

  private rebuild(entries: LogEntry[]): void {
    this.min = Infinity;
    this.max = -Infinity;
    for (const entry of entries) {
      if (entry.time === undefined) continue;
      if (entry.time < this.min) this.min = entry.time;
      if (entry.time > this.max) this.max = entry.time;
    }
    const span = this.max - this.min;
    this.step = STEPS.find((step) => span / step <= MAX_BUCKETS) ?? STEPS[STEPS.length - 1];
    this.counts = new Map();
    for (const entry of entries) this.add(entry, 1);
  }

  private add(entry: LogEntry, delta: 1 | -1): void {
    const time = entry.time;
    if (time === undefined) return;
    if (delta > 0) {
      if (time < this.min) this.min = time;
      if (time > this.max) this.max = time;
    }
    const key = Math.floor((time + this.offset) / this.step);
    let counts = this.counts.get(key);
    if (!counts) this.counts.set(key, (counts = [0, 0, 0]));
    counts[levelSlot(entry)] += delta;
  }

  private snapshot(): Histogram {
    if (this.min > this.max) return { step: this.step, buckets: [] };
    const first = Math.floor((this.min + this.offset) / this.step);
    const last = Math.floor((this.max + this.offset) / this.step);
    const buckets: HistogramBucket[] = [];
    for (let key = first; key <= last; key++) {
      const [errors, warnings, others] = this.counts.get(key) ?? [0, 0, 0];
      const start = key * this.step - this.offset;
      buckets.push({ start, end: start + this.step, errors, warnings, others });
    }
    return { step: this.step, buckets };
  }
}
