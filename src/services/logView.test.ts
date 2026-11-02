import { describe, expect, it } from 'vitest';
import { LogEntry } from '../types';
import { compactEntry } from './logEntry';
import { filterLogEntries, FilterOptions } from './logSearch';
import { IncrementalFilter, IncrementalLevelCounter, sharedPrefixLength } from './logView';

const record = (id: number, message: string, level: LogEntry['level'] = 'INF'): LogEntry =>
  compactEntry({ id, startLine: id, endLine: id, level, rawLevel: level, timestamp: '', message, stackTrace: [] }, [message]);

const base: FilterOptions = { searchTerm: '', level: 'ALL' };

describe('sharedPrefixLength', () => {
  it('finds the unchanged start of a timeline', () => {
    const a = [record(1, 'a'), record(2, 'b'), record(3, 'c')];
    expect(sharedPrefixLength(a, a)).toBe(3);
    expect(sharedPrefixLength(a, [...a.slice(0, 2), record(3, 'c2'), record(4, 'd')])).toBe(2);
    expect(sharedPrefixLength(a, [record(1, 'a')])).toBe(0);
    expect(sharedPrefixLength([], a)).toBe(0);
  });
});

describe('IncrementalFilter', () => {
  it('matches a full filter after appends that replace the provisional last record', () => {
    const options: FilterOptions = { ...base, searchFilters: [{ id: 'x', text: 'pedido', mode: 'include' }], lineLimit: '2', lineLimitDirection: 'tail' };
    const filter = new IncrementalFilter();
    let timeline = [record(1, 'pedido 1'), record(2, 'outro'), record(3, 'pedido 3 parcial')];
    filter.apply(timeline, options);

    timeline = [...timeline.slice(0, 2), record(3, 'pedido 3 completo'), record(4, 'nada'), record(5, 'pedido 5')];
    expect(filter.apply(timeline, options)).toEqual(filterLogEntries(timeline, options));
    expect(filter.apply(timeline, { ...options, lineLimit: 'ALL' }).map((entry) => entry.id)).toEqual([1, 3, 5]);
  });

  it('starts over when the filters change and keeps the same array without filters', () => {
    const filter = new IncrementalFilter();
    const timeline = [record(1, 'a', 'ERR'), record(2, 'b')];
    expect(filter.apply(timeline, { ...base, level: 'ERR' }).map((entry) => entry.id)).toEqual([1]);
    expect(filter.apply(timeline, { ...base, level: 'INF' }).map((entry) => entry.id)).toEqual([2]);
    expect(filter.apply(timeline, base)).toBe(timeline);
  });
});

describe('IncrementalLevelCounter', () => {
  it('updates the counts with the replaced and new records only', () => {
    const counter = new IncrementalLevelCounter();
    let timeline = [record(1, 'a', 'ERR'), record(2, 'b', 'WRN')];
    expect(counter.count(timeline)).toMatchObject({ ALL: 2, ERR: 1, WRN: 1, INF: 0 });
    timeline = [timeline[0], record(2, 'b', 'INF'), record(3, 'c', 'INF')];
    expect(counter.count(timeline)).toMatchObject({ ALL: 3, ERR: 1, WRN: 0, INF: 2 });
    expect(counter.count([record(9, 'z', 'DBG')])).toMatchObject({ ALL: 1, ERR: 0, INF: 0, DBG: 1 });
  });
});
