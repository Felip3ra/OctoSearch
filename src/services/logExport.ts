import { LogEntry } from '../types';
import { entryMessage, entryStackTrace, entryTimestamp } from './logEntry';
import { desktop } from './platform';

export type ExportFormat = 'log' | 'csv';

/** Plain text, one record (with its stack trace) after another, as in the original file. */
export function buildLogText(entries: LogEntry[], includeSource: boolean): string {
  return entries
    .map((entry) => (includeSource && entry.sourceFile ? `[${entry.sourceFile}] ${entry.rawText}` : entry.rawText))
    .join('\n');
}

/**
 * Log messages carry text written by third parties (user agents, request parameters). A cell that
 * starts with one of these characters is run as a formula by Excel and LibreOffice, so it gets an
 * apostrophe in front, which makes the spreadsheet show it as text.
 */
const FORMULA_START_REGEX = /^[=+\-@\t\r]/;

function csvCell(value: string): string {
  const safe = FORMULA_START_REGEX.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Spreadsheet export. Uses ';' (the separator Excel expects in pt-BR) and starts with a BOM so
 * accents open correctly.
 */
export function buildCsv(entries: LogEntry[], includeSource: boolean): string {
  const header = [...(includeSource ? ['Arquivo'] : []), 'Linha', 'Data/hora', 'Nível', 'Mensagem', 'Stack trace'];
  const rows = entries.map((entry) => [
    ...(includeSource ? [entry.sourceFile || ''] : []),
    String(entry.startLine),
    entryTimestamp(entry),
    entry.rawLevel || entry.level,
    entryMessage(entry),
    entryStackTrace(entry).join('\n'),
  ]);
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

export function buildExport(entries: LogEntry[], format: ExportFormat, includeSource: boolean): string {
  return format === 'csv' ? buildCsv(entries, includeSource) : buildLogText(entries, includeSource);
}

export function exportFileName(baseName: string, format: ExportFormat, now = new Date()): string {
  const safeBase = baseName.replace(/\.(log|txt)(\.\d+)?(\.gz)?$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'logs';
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safeBase}-filtrado-${stamp}.${format}`;
}

/** Saves through the native dialog in the desktop app, or as a browser download. Returns false if cancelled. */
export async function saveExport(fileName: string, content: string): Promise<boolean> {
  const saveTextFile = desktop()?.saveTextFile;
  if (saveTextFile) {
    return (await saveTextFile({ defaultName: fileName, content })) !== null;
  }
  const url = URL.createObjectURL(new Blob([content], { type: fileName.endsWith('.csv') ? 'text/csv' : 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
