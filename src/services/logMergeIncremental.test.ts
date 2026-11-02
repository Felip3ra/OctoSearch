import { describe, expect, it } from 'vitest';
import { LogEntry } from '../types';
import { compactEntry } from './logEntry';
import { IncrementalMerger, LogSource, mergeLogSources } from './logMerge';
import { sharedPrefixLength } from './logView';

let counter = 0;
const record = (time: number | undefined, text: string): LogEntry =>
  compactEntry({ id: ++counter, startLine: 1, endLine: 1, time, level: 'INF', rawLevel: 'INF', timestamp: '', message: text, stackTrace: [] }, [text]);

const shape = (entries: LogEntry[]) => entries.map((entry) => [entry.id, entry.sourceFile, entry.rawText]);

describe('IncrementalMerger', () => {
  it('matches the full merge through random live updates, keeping the unchanged start', () => {
    let seed = 42;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const files: LogEntry[][] = [[], [], []];
    const clocks = [1000, 1000, 1000];
    const merger = new IncrementalMerger();
    let previous: LogEntry[] = [];

    for (let step = 0; step < 300; step++) {
      const file = random(3);
      const current = files[file];
      // Replace the provisional last record now and then, as a live append does.
      const next = current.length > 0 && random(3) === 0 ? current.slice(0, -1) : current.slice();
      for (let count = 1 + random(3); count > 0; count--) {
        clocks[file] += random(40);
        next.push(record(random(5) === 0 ? undefined : clocks[file], `f${file}-${step}-${count}`));
      }
      files[file] = next;

      const sources: LogSource[] = files.map((entries, index) => ({ label: `arquivo-${index}`, entries }));
      const merged = merger.merge(sources);
      expect(shape(merged)).toEqual(shape(mergeLogSources(sources)));
      if (step > 10) expect(sharedPrefixLength(previous, merged)).toBeGreaterThan(0);
      previous = merged;
    }
  });

  it('starts over when a file is read again or the selection changes', () => {
    const merger = new IncrementalMerger();
    const a = [record(10, 'a1'), record(30, 'a2')];
    const b = [record(20, 'b1')];
    merger.merge([{ label: 'a', entries: a }, { label: 'b', entries: b }]);
    const reread = [record(5, 'a0'), record(10, 'a1')];
    const sources = [{ label: 'a', entries: reread }, { label: 'b', entries: b }];
    expect(shape(merger.merge(sources))).toEqual(shape(mergeLogSources(sources)));
    expect(merger.merge([{ label: 'a', entries: a }])).toBe(a);
  });
});
