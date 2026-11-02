import { LogEntry } from '../types';

/**
 * Field filters, typed in the search box as `$field operator value`:
 *   $UserId = 81     $Elapsed > 1000     $RequestPath ~ /api/pedidos     $Environment != Production
 * Fields come from JSON records (nested ones as `a.b`) and from `key=value` pairs in text records.
 */
export type FieldOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~';

export interface FieldFilter {
  field: string;
  operator: FieldOperator;
  value: string;
}

const FIELD_FILTER_REGEX = /^\$([\w@][\w@.-]*)\s*(>=|<=|!=|=|>|<|~)\s*(.*)$/;
const KEY_VALUE_REGEX = /(?:^|[\s,;([{])([A-Za-z_@][\w.@-]*)=("[^"]*"|'[^']*'|[^\s,;)\]}]+)/g;

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** True when the text is meant as a field filter (starts with `$` followed by a name). */
export function looksLikeFieldFilter(text: string): boolean {
  return /^\$[\w@]/.test(text.trim());
}

export function parseFieldFilter(text: string): FieldFilter | null {
  const match = FIELD_FILTER_REGEX.exec(text.trim());
  if (!match) return null;
  const value = unquote(match[3]);
  if (!value) return null;
  return { field: match[1].toLowerCase(), operator: match[2] as FieldOperator, value };
}

function flatten(value: unknown, prefix: string, into: Map<string, string>): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
    return;
  }
  if (prefix) into.set(prefix.toLowerCase(), typeof value === 'string' ? value : JSON.stringify(value));
}

/** The fields of a record (lowercase names). Built on demand: nothing is stored per record. */
export function entryFields(entry: LogEntry): Map<string, string> {
  const fields = new Map<string, string>();
  const newline = entry.rawText.indexOf('\n');
  const firstLine = newline === -1 ? entry.rawText : entry.rawText.slice(0, newline);
  if (firstLine.startsWith('{')) {
    try {
      flatten(JSON.parse(firstLine), '', fields);
      return fields;
    } catch {
      // Not JSON after all: read it as text.
    }
  }
  for (const match of firstLine.matchAll(KEY_VALUE_REGEX)) fields.set(match[1].toLowerCase(), unquote(match[2]));
  return fields;
}

function compare(actual: string | undefined, filter: FieldFilter): boolean {
  if (actual === undefined) return filter.operator === '!=';
  const { operator, value } = filter;
  if (operator === '~') return actual.toLowerCase().includes(value.toLowerCase());
  const actualNumber = Number.parseFloat(actual);
  const expectedNumber = Number.parseFloat(value);
  const numeric = !Number.isNaN(actualNumber) && !Number.isNaN(expectedNumber);
  if (operator === '=' || operator === '!=') {
    const equal = numeric && /^-?[\d.]+$/.test(value) ? actualNumber === expectedNumber : actual.toLowerCase() === value.toLowerCase();
    return operator === '=' ? equal : !equal;
  }
  if (!numeric) return false;
  if (operator === '>') return actualNumber > expectedNumber;
  if (operator === '>=') return actualNumber >= expectedNumber;
  if (operator === '<') return actualNumber < expectedNumber;
  return actualNumber <= expectedNumber;
}

/** Predicate for one field filter; `fields` lets several filters share one extraction per record. */
export function createFieldMatcher(filter: FieldFilter): (fields: Map<string, string>) => boolean {
  return (fields) => compare(fields.get(filter.field), filter);
}
