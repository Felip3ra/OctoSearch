import { describe, expect, it } from 'vitest';
import { LogEntry } from '../types';
import { mergeLogSources } from './logMerge';
import { buildCsv, buildLogText, exportFileName } from './logExport';

function entry(id: number, message: string, time?: number, extra: Partial<LogEntry> = {}): LogEntry {
  return {
    id,
    startLine: id,
    endLine: id,
    timestamp: time === undefined ? '' : new Date(time).toISOString(),
    time,
    level: 'INF',
    rawLevel: 'INF',
    message,
    stackTrace: [],
    rawText: `${time ?? ''} ${message}`.trim(),
    hasStackTrace: false,
    ...extra,
  };
}

describe('mergeLogSources', () => {
  it('returns the original array for a single chronological file', () => {
    const entries = [entry(1, 'a', 1), entry(2, 'b', 2)];
    expect(mergeLogSources([{ label: 'app.log', entries }])).toBe(entries);
  });

  it('interleaves files by time and tags the source', () => {
    const merged = mergeLogSources([
      { label: 'api.log', entries: [entry(1, 'api-1', 10), entry(2, 'api-2', 30)] },
      { label: 'worker.log', entries: [entry(1, 'worker-1', 20)] },
    ]);
    expect(merged.map((item) => [item.message, item.sourceFile])).toEqual([
      ['api-1', 'api.log'],
      ['worker-1', 'worker.log'],
      ['api-2', 'api.log'],
    ]);
    expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('keeps undated records next to the previous dated one of the same file', () => {
    const merged = mergeLogSources([
      { label: 'a', entries: [entry(1, 'a1', 10), entry(2, 'a-sem-data'), entry(3, 'a2', 40)] },
      { label: 'b', entries: [entry(1, 'b1', 20)] },
    ]);
    expect(merged.map((item) => item.message)).toEqual(['a1', 'a-sem-data', 'b1', 'a2']);
  });
});

describe('export', () => {
  const entries = [
    entry(1, 'simples', 0, { sourceFile: 'api.log' }),
    entry(2, 'com; "aspas"', 1000, { level: 'ERR', rawLevel: 'ERROR', stackTrace: ['Ex', '  at A'], hasStackTrace: true }),
  ];

  it('builds plain text with optional source prefix', () => {
    expect(buildLogText(entries, false).split('\n')).toHaveLength(2);
    expect(buildLogText(entries, true).startsWith('[api.log] ')).toBe(true);
  });

  it('builds a CSV with BOM, ; separator and escaped cells', () => {
    const csv = buildCsv(entries, false);
    expect(csv.startsWith('﻿Linha;Data/hora;Nível;Mensagem;Stack trace\r\n')).toBe(true);
    expect(csv).toContain('"com; ""aspas"""');
    expect(csv).toContain('"Ex\n  at A"');
    expect(buildCsv(entries, true).split('\r\n')[0]).toBe('﻿Arquivo;Linha;Data/hora;Nível;Mensagem;Stack trace');
  });

  it('creates a safe file name', () => {
    const name = exportFileName('app:prod.log.1.gz', 'csv', new Date(2026, 9, 6, 14, 5));
    expect(name).toBe('app_prod-filtrado-20261006-1405.csv');
  });
});
