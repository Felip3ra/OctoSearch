import { useCallback, useMemo, useState } from 'react';
import { LogEntry, LogFileItem } from '../types';
import { entryKey } from '../services/logEntry';

/** Marked records, kept per selection of files while the app is open (keys from entryKey). */
export function useBookmarks(selectedFiles: LogFileItem[]) {
  const [bookmarks, setBookmarks] = useState<Map<string, Set<string>>>(() => new Map());
  const selectionKey = useMemo(() => selectedFiles.map((file) => file.path.toLowerCase()).sort().join('|'), [selectedFiles]);
  const bookmarkedKeys = useMemo(() => bookmarks.get(selectionKey) ?? new Set<string>(), [bookmarks, selectionKey]);

  const toggleBookmark = useCallback(
    (entry: LogEntry) =>
      setBookmarks((current) => {
        const next = new Map(current);
        const keys = new Set(next.get(selectionKey));
        const key = entryKey(entry);
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        next.set(selectionKey, keys);
        return next;
      }),
    [selectionKey]
  );

  return { bookmarkedKeys, toggleBookmark };
}
