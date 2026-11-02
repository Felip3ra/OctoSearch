import { describe, expect, it } from 'vitest';
import { LogEntry } from '../types';
import { groupByMessage, messageTemplate, templateToPattern } from './errorGroups';
import { compactEntry } from './logEntry';
import { entryFields, parseFieldFilter } from './logFields';
import { IncrementalHistogram } from './logHistogram';
import { parseLogContentAsync } from './logParser';
import { filterLogEntries, getPatternError } from './logSearch';

let id = 0;
const record = (message: string, level: LogEntry['level'] = 'ERR', time?: number): LogEntry =>
  compactEntry({ id: ++id, startLine: id, endLine: id, time, level, rawLevel: level, timestamp: '', message, stackTrace: [] }, [message]);

describe('errorGroups', () => {
  it('groups messages that only differ in ids, numbers and quoted values', () => {
    expect(messageTemplate('Pedido 1145 do cliente 81 falhou (id 3f2b8c1e-1d2a-4b5c-9d8e-0f1a2b3c4d5e) "abc"')).toBe(
      'Pedido <n> do cliente <n> falhou (id <guid>) <texto>'
    );
    const groups = groupByMessage(
      [record('Pedido 1 falhou'), record('Pedido 2 falhou'), record('Timeout em https://x/y'), record('Pedido 3 falhou', 'WRN')],
      new Set(['ERR'])
    );
    expect(groups.map((group) => [group.template, group.count])).toEqual([
      ['Pedido <n> falhou', 2],
      ['Timeout em <url>', 1],
    ]);
  });

  it('turns a template into a regex that finds its records', () => {
    const pattern = new RegExp(templateToPattern('Pedido <n> do cliente <n> falhou (total: <n>)'));
    expect(pattern.test('2026 [ERR] Pedido 1145 do cliente 81 falhou (total: 1.234,50)')).toBe(true);
    expect(pattern.test('Pedido 1145 do fornecedor 81 falhou (total: 1)')).toBe(false);
  });
});

describe('field filters', () => {
  it('parses the syntax and reports a broken one', () => {
    expect(parseFieldFilter('$Elapsed > 1000')).toEqual({ field: 'elapsed', operator: '>', value: '1000' });
    expect(parseFieldFilter('$RequestPath ~ "/api/pedidos"')).toEqual({ field: 'requestpath', operator: '~', value: '/api/pedidos' });
    expect(getPatternError({ text: '$UserId' })).toMatch(/campo/);
    expect(getPatternError({ text: '$UserId = 81' })).toBeNull();
  });

  it('reads JSON fields (nested too) and key=value pairs', async () => {
    const { entries } = await parseLogContentAsync(
      [
        '{"@t":"2026-10-06T13:00:00Z","@mt":"Pedido salvo","UserId":81,"Elapsed":1250.5,"Http":{"Status":500}}',
        '{"@t":"2026-10-06T13:00:01Z","@mt":"Pedido salvo","UserId":7,"Elapsed":20}',
      ].join('\n')
    );
    expect(entryFields(entries[0]).get('http.status')).toBe('500');
    const only = (text: string) => filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [{ id: text, text, mode: 'include' }] });
    expect(only('$UserId = 81')).toHaveLength(1);
    expect(only('$Elapsed > 1000')).toHaveLength(1);
    expect(only('$Elapsed <= 1000')).toHaveLength(1);
    expect(only('$Http.Status = 500')).toHaveLength(1);
    expect(only('$Missing = 1')).toHaveLength(0);

    const text = await parseLogContentAsync('2026-10-06 10:00:00 [INF] GET /api/orders responded 200 in 45ms user=u101 order="ORD 1"');
    expect(entryFields(text.entries[0]).get('user')).toBe('u101');
    expect(entryFields(text.entries[0]).get('order')).toBe('ORD 1');
  });
});

describe('IncrementalHistogram', () => {
  it('counts records per bucket and level, also after appends', () => {
    const histogram = new IncrementalHistogram();
    const base = new Date(2026, 9, 6, 10, 0, 0).getTime();
    let timeline = [record('a', 'ERR', base), record('b', 'INF', base + 30_000), record('c', 'WRN', base + 90_000)];
    let result = histogram.compute(timeline);
    expect(result.step).toBe(1000);
    expect(result.buckets.reduce((total, bucket) => total + bucket.errors + bucket.warnings + bucket.others, 0)).toBe(3);

    timeline = [...timeline, record('d', 'ERR', base + 3 * 60 * 60 * 1000)];
    result = histogram.compute(timeline);
    expect(result.step).toBe(2 * 60 * 1000);
    expect(result.buckets[0]).toMatchObject({ start: base, errors: 1, others: 1, warnings: 1 });
    expect(result.buckets.at(-1)).toMatchObject({ errors: 1 });
    expect(result.buckets.length).toBeLessThanOrEqual(120);
  });
});
