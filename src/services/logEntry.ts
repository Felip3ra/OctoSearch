import { EntryLogLevel, LogEntry } from '../types';

const NO_LINES: readonly string[] = Object.freeze([]);

/** A record while it is being parsed, before `compactEntry` turns it into the stored form. */
export interface DraftEntry {
  id: number;
  startLine: number;
  endLine: number;
  time?: number;
  level: EntryLogLevel;
  rawLevel: string;
  timestamp: string;
  message: string;
  stackTrace: string[];
}

/** Identifies a record across updates of the timeline (bookmarks, notifications). */
export function entryKey(entry: LogEntry): string {
  return `${entry.sourceFile ?? ''}:${entry.startLine}`;
}

export function entryTimestamp(entry: LogEntry): string {
  return entry.timestamp ?? entry.rawText.slice(entry.timestampStart, entry.timestampEnd);
}

export function entryMessage(entry: LogEntry): string {
  return entry.message ?? entry.rawText.slice(entry.messageStart, entry.messageEnd);
}

export function hasStackTrace(entry: LogEntry): boolean {
  return entry.stackLines > 0;
}

/** The stack trace lines; built on demand, so call it for the few records being shown or exported. */
export function entryStackTrace(entry: LogEntry): readonly string[] {
  if (entry.stackTrace) return entry.stackTrace;
  if (entry.stackLines === 0) return NO_LINES;
  const lines = entry.rawText.split('\n');
  return lines.slice(lines.length - entry.stackLines);
}

/**
 * Everything a search looks at: the record as written, plus the parts kept apart from it and the
 * source file of a merged view. Usually just `rawText`, so filtering millions of records allocates nothing.
 */
export function entrySearchText(entry: LogEntry): string {
  let text = entry.rawText;
  if (entry.message !== undefined) text += `\n${entry.message}`;
  if (entry.timestamp !== undefined) text += `\n${entry.timestamp}`;
  if (entry.stackTrace) text += `\n${entry.stackTrace.join('\n')}`;
  if (entry.sourceFile) text += `\n${entry.sourceFile}`;
  return text;
}

/**
 * Builds the stored record from a draft and its lines. Timestamp, message and stack trace become
 * positions in the raw text whenever they are part of it, which roughly halves the memory per record.
 */
export function compactEntry(draft: DraftEntry, rawLines: string[]): LogEntry {
  const rawText = rawLines.join('\n');
  const firstLine = rawLines[0] ?? '';
  const entry: LogEntry = {
    id: draft.id,
    startLine: draft.startLine,
    endLine: draft.endLine,
    level: draft.level,
    rawLevel: draft.rawLevel,
    rawText,
    timestampStart: 0,
    timestampEnd: 0,
    messageStart: 0,
    messageEnd: 0,
    stackLines: draft.stackTrace.length,
  };
  if (draft.time !== undefined) entry.time = draft.time;

  const timestampAt = draft.timestamp ? firstLine.indexOf(draft.timestamp) : 0;
  if (timestampAt >= 0) {
    entry.timestampStart = timestampAt;
    entry.timestampEnd = timestampAt + draft.timestamp.length;
  } else {
    entry.timestamp = draft.timestamp;
  }

  const messageAt = draft.message ? firstLine.indexOf(draft.message) : 0;
  if (messageAt >= 0) {
    entry.messageStart = messageAt;
    entry.messageEnd = messageAt + draft.message.length;
  } else {
    entry.message = draft.message;
  }

  // The stack trace is normally the record's last lines; JSON exceptions come from a field instead.
  const stack = draft.stackTrace;
  const offset = rawLines.length - stack.length;
  const isTail = offset >= 1 && stack.every((line, index) => line === rawLines[offset + index]);
  if (stack.length > 0 && !isTail) entry.stackTrace = stack;
  return entry;
}

/** A copy with every text field filled in, for tests and debugging. */
export function expandEntry(entry: LogEntry) {
  return {
    ...entry,
    timestamp: entryTimestamp(entry),
    message: entryMessage(entry),
    stackTrace: [...entryStackTrace(entry)],
    hasStackTrace: hasStackTrace(entry),
  };
}

/** Plain record for fallbacks: one line, no timestamp, no stack trace. */
export function lineEntry(id: number, lineNumber: number, line: string): LogEntry {
  return compactEntry(
    { id, startLine: lineNumber, endLine: lineNumber, level: 'OTHER', rawLevel: '', timestamp: '', message: line, stackTrace: [] },
    [line]
  );
}
