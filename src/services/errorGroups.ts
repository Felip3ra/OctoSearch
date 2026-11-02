import { EntryLogLevel, LogEntry } from '../types';
import { entryMessage } from './logEntry';

export interface ErrorGroup {
  /** The message with the variable parts replaced by placeholders. */
  template: string;
  /** Regular expression that finds the records of this group. */
  pattern: string;
  count: number;
  first: LogEntry;
  last: LogEntry;
}

// Variable parts of a message, most specific first. Each one becomes a placeholder in the template
// and a matching piece of regular expression in the filter built from it.
const VARIABLE_PARTS: { regex: RegExp; placeholder: string; pattern: string }[] = [
  { regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, placeholder: '<guid>', pattern: '[0-9a-fA-F-]{36}' },
  { regex: /\bhttps?:\/\/\S+/gi, placeholder: '<url>', pattern: 'https?://\\S+' },
  { regex: /"[^"\n]*"|'[^'\n]*'/g, placeholder: '<texto>', pattern: `(?:"[^"]*"|'[^']*')` },
  { regex: /\b0x[0-9a-f]+\b|\b[0-9a-f]{16,}\b/gi, placeholder: '<hex>', pattern: '(?:0x)?[0-9a-fA-F]+' },
  { regex: /\d+(?:[.,:]\d+)*/g, placeholder: '<n>', pattern: '\\d+(?:[.,:]\\d+)*' },
];

/** "Pedido 1145 do cliente 81 falhou" → "Pedido <n> do cliente <n> falhou". */
export function messageTemplate(message: string): string {
  let template = message.trim().slice(0, 500);
  for (const part of VARIABLE_PARTS) template = template.replace(part.regex, part.placeholder);
  return template.replace(/\s+/g, ' ');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regular expression that finds the records of a group (used as a search filter). */
export function templateToPattern(template: string): string {
  const placeholders = new Map(VARIABLE_PARTS.map((part) => [part.placeholder, part.pattern]));
  return template
    .split(/(<guid>|<url>|<texto>|<hex>|<n>)/)
    .map((piece) => placeholders.get(piece) ?? escapeRegex(piece).replace(/ /g, '\\s+'))
    .join('');
}

/** Groups the records of the given levels by message template, most frequent first. */
export function groupByMessage(entries: LogEntry[], levels: ReadonlySet<EntryLogLevel>, limit = 100): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const entry of entries) {
    if (!levels.has(entry.level)) continue;
    const template = messageTemplate(entryMessage(entry));
    const group = groups.get(template);
    if (group) {
      group.count++;
      group.last = entry;
    } else {
      groups.set(template, { template, pattern: '', count: 1, first: entry, last: entry });
    }
  }
  const top = [...groups.values()].sort((a, b) => b.count - a.count || b.last.id - a.last.id).slice(0, limit);
  for (const group of top) group.pattern = templateToPattern(group.template);
  return top;
}
