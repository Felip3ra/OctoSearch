import { LogEntry, EntryLogLevel } from '../types';

/**
 * Supported layouts (one record per line; indented lines are continuations/stack traces):
 *  - Serilog file/console:  2026-10-06 10:00:00.123 -03:00 [ERR] msg   |   [10:00:00 ERR] msg
 *  - log4net:               2026-10-06 10:00:00,123 [12] ERROR Logger - msg
 *  - NLog:                  2026-10-06 10:00:00.1234|ERROR|Logger|msg
 *  - Dates dd/MM/yyyy, yyyy/MM/dd, bracketed timestamps and time-only (HH:mm:ss)
 *  - Microsoft.Extensions.Logging console:  fail: Category[0]  (message on the next line)
 *  - JSON lines (Serilog compact @t/@l/@m/@mt/@x and common keys: timestamp/level/message)
 * Files where no line is recognized are shown line by line (formatRecognized = false).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LINE_BREAK_REGEX = /\r?\n/;

const LEVEL_ALIASES: Record<string, EntryLogLevel> = {
  INF: 'INF', INFO: 'INF', INFORMATION: 'INF', NOTICE: 'INF',
  WRN: 'WRN', WARN: 'WRN', WARNING: 'WRN',
  ERR: 'ERR', ERROR: 'ERR', EXCEPTION: 'ERR', SEVERE: 'ERR',
  FTL: 'ERR', FATAL: 'ERR', CRT: 'ERR', CRIT: 'ERR', CRITICAL: 'ERR', ALERT: 'ERR', EMERGENCY: 'ERR',
  DBG: 'DBG', DEBUG: 'DBG', VRB: 'DBG', VERBOSE: 'DBG', TRC: 'DBG', TRACE: 'DBG',
};

const MEL_LEVELS: Record<string, string> = {
  trce: 'TRACE', dbug: 'DEBUG', info: 'INFO', warn: 'WARN', fail: 'ERROR', crit: 'CRITICAL',
};

const MEL_PREFIX_REGEX = /^(trce|dbug|info|warn|fail|crit): /;
const ISO_DATE_REGEX = /^(\d{4})[-/.](\d{2})[-/.](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?/;
const DMY_DATE_REGEX = /^(\d{2})[/.-](\d{2})[/.-](\d{4})[ T]?\s?(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?/;
const TIME_ONLY_REGEX = /^(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?(?=[\s\]|,;]|$)/;
const ZONE_REGEX = /^\s?(Z|[-+]\d{2}:?\d{2})(?=[\s\]|,;]|$)/i;
const LEVEL_WORDS = Object.keys(LEVEL_ALIASES).sort((a, b) => b.length - a.length).join('|');
const LEVEL_TOKEN_REGEX = new RegExp(String.raw`(^|[\s\[\]|(:;,-])(${LEVEL_WORDS})(?=$|[\s\]|):;,-])`, 'gi');
const LEVEL_HEADER_LENGTH = 64;
const BRACKETED_LEVEL_REGEX = /^\s*\[([A-Za-z]{3,11})\]\s*/;

export function normalizeLogLevel(raw: string | undefined): EntryLogLevel {
  if (!raw) return 'OTHER';
  return LEVEL_ALIASES[raw.trim().toUpperCase()] ?? 'OTHER';
}

export interface ParseResult {
  entries: LogEntry[];
  totalLines: number;
  /** False when no line matched a known layout; entries are then one per line. */
  formatRecognized: boolean;
}

export interface ParseOptions {
  /** Anchors time-only timestamps (HH:mm:ss) to a date; usually the file's last modification. */
  referenceTime?: number;
}

interface TimestampMatch {
  text: string;
  end: number;
  time?: number;
  timeOnly: boolean;
}

interface ParsedStart {
  timestamp: string;
  time?: number;
  timeOnly?: boolean;
  rawLevel: string;
  message: string;
  stackTrace?: string[];
  awaitsMelMessage?: boolean;
}

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  return fraction.length > 3 ? milliseconds + Number(`0.${fraction.slice(3)}`) : milliseconds;
}

