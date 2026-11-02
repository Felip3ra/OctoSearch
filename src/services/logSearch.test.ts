import { describe, expect, it } from 'vitest';
import { LogEntry, SearchFilter } from '../types';
import { compactEntry, DraftEntry } from './logEntry';
import {
  createAnyPatternMatcher,
  filterLogEntries,
  getIncludeBlocks,
  getPatternError,
  splitTextWithHighlights,
} from './logSearch';

function entry(id: number, message: string, extra: Partial<DraftEntry> & { sourceFile?: string } = {}): LogEntry {
  const { sourceFile, ...draft } = extra;
  const stackTrace = draft.stackTrace ?? [];
  const stored = compactEntry(
    { id, startLine: id, endLine: id, timestamp: '', level: 'INF', rawLevel: 'INF', message, ...draft, stackTrace },
    [message, ...stackTrace]
  );
  return sourceFile ? { ...stored, sourceFile } : stored;
}

const include = (text: string, extra: Partial<SearchFilter> = {}): SearchFilter => ({ id: text, text, mode: 'include', ...extra });
const exclude = (text: string, extra: Partial<SearchFilter> = {}): SearchFilter => ({ id: `-${text}`, text, mode: 'exclude', ...extra });

const entries = [
  entry(1, 'Pedido 10 criado', { time: 1000 }),
  entry(2, 'Pedido 11 falhou', { level: 'ERR', time: 2000, stackTrace: ['TimeoutException'] }),
  entry(3, 'Cliente atualizado', { time: 3000 }),
  entry(4, 'pedido sem data'),
];

const ids = (result: LogEntry[]) => result.map((item) => item.id);

describe('filterLogEntries', () => {
  it('filters by level and keeps everything without terms', () => {
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ERR' }))).toEqual([2]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL' }))).toEqual([1, 2, 3, 4]);
  });

  it('combines AND blocks with OR and applies exclusions', () => {
    const filters = [include('pedido'), include('10', { connector: 'and' }), include('cliente', { connector: 'or' })];
    expect(getIncludeBlocks(filters).map((block) => block.map((filter) => filter.text))).toEqual([['pedido', '10'], ['cliente']]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: filters }))).toEqual([1, 3]);
    expect(
      ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('pedido'), exclude('falhou')] }))
    ).toEqual([1, 4]);
  });

  it('searches inside stack traces', () => {
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('timeout')] }))).toEqual([2]);
  });

  it('supports case-sensitive and regex terms', () => {
    expect(
      ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('Pedido', { caseSensitive: true })] }))
    ).toEqual([1, 2]);
    expect(
      ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('pedido 1[01]', { regex: true })] }))
    ).toEqual([1, 2]);
    expect(
      ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('^Pedido', { regex: true, caseSensitive: true })] }))
    ).toEqual([1, 2]);
  });

  it('never matches an invalid regex instead of throwing', () => {
    expect(getPatternError({ text: '(', regex: true })).not.toBeNull();
    expect(getPatternError({ text: '(', regex: false })).toBeNull();
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', searchFilters: [include('(', { regex: true })] }))).toEqual([]);
  });

  it('keeps only dated records inside the time range', () => {
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', timeFrom: 1500 }))).toEqual([2, 3]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', timeFrom: 1000, timeTo: 2000 }))).toEqual([1, 2]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', timeTo: 1000 }))).toEqual([1]);
  });

  it('limits to the first or last records', () => {
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', lineLimit: '2' }))).toEqual([3, 4]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', lineLimit: '2', lineLimitDirection: 'head' }))).toEqual([1, 2]);
    expect(ids(filterLogEntries(entries, { searchTerm: '', level: 'ALL', lineLimit: 'custom', customLineLimit: 1 }))).toEqual([4]);
  });
});

describe('createAnyPatternMatcher', () => {
  it('matches any of the patterns', () => {
    const matches = createAnyPatternMatcher([{ text: 'erro' }, { text: '\\d{3}', regex: true }]);
    expect(matches('ERRO grave')).toBe(true);
    expect(matches('código 404')).toBe(true);
    expect(matches('tudo certo')).toBe(false);
    expect(createAnyPatternMatcher([])('qualquer')).toBe(false);
  });
});

describe('splitTextWithHighlights', () => {
  const marked = (text: string, terms: Parameters<typeof splitTextWithHighlights>[1]) =>
    splitTextWithHighlights(text, terms).filter((segment) => segment.isMatch).map((segment) => segment.text);

  it('highlights plain terms case-insensitively', () => {
    expect(marked('Erro e erro', ['erro'])).toEqual(['Erro', 'erro']);
    expect(splitTextWithHighlights('abc', []).map((segment) => segment.text)).toEqual(['abc']);
  });

  it('highlights regex and case-sensitive patterns', () => {
    expect(marked('id=10, id=200', [{ text: 'id=\\d+', regex: true }])).toEqual(['id=10', 'id=200']);
    expect(marked('Erro e erro', [{ text: 'erro', caseSensitive: true }])).toEqual(['erro']);
  });

  it('prefers the longest match at the same position and keeps the text intact', () => {
    const segments = splitTextWithHighlights('TimeoutException', ['Time', 'TimeoutException']);
    expect(segments).toEqual([{ text: 'TimeoutException', isMatch: true }]);
    expect(splitTextWithHighlights('a-b-a', ['a']).map((segment) => segment.text).join('')).toBe('a-b-a');
  });
});
