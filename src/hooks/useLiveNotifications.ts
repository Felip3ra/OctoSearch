import { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { entryKey, entryMessage, entrySearchText } from '../services/logEntry';
import { createAnyPatternMatcher } from '../services/logSearch';
import { sharedPrefixLength } from '../services/logView';

export interface NotificationSettings {
  /** Notify about new ERR records. */
  errors: boolean;
  /** Also notify about new records containing any of these terms (comma separated). */
  terms: string;
}

/** Notifications are grouped: at most one every few seconds, counting what arrived meanwhile. */
const MIN_INTERVAL_MS = 5000;

export function parseNotificationTerms(terms: string): string[] {
  return terms.split(',').map((term) => term.trim()).filter(Boolean);
}

/**
 * Shows a system notification when the live view brings records worth attention while the window
 * is not focused. Only records added by a live update count (not the initial load).
 */
export function useLiveNotifications(entries: LogEntry[], lastLiveUpdate: Date | null, settings: NotificationSettings) {
  const previousEntries = useRef<LogEntry[]>([]);
  const previousUpdate = useRef<Date | null>(null);
  const notified = useRef(new Set<string>());
  const pending = useRef<LogEntry[]>([]);
  const lastShownAt = useRef(0);

  useEffect(() => {
    const previous = previousEntries.current;
    const isLiveUpdate = lastLiveUpdate !== null && lastLiveUpdate !== previousUpdate.current;
    previousEntries.current = entries;
    previousUpdate.current = lastLiveUpdate;

    const terms = parseNotificationTerms(settings.terms);
    const notify = window.electronAPI?.notify;
    if (!isLiveUpdate || !notify || (!settings.errors && terms.length === 0)) return;
    const kept = sharedPrefixLength(previous, entries);
    if (kept === 0) return; // the file was read again from the start

    const matchesTerm = terms.length > 0 ? createAnyPatternMatcher(terms.map((text) => ({ text }))) : null;
    // The last record of a file is provisional and comes back complete in the next update: it is
    // the same record, not a new one.
    const replaced = new Set(previous.slice(kept).map(entryKey));
    for (let index = kept; index < entries.length; index++) {
      const entry = entries[index];
      const key = entryKey(entry);
      if (replaced.has(key) || notified.current.has(key)) continue;
      if ((settings.errors && entry.level === 'ERR') || matchesTerm?.(entrySearchText(entry))) {
        notified.current.add(key);
        pending.current.push(entry);
      }
    }
    if (notified.current.size > 10000) notified.current = new Set([...notified.current].slice(-1000));

    const now = Date.now();
    if (pending.current.length === 0 || document.hasFocus() || now - lastShownAt.current < MIN_INTERVAL_MS) {
      if (document.hasFocus()) pending.current = [];
      return;
    }
    const found = pending.current;
    pending.current = [];
    lastShownAt.current = now;
    const first = found[0];
    const source = first.sourceFile ? `[${first.sourceFile}] ` : '';
    void notify({
      title: found.length === 1 ? `Novo registro ${first.level === 'ERR' ? 'de erro' : 'encontrado'} no log` : `${found.length} novos registros no log`,
      body: `${source}${entryMessage(first)}`,
    }).catch(() => {});
  }, [entries, lastLiveUpdate, settings.errors, settings.terms]);
}