function zoneToMinutes(zone: string): number {
  if (zone.toUpperCase() === 'Z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
}

function matchTimestamp(line: string): TimestampMatch | null {
  const offset = line.startsWith('[') ? 1 : 0;
  const body = offset ? line.slice(1) : line;

  let year = 0;
  let month = 0;
  let day = 0;
  let parts: RegExpExecArray | null;
  let timeOnly = false;

  if ((parts = ISO_DATE_REGEX.exec(body))) {
    [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  } else if ((parts = DMY_DATE_REGEX.exec(body))) {
    [day, month, year] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    // pt-BR is day-first; fall back to month-first only when the day-first reading is impossible.
    if (month > 12 && day <= 12) [day, month] = [month, day];
  } else if ((parts = TIME_ONLY_REGEX.exec(body))) {
    timeOnly = true;
  } else {
    return null;
  }

  const timeGroup = timeOnly ? 1 : 4;
  const hours = Number(parts[timeGroup]);
  const minutes = Number(parts[timeGroup + 1]);
  const seconds = Number(parts[timeGroup + 2]);
  const milliseconds = fractionToMs(parts[timeGroup + 3]);
  if (hours > 23 || minutes > 59 || seconds > 60) return null;
  if (!timeOnly && (month < 1 || month > 12 || day < 1 || day > 31)) return null;

  let cursor = parts[0].length;
  const zone = ZONE_REGEX.exec(body.slice(cursor));
  if (zone) cursor += zone[0].length;

  let time: number;
  if (timeOnly) {
    time = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  } else if (zone) {
    time = Date.UTC(year, month - 1, day, hours, minutes, seconds) - zoneToMinutes(zone[1]) * 60000 + milliseconds;
  } else {
    time = new Date(year, month - 1, day, hours, minutes, seconds).getTime() + milliseconds;
  }

  return {
    text: body.slice(0, cursor).trim(),
    end: offset + cursor,
    time: Number.isFinite(time) ? time : undefined,
    timeOnly,
  };
}

/**
 * Finds the level in the header right after the timestamp. Bare words must be UPPERCASE
 * (avoids matching "error" inside a message); bracketed or piped words may use any case.
 */
function findLevel(remainder: string): { rawLevel: string; message: string } | null {
  // Fast path for the most common layout: "<timestamp> [LEVEL] message".
  const bracketed = BRACKETED_LEVEL_REGEX.exec(remainder);
  if (bracketed && LEVEL_ALIASES[bracketed[1].toUpperCase()]) {
    return { rawLevel: bracketed[1].toUpperCase(), message: remainder.slice(bracketed[0].length) };
  }

  const header = remainder.slice(0, LEVEL_HEADER_LENGTH);
  LEVEL_TOKEN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LEVEL_TOKEN_REGEX.exec(header))) {
    const word = match[2];
    const start = match.index + match[1].length;
    const end = start + word.length;
    const isDelimited = ['[', '|'].includes(header[start - 1]) || [']', '|'].includes(header[end]);
    if (word === word.toUpperCase() || isDelimited) {
      const prefix = remainder.slice(0, start).replace(/^[\s\]|:;,-]+/, '').replace(/[\s[|(]+$/, '');
      const rest = remainder.slice(end).replace(/^[\s\]|):;,-]+/, '');
      return { rawLevel: word.toUpperCase(), message: [prefix, rest].filter(Boolean).join(' ') };
    }
    LEVEL_TOKEN_REGEX.lastIndex = match.index + 1;
  }

  // Bracketed level further away, e.g. "[Thread-1] [App] [ERROR] msg".
  const embedded = /\[(INF|INFO|INFORMATION|WRN|WARN|WARNING|ERR|ERROR|FTL|FATAL|CRIT|CRITICAL|DBG|DEBUG|VRB|VERBOSE|TRACE)\]/i.exec(remainder);
  if (embedded) {
    return { rawLevel: embedded[1].toUpperCase(), message: remainder.replace(embedded[0], '').replace(/^[\s\]|:;,-]+/, '').trim() };
  }
  return null;
}

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseJsonLine(line: string): ParsedStart | null {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const data = record as Record<string, unknown>;

  const rawTime = pick(data, ['@t', 'Timestamp', 'timestamp', '@timestamp', 'time', 'Time', 'ts', 'date', 'datetime']);
  let message = pick(data, ['@m', 'RenderedMessage', 'Message', 'message', 'msg']);
  const template = pick(data, ['@mt', 'MessageTemplate']);
  if (message === undefined && typeof template === 'string') {
    message = template.replace(/\{[@$]?(\w+)(?:[,:][^}]*)?\}/g, (placeholder, name: string) =>
      data[name] === undefined ? placeholder : stringify(data[name])
    );
  }
  if (rawTime === undefined && message === undefined) return null;

  let time: number | undefined;
  let timestamp = '';
  if (typeof rawTime === 'number') {
    time = rawTime > 1e12 ? rawTime : rawTime * 1000;
    timestamp = new Date(time).toISOString();
  } else if (typeof rawTime === 'string') {
    timestamp = rawTime;
    time = matchTimestamp(rawTime)?.time ?? (Date.parse(rawTime) || undefined);
  }

  const levelValue = pick(data, ['@l', 'Level', 'level', 'severity', 'Severity', 'lvl', 'LogLevel', 'logLevel']);
  // Serilog compact JSON omits @l for Information events.
  const rawLevel = levelValue === undefined ? ('@t' in data ? 'INFORMATION' : '') : stringify(levelValue).toUpperCase();
  const exception = pick(data, ['@x', 'Exception', 'exception', 'stack_trace', 'stackTrace']);

  return {
    timestamp,
    time,
    rawLevel,
    message: message === undefined ? line : stringify(message),
    stackTrace: exception === undefined ? [] : stringify(exception).split(/\r?\n/).filter((item) => item.trim()),
  };
}

