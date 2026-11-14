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

function flatten(value: unknown, prefix: string, into: [string, string][]): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into);
    }
    return;
  }
  if (prefix) into.push([prefix, typeof value === 'string' ? value : JSON.stringify(value)]);
}

/** The fields of a record with their names as written, in order (for display). */
export function entryFieldList(entry: LogEntry): [string, string][] {
  const fields: [string, string][] = [];
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
  for (const match of firstLine.matchAll(KEY_VALUE_REGEX)) fields.push([match[1], unquote(match[2])]);
  return fields;
}

/** The fields of a record by lowercase name, for filtering. Built on demand: nothing is stored per record. */
export function entryFields(entry: LogEntry): Map<string, string> {
  return new Map(entryFieldList(entry).map(([name, value]) => [name.toLowerCase(), value]));
}

const NUMBER_REGEX = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
const NUMBER_WITH_UNIT_REGEX = /^([-+]?(?:\d+\.?\d*|\.\d+))\s*(?:[a-zµ]{1,3}|%)?$/i;

/** The value as a number, or null when it is not one. `allowUnit` accepts a short unit after it ("45ms", "80%"). */
function toNumber(text: string, allowUnit: boolean): number | null {
  const trimmed = text.trim();
  if (NUMBER_REGEX.test(trimmed)) return Number(trimmed);
  const withUnit = allowUnit ? NUMBER_WITH_UNIT_REGEX.exec(trimmed) : null;
  return withUnit ? Number(withUnit[1]) : null;
}

function compare(actual: string | undefined, filter: FieldFilter): boolean {
  if (actual === undefined) return filter.operator === '!=';
  const { operator, value } = filter;
  if (operator === '~') return actual.toLowerCase().includes(value.toLowerCase());
  if (operator === '=' || operator === '!=') {
    // Numbers compare by value ("81" = "81.0") only when both sides are entirely numeric:
    // an id such as "12ab34cd" is text, not the number 12.
    const actualExact = toNumber(actual, false);
    const expectedExact = toNumber(value, false);
    const equal =
      actualExact !== null && expectedExact !== null ? actualExact === expectedExact : actual.toLowerCase() === value.toLowerCase();
    return operator === '=' ? equal : !equal;
  }
  const actualNumber = toNumber(actual, true);
  const expectedNumber = toNumber(value, true);
  if (actualNumber === null || expectedNumber === null) return false;
  if (operator === '>') return actualNumber > expectedNumber;
  if (operator === '>=') return actualNumber >= expectedNumber;
  if (operator === '<') return actualNumber < expectedNumber;
  return actualNumber <= expectedNumber;
}

/** Predicate for one field filter; `fields` lets several filters share one extraction per record. */
export function createFieldMatcher(filter: FieldFilter): (fields: Map<string, string>) => boolean {
  return (fields) => compare(fields.get(filter.field), filter);
}