function parseEntryStart(rawLine: string): ParsedStart | null {
  // Indented lines are always continuations (stack traces, MEL message bodies).
  if (!rawLine || /^\s/.test(rawLine)) return null;

  if (rawLine.startsWith('{')) {
    const json = parseJsonLine(rawLine);
    if (json) return json;
  }

  const melMatch = MEL_PREFIX_REGEX.exec(rawLine);
  if (melMatch) {
    return { timestamp: '', rawLevel: MEL_LEVELS[melMatch[1]], message: rawLine.slice(melMatch[0].length).trim(), awaitsMelMessage: true };
  }

  const timestamp = matchTimestamp(rawLine);
  if (!timestamp) return null;
  const remainder = rawLine.slice(timestamp.end);
  const base = { timestamp: timestamp.text, time: timestamp.time, timeOnly: timestamp.timeOnly };

  const melAfterTimestamp = MEL_PREFIX_REGEX.exec(remainder.replace(/^[\s\]]+/, ''));
  if (melAfterTimestamp) {
    const melRemainder = remainder.replace(/^[\s\]]+/, '');
    return { ...base, rawLevel: MEL_LEVELS[melAfterTimestamp[1]], message: melRemainder.slice(melAfterTimestamp[0].length).trim(), awaitsMelMessage: true };
  }

  const level = findLevel(remainder);
  return {
    ...base,
    rawLevel: level?.rawLevel ?? '',
    message: level ? level.message : remainder.replace(/^[\s\]|:;,-]+/, ''),
  };
}

interface ParserState {
  current: LogEntry | null;
  rawLines: string[];
  awaitsMelMessage: boolean;
  entries: LogEntry[];
  nextId: number;
  recognizedStarts: number;
  dayOffset: number;
  lastTimeOfDay: number | null;
  timeOnlyEntries: LogEntry[];
}

function finalizeEntry(state: ParserState): void {
  const entry = state.current;
  if (!entry) return;
  let trailingBlank = 0;
  while (entry.stackTrace.length > 0 && entry.stackTrace[entry.stackTrace.length - 1].trim() === '') {
    entry.stackTrace.pop();
    trailingBlank++;
  }
  entry.endLine -= trailingBlank;
  entry.rawText = state.rawLines.slice(0, state.rawLines.length - trailingBlank).join('\n');
  entry.hasStackTrace = entry.stackTrace.length > 0;
  state.entries.push(entry);
  state.current = null;
}

function startEntry(state: ParserState, lineNumber: number, rawLine: string, start: ParsedStart): void {
  finalizeEntry(state);
  let time = start.time;
  if (start.timeOnly && time !== undefined) {
    // Time-only logs roll over at midnight: a big jump backwards means the next day.
    if (state.lastTimeOfDay !== null && time < state.lastTimeOfDay - 60 * 60 * 1000) state.dayOffset++;
    state.lastTimeOfDay = time;
    time += state.dayOffset * DAY_MS;
  }

  state.current = {
    id: state.nextId++,
    startLine: lineNumber,
    endLine: lineNumber,
    timestamp: start.timestamp,
    time,
    level: normalizeLogLevel(start.rawLevel),
    rawLevel: start.rawLevel,
    message: start.message.trim(),
    stackTrace: start.stackTrace ?? [],
    rawText: '',
    hasStackTrace: false,
  };
  if (start.timeOnly && time !== undefined) state.timeOnlyEntries.push(state.current);
  state.rawLines = [rawLine];
  state.awaitsMelMessage = Boolean(start.awaitsMelMessage);
  state.recognizedStarts++;
}

function processLogLine(rawLine: string, lineNumber: number, state: ParserState): void {
  const start = parseEntryStart(rawLine);
  if (start) {
    startEntry(state, lineNumber, rawLine, start);
    return;
  }

  const current = state.current;
  if (current) {
    if (state.awaitsMelMessage && rawLine.trim()) {
      current.message = current.message ? `${current.message}: ${rawLine.trim()}` : rawLine.trim();
      state.awaitsMelMessage = false;
    } else if (rawLine.trim() !== '' || current.stackTrace.length > 0) {
      current.stackTrace.push(rawLine);
    } else {
      return;
    }
    state.rawLines.push(rawLine);
    current.endLine = lineNumber;
    return;
  }

  // Lines before the first recognized record (headers, banners).
  if (rawLine.trim() !== '') {
    state.current = {
      id: state.nextId++,
      startLine: lineNumber,
      endLine: lineNumber,
      timestamp: '',
      level: 'OTHER',
      rawLevel: '',
      message: rawLine.trim(),
      stackTrace: [],
      rawText: '',
      hasStackTrace: false,
    };
    state.rawLines = [rawLine];
  }
}

function linePerEntry(lines: string[]): LogEntry[] {
  const entries: LogEntry[] = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    entries.push({
      id: entries.length + 1,
      startLine: index + 1,
      endLine: index + 1,
      timestamp: '',
      level: 'OTHER',
      rawLevel: '',
      message: line,
      stackTrace: [],
      rawText: line,
      hasStackTrace: false,
    });
  });
  return entries;
}

function createParserState(): ParserState {
  return {
    current: null,
    rawLines: [],
    awaitsMelMessage: false,
    entries: [],
    nextId: 1,
    recognizedStarts: 0,
    dayOffset: 0,
    lastTimeOfDay: null,
    timeOnlyEntries: [],
  };
}

export interface ParseSnapshot extends ParseResult {
  /** Entries before this index are unchanged since the previous snapshot; the rest replace them. */
  fromIndex: number;
}

/**
 * Incremental parser: text can be pushed in pieces (initial read, then whatever the live tail appends).
 * The text after the last line break is kept as a provisional line until the next push, and the
 * record still open at the end is reported as provisional too, so each snapshot only carries what changed.
 * Finished records are handed over by `snapshot()` and not kept here, so a long-lived session stays small.
 */
export class LogParseSession {
  private state = createParserState();
  private partial = '';
  private lineCount = 0;
  private nonBlankLines = 0;
  /** Finished records already handed over (they are the first `releasedCount` entries of the timeline). */
  private releasedCount = 0;
  private sawTimeOnly = false;
  /** Raw lines kept while no record start was recognized, for the line-by-line fallback. */
  private fallbackLines: string[] | null = [];

  constructor(private readonly options: ParseOptions = {}) {}

  push(text: string): void {
    if (!text) return;
    const lines = (this.partial + text).split(LINE_BREAK_REGEX);
    this.partial = lines.pop() ?? '';
    for (const line of lines) this.processLine(line);
  }

  /**
   * Live appends only work for dated, recognized logs: time-only logs anchor every record to the
   * file's last day and unrecognized files are shown line by line, so both are re-read in full.
   */
  get canAppend(): boolean {
    return this.state.recognizedStarts > 0 && !this.sawTimeOnly;
  }

  snapshot(): ParseSnapshot {
    const totalLines = this.lineCount + 1;
    const formatRecognized = this.state.recognizedStarts > 0 || this.nonBlankLines + (this.partial.trim() ? 1 : 0) <= 1;

    if (!formatRecognized) {
      return { fromIndex: 0, entries: linePerEntry([...(this.fallbackLines ?? []), this.partial]), totalLines, formatRecognized };
    }

    // Finish a copy of the open record (plus the provisional last line) without touching the real state.
    const timeOnly = new Set(this.state.timeOnlyEntries);
    const openRecord = this.state.current ? { ...this.state.current, stackTrace: [...this.state.current.stackTrace] } : null;
    const preview: ParserState = {
      ...this.state,
      current: openRecord,
      rawLines: [...this.state.rawLines],
      entries: [],
      timeOnlyEntries: openRecord && this.state.current && timeOnly.has(this.state.current) ? [openRecord] : [],
    };
    if (this.partial) processLogLine(this.partial, this.lineCount + 1, preview);
    finalizeEntry(preview);

    let finished = this.state.entries;
    if (this.sawTimeOnly || preview.timeOnlyEntries.length > 0) {
      // The last day of a time-only log is assumed to be the day the file was last written.
      // Stored times stay relative to the first day, so the anchoring is applied to copies.
      const reference = new Date(this.options.referenceTime ?? Date.now());
      reference.setHours(0, 0, 0, 0);
      const firstDay = reference.getTime() - preview.dayOffset * DAY_MS;
      finished = finished.map((entry) => (timeOnly.has(entry) ? { ...entry, time: (entry.time ?? 0) + firstDay } : entry));
      preview.timeOnlyEntries.forEach((entry) => {
        entry.time = (entry.time ?? 0) + firstDay;
      });
    }

    const fromIndex = this.releasedCount;
    const entries = [...finished, ...preview.entries];
    this.releasedCount += this.state.entries.length;
    this.state.entries = [];
    this.state.timeOnlyEntries = this.state.current && timeOnly.has(this.state.current) ? [this.state.current] : [];
    return { fromIndex, entries, totalLines, formatRecognized };
  }

  private processLine(line: string): void {
    this.lineCount++;
    if (line.trim() !== '') this.nonBlankLines++;
    processLogLine(line, this.lineCount, this.state);
    if (this.state.timeOnlyEntries.length > 0) this.sawTimeOnly = true;
    if (this.fallbackLines) {
      if (this.state.recognizedStarts > 0) this.fallbackLines = null;
      else this.fallbackLines.push(line);
    }
  }
}

/** Splits text into pieces of about `size` characters, so long parses can report progress. */
export function* textChunks(text: string, size = 4 * 1024 * 1024): Generator<string> {
  for (let index = 0; index < text.length; index += size) yield text.slice(index, index + size);
}

/**
 * Parses log content into structured LogEntries.
 * Lines that do not start a record (stack traces, exception dumps) are attached to the previous record.
 */
export async function parseLogContentAsync(
  content: string,
  onProgress?: (progress: number) => void,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const session = new LogParseSession(options);
  let processed = 0;
  for (const chunk of textChunks(content, 512 * 1024)) {
    session.push(chunk);
    processed += chunk.length;
    if (processed < content.length) {
      onProgress?.(Math.min(99, Math.round((processed / content.length) * 100)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(100);
  const { entries, totalLines, formatRecognized } = session.snapshot();
  return { entries, totalLines, formatRecognized };
}
